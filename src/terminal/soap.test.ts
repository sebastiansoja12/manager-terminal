import assert from "node:assert/strict";
import {test} from "node:test";
import {buildEnvelope, findFaultMessage, parseEnvelope, TerminalFaultError} from "./soap.ts";
import type {DeviceInformation, ScanOptions} from "./types.ts";

const device: DeviceInformation = {
    version: "1.3.0",
    deviceId: "SC:abc",
    responsibleUser: "warehouse.user",
    departmentCode: "KT1",
    pairKey: "key&<1>",
    deviceUserType: "SUPPLIER",
    deviceType: "SCANNER",
};
const options: ScanOptions = {supplierCode: "SUP-01", rejectReason: "Uszkodzona", returnToken: "12345"};
const items = [{code: "FTM-1", scannedAt: ""}, {code: "FTM-2", scannedAt: ""}];

const wrap = (body: string) =>
    `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Header/><SOAP-ENV:Body>${body}</SOAP-ENV:Body></SOAP-ENV:Envelope>`;

test("collect envelope contains device and tracking numbers with escaped values", () => {
    const xml = buildEnvelope("COLLECT", device, items, options);
    assert.match(xml, /<CollectRequest xmlns="http:\/\/warehouse.com\/logistics\/terminal">/);
    assert.match(xml, /<DeviceInformation><Version>1.3.0<\/Version><DeviceID>SC:abc<\/DeviceID>/);
    assert.match(xml, /<PairKey>key&amp;&lt;1&gt;<\/PairKey>/);
    assert.match(xml, /<CollectDetail><TrackingNumber>FTM-1<\/TrackingNumber><\/CollectDetail><CollectDetail><TrackingNumber>FTM-2/);
});

test("reject envelope follows TerminalRequest element order from XSD", () => {
    const xml = buildEnvelope("REJECT", device, [{code: "1000000001", scannedAt: ""}], options);
    assert.match(xml, /<TerminalRequest[^>]*><ProcessType>REJECT<\/ProcessType><Device>/);
    assert.match(xml, /<DeliveryRejectDetail><ShipmentID>1000000001<\/ShipmentID><SupplierCode>SUP-01<\/SupplierCode><DeliveryStatus>REJECTED<\/DeliveryStatus><DepartmentCode>KT1<\/DepartmentCode><RejectReason>Uszkodzona<\/RejectReason>/);
});

test("pallet envelope sends single pallet number", () => {
    const xml = buildEnvelope("PALLET", device, [{code: "PAL1", scannedAt: ""}], options);
    assert.match(xml, /<\/DeviceInformation><PalletTrackingNumber>PAL1<\/PalletTrackingNumber><\/PalletScanRequest>/);
});

test("parses collect response with partial success", () => {
    const result = parseEnvelope("COLLECT", wrap(
        `<ns2:CollectResponse xmlns:ns2="http://warehouse.com/logistics/terminal"><ns2:ProcessId>P-1</ns2:ProcessId><ns2:Success>false</ns2:Success>`
        + `<ns2:CollectResponseDetails><ns2:CollectResponseDetail><ns2:TrackingNumber>FTM-1</ns2:TrackingNumber><ns2:ShipmentID>55</ns2:ShipmentID><ns2:Success>true</ns2:Success></ns2:CollectResponseDetail></ns2:CollectResponseDetails>`
        + `</ns2:CollectResponse>`));
    assert.equal(result.processId, "P-1");
    assert.equal(result.success, false);
    assert.deepEqual(result.details, [{code: "FTM-1", success: true, message: "ID 55"}]);
});

test("parses pallet response", () => {
    const result = parseEnvelope("PALLET", wrap(
        `<PalletScanResponse xmlns="http://warehouse.com/logistics/terminal"><ProcessId>P-2</ProcessId><Success>true</Success><PalletTrackingNumber>PAL1</PalletTrackingNumber>`
        + `<PalletStatus>LOADED</PalletStatus><AlreadyLoaded>true</AlreadyLoaded>`
        + `<PalletScanResponseDetails><PalletScanResponseDetail><ShipmentID>9</ShipmentID><Success>true</Success><ShipmentStatus>DEPOT</ShipmentStatus></PalletScanResponseDetail>`
        + `<PalletScanResponseDetail><ShipmentID>10</ShipmentID><Success>false</Success><ErrorMessage>Lost</ErrorMessage></PalletScanResponseDetail></PalletScanResponseDetails></PalletScanResponse>`));
    assert.equal(result.success, true);
    assert.equal(result.summary, "Paleta PAL1 — LOADED · już załadowana");
    assert.equal(result.details.length, 2);
    assert.equal(result.details[1].message, "Lost");
});

test("parses return response with error detail", () => {
    const result = parseEnvelope("RETURN", wrap(
        `<TerminalResponse xmlns="http://warehouse.com/logistics/terminal"><ProcessId>P-3</ProcessId><DeliveryReturnResponse><DeliveryReturnResponseDetails>`
        + `<DeliveryReturnResponseDetail><ShipmentID>1</ShipmentID><ErrorMessage>Not found</ErrorMessage></DeliveryReturnResponseDetail>`
        + `</DeliveryReturnResponseDetails></DeliveryReturnResponse></TerminalResponse>`));
    assert.equal(result.processId, "P-3");
    assert.equal(result.success, false);
    assert.equal(result.details[0].message, "Not found");
});

test("SOAP fault is raised as TerminalFaultError", () => {
    const fault = wrap(`<SOAP-ENV:Fault><faultcode>SOAP-ENV:Server</faultcode><faultstring xml:lang="en">Invalid device pair key</faultstring></SOAP-ENV:Fault>`);
    assert.equal(findFaultMessage(fault), "Invalid device pair key");
    assert.throws(() => parseEnvelope("COLLECT", fault), TerminalFaultError);
    assert.equal(findFaultMessage("{\"message\":\"x\"}"), null);
});
