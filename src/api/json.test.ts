import assert from "node:assert/strict";
import {test} from "node:test";
import {parseJson, quoteLargeIntegers} from "./json.ts";

test("keeps 63-bit identifiers exact", () => {
    const parsed = parseJson<{supplierId: string; vehicleId: {value: string}}>(
        "{\"supplierId\":6047483447382963523,\"vehicleId\":{\"value\":9223372036854775807}}");
    assert.equal(parsed.supplierId, "6047483447382963523");
    assert.equal(parsed.vehicleId.value, "9223372036854775807");
});

test("leaves ordinary numbers as numbers", () => {
    const parsed = parseJson<{count: number; weight: number; negative: number; exponent: number; ids: number[]}>(
        "{\"count\":42,\"weight\":2.5,\"negative\":-7,\"exponent\":1e21,\"ids\":[1,999999999999999]}");
    assert.deepEqual(parsed, {count: 42, weight: 2.5, negative: -7, exponent: 1e21, ids: [1, 999999999999999]});
});

test("does not touch digits inside strings", () => {
    const json = "{\"note\":\"order 6047483447382963523, \\\"quoted\\\" 1234567890123456789\",\"id\":1234567890123456789}";
    assert.deepEqual(parseJson(json), {
        note: "order 6047483447382963523, \"quoted\" 1234567890123456789",
        id: "1234567890123456789",
    });
});

test("quotes large negative integers and array items", () => {
    assert.equal(quoteLargeIntegers("[-6047483447382963523, 7]"), "[\"-6047483447382963523\", 7]");
});
