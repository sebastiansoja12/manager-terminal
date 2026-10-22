export type SettingGroup = "SHIPMENTS" | "DELIVERIES" | "ROUTES" | "RETURNS" | "PREFERENCES";

export type SettingCategory = "PREFERENCE" | "OPERATIONAL_PERMISSION" | "MANDATORY_REQUIREMENT";

export type SupplierSetting =
    | "COPY_DEPARTMENT_CODE_FROM_DEVICE"
    | "SKIP_INVALID_SHIPMENTS"
    | "AUTO_GENERATE_LABELS"
    | "REQUIRE_PICKUP_SCAN"
    | "REQUIRE_DELIVERY_SCAN"
    | "ALLOW_MANUAL_SHIPMENT_ADDITION"
    | "ALLOW_SHIPMENT_TRANSFER"
    | "ALLOW_SHIPMENT_UNASSIGNMENT"
    | "REQUIRE_PROOF_OF_DELIVERY"
    | "REQUIRE_RECIPIENT_SIGNATURE"
    | "REQUIRE_DELIVERY_PHOTO"
    | "REQUIRE_NON_DELIVERY_REASON"
    | "ALLOW_DELIVERY_ADDRESS_CHANGE"
    | "ALLOW_DELIVERY_AREA_EDITING"
    | "ALLOW_OUT_OF_AREA_DELIVERY"
    | "ALLOW_DELIVERY_REORDERING"
    | "AUTO_ASSIGN_SHIPMENTS_BY_AREA"
    | "GENERATE_NEW_RETURN_CODES"
    | "AUTO_MARK_FOR_RETURN"
    | "REQUIRE_RETURN_SCAN"
    | "AUTO_GENERATE_RETURN_LABELS"
    | "NOTIFY_ABOUT_NEW_SHIPMENTS"
    | "NOTIFY_ABOUT_ROUTE_CHANGES"
    | "CONFIRM_SHIPMENT_TRANSFER";

export type ConfigurationParameter =
    | "MAX_DELIVERY_ATTEMPTS"
    | "MAX_SHIPMENTS_PER_ROUTE"
    | "SUBSTITUTE_SUPPLIER_ID"
    | "PREFERRED_LABEL_FORMAT"
    | "DEFAULT_SHIPMENT_SORT_ORDER";

export type LabelFormat = "PDF_A6" | "PDF_A4" | "ZPL";

export type ShipmentSortOrder = "DELIVERY_ORDER" | "POSTAL_CODE" | "RECIPIENT_NAME" | "ASSIGNED_AT";

export type ViolationCode = "REQUIRED" | "MUST_BE_POSITIVE" | "SUBSTITUTE_SELF" | "SUBSTITUTE_UNAVAILABLE" | "ENFORCED_BY_POLICY";

export type SettingDefinition = {
    setting: SupplierSetting;
    group: SettingGroup;
    category: SettingCategory;
    defaultValue: boolean;
};

export type SupplierConfiguration = {
    supplierId: number;
    supplierCode: string;
    firstName: string | null;
    lastName: string | null;
    settings: Record<SupplierSetting, boolean>;
    maxDeliveryAttempts: number;
    maxShipmentsPerRoute: number | null;
    substituteSupplierCode: string | null;
    preferredLabelFormat: LabelFormat;
    defaultShipmentSortOrder: ShipmentSortOrder;
    enforcedSettings: Partial<Record<SupplierSetting, boolean>>;
    definitions: SettingDefinition[];
    version: number | null;
    updatedAt: string | null;
    updatedBy: number | null;
};

export type SupplierConfigurationUpdate = {
    version: number | null;
    settings: Record<SupplierSetting, boolean>;
    maxDeliveryAttempts: number | null;
    maxShipmentsPerRoute: number | null;
    substituteSupplierCode: string | null;
    preferredLabelFormat: LabelFormat;
    defaultShipmentSortOrder: ShipmentSortOrder;
};

export type ConfigurationRevision = {
    revisionId: string;
    changeType: "UPDATED" | "RESET_TO_DEFAULTS";
    changedBy: number | null;
    changedAt: string;
    changes: {field: SupplierSetting | ConfigurationParameter; previousValue: string | null; newValue: string | null}[];
};

export type SubstituteCandidate = {
    supplierCode: string;
    firstName: string | null;
    lastName: string | null;
};

export type ConfigurationDraft = {
    settings: Record<SupplierSetting, boolean>;
    maxDeliveryAttempts: string;
    maxShipmentsPerRoute: string;
    substituteSupplierCode: string;
    preferredLabelFormat: LabelFormat;
    defaultShipmentSortOrder: ShipmentSortOrder;
};

export type FieldErrors = Partial<Record<SupplierSetting | ConfigurationParameter, ViolationCode>>;

export const GROUPS: {group: SettingGroup; label: string}[] = [
    {group: "SHIPMENTS", label: "Przesyłki"},
    {group: "DELIVERIES", label: "Doręczenia"},
    {group: "ROUTES", label: "Rejony i trasy"},
    {group: "RETURNS", label: "Zwroty"},
    {group: "PREFERENCES", label: "Preferencje"},
];

