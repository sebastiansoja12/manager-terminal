import {parseJson} from "./json";
import type {ChatConversationApi, ChatMessageApi, ChatUserApi} from "../terminal/chat";
import {pickupPointsQuery} from "../terminal/pickupPoints";
import type {PickupPoint, PickupPointPage} from "../terminal/pickupPoints";
import type {Carrier, SupplierProfile} from "../terminal/vehicle";
import type {AttemptStatus, Delivery} from "../terminal/deliveries";
import type {ProcessLog, ProcessLogPage} from "../terminal/processes";
import {buildEnvelope, findFaultMessage, parseEnvelope, TerminalFaultError} from "../terminal/soap";
import type {ShipmentLookupDetails} from "../terminal/shipmentLookup";
import type {ConfigurationRevision, SubstituteCandidate, SupplierConfiguration, SupplierConfigurationUpdate} from "../terminal/supplierConfiguration";
import type {DeviceInformation, ScanItem, ScanMode, ScanOptions, TerminalResult} from "../terminal/types";

export type Wrapped<T> = {value: T} | null;

export type CurrentUser = {
    userId: {value: number | string};
    username: string;
    firstName?: string | null;
    lastName?: string | null;
    role?: string | null;
    departmentCode: string | null;
};

export type ManagerDevice = {
    deviceId: Wrapped<string>;
    version: Wrapped<string>;
    deviceType: string | null;
    username: Wrapped<string>;
    depotCode: Wrapped<string>;
    lastUpdate: string | null;
    active: boolean | null;
    assignmentMode: DeviceAssignmentMode | null;
};

export type DeviceAssignmentMode = "PERSONAL" | "SHARED";

export type DeviceActivationRequest = {
    activationCode: string;
    installationId: string;
    deviceType: string;
    appVersion: string;
    manufacturer: string | null;
    model: string | null;
    osName: string | null;
    osVersion: string | null;
};

export type DeviceActivationResponse = {
    device: ManagerDevice;
    pairKey: string;
    pairKeyExpiresAt: string;
};

export type OperatorSessionResponse = {
    device: ManagerDevice;
    sessionExpiresAt: string;
};

export type DeviceHeartbeat = {
    version: string;
    manufacturer: string | null;
    model: string | null;
    osName: string | null;
    osVersion: string | null;
};

export type DeviceHeartbeatResponse = {
    updateRequired: boolean | null;
};

const HEADER_DEVICE_PAIR_KEY = "X-DEVICE-PAIR-KEY";

export class ApiError extends Error {
    constructor(message: string, readonly status: number, readonly details?: unknown) {
        super(message);
    }
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const REQUEST_TIMEOUT_MS = 20000;

const SOAP_ACTIONS: Record<ScanMode, string> = {
    COLLECT: "processCollect",
    PALLET: "processPalletScan",
    RETURN: "processTerminal",
    REJECT: "processTerminal",
    MISS: "processTerminal",
    HANDOVER: "processHandover",
};

export const normalizeServerUrl = (value: string) => {
    const trimmed = value.trim().replace(/\/+$/, "");
    if (!trimmed) {
        return trimmed;
    }
    return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
};

const parseDetails = (body: string): unknown => {
    try {
        return parseJson<unknown>(body);
    } catch {
        return undefined;
    }
};

const extractMessage = (body: string, status: number): string => {
    const fault = findFaultMessage(body);
    if (fault) {
        return fault;
    }
    try {
        const json = JSON.parse(body) as {message?: string; error?: string; detail?: string};
        const message = json.message || json.detail || json.error;
        if (message) {
            return message;
        }
    } catch {
    }
    if (status === 401) {
        return "Sesja wygasła lub błędne dane logowania";
    }
    if (status === 403) {
        return "Brak uprawnień do wykonania operacji";
    }
    if (status === 404) {
        return "Nie znaleziono zasobu";
    }
    return `Błąd serwera (${status})`;
};

type RequestOptions = {
    body?: string;
    headers?: Record<string, string>;
    retried?: boolean;
};

export class ManagerClient {
    private csrfToken: string | null = null;

    constructor(private readonly baseUrl: string) {
    }

