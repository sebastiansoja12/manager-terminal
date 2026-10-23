export type ScanMode = "COLLECT" | "PALLET" | "RETURN" | "REJECT" | "MISS" | "HANDOVER";

export type DeviceInformation = {
    version: string;
    deviceId: string;
    responsibleUser: string;
    departmentCode: string;
    pairKey: string;
    deviceUserType: "MANAGER" | "SUPPLIER";
    deviceType: string;
};

export type ScanItem = {
    code: string;
    scannedAt: string;
};

export type ScanOptions = {
    supplierCode: string;
    rejectReason: string;
    returnToken: string;
    recipientName: string;
    signature: string;
};

export type ResultDetail = {
    code: string;
    success: boolean;
    message: string | null;
};

export type TerminalResult = {
    mode: ScanMode;
    processId: string | null;
    success: boolean;
    details: ResultDetail[];
    summary: string | null;
};

export type HistoryEntry = TerminalResult & {
    id: string;
    sentAt: string;
    itemCount: number;
};
