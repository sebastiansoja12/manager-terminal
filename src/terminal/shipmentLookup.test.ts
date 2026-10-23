import assert from "node:assert/strict";
import {test} from "node:test";
import {
    eventTitle,
    formatDimensions,
    formatWeight,
    normalizeTrackingNumber,
    partyAddress,
    partyName,
    routeEvents,
    statusStep,
    statusTone,
} from "./shipmentLookup.ts";
import type {ShipmentLookupDetails, ShipmentParty} from "./shipmentLookup.ts";

const party: ShipmentParty = {
    firstName: "Jan",
    lastName: "Kowalski",
    email: null,
    telephoneNumber: "+48123456789",
    city: "Katowice",
    postalCode: "40-001",
    street: "Mariacka 1",
    countryCode: "PL",
};

test("normalizes scanned tracking numbers", () => {
    assert.equal(normalizeTrackingNumber("  ab 12 cd "), "AB12CD");
});

test("formats parties and parcel data", () => {
    assert.equal(partyName(party), "Jan Kowalski");
    assert.equal(partyAddress(party), "Mariacka 1, 40-001 Katowice, PL");
    assert.equal(partyName({...party, firstName: null, lastName: null}), "—");
    assert.equal(formatWeight({value: 2.5, unit: "KG"}), "2.5 kg");
    assert.equal(formatDimensions({length: 30, width: 20, height: 10, unit: "CM"}), "30 × 20 × 10 cm");
    assert.equal(formatWeight(null), null);
});

test("sorts route events from newest", () => {
    const details = {
        shipment: {} as ShipmentLookupDetails["shipment"],
        routeLog: {routeLogRecordDetails: {routeLogRecordDetailSet: [
            {id: 1, timestamp: "2026-10-20T08:00:00Z", processType: "CREATED"},
            {id: 2, timestamp: "2026-10-22T08:00:00Z", processType: "DELIVERY"},
        ]}},
    } as ShipmentLookupDetails;

    assert.deepEqual(routeEvents(details).map((event) => event.id), [2, 1]);
    assert.deepEqual(routeEvents({...details, routeLog: null}), []);
});

test("describes route events in Polish with a fallback to raw codes", () => {
    assert.equal(eventTitle({id: 1, timestamp: "", processType: "ROUTE", parcelStatus: "DEPOT"}), "Przekazanie w trasie · w oddziale");
    assert.equal(eventTitle({id: 2, timestamp: "", processType: "NEW_TYPE"}), "NEW_TYPE");
});

test("maps statuses to tones", () => {
    assert.equal(statusTone("DELIVERY"), "success");
    assert.equal(statusTone("CANCELED"), "danger");
    assert.equal(statusTone("SENT"), "info");
});

test("maps statuses to delivery progress", () => {
    assert.equal(statusStep("CREATED"), 0);
    assert.equal(statusStep("SENT"), 2);
    assert.equal(statusStep("DELIVERY"), 3);
    assert.equal(statusStep("CANCELED"), null);
});