    private async fetchWithTimeout(path: string, init: RequestInit): Promise<Response> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            return await fetch(`${this.baseUrl}${path}`, {...init, credentials: "include", signal: controller.signal});
        } catch (error) {
            if (controller.signal.aborted) {
                throw new ApiError("Serwer nie odpowiada (timeout)", 0);
            }
            throw new ApiError(`Brak połączenia z serwerem: ${(error as Error).message}`, 0);
        } finally {
            clearTimeout(timeout);
        }
    }

    private async refreshCsrf(): Promise<string | null> {
        const response = await this.fetchWithTimeout("/auth/csrf", {method: "GET", headers: {Accept: "application/json"}});
        if (!response.ok) {
            this.csrfToken = null;
            return null;
        }
        const json = await response.json() as {token?: string};
        this.csrfToken = json.token || null;
        return this.csrfToken;
    }

    private async request(method: string, path: string, options: RequestOptions = {}): Promise<string> {
        const headers: Record<string, string> = {Accept: "application/json", ...options.headers};
        if (UNSAFE_METHODS.has(method)) {
            const token = this.csrfToken || await this.refreshCsrf();
            if (token) {
                headers["X-XSRF-TOKEN"] = token;
            }
        }

        const response = await this.fetchWithTimeout(path, {method, headers, body: options.body});
        const body = await response.text();
        if (response.ok) {
            return body;
        }

        if (!options.retried && response.status === 403 && UNSAFE_METHODS.has(method) && !findFaultMessage(body)) {
            await this.refreshCsrf();
            return this.request(method, path, {...options, retried: true});
        }
        if (!options.retried && response.status === 401 && !path.startsWith("/auth/")) {
            if (await this.refreshSession()) {
                return this.request(method, path, {...options, retried: true});
            }
        }
        throw new ApiError(extractMessage(body, response.status), response.status, parseDetails(body));
    }

    private async refreshSession(): Promise<boolean> {
        try {
            await this.request("POST", "/auth/refresh", {retried: true});
            return true;
        } catch {
            return false;
        }
    }

    async login(username: string, password: string): Promise<CurrentUser> {
        await this.refreshCsrf();
        try {
            await this.request("POST", "/auth/login", {
                body: JSON.stringify({username, password}),
                headers: {"Content-Type": "application/json"},
            });
        } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
                throw new ApiError("Nieprawidłowy login lub hasło", 401);
            }
            throw error;
        }
        await this.refreshCsrf();
        return this.me();
    }

    async logout(): Promise<void> {
        try {
            await this.request("POST", "/auth/logout");
        } catch {
        }
    }

    async me(): Promise<CurrentUser> {
        return parseJson<CurrentUser>(await this.request("GET", "/auth/me"));
    }

    async activateDevice(activation: DeviceActivationRequest): Promise<DeviceActivationResponse> {
        const body = await this.request("POST", "/internal/device-activations", {
            body: JSON.stringify(activation),
            headers: {"Content-Type": "application/json"},
        });
        return parseJson<DeviceActivationResponse>(body);
    }

    async startOperatorSession(pairKey: string): Promise<OperatorSessionResponse> {
        const body = await this.request("POST", "/devices/current-user/sessions", {
            headers: {[HEADER_DEVICE_PAIR_KEY]: pairKey},
        });
        return parseJson<OperatorSessionResponse>(body);
    }

    async endOperatorSession(pairKey: string): Promise<void> {
        await this.request("DELETE", "/devices/current-user/sessions", {
            headers: {[HEADER_DEVICE_PAIR_KEY]: pairKey},
        });
    }

    async heartbeat(pairKey: string, heartbeat: DeviceHeartbeat): Promise<DeviceHeartbeatResponse> {
        const body = await this.request("POST", "/internal/device-pairing-verifications/heartbeats", {
            body: JSON.stringify(heartbeat),
            headers: {"Content-Type": "application/json", [HEADER_DEVICE_PAIR_KEY]: pairKey},
        });
        return parseJson<DeviceHeartbeatResponse>(body);
    }

    async shipmentByTrackingNumber(trackingNumber: string): Promise<ShipmentLookupDetails> {
        const path = `/shipments/tracking-numbers/${encodeURIComponent(trackingNumber)}/control-center`;
        return parseJson<ShipmentLookupDetails>(await this.request("GET", path));
    }

    async myConfiguration(): Promise<SupplierConfiguration> {
        return parseJson<SupplierConfiguration>(await this.request("GET", "/suppliers/me/configuration"));
    }

    async updateMyConfiguration(update: SupplierConfigurationUpdate): Promise<SupplierConfiguration> {
        const body = await this.request("PUT", "/suppliers/me/configuration", {
            body: JSON.stringify(update),
            headers: {"Content-Type": "application/json"},
        });
        return parseJson<SupplierConfiguration>(body);
    }

    async resetMyConfiguration(version: number | null): Promise<SupplierConfiguration> {
        const body = await this.request("POST", "/suppliers/me/configuration/reset", {
            body: JSON.stringify({version}),
            headers: {"Content-Type": "application/json"},
        });
        return parseJson<SupplierConfiguration>(body);
    }

    async myConfigurationHistory(): Promise<ConfigurationRevision[]> {
        return parseJson<ConfigurationRevision[]>(await this.request("GET", "/suppliers/me/configuration/history"));
    }

    async substituteCandidates(): Promise<SubstituteCandidate[]> {
        return parseJson<SubstituteCandidate[]>(await this.request("GET", "/suppliers/me/configuration/substitute-candidates"));
    }

    async chatUsers(): Promise<ChatUserApi[]> {
        return parseJson<ChatUserApi[]>(await this.request("GET", "/users"));
    }

    async openDirectConversation(participantUserId: string): Promise<ChatConversationApi> {
        const body = await this.request("POST", `/chat/conversations/direct/${encodeURIComponent(participantUserId)}`);
        return parseJson<ChatConversationApi>(body);
    }

    async chatMessages(conversationId: string, limit = 100): Promise<ChatMessageApi[]> {
        const path = `/chat/conversations/${encodeURIComponent(conversationId)}/messages?limit=${limit}`;
        return parseJson<ChatMessageApi[]>(await this.request("GET", path));
    }

    async sendChatMessage(conversationId: string, clientMessageId: string, body: string): Promise<ChatMessageApi> {
        const response = await this.request("POST", `/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
            body: JSON.stringify({clientMessageId, body}),
            headers: {"Content-Type": "application/json"},
        });
        return parseJson<ChatMessageApi>(response);
    }

    async pickupPoints(query: string, collectionOnly: boolean): Promise<PickupPointPage> {
        return parseJson<PickupPointPage>(await this.request("GET", `/pickup-points?${pickupPointsQuery(query, collectionOnly)}`));
    }

    async pickupPoint(pickupPointId: string): Promise<PickupPoint> {
        return parseJson<PickupPoint>(await this.request("GET", `/pickup-points/${encodeURIComponent(pickupPointId)}`));
    }

    async supplierProfile(supplierCode: string): Promise<SupplierProfile> {
        return parseJson<SupplierProfile>(await this.request("GET", `/suppliers/by-suppliercode/${encodeURIComponent(supplierCode)}`));
    }

    async carriers(): Promise<Carrier[]> {
        return parseJson<Carrier[]>(await this.request("GET", "/carriers"));
    }

    async supplierDeliveries(supplierId: number | string, limit = 50): Promise<Delivery[]> {
        return parseJson<Delivery[]>(await this.request("GET", `/deliveries?supplierId=${encodeURIComponent(String(supplierId))}&limit=${limit}`));
    }

    async delivery(deliveryId: string): Promise<Delivery> {
        return parseJson<Delivery>(await this.request("GET", `/deliveries/${encodeURIComponent(deliveryId)}`));
    }

    async shipmentById(shipmentId: string): Promise<ShipmentLookupDetails> {
        return parseJson<ShipmentLookupDetails>(await this.request("GET", `/shipments/${encodeURIComponent(shipmentId)}/control-center`));
    }

    async registerDeliveryAttempt(deliveryId: string, deliveryStatus: AttemptStatus, comment: string | null): Promise<Delivery> {
        const body = await this.request("POST", `/deliveries/${encodeURIComponent(deliveryId)}/attempts`, {
            body: JSON.stringify({deliveryStatus, comment}),
            headers: {"Content-Type": "application/json"},
        });
        return parseJson<Delivery>(body);
    }

    async commentDeliveryStep(deliveryId: string, stepNumber: number, comment: string): Promise<Delivery> {
        const body = await this.request("PUT", `/deliveries/${encodeURIComponent(deliveryId)}/steps/${stepNumber}/comment`, {
            body: JSON.stringify({comment}),
            headers: {"Content-Type": "application/json"},
        });
        return parseJson<Delivery>(body);
    }

    async myProcesses(page = 0, size = 20): Promise<ProcessLogPage> {
        return parseJson<ProcessLogPage>(await this.request("GET", `/process-logs?page=${page}&size=${size}&sort=createdAt,desc`));
    }

    async process(processId: string): Promise<ProcessLog> {
        return parseJson<ProcessLog>(await this.request("GET", `/process-logs/${encodeURIComponent(processId)}`));
    }

    async sendScans(mode: ScanMode,
                    device: DeviceInformation,
                    items: ScanItem[],
                    options: ScanOptions): Promise<TerminalResult> {
        const xml = buildEnvelope(mode, device, items, options);
        let responseBody: string;
        try {
            responseBody = await this.request("POST", "/ws", {
                body: xml,
                headers: {
                    "Content-Type": "text/xml; charset=utf-8",
                    Accept: "text/xml",
                    SOAPAction: `"http://warehouse.com/logistics/terminal/${SOAP_ACTIONS[mode]}"`,
                },
            });
        } catch (error) {
            if (error instanceof ApiError && error.status > 0) {
                throw new TerminalFaultError(error.message);
            }
            throw error;
        }
        return parseEnvelope(mode, responseBody);
    }
}
