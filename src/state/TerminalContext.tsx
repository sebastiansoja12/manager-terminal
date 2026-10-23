import * as Application from "expo-application";
import Constants from "expo-constants";
import * as ExpoDevice from "expo-device";
import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
import {AppState, Platform} from "react-native";
import {ApiError, CurrentUser, DeviceAssignmentMode, DeviceHeartbeat, ManagerClient, ManagerDevice, normalizeServerUrl} from "../api/client";
import {formatActivationCode, isDeviceCredentialFault} from "../terminal/activation";
import {createOutboxEntry, isTransientSendError, OutboxEntry, RETRY_INTERVAL_MS} from "../terminal/outbox";
import {modeIsSingleScan} from "../terminal/soap";
import type {SupplierConfiguration} from "../terminal/supplierConfiguration";
import type {DeviceInformation, HistoryEntry, ScanItem, ScanMode, ScanOptions, TerminalResult} from "../terminal/types";
import {readJson, readSecret, writeJson, writeSecret} from "./storage";

export type RegisteredDevice = {
    deviceId: string;
    version: string | null;
    deviceType: string | null;
    departmentCode: string | null;
    assignmentMode?: DeviceAssignmentMode | null;
};

export type AddScanResult = "added" | "duplicate" | "invalid" | "replaced";

export type ConnectionState = "online" | "offline" | "unknown";

export type SendOutcome =
    | {status: "sent"; result: TerminalResult}
    | {status: "queued"; entry: OutboxEntry};

type PendingScans = Record<ScanMode, ScanItem[]>;

const EMPTY_PENDING: PendingScans = {COLLECT: [], PALLET: [], RETURN: [], REJECT: [], MISS: [], HANDOVER: []};
const DEFAULT_OPTIONS: ScanOptions = {supplierCode: "", rejectReason: "", returnToken: "", recipientName: "", signature: ""};
const HISTORY_LIMIT = 50;

const KEYS = {
    serverUrl: "terminal.serverUrl",
    user: "terminal.user",
    device: "terminal.device",
    pairKey: "terminal.pairKey",
    operatorSession: "terminal.operatorSession",
    installationId: "terminal.installationId",
    pending: "terminal.pending",
    history: "terminal.history",
    options: "terminal.options",
    supplierConfiguration: "terminal.supplierConfiguration",
    outbox: "terminal.outbox",
    lastMode: "terminal.lastMode",
    cameraPreferred: "terminal.cameraPreferred",
};

export const APP_VERSION = Application.nativeApplicationVersion || Constants.expoConfig?.version || "1.0.0";

const randomInstallationId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

const resolveInstallationId = async (): Promise<string> => {
    const platformId = Platform.OS === "android"
        ? Application.getAndroidId()
        : Platform.OS === "ios" ? await Application.getIosIdForVendorAsync().catch(() => null) : null;
    if (platformId) {
        return `${Platform.OS}-${platformId}`;
    }
    const storedId = await readSecret(KEYS.installationId);
    if (storedId) {
        return storedId;
    }
    const generatedId = `${Platform.OS}-${randomInstallationId()}`;
    await writeSecret(KEYS.installationId, generatedId);
    return generatedId;
};

const deviceHeartbeat = (): DeviceHeartbeat => ({
    version: APP_VERSION,
    manufacturer: ExpoDevice.manufacturer,
    model: ExpoDevice.modelName,
    osName: ExpoDevice.osName,
    osVersion: ExpoDevice.osVersion,
});

