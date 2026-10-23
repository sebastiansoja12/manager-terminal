import assert from "node:assert/strict";
import {test} from "node:test";
import {buildEnvelope, findFaultMessage, modeIsDeliveryProcess, parseEnvelope, TerminalFaultError} from "./soap.ts";
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
const options: ScanOptions = {supplierCode: "SUP-01", rejectReason: "Uszkodzona", returnToken: "12345", recipientName: "", signature: ""};
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
    const xml = buildEnvelope("REJECT", device, [{code: "PL0000000001", scannedAt: ""}], options);
    assert.match(xml, /<TerminalRequest[^>]*><ProcessType>REJECT<\/ProcessType><Device>/);
    assert.match(xml, /<DeliveryRejectDetail><TrackingNumber>PL0000000001<\/TrackingNumber><SupplierCode>SUP-01<\/SupplierCode><DeliveryStatus>REJECTED<\/DeliveryStatus><DepartmentCode>KT1<\/DepartmentCode><RejectReason>Uszkodzona<\/RejectReason>/);
});

test("pallet envelope sends single pallet number", () => {
    const xml = buildEnvelope("PALLET", device, [{code: "PAL1", scannedAt: ""}], options);
    assert.match(xml, /<\/DeviceInformation><PalletTrackingNumber>PAL1<\/PalletTrackingNumber><\/PalletScanRequest>/);
});

test("parses collect response with partial success", () => {
    const result = parseEnvelope("COLLECT", wrap(
        `<ns2:CollectResponse xmlns:ns2="http://warehouse.com/logistics/terminal"><ns2:ProcessId>P-1</ns2:ProcessId><ns2:Success>false</ns2:Success>`
        + `<ns2:CollectResponseDetails><ns2:CollectResponseDetail><ns2:TrackingNumber>FTM-1</ns2:TrackingNumber><ns2:Success>true</ns2:Success></ns2:CollectResponseDetail></ns2:CollectResponseDetails>`
        + `</ns2:CollectResponse>`));
    assert.equal(result.processId, "P-1");
    assert.equal(result.success, false);
    assert.deepEqual(result.details, [{code: "FTM-1", success: true, message: null}]);
});

test("handover envelope contains recipient, escaped signature and tracking numbers", () => {
    const xml = buildEnvelope("HANDOVER", device, items, {...options, recipientName: " Jan Kowalski ", signature: "<svg/>"});
    assert.match(xml, /<HandoverRequest xmlns="http:\/\/warehouse.com\/logistics\/terminal"><DeviceInformation>/);
    assert.match(xml, /<HandoverDetails><RecipientName>Jan Kowalski<\/RecipientName><Signature>&lt;svg\/&gt;<\/Signature><HandoverDetail><TrackingNumber>FTM-1<\/TrackingNumber><\/HandoverDetail>/);
});

test("handover envelope skips empty recipient confirmation", () => {
    const xml = buildEnvelope("HANDOVER", device, items, options);
    assert.match(xml, /<HandoverDetails><HandoverDetail><TrackingNumber>FTM-1/);
});

test("parses handover response with failed detail", () => {
    const result = parseEnvelope("HANDOVER", wrap(
        `<ns2:HandoverResponse xmlns:ns2="http://warehouse.com/logistics/terminal"><ns2:ProcessId>P-9</ns2:ProcessId><ns2:Success>false</ns2:Success>`
        + `<ns2:HandoverResponseDetails><ns2:HandoverResponseDetail><ns2:TrackingNumber>FTM-1</ns2:TrackingNumber><ns2:Success>true</ns2:Success></ns2:HandoverResponseDetail>`
        + `<ns2:HandoverResponseDetail><ns2:TrackingNumber>FTM-2</ns2:TrackingNumber><ns2:Success>false</ns2:Success><ns2:ErrorMessage>Shipment cannot be handed over</ns2:ErrorMessage></ns2:HandoverResponseDetail></ns2:HandoverResponseDetails>`
        + `</ns2:HandoverResponse>`));
    assert.equal(result.processId, "P-9");
    assert.equal(result.success, false);
    assert.equal(result.details[0].success, true);
    assert.equal(result.details[1].success, false);
    assert.equal(result.details[1].message, "Shipment cannot be handed over");
});

