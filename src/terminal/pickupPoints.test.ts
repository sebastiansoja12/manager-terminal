import assert from "node:assert/strict";
import {test} from "node:test";
import {
    formatIntervals,
    formatMinute,
    pickupPointAddress,
    pickupPointState,
    pickupPointsQuery,
    weeklyHours,
} from "./pickupPoints.ts";
import type {PickupPoint} from "./pickupPoints.ts";

const point = (overrides: Partial<PickupPoint> = {}): PickupPoint => ({
    pickupPointId: {value: "1b4c0f3a-0000-4000-8000-000000000001"},
    code: "KT-001",
    name: "Kiosk Mariacka",
    type: "SERVICE_POINT",
    status: "ACTIVE",
    capabilities: ["DROP_OFF", "COLLECTION"],
    address: {countryCode: "PL", postalCode: "40-001", city: "Katowice", street: "Mariacka", buildingNumber: "1", unitNumber: null},
    openingSchedule: {
        timeZone: "Europe/Warsaw",
        mode: "WEEKLY",
        days: [
            {dayOfWeek: "MONDAY", availability: "INTERVALS", intervals: [{startMinute: 480, endMinute: 720}, {startMinute: 780, endMinute: 1080}]},
            {dayOfWeek: "SATURDAY", availability: "ALL_DAY", intervals: []},
            {dayOfWeek: "SUNDAY", availability: "CLOSED", intervals: []},
        ],
        exceptions: [],
    },
    ...overrides,
});

test("formats minutes of day", () => {
    assert.equal(formatMinute(0), "00:00");
    assert.equal(formatMinute(545), "09:05");
    assert.equal(formatMinute(1440), "00:00");
});

test("formats opening intervals", () => {
    assert.equal(formatIntervals("ALL_DAY", []), "Całą dobę");
    assert.equal(formatIntervals("CLOSED", [{startMinute: 1, endMinute: 2}]), "Nieczynne");
    assert.equal(formatIntervals("INTERVALS", [{startMinute: 480, endMinute: 960}]), "08:00–16:00");
});

test("builds Monday-first weekly hours with missing days closed", () => {
    const hours = weeklyHours(point());
    assert.equal(hours.length, 7);
    assert.deepEqual(hours[0], {day: "MONDAY", label: "Pon", hours: "08:00–12:00, 13:00–18:00"});
    assert.equal(hours[1].hours, "Nieczynne");
    assert.equal(hours[5].hours, "Całą dobę");
    assert.equal(hours[6].hours, "Nieczynne");
    assert.ok(weeklyHours(point({openingSchedule: {timeZone: "UTC", mode: "ALWAYS_OPEN", days: []}}))
        .every((row) => row.hours === "Całą dobę"));
    assert.deepEqual(weeklyHours(point({openingSchedule: null})), []);
});

test("formats address with unit number", () => {
    assert.equal(pickupPointAddress(point()), "Mariacka 1, 40-001 Katowice");
    assert.equal(pickupPointAddress(point({address: {...point().address, unitNumber: "4"}})), "Mariacka 1/4, 40-001 Katowice");
});

test("describes point state from status and opening", () => {
    assert.deepEqual(pickupPointState(point({availability: {selectable: true, isOpenNow: true}})), {label: "Otwarte teraz", tone: "success"});
    assert.deepEqual(pickupPointState(point({availability: {selectable: true, isOpenNow: false}})), {label: "Teraz zamknięte", tone: "neutral"});
    assert.equal(pickupPointState(point({status: "SUSPENDED"})).tone, "warning");
    assert.equal(pickupPointState(point({status: "CLOSED"})).tone, "danger");
});

test("builds search query for active points", () => {
    assert.equal(pickupPointsQuery(" Katowice ", true), "status=ACTIVE&size=50&query=Katowice&capability=COLLECTION");
    assert.equal(pickupPointsQuery("", false, 20), "status=ACTIVE&size=20");
});