type TerminalState = {
    ready: boolean;
    serverUrl: string;
    user: CurrentUser | null;
    device: RegisteredDevice | null;
    pairKey: string | null;
    operatorSessionExpiresAt: string | null;
    updateRequired: boolean;
    client: ManagerClient | null;
    pending: PendingScans;
    history: HistoryEntry[];
    options: ScanOptions;
    supplierConfiguration: SupplierConfiguration | null;
    outbox: OutboxEntry[];
    connection: ConnectionState;
    retrying: boolean;
    lastMode: ScanMode;
    cameraPreferred: boolean;
    activate: (serverUrl: string, activationCode: string) => Promise<void>;
    login: (username: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    deregister: () => Promise<void>;
    addScan: (mode: ScanMode, rawCode: string) => AddScanResult;
    removeScan: (mode: ScanMode, code: string) => void;
    clearScans: (mode: ScanMode) => void;
    setOptions: (options: ScanOptions) => void;
    send: (mode: ScanMode) => Promise<SendOutcome>;
    clearHistory: () => void;
    retryOutbox: (entryId?: string) => Promise<void>;
    restoreOutboxEntry: (entryId: string) => void;
    discardOutboxEntry: (entryId: string) => void;
    setLastMode: (mode: ScanMode) => void;
    setCameraPreferred: (value: boolean) => void;
    storeSupplierConfiguration: (configuration: SupplierConfiguration) => void;
};

const TerminalContext = createContext<TerminalState | null>(null);

const toRegisteredDevice = (device: ManagerDevice): RegisteredDevice => ({
    deviceId: device.deviceId?.value || "",
    version: device.version?.value || null,
    deviceType: device.deviceType || null,
    departmentCode: device.depotCode?.value || null,
    assignmentMode: device.assignmentMode || null,
});

const scanTime = () => new Date().toISOString();

export function TerminalProvider({children}: {children: React.ReactNode}) {
    const [ready, setReady] = useState(false);
    const [serverUrl, setServerUrl] = useState("");
    const [user, setUser] = useState<CurrentUser | null>(null);
    const [device, setDevice] = useState<RegisteredDevice | null>(null);
    const [pairKey, setPairKey] = useState<string | null>(null);
    const [operatorSessionExpiresAt, setOperatorSessionExpiresAt] = useState<string | null>(null);
    const [updateRequired, setUpdateRequired] = useState(false);
    const [pending, setPending] = useState<PendingScans>(EMPTY_PENDING);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [options, setOptionsState] = useState<ScanOptions>(DEFAULT_OPTIONS);
    const [supplierConfiguration, setSupplierConfiguration] = useState<SupplierConfiguration | null>(null);
    const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
    const [connection, setConnection] = useState<ConnectionState>("unknown");
    const [retrying, setRetrying] = useState(false);
    const [lastMode, setLastModeState] = useState<ScanMode>("COLLECT");
    const [cameraPreferred, setCameraPreferredState] = useState(false);
    const pendingRef = useRef(pending);
    const outboxRef = useRef(outbox);
    const retryingRef = useRef(false);

    const client = useMemo(() => (serverUrl ? new ManagerClient(serverUrl) : null), [serverUrl]);

    useEffect(() => {
        (async () => {
            const [
                storedUrl, storedUser, storedDevice, storedPairKey, storedSession, storedPending, storedHistory, storedOptions,
                storedConfiguration, storedOutbox, storedLastMode, storedCameraPreferred,
            ] = await Promise.all([
                readJson<string>(KEYS.serverUrl, ""),
                readJson<CurrentUser | null>(KEYS.user, null),
                readJson<RegisteredDevice | null>(KEYS.device, null),
                readSecret(KEYS.pairKey),
                readJson<string | null>(KEYS.operatorSession, null),
                readJson<PendingScans>(KEYS.pending, EMPTY_PENDING),
                readJson<HistoryEntry[]>(KEYS.history, []),
                readJson<ScanOptions>(KEYS.options, DEFAULT_OPTIONS),
                readJson<SupplierConfiguration | null>(KEYS.supplierConfiguration, null),
                readJson<OutboxEntry[]>(KEYS.outbox, []),
                readJson<ScanMode>(KEYS.lastMode, "COLLECT"),
                readJson<boolean>(KEYS.cameraPreferred, false),
            ]);
            setServerUrl(storedUrl);
            setUser(storedUser);
            setDevice(storedDevice);
            setPairKey(storedPairKey);
            setOperatorSessionExpiresAt(storedSession);
            setPending({...EMPTY_PENDING, ...storedPending});
            setHistory(storedHistory);
            setOptionsState({...DEFAULT_OPTIONS, ...storedOptions});
            setSupplierConfiguration(storedConfiguration);
            outboxRef.current = storedOutbox;
            setOutbox(storedOutbox);
            setLastModeState(storedLastMode);
            setCameraPreferredState(storedCameraPreferred);
            setReady(true);
        })();
    }, []);

    useEffect(() => {
        pendingRef.current = pending;
        if (ready) {
            writeJson(KEYS.pending, pending);
        }
    }, [pending, ready]);

    const updateOutbox = useCallback((change: (current: OutboxEntry[]) => OutboxEntry[]) => {
        const next = change(outboxRef.current);
        outboxRef.current = next;
        setOutbox(next);
        writeJson(KEYS.outbox, next);
    }, []);

    const recordHistory = useCallback((result: TerminalResult, itemCount: number) => {
        const entry: HistoryEntry = {
            ...result,
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            sentAt: new Date().toISOString(),
            itemCount,
        };
        setHistory((current) => {
            const next = [entry, ...current].slice(0, HISTORY_LIMIT);
            writeJson(KEYS.history, next);
            return next;
        });
    }, []);

    const storeSupplierConfiguration = useCallback((configuration: SupplierConfiguration | null) => {
        setSupplierConfiguration(configuration);
        writeJson(KEYS.supplierConfiguration, configuration);
    }, []);

    const storeDevice = useCallback(async (managerDevice: ManagerDevice) => {
        const registeredDevice = toRegisteredDevice(managerDevice);
        setDevice(registeredDevice);
        await writeJson(KEYS.device, registeredDevice);
    }, []);

    const clearOperator = useCallback(async () => {
        setUser(null);
        setOperatorSessionExpiresAt(null);
        storeSupplierConfiguration(null);
        await Promise.all([writeJson(KEYS.user, null), writeJson(KEYS.operatorSession, null)]);
    }, [storeSupplierConfiguration]);

    const clearRegistration = useCallback(async () => {
        setDevice(null);
        setPairKey(null);
        setUpdateRequired(false);
        await Promise.all([writeJson(KEYS.device, null), writeSecret(KEYS.pairKey, null), clearOperator()]);
    }, [clearOperator]);

    const activate = useCallback(async (url: string, activationCode: string) => {
        const normalizedUrl = normalizeServerUrl(url);
        const activationClient = new ManagerClient(normalizedUrl);
        const response = await activationClient.activateDevice({
            ...deviceHeartbeat(),
            activationCode: formatActivationCode(activationCode),
            installationId: await resolveInstallationId(),
            deviceType: "MOBILE",
            appVersion: APP_VERSION,
        });
        await clearOperator();
        setServerUrl(normalizedUrl);
        setPairKey(response.pairKey);
        await Promise.all([
            writeJson(KEYS.serverUrl, normalizedUrl),
            writeSecret(KEYS.pairKey, response.pairKey),
            storeDevice(response.device),
        ]);
    }, [clearOperator, storeDevice]);

    const login = useCallback(async (username: string, password: string) => {
        if (!client || !pairKey) {
            throw new Error("Urządzenie nie jest aktywowane");
        }
        const currentUser = await client.login(username.trim(), password);
        try {
            const session = await client.startOperatorSession(pairKey);
            await storeDevice(session.device);
            setOperatorSessionExpiresAt(session.sessionExpiresAt);
            await writeJson(KEYS.operatorSession, session.sessionExpiresAt);
        } catch (error) {
            await client.logout();
            if (error instanceof ApiError && isDeviceCredentialFault(error.message)) {
                await clearRegistration();
            }
            throw error;
        }
        setUser(currentUser);
        await writeJson(KEYS.user, currentUser);
    }, [client, pairKey, storeDevice, clearRegistration]);

    useEffect(() => {
        if (!ready || !user || !client) {
            return;
        }
        client.myConfiguration()
            .then(storeSupplierConfiguration)
            .catch((error) => {
                if (error instanceof ApiError && error.status === 404) {
                    storeSupplierConfiguration(null);
                }
            });
    }, [ready, user, client, storeSupplierConfiguration]);

    const endSession = useCallback(async () => {
        if (client && pairKey && user) {
            await client.endOperatorSession(pairKey).catch(() => undefined);
        }
        await client?.logout();
    }, [client, pairKey, user]);

    const logout = useCallback(async () => {
        await endSession();
        await clearOperator();
    }, [endSession, clearOperator]);

    const deregister = useCallback(async () => {
        await endSession();
        await clearRegistration();
    }, [endSession, clearRegistration]);

    useEffect(() => {
        if (!ready || !client || !pairKey) {
            return;
        }
        const reportHeartbeat = () => {
            client.heartbeat(pairKey, deviceHeartbeat())
                .then((response) => {
                    setConnection("online");
                    setUpdateRequired(Boolean(response.updateRequired));
                })
                .catch((error) => {
                    if (error instanceof ApiError && error.status === 0) {
                        setConnection("offline");
                    }
                    if (error instanceof ApiError && error.status === 401) {
                        clearRegistration();
                    }
                });
        };
        reportHeartbeat();
        const subscription = AppState.addEventListener("change", (state) => {
            if (state === "active") {
                reportHeartbeat();
            }
        });
        return () => subscription.remove();
    }, [ready, client, pairKey, clearRegistration]);

    const addScan = useCallback((mode: ScanMode, rawCode: string): AddScanResult => {
        const code = rawCode.trim();
        if (!code) {
            return "invalid";
        }
        const current = pendingRef.current[mode];
        if (current.some((item) => item.code === code)) {
            return "duplicate";
        }
        const item = {code, scannedAt: scanTime()};
        const single = modeIsSingleScan(mode);
        const next = {...pendingRef.current, [mode]: single ? [item] : [item, ...current]};
        pendingRef.current = next;
        setPending(next);
        return single && current.length ? "replaced" : "added";
    }, []);

    const removeScan = useCallback((mode: ScanMode, code: string) => {
        setPending((current) => ({...current, [mode]: current[mode].filter((item) => item.code !== code)}));
    }, []);

    const clearScans = useCallback((mode: ScanMode) => {
        setPending((current) => ({...current, [mode]: []}));
    }, []);

    const setOptions = useCallback((next: ScanOptions) => {
        setOptionsState(next);
        writeJson(KEYS.options, next);
    }, []);

    const deviceInformation = useCallback((): DeviceInformation => {
        if (!device || !pairKey) {
            throw new Error("Urządzenie nie jest aktywowane");
        }
        return {
            version: device.version || APP_VERSION,
            deviceId: device.deviceId,
            responsibleUser: user?.username || "",
            departmentCode: device.departmentCode || user?.departmentCode || "",
            pairKey,
            deviceUserType: "SUPPLIER",
            deviceType: device.deviceType || "MOBILE",
        };
    }, [device, pairKey, user]);

    const send = useCallback(async (mode: ScanMode): Promise<SendOutcome> => {
        if (!client) {
            throw new Error("Urządzenie nie jest aktywowane");
        }
        const information = deviceInformation();
        const items = [...pendingRef.current[mode]].reverse();
        if (!items.length) {
            throw new Error("Brak zeskanowanych kodów");
        }
        const sentCodes = new Set(items.map((item) => item.code));
        const dropSent = () => setPending((current) => ({...current, [mode]: current[mode].filter((item) => !sentCodes.has(item.code))}));
        try {
            const result = await client.sendScans(mode, information, items, options);
            setConnection("online");
            dropSent();
            recordHistory(result, items.length);
            return {status: "sent", result};
        } catch (error) {
            if (!isTransientSendError(error)) {
                throw error;
            }
            setConnection("offline");
            const entry = createOutboxEntry(mode, items, options, (error as Error).message);
            dropSent();
            updateOutbox((current) => [...current, entry]);
            return {status: "queued", entry};
        }
    }, [client, deviceInformation, options, recordHistory, updateOutbox]);

    const retryOutbox = useCallback(async (entryId?: string) => {
        if (!client || !user || retryingRef.current) {
            return;
        }
        if (entryId) {
            updateOutbox((current) => current.map((entry) => (entry.id === entryId ? {...entry, blocked: false} : entry)));
        }
        const queue = outboxRef.current.filter((entry) => !entry.blocked && (!entryId || entry.id === entryId));
        if (!queue.length) {
            return;
        }
        retryingRef.current = true;
        setRetrying(true);
        try {
            const information = deviceInformation();
            for (const entry of queue) {
                const attemptAt = new Date().toISOString();
                try {
                    const result = await client.sendScans(entry.mode, information, entry.items, entry.options);
                    setConnection("online");
                    updateOutbox((current) => current.filter((item) => item.id !== entry.id));
                    recordHistory(result, entry.items.length);
                } catch (error) {
                    const transient = isTransientSendError(error);
                    updateOutbox((current) => current.map((item) => (item.id === entry.id
                        ? {...item, attempts: item.attempts + 1, lastAttemptAt: attemptAt, lastError: (error as Error).message, blocked: !transient}
                        : item)));
                    if (transient) {
                        setConnection("offline");
                        break;
                    }
                }
            }
        } catch {
            // Device is not activated any more; entries stay in the outbox.
        } finally {
            retryingRef.current = false;
            setRetrying(false);
        }
    }, [client, user, deviceInformation, recordHistory, updateOutbox]);

    const restoreOutboxEntry = useCallback((entryId: string) => {
        const entry = outboxRef.current.find((item) => item.id === entryId);
        if (!entry) {
            return;
        }
        const next = {
            ...pendingRef.current,
            [entry.mode]: [
                ...entry.items.slice().reverse(),
                ...pendingRef.current[entry.mode].filter((item) => !entry.items.some((queued) => queued.code === item.code)),
            ],
        };
        pendingRef.current = next;
        setPending(next);
        updateOutbox((current) => current.filter((item) => item.id !== entryId));
    }, [updateOutbox]);

    const discardOutboxEntry = useCallback((entryId: string) => {
        updateOutbox((current) => current.filter((item) => item.id !== entryId));
    }, [updateOutbox]);

    const hasRetryableOutbox = outbox.some((entry) => !entry.blocked);

    useEffect(() => {
        if (!ready || !user || !client || !hasRetryableOutbox) {
            return;
        }
        retryOutbox();
        const timer = setInterval(() => retryOutbox(), RETRY_INTERVAL_MS);
        const subscription = AppState.addEventListener("change", (state) => {
            if (state === "active") {
                retryOutbox();
            }
        });
        return () => {
            clearInterval(timer);
            subscription.remove();
        };
    }, [ready, user, client, hasRetryableOutbox, retryOutbox]);

    useEffect(() => {
        if (connection === "online" && hasRetryableOutbox) {
            retryOutbox();
        }
    }, [connection, hasRetryableOutbox, retryOutbox]);

    const setLastMode = useCallback((mode: ScanMode) => {
        setLastModeState(mode);
        writeJson(KEYS.lastMode, mode);
    }, []);

    const setCameraPreferred = useCallback((value: boolean) => {
        setCameraPreferredState(value);
        writeJson(KEYS.cameraPreferred, value);
    }, []);

    const clearHistory = useCallback(() => {
        setHistory([]);
        writeJson(KEYS.history, []);
    }, []);

    const value = useMemo<TerminalState>(() => ({
        ready, serverUrl, user, device, pairKey, operatorSessionExpiresAt, updateRequired, client, pending, history,
        options, supplierConfiguration, outbox, connection, retrying, lastMode, cameraPreferred, activate, login, logout,
        deregister, addScan, removeScan, clearScans, setOptions, send, clearHistory, storeSupplierConfiguration,
        retryOutbox, restoreOutboxEntry, discardOutboxEntry, setLastMode, setCameraPreferred,
    }), [ready, serverUrl, user, device, pairKey, operatorSessionExpiresAt, updateRequired, client, pending, history,
        options, supplierConfiguration, outbox, connection, retrying, lastMode, cameraPreferred, activate, login, logout,
        deregister, addScan, removeScan, clearScans, setOptions, send, clearHistory, storeSupplierConfiguration,
        retryOutbox, restoreOutboxEntry, discardOutboxEntry, setLastMode, setCameraPreferred]);

    return <TerminalContext.Provider value={value}>{children}</TerminalContext.Provider>;
}

export const useTerminal = () => {
    const context = useContext(TerminalContext);
    if (!context) {
        throw new Error("useTerminal must be used within TerminalProvider");
    }
    return context;
};