test("parses pallet response", () => {
    const result = parseEnvelope("PALLET", wrap(
        `<PalletScanResponse xmlns="http://warehouse.com/logistics/terminal"><ProcessId>P-2</ProcessId><Success>true</Success><PalletTrackingNumber>PAL1</PalletTrackingNumber>`
        + `<PalletStatus>LOADED</PalletStatus><AlreadyLoaded>true</AlreadyLoaded>`
        + `<PalletScanResponseDetails><PalletScanResponseDetail><TrackingNumber>FTM-9</TrackingNumber><Success>true</Success><ShipmentStatus>DEPOT</ShipmentStatus></PalletScanResponseDetail>`
        + `<PalletScanResponseDetail><TrackingNumber>FTM-10</TrackingNumber><Success>false</Success><ErrorMessage>Lost</ErrorMessage></PalletScanResponseDetail></PalletScanResponseDetails></PalletScanResponse>`));
    assert.equal(result.success, true);
    assert.equal(result.summary, "Paleta PAL1 — LOADED · już załadowana");
    assert.equal(result.details.length, 2);
    assert.equal(result.details[0].code, "FTM-9");
    assert.equal(result.details[1].message, "Lost");
});

test("parses return response with error detail", () => {
    const result = parseEnvelope("RETURN", wrap(
        `<TerminalResponse xmlns="http://warehouse.com/logistics/terminal"><ProcessId>P-3</ProcessId><DeliveryReturnResponse><DeliveryReturnResponseDetails>`
        + `<DeliveryReturnResponseDetail><TrackingNumber>FTM-1</TrackingNumber><ErrorMessage>Not found</ErrorMessage></DeliveryReturnResponseDetail>`
        + `</DeliveryReturnResponseDetails></DeliveryReturnResponse></TerminalResponse>`));
    assert.equal(result.processId, "P-3");
    assert.equal(result.success, false);
    assert.equal(result.details[0].code, "FTM-1");
    assert.equal(result.details[0].message, "Not found");
});

test("parses return response with the new return shipment", () => {
    const result = parseEnvelope("RETURN", wrap(
        `<TerminalResponse xmlns="http://warehouse.com/logistics/terminal"><ProcessId>P-4</ProcessId><DeliveryReturnResponse><DeliveryReturnResponseDetails>`
        + `<DeliveryReturnResponseDetail><TrackingNumber>FTM-1</TrackingNumber><NewTrackingNumber>FTM-RET-1</NewTrackingNumber><UpdateStatus>OK</UpdateStatus></DeliveryReturnResponseDetail>`
        + `</DeliveryReturnResponseDetails></DeliveryReturnResponse></TerminalResponse>`));
    assert.equal(result.success, true);
    assert.deepEqual(result.details, [{code: "FTM-1", success: true, message: "Przesyłka zwrotna FTM-RET-1"}]);
});

test("SOAP fault is raised as TerminalFaultError", () => {
    const fault = wrap(`<SOAP-ENV:Fault><faultcode>SOAP-ENV:Server</faultcode><faultstring xml:lang="en">Invalid device pair key</faultstring></SOAP-ENV:Fault>`);
    assert.equal(findFaultMessage(fault), "Invalid device pair key");
    assert.throws(() => parseEnvelope("COLLECT", fault), TerminalFaultError);
    assert.equal(findFaultMessage("{\"message\":\"x\"}"), null);
});

test("delivery processes send tracking numbers", () => {
    assert.equal(modeIsDeliveryProcess("RETURN"), true);
    assert.equal(modeIsDeliveryProcess("REJECT"), true);
    assert.equal(modeIsDeliveryProcess("MISS"), true);
    assert.equal(modeIsDeliveryProcess("COLLECT"), false);
    const missed = buildEnvelope("MISS", device, [{code: "PL0001", scannedAt: ""}], options);
    assert.match(missed, /<DeliveryMissedDetail><TrackingNumber>PL0001<\/TrackingNumber><DeliveryStatus>UNKNOWN<\/DeliveryStatus>/);
    assert.doesNotMatch(missed, /ShipmentID/);
    const returned = buildEnvelope("RETURN", device, [{code: "PL0002", scannedAt: ""}], options);
    assert.match(returned, /<DeliveryReturnDetail><TrackingNumber>PL0002<\/TrackingNumber>/);
});
