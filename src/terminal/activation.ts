export const DEVICE_ACTIVATION_QR_TYPE = "MANAGER_DEVICE_ACTIVATION";

export type ActivationRequest = {
    serverUrl: string;
    activationCode: string;
};

const ACTIVATION_CODE_PATTERN = /^[A-Z0-9]{8}$/;

export const normalizeActivationCode = (value: string): string => value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

export const formatActivationCode = (value: string): string => {
    const normalized = normalizeActivationCode(value);
    return normalized.length > 4 ? `${normalized.slice(0, 4)}-${normalized.slice(4)}` : normalized;
};

export const isActivationCodeComplete = (value: string): boolean => (
    ACTIVATION_CODE_PATTERN.test(normalizeActivationCode(value))
);

export const parseActivationQr = (raw: string): ActivationRequest | null => {
    try {
        const payload = JSON.parse(raw) as {type?: unknown; serverUrl?: unknown; activationCode?: unknown};
        if (payload.type !== DEVICE_ACTIVATION_QR_TYPE
            || typeof payload.serverUrl !== "string"
            || typeof payload.activationCode !== "string"
            || !payload.serverUrl.trim()
            || !isActivationCodeComplete(payload.activationCode)) {
            return null;
        }
        return {serverUrl: payload.serverUrl.trim(), activationCode: formatActivationCode(payload.activationCode)};
    } catch {
        return null;
    }
};

export const isOperatorSessionFault = (message: string): boolean => /no operator signed in/i.test(message);

export const isDeviceCredentialFault = (message: string): boolean => (
    /pair key|invalid device credentials|device.*(not found|inactive|not active)/i.test(message)
);
