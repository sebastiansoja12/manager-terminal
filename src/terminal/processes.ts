import {XMLParser} from "fast-xml-parser";
import type {ScanMode} from "./types";

export type ProcessStatus = "CREATED" | "SUCCESS" | "FAILURE";

export type ProcessLog = {
    processId: string;
    request: string | null;
    response: string | null;
    createdAt: string | null;
    modifiedAt: string | null;
    status: ProcessStatus | null;
    faultDescription: string | null;
    deviceInformation?: {deviceId: string | null; departmentCode: string | null} | null;
};

// Spring returns a Page either in the classic shape or wrapped in {content, page}.
export type ProcessLogPage = {
    content: ProcessLog[];
    last?: boolean;
    totalPages?: number;
    number?: number;
    page?: {number: number; totalPages: number};
};

export type ProcessOutcome = "SUCCESS" | "PARTIAL" | "FAILED" | "PENDING";

export type ProcessParcel = {
    trackingNumber: string;
    success: boolean | null;
    message: string | null;
    newTrackingNumber: string | null;
};

export type ProcessSummary = {
    id: string;
    mode: ScanMode | null;
    title: string;
    subtitle: string | null;
    createdAt: string | null;
    outcome: ProcessOutcome;
    outcomeLabel: string;
    parcels: ProcessParcel[];
    problem: string | null;
};

export const OUTCOME_LABELS: Record<ProcessOutcome, string> = {
    SUCCESS: "Udane",
    PARTIAL: "Częściowo udane",
    FAILED: "Nieudane",
    PENDING: "W toku",
};

const parser = new XMLParser({
    removeNSPrefix: true,
    ignoreAttributes: true,
    parseTagValue: false,
    trimValues: true,
    isArray: (name) => name.endsWith("Detail"),
});

type XmlNode = Record<string, unknown>;

const node = (value: unknown): XmlNode => (value && typeof value === "object" && !Array.isArray(value) ? value as XmlNode : {});

const text = (parent: XmlNode, name: string): string | null => {
    const value = parent[name];
    if (value === undefined || value === null || typeof value === "object") {
        return null;
    }
    const trimmed = String(value).trim();
    return trimmed || null;
};

const list = (parent: XmlNode, wrapper: string, item: string): XmlNode[] => {
    const items = node(parent[wrapper])[item];
    return Array.isArray(items) ? items.map(node) : [];
};

const parseXml = (xml: string | null): XmlNode => {
    if (!xml || !xml.trim().startsWith("<")) {
        return {};
    }
    try {
        return node(parser.parse(xml));
    } catch {
        return {};
    }
};

const plural = (count: number, one: string, few: string, many: string) => {
    if (count === 1) {
        return one;
    }
    const lastTwo = count % 100;
    const last = count % 10;
    return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
};

export const parcelCount = (count: number) => `${count} ${plural(count, "paczka", "paczki", "paczek")}`;

const BACKEND_MESSAGES: [RegExp, (match: RegExpMatchArray) => string][] = [
    [/^Shipment with tracking number (.+) not found$/i, (match) => `Nie znaleziono przesyłki ${match[1]}`],
    [/^Shipment was not found$/i, () => "Nie znaleziono przesyłki"],
    [/^Tracking number is duplicated in request$/i, () => "Numer zeskanowano więcej niż raz"],
    [/^Shipment cannot be collected from status (\w+)$/i, (match) => `Nie można odebrać przesyłki w statusie „${shipmentStatusLabel(match[1])}”`],
    [/^Shipment cannot be handed over$/i, () => "Nie można wydać tej przesyłki"],
    [/^Delivered shipment cannot be changed$/i, () => "Doręczonej przesyłki nie można zmienić"],
    [/^Cannot return shipment in current status$/i, () => "Przesyłki w obecnym statusie nie można zwrócić"],
    [/^Wrong return token$/i, () => "Nieprawidłowy token zwrotu"],
    [/^Wrong delivery status$/i, () => "Nieprawidłowy status dostawy"],
    [/^Wrong process type$/i, () => "Nieprawidłowy rodzaj operacji"],
    [/pair key/i, () => "Urządzenie nie jest sparowane z managerem"],
];

