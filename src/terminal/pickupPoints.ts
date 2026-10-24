export type PickupPointType = "SERVICE_POINT" | "PARCEL_LOCKER";
export type PickupPointStatus = "ACTIVE" | "SUSPENDED" | "CLOSED";
export type PickupPointCapability = "DROP_OFF" | "COLLECTION";
export type PickupPointShipmentSize = "TINY" | "SMALL" | "MEDIUM" | "AVERAGE" | "BIG";
export type DayOfWeek = "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";
export type DayAvailability = "CLOSED" | "ALL_DAY" | "INTERVALS";

export type OpeningInterval = {startMinute: number; endMinute: number};

export type OpeningDay = {dayOfWeek: DayOfWeek; availability: DayAvailability; intervals: OpeningInterval[]};

export type PickupPoint = {
    pickupPointId: {value: string};
    code: string;
    name: string;
    type: PickupPointType;
    status: PickupPointStatus;
    capabilities: PickupPointCapability[];
    address: {
        countryCode: string;
        postalCode: string;
        city: string;
        street: string;
        buildingNumber: string;
        unitNumber?: string | null;
    };
    coordinates?: {latitude: number; longitude: number} | null;
    department?: {code?: string | null} | null;
    availability?: {selectable: boolean; reasonCodes?: string[] | null; isOpenNow?: boolean | null} | null;
    contact?: {telephoneNumber?: string | null; email?: string | null} | null;
    accessInstructions?: string | null;
    openingSchedule?: {
        timeZone: string;
        mode: "ALWAYS_OPEN" | "WEEKLY";
        days: OpeningDay[];
        exceptions?: {date: string; availability: DayAvailability; intervals: OpeningInterval[]}[] | null;
    } | null;
    servicePolicy?: {allowedShipmentSizes: PickupPointShipmentSize[]; acceptsDangerousGoods: boolean} | null;
    statusReason?: string | null;
};

export type PickupPointPage = {
    items: PickupPoint[];
    page: number;
    size: number;
    totalElements: number;
    totalPages: number;
};

export const PICKUP_POINT_TYPE_LABELS: Record<PickupPointType, string> = {
    SERVICE_POINT: "Punkt obsługi",
    PARCEL_LOCKER: "Paczkomat",
};

export const PICKUP_POINT_STATUS_LABELS: Record<PickupPointStatus, string> = {
    ACTIVE: "Aktywny",
    SUSPENDED: "Wstrzymany",
    CLOSED: "Zamknięty",
};

export const SHIPMENT_SIZE_LABELS: Record<PickupPointShipmentSize, string> = {
    TINY: "XS",
    SMALL: "S",
    MEDIUM: "M",
    AVERAGE: "L",
    BIG: "XL",
};

const DAY_ORDER: DayOfWeek[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

export const DAY_LABELS: Record<DayOfWeek, string> = {
    MONDAY: "Pon",
    TUESDAY: "Wt",
    WEDNESDAY: "Śr",
    THURSDAY: "Czw",
    FRIDAY: "Pt",
    SATURDAY: "Sob",
    SUNDAY: "Nd",
};

export const pickupPointId = (point: PickupPoint) => point.pickupPointId.value;

export const pickupPointAddress = (point: PickupPoint) => {
    const {street, buildingNumber, unitNumber, postalCode, city} = point.address;
    const building = unitNumber ? `${buildingNumber}/${unitNumber}` : buildingNumber;
    return `${street} ${building}, ${postalCode} ${city}`.trim();
};

const pad = (value: number) => String(value).padStart(2, "0");

export const formatMinute = (minute: number) => `${pad(Math.floor(minute / 60) % 24)}:${pad(minute % 60)}`;

export const formatIntervals = (availability: DayAvailability, intervals: OpeningInterval[]) => {
    if (availability === "ALL_DAY") {
        return "Całą dobę";
    }
    if (availability === "CLOSED" || !intervals.length) {
        return "Nieczynne";
    }
    return intervals.map((interval) => `${formatMinute(interval.startMinute)}–${formatMinute(interval.endMinute)}`).join(", ");
};

// One row per weekday, in Monday-first order; days missing from the schedule count as closed.
export const weeklyHours = (point: PickupPoint): {day: DayOfWeek; label: string; hours: string}[] => {
    const schedule = point.openingSchedule;
    if (!schedule) {
        return [];
    }
    if (schedule.mode === "ALWAYS_OPEN") {
        return DAY_ORDER.map((day) => ({day, label: DAY_LABELS[day], hours: "Całą dobę"}));
    }
    return DAY_ORDER.map((day) => {
        const entry = schedule.days.find((candidate) => candidate.dayOfWeek === day);
        return {
            day,
            label: DAY_LABELS[day],
            hours: entry ? formatIntervals(entry.availability, entry.intervals) : "Nieczynne",
        };
    });
};

export type PickupPointTone = "success" | "warning" | "danger" | "neutral";

export const pickupPointState = (point: PickupPoint): {label: string; tone: PickupPointTone} => {
    if (point.status !== "ACTIVE") {
        return {label: PICKUP_POINT_STATUS_LABELS[point.status], tone: point.status === "CLOSED" ? "danger" : "warning"};
    }
    if (point.availability?.isOpenNow === true) {
        return {label: "Otwarte teraz", tone: "success"};
    }
    if (point.availability?.isOpenNow === false) {
        return {label: "Teraz zamknięte", tone: "neutral"};
    }
    return {label: PICKUP_POINT_STATUS_LABELS.ACTIVE, tone: "success"};
};

export const acceptsCollection = (point: PickupPoint) => point.capabilities.includes("COLLECTION");

export const pickupPointsQuery = (query: string, collectionOnly: boolean, size = 50) => {
    // Built by hand: URLSearchParams in React Native does not implement every method.
    const params: [string, string][] = [["status", "ACTIVE"], ["size", String(size)]];
    if (query.trim()) {
        params.push(["query", query.trim()]);
    }
    if (collectionOnly) {
        params.push(["capability", "COLLECTION"]);
    }
    return params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
};
