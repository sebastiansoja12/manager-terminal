import assert from "node:assert/strict";
import {test} from "node:test";
import {hasNextPage, humanMessage, pageItems, parcelCount, parseProcessRequest, summarizeProcess} from "./processes.ts";
import type {ProcessLog} from "./processes.ts";

const NS = "http://warehouse.com/logistics/terminal";
const DECLARATION = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;

const log = (request: string, response: string | null, status: ProcessLog["status"] = "SUCCESS",
             faultDescription: string | null = null): ProcessLog => ({
    processId: "p-1",
    request,
    response,
    createdAt: "2026-10-24T08:00:00Z",
    modifiedAt: null,
    status,
    faultDescription,
});

const device = `<DeviceInformation><DeviceID>TL-1</DeviceID></DeviceInformation>`;

test("counts parcels with Polish plural forms", () => {
    assert.equal(parcelCount(1), "1 paczka");
    assert.equal(parcelCount(3), "3 paczki");
    assert.equal(parcelCount(5), "5 paczek");
    assert.equal(parcelCount(12), "12 paczek");
    assert.equal(parcelCount(22), "22 paczki");
});

test("summarizes a partially successful collect with namespaced XML", () => {
    const summary = summarizeProcess(log(
        `${DECLARATION}<ns2:CollectRequest xmlns:ns2="${NS}">${device}<ns2:CollectDetails>`
        + `<ns2:CollectDetail><ns2:TrackingNumber>FTM-1</ns2:TrackingNumber></ns2:CollectDetail>`
        + `<ns2:CollectDetail><ns2:TrackingNumber>FTM-2</ns2:TrackingNumber></ns2:CollectDetail>`
        + `</ns2:CollectDetails></ns2:CollectRequest>`,
        `${DECLARATION}<ns2:CollectResponse xmlns:ns2="${NS}"><ns2:ProcessId>p-1</ns2:ProcessId><ns2:Success>false</ns2:Success>`
        + `<ns2:CollectResponseDetails>`
        + `<ns2:CollectResponseDetail><ns2:TrackingNumber>FTM-1</ns2:TrackingNumber><ns2:Success>true</ns2:Success></ns2:CollectResponseDetail>`
        + `<ns2:CollectResponseDetail><ns2:TrackingNumber>FTM-2</ns2:TrackingNumber><ns2:Success>false</ns2:Success>`
        + `<ns2:ErrorMessage>Shipment cannot be collected from status SENT</ns2:ErrorMessage></ns2:CollectResponseDetail>`
        + `</ns2:CollectResponseDetails></ns2:CollectResponse>`,
    ));
    assert.equal(summary.mode, "COLLECT");
    assert.equal(summary.title, "Odbiór od klienta · 2 paczki");
    assert.equal(summary.outcome, "PARTIAL");
    assert.equal(summary.outcomeLabel, "Częściowo udane");
    assert.deepEqual(summary.parcels.map((parcel) => [parcel.trackingNumber, parcel.success]), [["FTM-1", true], ["FTM-2", false]]);
    assert.equal(summary.parcels[1].message, "Nie można odebrać przesyłki w statusie „Wysłana”");
});

test("summarizes a single-parcel handover with recipient", () => {
    const summary = summarizeProcess(log(
        `<HandoverRequest xmlns="${NS}">${device}<HandoverDetails><RecipientName>Jan Kowalski</RecipientName>`
        + `<HandoverDetail><TrackingNumber>FTM-9</TrackingNumber></HandoverDetail></HandoverDetails></HandoverRequest>`,
        `<HandoverResponse xmlns="${NS}"><Success>true</Success><HandoverResponseDetails>`
        + `<HandoverResponseDetail><TrackingNumber>FTM-9</TrackingNumber><Success>true</Success></HandoverResponseDetail>`
        + `</HandoverResponseDetails></HandoverResponse>`,
    ));
    assert.equal(summary.title, "Doręczenie");
    assert.equal(summary.subtitle, "Odebrał(a): Jan Kowalski");
    assert.equal(summary.outcome, "SUCCESS");
    assert.equal(summary.parcels[0].message, "Doręczona odbiorcy");
});

