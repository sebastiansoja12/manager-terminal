import {XMLParser} from "fast-xml-parser";
import type {DeviceInformation, ResultDetail, ScanItem, ScanMode, ScanOptions, TerminalResult} from "./types";

export const TERMINAL_NAMESPACE = "http://warehouse.com/logistics/terminal";
const SOAP_ENVELOPE_NAMESPACE = "http://schemas.xmlsoap.org/soap/envelope/";

export class TerminalFaultError extends Error {
}

const escapeXml = (value: string) => value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const element = (name: string, value: string | null | undefined) =>
    value === null || value === undefined || value === "" ? "" : `<${name}>${escapeXml(value)}</${name}>`;

const deviceXml = (tag: string, device: DeviceInformation) =>
    `<${tag}>`
    + element("Version", device.version)
    + element("DeviceID", device.deviceId)
    + element("ResponsibleUser", device.responsibleUser)
    + element("DepartmentCode", device.departmentCode)
    + element("PairKey", device.pairKey)
    + element("DeviceUserType", device.deviceUserType)
    + element("DeviceType", device.deviceType)
    + `</${tag}>`;

const envelope = (body: string) =>
    `<?xml version="1.0" encoding="UTF-8"?>`
    + `<soapenv:Envelope xmlns:soapenv="${SOAP_ENVELOPE_NAMESPACE}">`
    + `<soapenv:Body>${body}</soapenv:Body>`
    + `</soapenv:Envelope>`;

const terminalRequest = (processType: string, device: DeviceInformation, content: string) =>
    `<TerminalRequest xmlns="${TERMINAL_NAMESPACE}">`
    + element("ProcessType", processType)
    + deviceXml("Device", device)
    + content
    + `</TerminalRequest>`;

export const isNumericShipmentId = (code: string) => /^\d{1,19}$/.test(code);

export const modeRequiresShipmentId = (mode: ScanMode) => mode === "RETURN" || mode === "REJECT" || mode === "MISS";

export const modeIsSingleScan = (mode: ScanMode) => mode === "PALLET";

export const buildEnvelope = (mode: ScanMode,
                              device: DeviceInformation,
                              items: ScanItem[],
                              options: ScanOptions): string => {
    const department = device.departmentCode;
    const supplier = options.supplierCode.trim();
    switch (mode) {
        case "COLLECT":
            return envelope(
                `<CollectRequest xmlns="${TERMINAL_NAMESPACE}">`
                + deviceXml("DeviceInformation", device)
                + `<CollectDetails>`
                + items.map((item) => `<CollectDetail>${element("TrackingNumber", item.code)}</CollectDetail>`).join("")
                + `</CollectDetails>`
                + `</CollectRequest>`);
        case "PALLET":
            return envelope(
                `<PalletScanRequest xmlns="${TERMINAL_NAMESPACE}">`
                + deviceXml("DeviceInformation", device)
                + element("PalletTrackingNumber", items[0]?.code)
                + `</PalletScanRequest>`);
        case "REJECT":
            return envelope(terminalRequest("REJECT", device,
                `<DeliveryRejectRequest><DeliveryRejectDetails>`
                + items.map((item) => `<DeliveryRejectDetail>`
                    + element("ShipmentID", item.code)
                    + element("SupplierCode", supplier)
                    + element("DeliveryStatus", "REJECTED")
                    + element("DepartmentCode", department)
                    + element("RejectReason", options.rejectReason.trim())
                    + `</DeliveryRejectDetail>`).join("")
                + `</DeliveryRejectDetails></DeliveryRejectRequest>`));
        case "RETURN":
            return envelope(terminalRequest("RETURN", device,
                `<DeliveryReturnRequest><DeliveryReturnDetails>`
                + items.map((item) => `<DeliveryReturnDetail>`
                    + element("ShipmentID", item.code)
                    + element("DeliveryStatus", "RETURN")
                    + element("DepartmentCode", department)
                    + element("SupplierCode", supplier)
                    + element("ReturnToken", options.returnToken.trim())
                    + `</DeliveryReturnDetail>`).join("")
                + `</DeliveryReturnDetails></DeliveryReturnRequest>`));
        case "MISS":
            return envelope(terminalRequest("MISS", device,
                `<DeliveryMissedRequest><DeliveryMissedDetails>`
                + items.map((item) => `<DeliveryMissedDetail>`
                    + element("ShipmentID", item.code)
                    + element("DeliveryStatus", "UNKNOWN")
                    + element("DepartmentCode", department)
                    + element("SupplierCode", supplier)
                    + `</DeliveryMissedDetail>`).join("")
                + `</DeliveryMissedDetails></DeliveryMissedRequest>`));
    }
};