export const CATEGORY_LABELS: Record<SettingCategory, string> = {
    PREFERENCE: "Preferencja",
    OPERATIONAL_PERMISSION: "Uprawnienie",
    MANDATORY_REQUIREMENT: "Wymaganie",
};

export const SETTING_LABELS: Record<SupplierSetting, {label: string; description?: string}> = {
    COPY_DEPARTMENT_CODE_FROM_DEVICE: {label: "Przepisuj kod oddziału z urządzenia", description: "Kod oddziału przesyłki jest uzupełniany na podstawie sparowanego urządzenia."},
    SKIP_INVALID_SHIPMENTS: {label: "Pomijaj nieprawidłowe przesyłki", description: "Nieprawidłowe pozycje są pomijane, pozostałe przetwarzane dalej. Błędy zostają zapisane."},
    AUTO_GENERATE_LABELS: {label: "Automatycznie generuj etykiety"},
    REQUIRE_PICKUP_SCAN: {label: "Wymagaj skanowania przy odbiorze", description: "W trybie Odbiór kody trzeba skanować — ręczne dodawanie jest wyłączone."},
    REQUIRE_DELIVERY_SCAN: {label: "Wymagaj skanowania przy doręczeniu", description: "Przesyłkę trzeba zeskanować przed potwierdzeniem doręczenia."},
    ALLOW_MANUAL_SHIPMENT_ADDITION: {label: "Zezwalaj na ręczne dodawanie przesyłek"},
    ALLOW_SHIPMENT_TRANSFER: {label: "Zezwalaj na przekazywanie przesyłek", description: "Przekazanie aktualizuje przypisanie i historię przesyłki."},
    ALLOW_SHIPMENT_UNASSIGNMENT: {label: "Zezwalaj na usuwanie przesyłek z listy", description: "Odpina przesyłkę od Ciebie — nie usuwa jej z systemu."},
    REQUIRE_PROOF_OF_DELIVERY: {label: "Wymagaj potwierdzenia doręczenia (POD)", description: "Włączane automatycznie, gdy wymagany jest podpis lub zdjęcie."},
    REQUIRE_RECIPIENT_SIGNATURE: {label: "Wymagaj podpisu odbiorcy"},
    REQUIRE_DELIVERY_PHOTO: {label: "Wymagaj zdjęcia doręczenia"},
    REQUIRE_NON_DELIVERY_REASON: {label: "Wymagaj powodu niedoręczenia", description: "Przy nieudanym doręczeniu trzeba wybrać powód."},
    ALLOW_DELIVERY_ADDRESS_CHANGE: {label: "Zezwalaj na zmianę adresu doręczenia", description: "Zmiana adresu jest zapisywana w historii przesyłki."},
    ALLOW_DELIVERY_AREA_EDITING: {label: "Edytuj rejon dowożenia", description: "Możesz samodzielnie zmienić swój rejon."},
    ALLOW_OUT_OF_AREA_DELIVERY: {label: "Zezwalaj na doręczenia poza rejonem"},
    ALLOW_DELIVERY_REORDERING: {label: "Zezwalaj na zmianę kolejności doręczeń"},
    AUTO_ASSIGN_SHIPMENTS_BY_AREA: {label: "Automatycznie przypisuj przesyłki według rejonu"},
    GENERATE_NEW_RETURN_CODES: {label: "Generuj nowe kody zwrotu"},
    AUTO_MARK_FOR_RETURN: {label: "Automatycznie oznaczaj przesyłki do zwrotu", description: "Tylko gdy spełnione są warunki procesu zwrotów."},
    REQUIRE_RETURN_SCAN: {label: "Wymagaj skanowania przesyłek zwrotnych", description: "W trybie Zwrot kody trzeba skanować — ręczne dodawanie jest wyłączone."},
    AUTO_GENERATE_RETURN_LABELS: {label: "Automatycznie generuj etykiety zwrotne"},
    NOTIFY_ABOUT_NEW_SHIPMENTS: {label: "Powiadomienia o nowych przesyłkach"},
    NOTIFY_ABOUT_ROUTE_CHANGES: {label: "Powiadomienia o zmianach na trasie"},
    CONFIRM_SHIPMENT_TRANSFER: {label: "Potwierdzaj przekazanie przesyłki"},
};

export const PARAMETER_LABELS: Record<ConfigurationParameter, string> = {
    MAX_DELIVERY_ATTEMPTS: "Maksymalna liczba prób doręczenia",
    MAX_SHIPMENTS_PER_ROUTE: "Maksymalna liczba przesyłek na trasie",
    SUBSTITUTE_SUPPLIER_ID: "Kod kuriera zastępczego",
    PREFERRED_LABEL_FORMAT: "Preferowany format etykiety",
    DEFAULT_SHIPMENT_SORT_ORDER: "Domyślne sortowanie przesyłek",
};

