import assert from "node:assert/strict";
import {test} from "node:test";
import {attemptsLabel, deliveriesForTab, deliveryTone, isOpen, isOverdue, latestStep, statusLabel} from "./deliveries.ts";
import type {Delivery, DeliveryStep} from "./deliveries.ts";

const step = (stepNumber: number, outcome: DeliveryStep["outcome"]): DeliveryStep => ({
    stepNumber, attemptedAt: "2026-10-23T08:00:00", outcome, deliveryStatus: null, userId: null, comment: null, failureReason: null,
});

const delivery = (id: string, overrides: Partial<Delivery> = {}): Delivery => ({
    id,
    targetType: "SHIPMENT",
    targetId: id,
    shipmentId: id,
    type: "OUTBOUND",
    deliveryStatus: "DELIVERY",
    lifecycleStatus: "MODIFIED",
    method: "COURIER",
    supplierId: "7",
    signatureRequired: false,
    instructions: null,
    createdAt: "2026-10-22T08:00:00",
    plannedAt: null,
    deliveredAt: null,
    attemptLimit: 3,
    steps: [],
    ...overrides,
});

test("treats delivered, completed and canceled deliveries as done", () => {
    assert.equal(isOpen(delivery("1")), true);
    assert.equal(isOpen(delivery("2", {deliveryStatus: "DELIVERED"})), false);
    assert.equal(isOpen(delivery("3", {lifecycleStatus: "COMPLETED"})), false);
    assert.equal(isOpen(delivery("4", {lifecycleStatus: "CANCELED"})), false);
});

test("orders open deliveries by plan, then by creation; done newest first", () => {
    const list = [
        delivery("late", {createdAt: "2026-10-22T10:00:00"}),
        delivery("early", {createdAt: "2026-10-21T10:00:00"}),
        delivery("planned", {plannedAt: "2026-10-23T14:00:00", createdAt: "2026-10-23T07:00:00"}),
        delivery("doneOld", {deliveryStatus: "DELIVERED", deliveredAt: "2026-10-20T10:00:00"}),
        delivery("doneNew", {lifecycleStatus: "COMPLETED", deliveredAt: "2026-10-22T10:00:00"}),
    ];
    assert.deepEqual(deliveriesForTab(list, "OPEN").map((entry) => entry.id), ["planned", "early", "late"]);
    assert.deepEqual(deliveriesForTab(list, "DONE").map((entry) => entry.id), ["doneNew", "doneOld"]);
});

test("counts failed attempts against the limit", () => {
    assert.equal(attemptsLabel(delivery("1")), null);
    assert.equal(attemptsLabel(delivery("2", {steps: [step(0, "IN_PROGRESS"), step(1, "FAILED")]})), "Nieudane próby: 1/3");
    assert.equal(attemptsLabel(delivery("3", {attemptLimit: 0, steps: [step(0, "FAILED")]})), "Nieudane próby: 1");
});

test("finds the latest step by number", () => {
    assert.equal(latestStep(delivery("1")), null);
    assert.equal(latestStep(delivery("2", {steps: [step(2, null), step(0, null), step(1, null)]}))?.stepNumber, 2);
});

test("picks a tone for the delivery state", () => {
    assert.equal(deliveryTone(delivery("1")), "info");
    assert.equal(deliveryTone(delivery("2", {steps: [step(0, "FAILED")]})), "warning");
    assert.equal(deliveryTone(delivery("3", {deliveryStatus: "REJECTED"})), "danger");
    assert.equal(deliveryTone(delivery("4", {deliveryStatus: "DELIVERED"})), "success");
    assert.equal(deliveryTone(delivery("5", {lifecycleStatus: "CANCELED"})), "neutral");
});

test("flags open deliveries past their planned time", () => {
    const now = new Date("2026-10-23T12:00:00");
    assert.equal(isOverdue(delivery("1", {plannedAt: "2026-10-23T10:00:00"}), now), true);
    assert.equal(isOverdue(delivery("2", {plannedAt: "2026-10-23T14:00:00"}), now), false);
    assert.equal(isOverdue(delivery("3", {plannedAt: "2026-10-23T10:00:00", deliveryStatus: "DELIVERED"}), now), false);
});

test("labels statuses with a fallback", () => {
    assert.equal(statusLabel("UNAVAILABLE"), "Odbiorca niedostępny");
    assert.equal(statusLabel("NEW_STATUS"), "NEW_STATUS");
    assert.equal(statusLabel(null), "Brak statusu");
});