// Backend errors are English and technical; known ones are translated, others are shown as they are.
export const humanMessage = (message: string | null | undefined): string | null => {
    const trimmed = message?.trim();
    if (!trimmed) {
        return null;
    }
    for (const [pattern, translate] of BACKEND_MESSAGES) {
        const match = trimmed.match(pattern);
        if (match) {
            return translate(match);
        }
    }
    return trimmed;
};

// Kept local: these modules run under `node --test`, where only type imports between them resolve.
const SHIPMENT_STATUS_LABELS: Record<string, string> = {
    PLANNED: "Planowana",
    CREATED: "Utworzona",
    PREPARED: "Przygotowana",
    ACCEPTED: "Przyjęta",
    REROUTE: "Zmiana trasy",
    SENT: "Wysłana",
    DELIVERY: "Dostarczona",
    RETURN: "Zwrot",
    REDIRECT: "Przekierowana",
    CANCELED: "Anulowana",
    UNDELIVERABLE: "Niedoręczalna",
};

const shipmentStatusLabel = (status: string | null | undefined) =>
    status ? SHIPMENT_STATUS_LABELS[status] || status : null;

const PROCESS_TYPE_MODES: Record<string, ScanMode> = {RETURN: "RETURN", REJECT: "REJECT", MISS: "MISS"};

type ParsedRequest = {mode: ScanMode | null; trackingNumbers: string[]; palletCode: string | null; detail: string | null};

const DETAIL_PATHS: Record<string, [string, string, string]> = {
    RETURN: ["DeliveryReturnRequest", "DeliveryReturnDetails", "DeliveryReturnDetail"],
    REJECT: ["DeliveryRejectRequest", "DeliveryRejectDetails", "DeliveryRejectDetail"],
    MISS: ["DeliveryMissedRequest", "DeliveryMissedDetails", "DeliveryMissedDetail"],
};

const codes = (details: XmlNode[]) =>
    details.map((detail) => text(detail, "TrackingNumber")).filter((code): code is string => Boolean(code));

export const parseProcessRequest = (xml: string | null): ParsedRequest => {
    const document = parseXml(xml);
    if (document.CollectRequest) {
        return {mode: "COLLECT", trackingNumbers: codes(list(node(document.CollectRequest), "CollectDetails", "CollectDetail")),
            palletCode: null, detail: null};
    }
    if (document.HandoverRequest) {
        const details = node(node(document.HandoverRequest).HandoverDetails);
        const recipient = text(details, "RecipientName");
        return {mode: "HANDOVER", trackingNumbers: codes(list(node(document.HandoverRequest), "HandoverDetails", "HandoverDetail")),
            palletCode: null, detail: recipient ? `Odebrał(a): ${recipient}` : null};
    }
    if (document.PalletScanRequest) {
        return {mode: "PALLET", trackingNumbers: [], palletCode: text(node(document.PalletScanRequest), "PalletTrackingNumber"),
            detail: null};
    }
    if (document.TerminalRequest) {
        const request = node(document.TerminalRequest);
        const mode = PROCESS_TYPE_MODES[text(request, "ProcessType") || ""] || null;
        if (!mode) {
            return {mode: null, trackingNumbers: [], palletCode: null, detail: null};
        }
        const [wrapper, listName, item] = DETAIL_PATHS[mode];
        const details = list(node(request[wrapper]), listName, item);
        const reason = mode === "REJECT" ? text(details[0] || {}, "RejectReason") : null;
        return {mode, trackingNumbers: codes(details), palletCode: null, detail: reason ? `Powód: ${reason}` : null};
    }
    return {mode: null, trackingNumbers: [], palletCode: null, detail: null};
};

type ParsedResponse = {parcels: ProcessParcel[]; detail: string | null; problem: string | null; overallSuccess: boolean | null};

const newNumber = (detail: XmlNode) => {
    const original = text(detail, "TrackingNumber");
    const replacement = text(detail, "NewTrackingNumber");
    return replacement && replacement !== original ? replacement : null;
};

