export type Wrapped<T> = {value: T} | null;

export type SupplierProfile = {
    supplierId: number | string;
    supplierCode: Wrapped<string>;
    firstName: string | null;
    lastName: string | null;
    telephoneNumber: string | null;
    email: string | null;
    departmentCode: Wrapped<string>;
    status: string | null;
    vehicleId: Wrapped<number | string>;
    dangerousGoodCertification?: {
        certificateNumber: string | null;
        issueDate: string | null;
        expiryDate: string | null;
        authority: string | null;
        valid: boolean;
    } | null;
    driverLicense?: {number: string | null; acquiredDate: string | null; drivingLicenseExpiryDate: string | null} | null;
    deliveryArea?: {
        areaName: string | null;
        city: string | null;
        district: string | null;
        municipality: string | null;
        region: string | null;
        country: string | null;
        postalCodes: string[] | null;
    } | null;
};

export type CarrierVehicle = {
    vehicleId: number | string;
    registrationNumber: string;
    brand?: string | null;
    model?: string | null;
    vehicleType: string | null;
    trailerRegistrationNumber: string | null;
    maxLoadKg: number | null;
    active: boolean;
};

export type Carrier = {
    carrierId: number | string;
    name: string;
    taxId: string | null;
    phone: string | null;
    email: string | null;
    defaultTransportType: string | null;
    active: boolean;
    vehicles: CarrierVehicle[];
};

export type AssignedVehicle = {vehicle: CarrierVehicle; carrier: Carrier};

export const VEHICLE_TYPE_LABELS: Record<string, string> = {
    VAN: "Dostawczy",
    TRUCK: "Ciężarowy",
    SEMI_TRAILER: "Naczepa",
    REFRIGERATED_TRUCK: "Chłodnia",
    OTHER: "Inny",
};

export const TRANSPORT_TYPE_LABELS: Record<string, string> = {
    OWN_FLEET: "Flota własna",
    EXTERNAL_CARRIER: "Przewoźnik zewnętrzny",
    COURIER_SERVICE: "Usługa kurierska",
};

export const label = (labels: Record<string, string>, value: string | null | undefined) =>
    value ? labels[value] || value : null;

// The supplier only stores a vehicle id, so the vehicle and its carrier are found among all carriers.
export const findAssignedVehicle = (carriers: Carrier[], vehicleId: Wrapped<number | string>): AssignedVehicle | null => {
    if (!vehicleId || vehicleId.value === null || vehicleId.value === undefined) {
        return null;
    }
    const wanted = String(vehicleId.value);
    for (const carrier of carriers) {
        const vehicle = (carrier.vehicles || []).find((candidate) => String(candidate.vehicleId) === wanted);
        if (vehicle) {
            return {vehicle, carrier};
        }
    }
    return null;
};

export const vehicleMakeModel = (vehicle: CarrierVehicle) =>
    [vehicle.brand, vehicle.model].map((part) => part?.trim()).filter(Boolean).join(" ") || null;

export const formatMaxLoad = (kilograms: number | null | undefined) => {
    if (kilograms === null || kilograms === undefined) {
        return null;
    }
    return kilograms >= 1000
        ? `${(kilograms / 1000).toLocaleString("pl-PL", {maximumFractionDigits: 2})} t`
        : `${kilograms.toLocaleString("pl-PL", {maximumFractionDigits: 0})} kg`;
};

export type ExpiryState = {tone: "success" | "warning" | "danger" | "neutral"; label: string};

const DAY_MS = 24 * 60 * 60 * 1000;

export const expiryState = (iso: string | null | undefined, now: Date = new Date(), warningDays = 30): ExpiryState => {
    if (!iso) {
        return {tone: "neutral", label: "Brak daty ważności"};
    }
    const date = new Date(iso);
    const formatted = date.toLocaleDateString("pl-PL", {day: "numeric", month: "long", year: "numeric"});
    const daysLeft = Math.ceil((date.getTime() - now.getTime()) / DAY_MS);
    if (daysLeft < 0) {
        return {tone: "danger", label: `Wygasło ${formatted}`};
    }
    if (daysLeft <= warningDays) {
        return {tone: "warning", label: `Wygasa za ${daysLeft} ${daysLeft === 1 ? "dzień" : "dni"} (${formatted})`};
    }
    return {tone: "success", label: `Ważne do ${formatted}`};
};
