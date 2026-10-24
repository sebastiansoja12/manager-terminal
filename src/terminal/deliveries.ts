export type DeliveryLifecycleStatus = "CREATED" | "MODIFIED" | "CANCELED" | "COMPLETED";
export type DeliveryStepOutcome = "IN_PROGRESS" | "SUCCEEDED" | "FAILED";

export type DeliveryStep = {
    stepNumber: number;
    attemptedAt: string | null;
    outcome: DeliveryStepOutcome | null;
    deliveryStatus: string | null;
    userId: string | null;
    comment: string | null;
    failureReason: string | null;
};

export type Delivery = {
    id: string;
    targetType: "SHIPMENT" | "PALLET";
    targetId: string;
    shipmentId: string | null;
    type: "OUTBOUND" | "RETURN";
    deliveryStatus: string | null;
    lifecycleStatus: DeliveryLifecycleStatus;
    method: "COURIER" | "PICKUP_POINT" | "LOCKER" | null;
    supplierId: string | null;
    signatureRequired: boolean | null;
    instructions: string | null;
    createdAt: string;
    plannedAt: string | null;
    deliveredAt: string | null;
    attemptLimit: number;
    steps: DeliveryStep[];
};

export type ShipmentSummary = {trackingNumber: string; recipient: string | null; address: string | null};

// Statuses a courier may record directly; delivery, rejection and absence go through the scanner process.
export const ATTEMPT_STATUSES = [
    {status: "DELIVERY", label: "W drodze", description: "Zabrana na trasę, doręczenie w toku"},
    {status: "UNAVAILABLE", label: "Odbiorca niedostępny", description: "Nie da się doręczyć — np. brak dostępu do adresu"},
] as const;

export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number]["status"];

export const DELIVERY_STATUS_LABELS: Record<string, string> = {
    DEPOT: "W oddziale",
    CLIENT: "U klienta",
    DELIVERY: "W doręczeniu",
    SENDER: "U nadawcy",
    LOST: "Zagubiona",
    UNKNOWN: "Nieznany",
    DELIVERED: "Doręczona",
    REJECTED: "Odmowa",
    RETURN: "Zwrot",
    UNAVAILABLE: "Odbiorca niedostępny",
};

export const DELIVERY_METHOD_LABELS: Record<string, string> = {
    COURIER: "Kurier",
    PICKUP_POINT: "Punkt odbioru",
    LOCKER: "Paczkomat",
};

export const LIFECYCLE_LABELS: Record<DeliveryLifecycleStatus, string> = {
    CREATED: "Nowa",
    MODIFIED: "W realizacji",
    CANCELED: "Anulowana",
    COMPLETED: "Zakończona",
};

export const statusLabel = (status: string | null | undefined) =>
    status ? DELIVERY_STATUS_LABELS[status] || status : "Brak statusu";

export const isOpen = (delivery: Delivery) =>
    delivery.lifecycleStatus !== "CANCELED" && delivery.lifecycleStatus !== "COMPLETED"
    && delivery.deliveryStatus !== "DELIVERED";

export type DeliveryTab = "OPEN" | "DONE";

const plannedOrCreated = (delivery: Delivery) => delivery.plannedAt || delivery.createdAt;

// Open deliveries: planned ones first by planned time, then the rest oldest first; done: newest first.
export const deliveriesForTab = (deliveries: Delivery[], tab: DeliveryTab) => {
    if (tab === "OPEN") {
        return deliveries.filter(isOpen).sort((left, right) => {
            if (Boolean(left.plannedAt) !== Boolean(right.plannedAt)) {
                return left.plannedAt ? -1 : 1;
            }
            return plannedOrCreated(left).localeCompare(plannedOrCreated(right));
        });
    }
    return deliveries.filter((delivery) => !isOpen(delivery))
        .sort((left, right) => (right.deliveredAt || right.createdAt).localeCompare(left.deliveredAt || left.createdAt));
};

export const failedAttempts = (delivery: Delivery) => delivery.steps.filter((step) => step.outcome === "FAILED").length;

export const attemptsLabel = (delivery: Delivery) => {
    const failed = failedAttempts(delivery);
    if (!failed) {
        return null;
    }
    return delivery.attemptLimit > 0 ? `Nieudane próby: ${failed}/${delivery.attemptLimit}` : `Nieudane próby: ${failed}`;
};

export const latestStep = (delivery: Delivery): DeliveryStep | null =>
    delivery.steps.reduce<DeliveryStep | null>((latest, step) => (!latest || step.stepNumber > latest.stepNumber ? step : latest), null);

export type DeliveryTone = "success" | "warning" | "danger" | "info" | "neutral";

export const deliveryTone = (delivery: Delivery): DeliveryTone => {
    if (delivery.lifecycleStatus === "CANCELED") {
        return "neutral";
    }
    if (delivery.deliveryStatus === "DELIVERED" || delivery.lifecycleStatus === "COMPLETED") {
        return "success";
    }
    if (delivery.deliveryStatus === "REJECTED" || delivery.deliveryStatus === "LOST") {
        return "danger";
    }
    if (failedAttempts(delivery) || delivery.deliveryStatus === "UNAVAILABLE") {
        return "warning";
    }
    return "info";
};

export const isOverdue = (delivery: Delivery, now: Date = new Date()) =>
    isOpen(delivery) && Boolean(delivery.plannedAt) && new Date(delivery.plannedAt as string).getTime() < now.getTime();