const flag = (value: string | null) => (value === null ? null : value === "true");

export const parseProcessResponse = (mode: ScanMode | null, xml: string | null): ParsedResponse => {
    const document = parseXml(xml);
    if (mode === "COLLECT" || mode === "HANDOVER") {
        const prefix = mode === "COLLECT" ? "Collect" : "Handover";
        const response = node(document[`${prefix}Response`]);
        const parcels = list(response, `${prefix}ResponseDetails`, `${prefix}ResponseDetail`).map((detail) => {
            const success = text(detail, "Success") === "true";
            return {
                trackingNumber: text(detail, "TrackingNumber") || "",
                success,
                message: success
                    ? (mode === "COLLECT" ? "Odebrana od klienta" : "Doręczona odbiorcy")
                    : humanMessage(text(detail, "ErrorMessage")) || "Nie udało się",
                newTrackingNumber: null,
            };
        });
        return {parcels, detail: null, problem: null, overallSuccess: flag(text(response, "Success"))};
    }
    if (mode === "PALLET") {
        const response = node(document.PalletScanResponse);
        const parcels = list(response, "PalletScanResponseDetails", "PalletScanResponseDetail").map((detail) => {
            const success = text(detail, "Success") === "true";
            return {
                trackingNumber: text(detail, "TrackingNumber") || "",
                success,
                message: success
                    ? (shipmentStatusLabel(text(detail, "ShipmentStatus")) ? `Status: ${shipmentStatusLabel(text(detail, "ShipmentStatus"))}` : "Zaktualizowana")
                    : humanMessage(text(detail, "ErrorMessage")) || "Nie udało się",
                newTrackingNumber: null,
            };
        });
        const detail = [
            text(response, "PalletStatus") ? `Paleta: ${text(response, "PalletStatus")}` : null,
            text(response, "AlreadyLoaded") === "true" ? "była już załadowana" : null,
        ].filter(Boolean).join(", ") || null;
        return {parcels, detail, problem: humanMessage(text(response, "ErrorMessage")), overallSuccess: flag(text(response, "Success"))};
    }
    const terminal = node(document.TerminalResponse);
    if (mode === "REJECT") {
        const parcels = list(node(terminal.DeliveryRejectResponse), "DeliveryRejectResponseDetails", "DeliveryRejectResponseDetail")
            .map((detail) => ({
                trackingNumber: text(detail, "TrackingNumber") || "",
                success: true,
                message: newNumber(detail) ? "Odmowa przyjęta — przesyłka wraca do nadawcy" : "Odmowa przyjęta",
                newTrackingNumber: newNumber(detail),
            }));
        return {parcels, detail: null, problem: null, overallSuccess: parcels.length ? true : null};
    }
    if (mode === "RETURN") {
        const parcels = list(node(terminal.DeliveryReturnResponse), "DeliveryReturnResponseDetails", "DeliveryReturnResponseDetail")
            .map((detail) => {
                const error = humanMessage(text(detail, "ErrorMessage"));
                const success = !error && text(detail, "UpdateStatus") !== "NOT_OK" && text(detail, "UpdateStatus") !== "ERROR";
                return {
                    trackingNumber: text(detail, "TrackingNumber") || "",
                    success,
                    message: success
                        ? (newNumber(detail) ? "Zwrot zarejestrowany — utworzono przesyłkę zwrotną" : "Zwrot zarejestrowany")
                        : error || "Nie udało się zarejestrować zwrotu",
                    newTrackingNumber: success ? newNumber(detail) : null,
                };
            });
        return {parcels, detail: null, problem: null, overallSuccess: null};
    }
    return {parcels: [], detail: null, problem: null, overallSuccess: null};
};

const TITLES: Record<ScanMode, string> = {
    COLLECT: "Odbiór od klienta",
    HANDOVER: "Doręczenie",
    PALLET: "Skan palety",
    RETURN: "Zwrot",
    REJECT: "Odmowa przyjęcia",
    MISS: "Nieobecny odbiorca",
};