const parser = new XMLParser({
    removeNSPrefix: true,
    ignoreAttributes: true,
    parseTagValue: false,
    trimValues: true,
    isArray: (name) => name.endsWith("ResponseDetail"),
});

type XmlNode = Record<string, unknown>;

const node = (value: unknown): XmlNode => (value && typeof value === "object" ? value as XmlNode : {});

const text = (parent: XmlNode, name: string): string | null => {
    const value = parent[name];
    if (value === undefined || value === null || typeof value === "object") {
        return null;
    }
    const trimmed = String(value).trim();
    return trimmed ? trimmed : null;
};

const list = (parent: XmlNode, wrapper: string, item: string): XmlNode[] => {
    const items = node(parent[wrapper])[item];
    return Array.isArray(items) ? items.map(node) : [];
};

const parseBody = (xml: string): XmlNode => {
    const document = node(parser.parse(xml));
    return node(node(document.Envelope).Body);
};

export const findFaultMessage = (xml: string): string | null => {
    if (!xml.trim().startsWith("<")) {
        return null;
    }
    try {
        const fault = node(parseBody(xml).Fault);
        if (!Object.keys(fault).length) {
            return null;
        }
        return text(fault, "faultstring") || text(node(fault.Reason), "Text") || "SOAP Fault";
    } catch {
        return null;
    }
};

const allSucceeded = (details: ResultDetail[]) => details.length > 0 && details.every((detail) => detail.success);

export const parseEnvelope = (mode: ScanMode, xml: string): TerminalResult => {
    const faultMessage = findFaultMessage(xml);
    if (faultMessage) {
        throw new TerminalFaultError(faultMessage);
    }
    const body = parseBody(xml);

    if (mode === "COLLECT") {
        const response = node(body.CollectResponse);
        if (!Object.keys(response).length) {
            throw new TerminalFaultError("Brak CollectResponse w odpowiedzi");
        }
        const details = list(response, "CollectResponseDetails", "CollectResponseDetail").map((detail) => ({
            code: text(detail, "TrackingNumber") || "",
            success: text(detail, "Success") === "true",
            message: text(detail, "ErrorMessage") || (text(detail, "ShipmentID") ? `ID ${text(detail, "ShipmentID")}` : null),
        }));
        return {
            mode,
            processId: text(response, "ProcessId"),
            success: text(response, "Success") === "true",
            details,
            summary: null,
        };
    }

    if (mode === "PALLET") {
        const response = node(body.PalletScanResponse);
        if (!Object.keys(response).length) {
            throw new TerminalFaultError("Brak PalletScanResponse w odpowiedzi");
        }
        const details = list(response, "PalletScanResponseDetails", "PalletScanResponseDetail").map((detail) => ({
            code: text(detail, "ShipmentID") || "",
            success: text(detail, "Success") === "true",
            message: text(detail, "ErrorMessage") || text(detail, "ShipmentStatus"),
        }));
        const status = [
            text(response, "PalletStatus"),
            text(response, "AlreadyLoaded") === "true" ? "już załadowana" : null,
            text(response, "ErrorMessage"),
        ].filter(Boolean).join(" · ");
        return {
            mode,
            processId: text(response, "ProcessId"),
            success: text(response, "Success") === "true",
            details,
            summary: `Paleta ${text(response, "PalletTrackingNumber") || ""}${status ? ` — ${status}` : ""}`,
        };
    }

    const response = node(body.TerminalResponse);
    if (!Object.keys(response).length) {
        throw new TerminalFaultError("Brak TerminalResponse w odpowiedzi");
    }
    const processId = text(response, "ProcessId");

    if (mode === "REJECT") {
        const details = list(node(response.DeliveryRejectResponse), "DeliveryRejectResponseDetails", "DeliveryRejectResponseDetail")
            .map((detail) => ({
                code: text(detail, "ShipmentID") || "",
                success: true,
                message: text(detail, "NewShipmentID") ? `Nowa przesyłka ${text(detail, "NewShipmentID")}` : text(detail, "DeliveryStatus"),
            }));
        return {mode, processId, success: true, details, summary: null};
    }

    if (mode === "RETURN") {
        const details = list(node(response.DeliveryReturnResponse), "DeliveryReturnResponseDetails", "DeliveryReturnResponseDetail")
            .map((detail) => ({
                code: text(detail, "ShipmentID") || "",
                success: !text(detail, "ErrorMessage"),
                message: text(detail, "ErrorMessage") || text(detail, "UpdateStatus") || text(detail, "DeliveryStatus"),
            }));
        return {mode, processId, success: details.length === 0 || allSucceeded(details), details, summary: null};
    }

    return {mode, processId, success: true, details: [], summary: "Zgłoszenie przyjęte"};
};