export const LABEL_FORMATS: {value: LabelFormat; label: string}[] = [
    {value: "PDF_A6", label: "PDF A6"},
    {value: "PDF_A4", label: "PDF A4"},
    {value: "ZPL", label: "ZPL"},
];

export const SORT_ORDERS: {value: ShipmentSortOrder; label: string}[] = [
    {value: "DELIVERY_ORDER", label: "Kolejność doręczeń"},
    {value: "POSTAL_CODE", label: "Kod pocztowy"},
    {value: "RECIPIENT_NAME", label: "Odbiorca"},
    {value: "ASSIGNED_AT", label: "Data przypisania"},
];

export const VIOLATION_MESSAGES: Record<ViolationCode, string> = {
    REQUIRED: "Pole jest wymagane",
    MUST_BE_POSITIVE: "Wartość musi być liczbą większą od 0",
    SUBSTITUTE_SELF: "Nie możesz wskazać siebie jako zastępcy",
    SUBSTITUTE_UNAVAILABLE: "Wybrany kurier jest nieaktywny lub niedostępny",
    ENFORCED_BY_POLICY: "Wartość jest sprzeczna z polityką firmy",
};

export const toDraft = (configuration: SupplierConfiguration): ConfigurationDraft => ({
    settings: {...configuration.settings},
    maxDeliveryAttempts: String(configuration.maxDeliveryAttempts),
    maxShipmentsPerRoute: configuration.maxShipmentsPerRoute === null ? "" : String(configuration.maxShipmentsPerRoute),
    substituteSupplierCode: configuration.substituteSupplierCode || "",
    preferredLabelFormat: configuration.preferredLabelFormat,
    defaultShipmentSortOrder: configuration.defaultShipmentSortOrder,
});

export const isDraftDirty = (configuration: SupplierConfiguration, draft: ConfigurationDraft) => (
    JSON.stringify(toDraft(configuration)) !== JSON.stringify(draft)
);

export const isProofOfDeliveryForced = (settings: Record<SupplierSetting, boolean>) => (
    settings.REQUIRE_RECIPIENT_SIGNATURE || settings.REQUIRE_DELIVERY_PHOTO
);

export const toggleSetting = (
    configuration: SupplierConfiguration,
    draft: ConfigurationDraft,
    setting: SupplierSetting,
    enabled: boolean,
): ConfigurationDraft => {
    if (configuration.enforcedSettings[setting] !== undefined) {
        return draft;
    }
    const settings = {...draft.settings, [setting]: enabled};
    return {
        ...draft,
        settings: isProofOfDeliveryForced(settings) ? {...settings, REQUIRE_PROOF_OF_DELIVERY: true} : settings,
    };
};

const parseInteger = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    return /^-?\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
};

export const validateDraft = (draft: ConfigurationDraft): FieldErrors => {
    const errors: FieldErrors = {};
    const attempts = parseInteger(draft.maxDeliveryAttempts);
    if (attempts === null) {
        errors.MAX_DELIVERY_ATTEMPTS = "REQUIRED";
    } else if (Number.isNaN(attempts) || attempts <= 0) {
        errors.MAX_DELIVERY_ATTEMPTS = "MUST_BE_POSITIVE";
    }
    const routeLimit = parseInteger(draft.maxShipmentsPerRoute);
    if (routeLimit !== null && (Number.isNaN(routeLimit) || routeLimit <= 0)) {
        errors.MAX_SHIPMENTS_PER_ROUTE = "MUST_BE_POSITIVE";
    }
    return errors;
};

export const toUpdate = (draft: ConfigurationDraft, version: number | null): SupplierConfigurationUpdate => ({
    version,
    settings: draft.settings,
    maxDeliveryAttempts: parseInteger(draft.maxDeliveryAttempts),
    maxShipmentsPerRoute: parseInteger(draft.maxShipmentsPerRoute),
    substituteSupplierCode: draft.substituteSupplierCode.trim() || null,
    preferredLabelFormat: draft.preferredLabelFormat,
    defaultShipmentSortOrder: draft.defaultShipmentSortOrder,
});

export const toFieldErrors = (details: unknown): FieldErrors => {
    const fieldErrors = (details as {fieldErrors?: {field: SupplierSetting | ConfigurationParameter; code: ViolationCode}[]})?.fieldErrors;
    if (!Array.isArray(fieldErrors)) {
        return {};
    }
    return fieldErrors.reduce<FieldErrors>((errors, error) => ({...errors, [error.field]: error.code}), {});
};

export const fieldLabel = (field: SupplierSetting | ConfigurationParameter) => (
    (SETTING_LABELS as Record<string, {label: string}>)[field]?.label
    || (PARAMETER_LABELS as Record<string, string>)[field]
    || field
);

export const isScanRequired = (configuration: SupplierConfiguration | null, mode: string) => {
    if (!configuration) {
        return false;
    }
    if (mode === "COLLECT") {
        return configuration.settings.REQUIRE_PICKUP_SCAN;
    }
    if (mode === "RETURN") {
        return configuration.settings.REQUIRE_RETURN_SCAN;
    }
    return false;
};
