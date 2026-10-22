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
};

export type DevicePairResponse = {
    deviceId: Wrapped<string>;
    pairStatus: string | null;
    pairKey: string | null;
};

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
        return JSON.parse(body);
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
        return JSON.parse(await this.request("GET", "/auth/me")) as CurrentUser;
    }

    async currentUserDevices(): Promise<ManagerDevice[]> {
        return JSON.parse(await this.request("GET", "/devices/current-user")) as ManagerDevice[];
    }

    async pairDevice(externalSystemId: string, departmentCode: string | null): Promise<DevicePairResponse> {
        const body = await this.request("POST", "/devices/current-user/pairings", {
            body: JSON.stringify({
                externalSystemId,
                departmentCode: departmentCode ? {value: departmentCode} : null,
            }),
            headers: {"Content-Type": "application/json"},
        });
        return JSON.parse(body) as DevicePairResponse;
    }

    async shipmentByTrackingNumber(trackingNumber: string): Promise<ShipmentLookupDetails> {
        const path = `/shipments/tracking-numbers/${encodeURIComponent(trackingNumber)}/control-center`;
        return JSON.parse(await this.request("GET", path)) as ShipmentLookupDetails;
    }

    async myConfiguration(): Promise<SupplierConfiguration> {
        return JSON.parse(await this.request("GET", "/suppliers/me/configuration")) as SupplierConfiguration;
    }

    async updateMyConfiguration(update: SupplierConfigurationUpdate): Promise<SupplierConfiguration> {
        const body = await this.request("PUT", "/suppliers/me/configuration", {
            body: JSON.stringify(update),
            headers: {"Content-Type": "application/json"},
        });
        return JSON.parse(body) as SupplierConfiguration;
    }

    async resetMyConfiguration(version: number | null): Promise<SupplierConfiguration> {
        const body = await this.request("POST", "/suppliers/me/configuration/reset", {
            body: JSON.stringify({version}),
            headers: {"Content-Type": "application/json"},
        });
        return JSON.parse(body) as SupplierConfiguration;
    }

    async myConfigurationHistory(): Promise<ConfigurationRevision[]> {
        return JSON.parse(await this.request("GET", "/suppliers/me/configuration/history")) as ConfigurationRevision[];
    }

    async substituteCandidates(): Promise<SubstituteCandidate[]> {
        return JSON.parse(await this.request("GET", "/suppliers/me/configuration/substitute-candidates")) as SubstituteCandidate[];
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