test("shows the new tracking number after a rejection with redirection", () => {
    const summary = summarizeProcess(log(
        `<TerminalRequest xmlns="${NS}"><ProcessType>REJECT</ProcessType><DeliveryRejectRequest><DeliveryRejectDetails>`
        + `<DeliveryRejectDetail><TrackingNumber>FTM-3</TrackingNumber><RejectReason>Uszkodzona</RejectReason></DeliveryRejectDetail>`
        + `</DeliveryRejectDetails></DeliveryRejectRequest></TerminalRequest>`,
        `<TerminalResponse><ProcessId>p-1</ProcessId><DeliveryRejectResponse><DeliveryRejectResponseDetails>`
        + `<DeliveryRejectResponseDetail><TrackingNumber>FTM-3</TrackingNumber><NewTrackingNumber>FTM-3R</NewTrackingNumber>`
        + `<DeliveryStatus>REJECTED</DeliveryStatus></DeliveryRejectResponseDetail>`
        + `</DeliveryRejectResponseDetails></DeliveryRejectResponse></TerminalResponse>`,
    ));
    assert.equal(summary.title, "Odmowa przyjęcia");
    assert.equal(summary.subtitle, "Powód: Uszkodzona");
    assert.deepEqual(summary.parcels, [{
        trackingNumber: "FTM-3", success: true, newTrackingNumber: "FTM-3R",
        message: "Odmowa przyjęta — przesyłka wraca do nadawcy",
    }]);
});

test("does not report a new number when it equals the original", () => {
    const summary = summarizeProcess(log(
        `<TerminalRequest xmlns="${NS}"><ProcessType>REJECT</ProcessType><DeliveryRejectRequest><DeliveryRejectDetails>`
        + `<DeliveryRejectDetail><TrackingNumber>FTM-4</TrackingNumber></DeliveryRejectDetail></DeliveryRejectDetails></DeliveryRejectRequest></TerminalRequest>`,
        `<TerminalResponse><DeliveryRejectResponse><DeliveryRejectResponseDetails><DeliveryRejectResponseDetail>`
        + `<TrackingNumber>FTM-4</TrackingNumber><NewTrackingNumber>FTM-4</NewTrackingNumber></DeliveryRejectResponseDetail>`
        + `</DeliveryRejectResponseDetails></DeliveryRejectResponse></TerminalResponse>`,
    ));
    assert.equal(summary.parcels[0].newTrackingNumber, null);
    assert.equal(summary.parcels[0].message, "Odmowa przyjęta");
});

test("summarizes returns with a created return shipment and a failed parcel", () => {
    const summary = summarizeProcess(log(
        `<TerminalRequest xmlns="${NS}"><ProcessType>RETURN</ProcessType><DeliveryReturnRequest><DeliveryReturnDetails>`
        + `<DeliveryReturnDetail><TrackingNumber>FTM-5</TrackingNumber></DeliveryReturnDetail>`
        + `<DeliveryReturnDetail><TrackingNumber>FTM-6</TrackingNumber></DeliveryReturnDetail>`
        + `</DeliveryReturnDetails></DeliveryReturnRequest></TerminalRequest>`,
        `<TerminalResponse><DeliveryReturnResponse><DeliveryReturnResponseDetails>`
        + `<DeliveryReturnResponseDetail><TrackingNumber>FTM-5</TrackingNumber><NewTrackingNumber>FTM-5Z</NewTrackingNumber><UpdateStatus>OK</UpdateStatus></DeliveryReturnResponseDetail>`
        + `<DeliveryReturnResponseDetail><TrackingNumber>FTM-6</TrackingNumber><UpdateStatus>NOT_OK</UpdateStatus><ErrorMessage>Wrong return token</ErrorMessage></DeliveryReturnResponseDetail>`
        + `</DeliveryReturnResponseDetails></DeliveryReturnResponse></TerminalResponse>`,
    ));
    assert.equal(summary.title, "Zwrot · 2 paczki");
    assert.equal(summary.outcome, "PARTIAL");
    assert.equal(summary.parcels[0].newTrackingNumber, "FTM-5Z");
    assert.equal(summary.parcels[0].message, "Zwrot zarejestrowany — utworzono przesyłkę zwrotną");
    assert.equal(summary.parcels[1].success, false);
    assert.equal(summary.parcels[1].message, "Nieprawidłowy token zwrotu");
});

