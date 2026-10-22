import Constants from "expo-constants";
import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
import {ApiError, CurrentUser, ManagerClient, ManagerDevice, normalizeServerUrl} from "../api/client";
import {isNumericShipmentId, modeIsSingleScan, modeRequiresShipmentId} from "../terminal/soap";
import type {SupplierConfiguration} from "../terminal/supplierConfiguration";
import type {DeviceInformation, HistoryEntry, ScanItem, ScanMode, ScanOptions, TerminalResult} from "../terminal/types";
import {readJson, readSecret, writeJson, writeSecret} from "./storage";

export type PairedDevice = {
    deviceId: string;
    version: string | null;
    deviceType: string | null;
    departmentCode: string | null;
};

export type AddScanResult = "added" | "duplicate" | "invalid" | "replaced";

type PendingScans = Record<ScanMode, ScanItem[]>;

const EMPTY_PENDING: PendingScans = {COLLECT: [], PALLET: [], RETURN: [], REJECT: [], MISS: []};
const DEFAULT_OPTIONS: ScanOptions = {supplierCode: "", rejectReason: "", returnToken: ""};
const HISTORY_LIMIT = 50;

const KEYS = {
    serverUrl: "terminal.serverUrl",
    user: "terminal.user",
    device: "terminal.device",
    pairKey: "terminal.pairKey",
    pending: "terminal.pending",
    history: "terminal.history",
    options: "terminal.options",
    supplierConfiguration: "terminal.supplierConfiguration",
};

export const APP_VERSION = Constants.expoConfig?.version || "1.0.0";

