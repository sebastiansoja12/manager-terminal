import assert from "node:assert/strict";
import {test} from "node:test";
import {createOutboxEntry, dayStats, historyStatus, isTransientSendError, outboxItemCount, retryableEntries} from "./outbox.ts";
import type {HistoryEntry, ScanOptions} from "./types.ts";

const options: ScanOptions = {supplierCode: "", rejectReason: "Uszkodzona paczka", returnToken: "", recipientName: "", signature: ""};

const entry = (overrides: Partial<HistoryEntry>): HistoryEntry => ({
    id: "1",
    mode: "COLLECT",
    processId: null,
    success: true,
    details: [],
    summary: null,
    sentAt: "2026-10-23T08:00:00.000Z",
    itemCount: 1,
    ...overrides,
});

test("treats only connection problems as transient", () => {
    const network = Object.assign(new Error("Brak połączenia z serwerem"), {status: 0});
    const server = Object.assign(new Error("Błąd serwera (500)"), {status: 500});
    assert.equal(isTransientSendError(network), true);
    assert.equal(isTransientSendError(server), false);
    assert.equal(isTransientSendError(new Error("fault")), false);
    assert.equal(isTransientSendError(null), false);
});

test("outbox entry keeps its own copy of the options", () => {
    const shared = {...options};
    const created = createOutboxEntry("REJECT", [{code: "123", scannedAt: "2026-10-23T08:00:00.000Z"}], shared, "timeout",
        new Date("2026-10-23T08:01:00.000Z"));
    shared.rejectReason = "zmieniony";
    assert.equal(created.options.rejectReason, "Uszkodzona paczka");
    assert.equal(created.attempts, 1);
    assert.equal(created.blocked, false);
    assert.equal(created.queuedAt, "2026-10-23T08:01:00.000Z");
});

test("counts queued items and skips blocked entries when retrying", () => {
    const first = createOutboxEntry("COLLECT", [{code: "A", scannedAt: ""}, {code: "B", scannedAt: ""}], options, "x");
    const second = {...createOutboxEntry("MISS", [{code: "1", scannedAt: ""}], options, "x"), blocked: true};
    assert.equal(outboxItemCount([first, second]), 3);
    assert.deepEqual(retryableEntries([first, second]).map((item) => item.mode), ["COLLECT"]);
});

test("day stats count only today's successful items", () => {
    const now = new Date(2026, 9, 23, 15, 0, 0);
    const today = new Date(2026, 9, 23, 9, 0, 0).toISOString();
    const yesterday = new Date(2026, 9, 22, 9, 0, 0).toISOString();
    const stats = dayStats([
        entry({sentAt: today, itemCount: 3}),
        entry({sentAt: today, mode: "HANDOVER", itemCount: 2}),
        entry({
            sentAt: today, itemCount: 2, success: false,
            details: [{code: "A", success: true, message: null}, {code: "B", success: false, message: "nie istnieje"}],
        }),
        entry({sentAt: yesterday, itemCount: 10}),
    ], now);
    assert.deepEqual(stats, {sent: 6, delivered: 2, failed: 1, batches: 3});
});

test("history status distinguishes partial results", () => {
    assert.equal(historyStatus(entry({success: true})), "ok");
    assert.equal(historyStatus(entry({
        success: false,
        details: [{code: "A", success: true, message: null}, {code: "B", success: false, message: null}],
    })), "partial");
    assert.equal(historyStatus(entry({success: false, details: []})), "error");
});
