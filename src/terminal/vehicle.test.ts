import assert from "node:assert/strict";
import {test} from "node:test";
import {expiryState, findAssignedVehicle, formatMaxLoad, label, VEHICLE_TYPE_LABELS} from "./vehicle.ts";
import type {Carrier} from "./vehicle.ts";

const carrier = (carrierId: number, vehicleIds: number[]): Carrier => ({
    carrierId,
    name: `Przewoźnik ${carrierId}`,
    taxId: null,
    phone: null,
    email: null,
    defaultTransportType: "OWN_FLEET",
    active: true,
    vehicles: vehicleIds.map((vehicleId) => ({
        vehicleId,
        registrationNumber: `SK ${vehicleId}`,
        vehicleType: "VAN",
        trailerRegistrationNumber: null,
        maxLoadKg: 1200,
        active: true,
    })),
});

test("finds the carrier owning the supplier's vehicle", () => {
    const carriers = [carrier(1, [10, 11]), carrier(2, [20])];
    const assigned = findAssignedVehicle(carriers, {value: 20});
    assert.equal(assigned?.carrier.carrierId, 2);
    assert.equal(assigned?.vehicle.registrationNumber, "SK 20");
    assert.equal(findAssignedVehicle(carriers, {value: "11"})?.carrier.carrierId, 1);
    assert.equal(findAssignedVehicle(carriers, {value: 99}), null);
    assert.equal(findAssignedVehicle(carriers, null), null);
});

test("formats maximum load in kilograms or tonnes", () => {
    assert.equal(formatMaxLoad(850), "850 kg");
    assert.equal(formatMaxLoad(3500), "3,5 t");
    assert.equal(formatMaxLoad(null), null);
});

test("labels enum values and falls back to the raw value", () => {
    assert.equal(label(VEHICLE_TYPE_LABELS, "VAN"), "Dostawczy");
    assert.equal(label(VEHICLE_TYPE_LABELS, "HOVERCRAFT"), "HOVERCRAFT");
    assert.equal(label(VEHICLE_TYPE_LABELS, null), null);
});

test("describes document expiry", () => {
    const now = new Date("2026-10-23T12:00:00Z");
    assert.equal(expiryState("2026-10-01T00:00:00Z", now).tone, "danger");
    assert.equal(expiryState("2026-11-10T00:00:00Z", now).tone, "warning");
    assert.match(expiryState("2026-10-24T12:00:00Z", now).label, /^Wygasa za 1 dzień/);
    assert.equal(expiryState("2027-06-01T00:00:00Z", now).tone, "success");
    assert.equal(expiryState(null, now).tone, "neutral");
});