const MISS_MESSAGES: Record<ProcessStatus, string> = {
    SUCCESS: "Zgłoszono nieobecność odbiorcy",
    FAILURE: "Nie udało się zgłosić nieobecności",
    CREATED: "Zgłoszenie w toku",
};

// Request parcels come first; response details complete them, and parcels known only from the response
// (shipments loaded on a pallet) are appended.
const mergeParcels = (requested: string[], answered: ProcessParcel[]): ProcessParcel[] => {
    const merged: ProcessParcel[] = requested.map((trackingNumber) => ({trackingNumber, success: null, message: null, newTrackingNumber: null}));
    const used = new Set<number>();
    for (const parcel of answered) {
        const index = merged.findIndex((candidate, position) => !used.has(position) && candidate.trackingNumber === parcel.trackingNumber);
        if (index >= 0) {
            merged[index] = parcel;
            used.add(index);
        } else {
            merged.push(parcel);
        }
    }
    return merged;
};

const outcomeOf = (status: ProcessStatus | null, parcels: ProcessParcel[], overallSuccess: boolean | null): ProcessOutcome => {
    const succeeded = parcels.filter((parcel) => parcel.success === true).length;
    const failed = parcels.filter((parcel) => parcel.success === false).length;
    if (status === "FAILURE") {
        return succeeded ? "PARTIAL" : "FAILED";
    }
    if (status !== "SUCCESS" && !succeeded && !failed && overallSuccess === null) {
        return "PENDING";
    }
    if (failed && succeeded) {
        return "PARTIAL";
    }
    if (failed || overallSuccess === false) {
        return succeeded ? "PARTIAL" : "FAILED";
    }
    return "SUCCESS";
};

export const summarizeProcess = (log: ProcessLog): ProcessSummary => {
    const request = parseProcessRequest(log.request);
    const response = parseProcessResponse(request.mode, log.response);
    let parcels = mergeParcels(request.trackingNumbers, response.parcels);
    if (request.mode === "MISS") {
        parcels = parcels.map((parcel) => ({
            ...parcel,
            success: log.status === "SUCCESS" ? true : log.status === "FAILURE" ? false : null,
            message: MISS_MESSAGES[log.status || "CREATED"],
        }));
    } else if (log.status === "FAILURE") {
        parcels = parcels.map((parcel) => (parcel.success === null ? {...parcel, success: false} : parcel));
    }
    const outcome = outcomeOf(log.status, parcels, response.overallSuccess);
    const baseTitle = request.mode ? TITLES[request.mode] : "Inna operacja";
    const title = request.mode === "PALLET"
        ? `${baseTitle}${request.palletCode ? ` ${request.palletCode}` : ""}`
        : parcels.length > 1 ? `${baseTitle} · ${parcelCount(parcels.length)}` : baseTitle;
    const subtitle = [request.detail, response.detail].filter(Boolean).join(" · ") || null;
    return {
        id: log.processId,
        mode: request.mode,
        title,
        subtitle,
        createdAt: log.createdAt,
        outcome,
        outcomeLabel: OUTCOME_LABELS[outcome],
        parcels,
        problem: humanMessage(log.faultDescription) || response.problem,
    };
};

export const pageItems = (page: ProcessLogPage | ProcessLog[] | null | undefined): ProcessLog[] => {
    if (!page) {
        return [];
    }
    return Array.isArray(page) ? page : page.content || [];
};

export const hasNextPage = (page: ProcessLogPage | null | undefined): boolean => {
    if (!page || Array.isArray(page)) {
        return false;
    }
    if (typeof page.last === "boolean") {
        return !page.last;
    }
    const number = page.page?.number ?? page.number ?? 0;
    const totalPages = page.page?.totalPages ?? page.totalPages ?? 0;
    return number + 1 < totalPages;
};

export const outcomeTone = (outcome: ProcessOutcome): "success" | "warning" | "danger" | "info" =>
    outcome === "SUCCESS" ? "success" : outcome === "PARTIAL" ? "warning" : outcome === "FAILED" ? "danger" : "info";
