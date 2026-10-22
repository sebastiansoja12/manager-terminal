export type ShipmentStatus =
    | "PLANNED" | "CREATED" | "PREPARED" | "ACCEPTED" | "REROUTE" | "SENT" | "DELIVERY" | "RETURN" | "REDIRECT" | "CANCELED";

export type ShipmentParty = {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    telephoneNumber: string | null;
    city: string | null;
    postalCode: string | null;
    street: string | null;
    countryCode?: string | null;
};

export type ShipmentLookupDetails = {
    shipment: {
        trackingNumber: {value: string};
        shipmentStatus: ShipmentStatus;
        sender: ShipmentParty;
        recipient: ShipmentParty;
        dimensions?: {length: number; width: number; height: number; unit: string} | null;
        weight?: {value: number; unit: string} | null;
        contentDescription?: string | null;
        customerReference?: string | null;
        shipmentPriority?: string | null;
        serviceLevel?: string | null;
        packagingType?: string | null;
        price?: {amount: number; currency: string} | null;
        locked?: boolean;
        signature?: {signerName: string; signedAt: string; signatureMethod: string} | null;
        createdAt?: string | null;
        updatedAt?: string | null;
    };
    routeLog: {
        routeLogRecordDetails?: {
            routeLogRecordDetailSet?: RouteEvent[];
        } | null;
    } | null;
};

export type RouteEvent = {
    id: number | string;
    timestamp: string;
    processType: string;
    parcelStatus?: string | null;
    shipmentStatus?: string | null;
    description?: string | null;
    username?: string | null;
    supplierCode?: {value: string} | null;
    departmentCode?: {value: string} | null;
    depotCode?: {value: string} | null;
};

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
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
};

export type StatusTone = "success" | "warning" | "danger" | "info";

export const statusTone = (status: ShipmentStatus): StatusTone => {
    if (status === "DELIVERY") {
        return "success";
    }
    if (status === "CANCELED" || status === "RETURN") {
        return "danger";
    }
    if (status === "REROUTE" || status === "REDIRECT") {
        return "warning";
    }
    return "info";
};

const PRIORITY_LABELS: Record<string, string> = {LOW: "Niski", MEDIUM: "Średni", HIGH: "Wysoki", EXPRESS: "Ekspres"};
const SERVICE_LABELS: Record<string, string> = {ECONOMY: "Ekonomiczna", STANDARD: "Standard", EXPRESS: "Ekspresowa"};
const PACKAGING_LABELS: Record<string, string> = {
    ENVELOPE: "Koperta", BAG: "Worek", BOX: "Karton", TUBE: "Tuba", CRATE: "Skrzynia", OTHER: "Inne",
};

export const priorityLabel = (value?: string | null) => (value ? PRIORITY_LABELS[value] || value : null);
export const serviceLevelLabel = (value?: string | null) => (value ? SERVICE_LABELS[value] || value : null);
export const packagingLabel = (value?: string | null) => (value ? PACKAGING_LABELS[value] || value : null);

export const normalizeTrackingNumber = (value: string) => value.trim().replace(/\s+/g, "").toUpperCase();

export const partyName = (party: ShipmentParty) => (
    `${party.firstName || ""} ${party.lastName || ""}`.trim() || "—"
);

export const partyAddress = (party: ShipmentParty) => {
    const city = [party.postalCode, party.city].filter(Boolean).join(" ");
    return [party.street, city, party.countryCode].filter(Boolean).join(", ") || "—";
};

export const formatWeight = (weight?: ShipmentLookupDetails["shipment"]["weight"]) => (
    weight ? `${weight.value} ${weight.unit.toLowerCase()}` : null
);

export const formatDimensions = (dimensions?: ShipmentLookupDetails["shipment"]["dimensions"]) => (
    dimensions
        ? `${dimensions.length} × ${dimensions.width} × ${dimensions.height} ${dimensions.unit.toLowerCase()}`
        : null
);

export const formatDateTime = (iso?: string | null) => (
    iso
        ? new Date(iso).toLocaleString("pl-PL", {day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"})
        : null
);

const eventTime = (event: RouteEvent) => new Date(event.timestamp || "").getTime() || 0;

export const routeEvents = (details: ShipmentLookupDetails): RouteEvent[] => (
    [...(details.routeLog?.routeLogRecordDetails?.routeLogRecordDetailSet || [])]
        .sort((left, right) => eventTime(right) - eventTime(left))
);

const PROCESS_LABELS: Record<string, string> = {
    CREATED: "Utworzenie",
    RETURN: "Zwrot",
    ROUTE: "Przekazanie w trasie",
    REJECT: "Odmowa przyjęcia",
    REROUTE: "Zmiana trasy",
    REDIRECT: "Przekierowanie",
    MISS: "Nieudane doręczenie",
    CANCELED: "Anulowanie",
};

const PARCEL_STATUS_LABELS: Record<string, string> = {
    DEPOT: "w oddziale",
    CLIENT: "u klienta",
    DELIVERY: "w doręczeniu",
    SENDER: "u nadawcy",
    LOST: "zaginiona",
    UNKNOWN: "status nieznany",
    DELIVERED: "doręczona",
    REJECTED: "odrzucona",
    RETURN: "zwrot",
    UNAVAILABLE: "nieudana próba",
    SENT: "wysłana",
    CREATED: "utworzona",
};

export const eventTitle = (event: RouteEvent) => {
    const process = PROCESS_LABELS[event.processType] || event.processType;
    const status = event.parcelStatus ? PARCEL_STATUS_LABELS[event.parcelStatus] || event.parcelStatus : null;
    return status ? `${process} · ${status}` : process;
};

export const eventLocation = (event: RouteEvent) => (
    event.departmentCode?.value || event.depotCode?.value || null
);
