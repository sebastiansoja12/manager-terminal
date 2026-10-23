import type {HistoryEntry, ScanItem, ScanMode, ScanOptions} from "./types";

// A batch that could not reach the manager (no network / timeout). It keeps its own copy of
// the options (reject reason, return token, signature…) so it can be re-sent later unchanged.
export type OutboxEntry = {
    id: string;
    mode: ScanMode;
    items: ScanItem[];
    options: ScanOptions;
    queuedAt: string;
    attempts: number;
    lastAttemptAt: string | null;
    lastError: string | null;
    // Set when the manager answered with an error that a retry will not fix (fault, expired session).
    blocked: boolean;
};

export const RETRY_INTERVAL_MS = 30_000;

type ErrorWithStatus = {status?: unknown; name?: unknown};

// ManagerClient reports connection problems and timeouts as ApiError with status 0.
export const isTransientSendError = (error: unknown): boolean => {
    if (!error || typeof error !== "object") {
        return false;
    }
    const {status, name} = error as ErrorWithStatus;
    if (name === "TerminalFaultError") {
        return false;
    }
    return status === 0;
};

export const createOutboxEntry = (mode: ScanMode, items: ScanItem[], options: ScanOptions, error: string, now = new Date()): OutboxEntry => ({
    id: `${now.getTime()}-${mode}`,
    mode,
    items,
    options: {...options},
    queuedAt: now.toISOString(),
    attempts: 1,
    lastAttemptAt: now.toISOString(),
    lastError: error,
    blocked: false,
});

export const outboxItemCount = (outbox: OutboxEntry[]) => outbox.reduce((total, entry) => total + entry.items.length, 0);

export const retryableEntries = (outbox: OutboxEntry[]) => outbox.filter((entry) => !entry.blocked);

const sameDay = (iso: string, now: Date) => {
    const date = new Date(iso);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
};

export type DayStats = {
    sent: number;
    delivered: number;
    failed: number;
    batches: number;
};

// Counts today's items from local send history (only what was sent from this phone).
export const dayStats = (history: HistoryEntry[], now = new Date()): DayStats => history
    .filter((entry) => sameDay(entry.sentAt, now))
    .reduce<DayStats>((stats, entry) => {
        const failed = entry.details.length
            ? entry.details.filter((detail) => !detail.success).length
            : entry.success ? 0 : entry.itemCount;
        const succeeded = Math.max(entry.itemCount - failed, 0);
        return {
            sent: stats.sent + succeeded,
            delivered: stats.delivered + (entry.mode === "HANDOVER" ? succeeded : 0),
            failed: stats.failed + failed,
            batches: stats.batches + 1,
        };
    }, {sent: 0, delivered: 0, failed: 0, batches: 0});

export type HistoryStatus = "ok" | "partial" | "error";

export const historyStatus = (entry: HistoryEntry): HistoryStatus => {
    if (entry.success) {
        return "ok";
    }
    const failed = entry.details.filter((detail) => !detail.success).length;
    return entry.details.length && failed < entry.details.length ? "partial" : "error";
};