test("uses request parcels and process status for missed deliveries", () => {
    const request = `<TerminalRequest xmlns="${NS}"><ProcessType>MISS</ProcessType><DeliveryMissedRequest><DeliveryMissedDetails>`
        + `<DeliveryMissedDetail><TrackingNumber>FTM-7</TrackingNumber></DeliveryMissedDetail>`
        + `</DeliveryMissedDetails></DeliveryMissedRequest></TerminalRequest>`;
    const done = summarizeProcess(log(request, `<TerminalResponse><ProcessId>p-1</ProcessId></TerminalResponse>`));
    assert.equal(done.title, "Nieobecny odbiorca");
    assert.equal(done.outcome, "SUCCESS");
    assert.deepEqual(done.parcels[0], {trackingNumber: "FTM-7", success: true, message: "Zgłoszono nieobecność odbiorcy", newTrackingNumber: null});

    const failed = summarizeProcess(log(request, null, "FAILURE", "Shipment with tracking number FTM-7 not found"));
    assert.equal(failed.outcome, "FAILED");
    assert.equal(failed.problem, "Nie znaleziono przesyłki FTM-7");
    assert.equal(failed.parcels[0].success, false);
});

test("lists shipments loaded by a pallet scan", () => {
    const summary = summarizeProcess(log(
        `<PalletScanRequest xmlns="${NS}">${device}<PalletTrackingNumber>PAL1</PalletTrackingNumber></PalletScanRequest>`,
        `<PalletScanResponse xmlns="${NS}"><Success>true</Success><PalletTrackingNumber>PAL1</PalletTrackingNumber>`
        + `<PalletStatus>LOADED</PalletStatus><AlreadyLoaded>true</AlreadyLoaded><PalletScanResponseDetails>`
        + `<PalletScanResponseDetail><TrackingNumber>FTM-8</TrackingNumber><Success>true</Success><ShipmentStatus>SENT</ShipmentStatus></PalletScanResponseDetail>`
        + `</PalletScanResponseDetails></PalletScanResponse>`,
    ));
    assert.equal(summary.title, "Skan palety PAL1");
    assert.equal(summary.subtitle, "Paleta: LOADED, była już załadowana");
    assert.deepEqual(summary.parcels, [{trackingNumber: "FTM-8", success: true, message: "Status: Wysłana", newTrackingNumber: null}]);
});

test("marks processes without a response as pending and unknown requests as other operations", () => {
    const pending = summarizeProcess(log(
        `<CollectRequest xmlns="${NS}"><CollectDetails><CollectDetail><TrackingNumber>FTM-1</TrackingNumber></CollectDetail></CollectDetails></CollectRequest>`,
        null, "CREATED"));
    assert.equal(pending.outcome, "PENDING");
    assert.equal(pending.outcomeLabel, "W toku");
    assert.equal(pending.parcels[0].success, null);

    const other = summarizeProcess(log("<SomethingElse/>", null, "SUCCESS"));
    assert.equal(other.title, "Inna operacja");
    assert.equal(other.mode, null);
    assert.equal(parseProcessRequest("not xml").mode, null);
});

test("translates known backend messages and keeps unknown ones", () => {
    assert.equal(humanMessage("Invalid device pair key"), "Urządzenie nie jest sparowane z managerem");
    assert.equal(humanMessage("Tracking number is duplicated in request"), "Numer zeskanowano więcej niż raz");
    assert.equal(humanMessage("Coś innego"), "Coś innego");
    assert.equal(humanMessage("  "), null);
});

test("reads both Spring page shapes", () => {
    const item = log("<x/>", null);
    assert.deepEqual(pageItems({content: [item], last: false}), [item]);
    assert.equal(hasNextPage({content: [item], last: false}), true);
    assert.equal(hasNextPage({content: [item], page: {number: 0, totalPages: 1}}), false);
    assert.equal(hasNextPage({content: [item], page: {number: 0, totalPages: 3}}), true);
    assert.deepEqual(pageItems(null), []);
});
