import assert from "node:assert/strict";
import {test} from "node:test";
import {
    isDraftDirty,
    isScanRequired,
    toDraft,
    toFieldErrors,
    toggleSetting,
    toUpdate,
    validateDraft,
} from "./supplierConfiguration.ts";
import type {SupplierConfiguration, SupplierSetting} from "./supplierConfiguration.ts";

const SETTINGS: SupplierSetting[] = [
    "COPY_DEPARTMENT_CODE_FROM_DEVICE", "SKIP_INVALID_SHIPMENTS", "AUTO_GENERATE_LABELS", "REQUIRE_PICKUP_SCAN",
    "REQUIRE_DELIVERY_SCAN", "ALLOW_MANUAL_SHIPMENT_ADDITION", "ALLOW_SHIPMENT_TRANSFER", "ALLOW_SHIPMENT_UNASSIGNMENT",
    "REQUIRE_PROOF_OF_DELIVERY", "REQUIRE_RECIPIENT_SIGNATURE", "REQUIRE_DELIVERY_PHOTO", "REQUIRE_NON_DELIVERY_REASON",
    "ALLOW_DELIVERY_ADDRESS_CHANGE", "ALLOW_DELIVERY_AREA_EDITING", "ALLOW_OUT_OF_AREA_DELIVERY", "ALLOW_DELIVERY_REORDERING",
    "AUTO_ASSIGN_SHIPMENTS_BY_AREA", "GENERATE_NEW_RETURN_CODES", "AUTO_MARK_FOR_RETURN", "REQUIRE_RETURN_SCAN",
    "AUTO_GENERATE_RETURN_LABELS", "NOTIFY_ABOUT_NEW_SHIPMENTS", "NOTIFY_ABOUT_ROUTE_CHANGES", "CONFIRM_SHIPMENT_TRANSFER",
];

const configuration = (overrides: Partial<SupplierConfiguration> = {}): SupplierConfiguration => ({
    supplierId: 11,
    supplierCode: "KUR-01",
    firstName: "Adam",
    lastName: "Nowak",
    settings: Object.fromEntries(SETTINGS.map((setting) => [setting, false])) as Record<SupplierSetting, boolean>,
    maxDeliveryAttempts: 3,
    maxShipmentsPerRoute: null,
    substituteSupplierCode: null,
    preferredLabelFormat: "PDF_A6",
    defaultShipmentSortOrder: "DELIVERY_ORDER",
    enforcedSettings: {},
    definitions: [],
    version: 2,
    updatedAt: null,
    updatedBy: null,
    ...overrides,
});

test("ignores toggling a setting enforced by the organization policy", () => {
    const loaded = configuration({enforcedSettings: {REQUIRE_PICKUP_SCAN: true}});
    const draft = toDraft(loaded);

    const next = toggleSetting(loaded, draft, "REQUIRE_PICKUP_SCAN", false);

    assert.equal(next, draft);
});

test("turns on proof of delivery when a signature becomes required", () => {
    const loaded = configuration();

    const next = toggleSetting(loaded, toDraft(loaded), "REQUIRE_RECIPIENT_SIGNATURE", true);

    assert.equal(next.settings.REQUIRE_PROOF_OF_DELIVERY, true);
    assert.equal(isDraftDirty(loaded, next), true);
});

test("validates numeric limits", () => {
    const draft = {...toDraft(configuration()), maxDeliveryAttempts: "0", maxShipmentsPerRoute: "abc"};

    assert.deepEqual(validateDraft(draft), {MAX_DELIVERY_ATTEMPTS: "MUST_BE_POSITIVE", MAX_SHIPMENTS_PER_ROUTE: "MUST_BE_POSITIVE"});
    assert.deepEqual(validateDraft({...draft, maxDeliveryAttempts: "4", maxShipmentsPerRoute: ""}), {});
});

test("maps an empty route limit to no limit and keeps the loaded version", () => {
    const update = toUpdate({...toDraft(configuration()), maxShipmentsPerRoute: " "}, 2);

    assert.equal(update.maxShipmentsPerRoute, null);
    assert.equal(update.maxDeliveryAttempts, 3);
    assert.equal(update.version, 2);
});

test("maps backend field errors", () => {
    const errors = toFieldErrors({code: "SUPPLIER_CONFIGURATION_INVALID", fieldErrors: [{field: "SUBSTITUTE_SUPPLIER_ID", code: "SUBSTITUTE_UNAVAILABLE"}]});

    assert.deepEqual(errors, {SUBSTITUTE_SUPPLIER_ID: "SUBSTITUTE_UNAVAILABLE"});
    assert.deepEqual(toFieldErrors(undefined), {});
});

test("requires scanning only in the modes covered by the configuration", () => {
    const loaded = configuration({settings: {...configuration().settings, REQUIRE_PICKUP_SCAN: true}});

    assert.equal(isScanRequired(loaded, "COLLECT"), true);
    assert.equal(isScanRequired(loaded, "RETURN"), false);
    assert.equal(isScanRequired(null, "COLLECT"), false);
});