type TerminalState = {
    ready: boolean;
    serverUrl: string;
    user: CurrentUser | null;
    device: PairedDevice | null;
    pairKey: string | null;
    client: ManagerClient | null;
    pending: PendingScans;
    history: HistoryEntry[];
    options: ScanOptions;
    supplierConfiguration: SupplierConfiguration | null;
    login: (serverUrl: string, username: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    pair: (device: ManagerDevice, externalSystemId: string) => Promise<void>;
    savePairKey: (device: ManagerDevice, pairKey: string) => Promise<void>;
    unpair: () => Promise<void>;
    addScan: (mode: ScanMode, rawCode: string) => AddScanResult;
    removeScan: (mode: ScanMode, code: string) => void;
    clearScans: (mode: ScanMode) => void;
    setOptions: (options: ScanOptions) => void;
    send: (mode: ScanMode) => Promise<TerminalResult>;
    clearHistory: () => void;
    storeSupplierConfiguration: (configuration: SupplierConfiguration) => void;
};

const TerminalContext = createContext<TerminalState | null>(null);

const toPairedDevice = (device: ManagerDevice): PairedDevice => ({
    deviceId: device.deviceId?.value || "",
    version: device.version?.value || null,
    deviceType: device.deviceType || null,
    departmentCode: device.depotCode?.value || null,
});

const scanTime = () => new Date().toISOString();

export function TerminalProvider({children}: {children: React.ReactNode}) {
    const [ready, setReady] = useState(false);
    const [serverUrl, setServerUrl] = useState("");
    const [user, setUser] = useState<CurrentUser | null>(null);
    const [device, setDevice] = useState<PairedDevice | null>(null);
    const [pairKey, setPairKey] = useState<string | null>(null);
    const [pending, setPending] = useState<PendingScans>(EMPTY_PENDING);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [options, setOptionsState] = useState<ScanOptions>(DEFAULT_OPTIONS);
    const [supplierConfiguration, setSupplierConfiguration] = useState<SupplierConfiguration | null>(null);
    const pendingRef = useRef(pending);

    const client = useMemo(() => (serverUrl ? new ManagerClient(serverUrl) : null), [serverUrl]);

    useEffect(() => {
        (async () => {
            const [storedUrl, storedUser, storedDevice, storedPairKey, storedPending, storedHistory, storedOptions, storedConfiguration] = await Promise.all([
                readJson<string>(KEYS.serverUrl, ""),
                readJson<CurrentUser | null>(KEYS.user, null),
                readJson<PairedDevice | null>(KEYS.device, null),
                readSecret(KEYS.pairKey),
                readJson<PendingScans>(KEYS.pending, EMPTY_PENDING),
                readJson<HistoryEntry[]>(KEYS.history, []),
                readJson<ScanOptions>(KEYS.options, DEFAULT_OPTIONS),
                readJson<SupplierConfiguration | null>(KEYS.supplierConfiguration, null),
            ]);
            setServerUrl(storedUrl);
            setUser(storedUser);
            setDevice(storedDevice);
            setPairKey(storedPairKey);
            setPending({...EMPTY_PENDING, ...storedPending});
            setHistory(storedHistory);
            setOptionsState({...DEFAULT_OPTIONS, ...storedOptions});
            setSupplierConfiguration(storedConfiguration);
            setReady(true);
        })();
    }, []);

    useEffect(() => {
        pendingRef.current = pending;
        if (ready) {
            writeJson(KEYS.pending, pending);
        }
    }, [pending, ready]);

    const login = useCallback(async (url: string, username: string, password: string) => {
        const normalizedUrl = normalizeServerUrl(url);
        const loginClient = new ManagerClient(normalizedUrl);
        const currentUser = await loginClient.login(username.trim(), password);
        setServerUrl(normalizedUrl);
        setUser(currentUser);
        await Promise.all([writeJson(KEYS.serverUrl, normalizedUrl), writeJson(KEYS.user, currentUser)]);
    }, []);

    const unpair = useCallback(async () => {
        setDevice(null);
        setPairKey(null);
        await Promise.all([writeJson(KEYS.device, null), writeSecret(KEYS.pairKey, null)]);
    }, []);

    const storeSupplierConfiguration = useCallback((configuration: SupplierConfiguration | null) => {
        setSupplierConfiguration(configuration);
        writeJson(KEYS.supplierConfiguration, configuration);
    }, []);

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

    const logout = useCallback(async () => {
        await client?.logout();
        await unpair();
        setUser(null);
        storeSupplierConfiguration(null);
        await writeJson(KEYS.user, null);
    }, [client, unpair, storeSupplierConfiguration]);

    const storePairing = useCallback(async (managerDevice: ManagerDevice, key: string, resolvedDeviceId?: string | null) => {
        const pairedDevice = {...toPairedDevice(managerDevice), deviceId: resolvedDeviceId || managerDevice.deviceId?.value || ""};
        setDevice(pairedDevice);
        setPairKey(key);
        await Promise.all([writeJson(KEYS.device, pairedDevice), writeSecret(KEYS.pairKey, key)]);
    }, []);

    const pair = useCallback(async (managerDevice: ManagerDevice, externalSystemId: string) => {
        if (!client) {
            throw new Error("Brak konfiguracji serwera");
        }
        const departmentCode = managerDevice.depotCode?.value || user?.departmentCode || null;
        const response = await client.pairDevice(externalSystemId.trim(), departmentCode);
        if (!response.pairKey) {
            throw new Error("Serwer nie zwrócił klucza parowania");
        }
        await storePairing(managerDevice, response.pairKey, response.deviceId?.value);
    }, [client, storePairing, user?.departmentCode]);

    const savePairKey = useCallback(async (managerDevice: ManagerDevice, key: string) => {
        await storePairing(managerDevice, key.trim());
    }, [storePairing]);

    const addScan = useCallback((mode: ScanMode, rawCode: string): AddScanResult => {
        const code = rawCode.trim();
        if (!code || (modeRequiresShipmentId(mode) && !isNumericShipmentId(code))) {
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

    const send = useCallback(async (mode: ScanMode): Promise<TerminalResult> => {
        if (!client || !device || !pairKey) {
            throw new Error("Urządzenie nie jest sparowane");
        }
        const items = [...pendingRef.current[mode]].reverse();
        if (!items.length) {
            throw new Error("Brak zeskanowanych kodów");
        }
        const deviceInformation: DeviceInformation = {
            version: device.version || APP_VERSION,
            deviceId: device.deviceId,
            responsibleUser: user?.username || "",
            departmentCode: device.departmentCode || user?.departmentCode || "",
            pairKey,
            deviceUserType: "SUPPLIER",
            deviceType: device.deviceType || "MOBILE",
        };
        const result = await client.sendScans(mode, deviceInformation, items, options);
        const sentCodes = new Set(items.map((item) => item.code));
        setPending((current) => ({...current, [mode]: current[mode].filter((item) => !sentCodes.has(item.code))}));
        const entry: HistoryEntry = {
            ...result,
            id: `${Date.now()}`,
            sentAt: new Date().toISOString(),
            itemCount: items.length,
        };
        setHistory((current) => {
            const next = [entry, ...current].slice(0, HISTORY_LIMIT);
            writeJson(KEYS.history, next);
            return next;
        });
        return result;
    }, [client, device, options, pairKey, user]);

    const clearHistory = useCallback(() => {
        setHistory([]);
        writeJson(KEYS.history, []);
    }, []);

    const value = useMemo<TerminalState>(() => ({
        ready, serverUrl, user, device, pairKey, client, pending, history, options, supplierConfiguration,
        login, logout, pair, savePairKey, unpair, addScan, removeScan, clearScans, setOptions, send, clearHistory,
        storeSupplierConfiguration,
    }), [ready, serverUrl, user, device, pairKey, client, pending, history, options, supplierConfiguration,
        login, logout, pair, savePairKey, unpair, addScan, removeScan, clearScans, setOptions, send, clearHistory,
        storeSupplierConfiguration]);

    return <TerminalContext.Provider value={value}>{children}</TerminalContext.Provider>;
}

export const useTerminal = () => {
    const context = useContext(TerminalContext);
    if (!context) {
        throw new Error("useTerminal must be used within TerminalProvider");
    }
    return context;
};
