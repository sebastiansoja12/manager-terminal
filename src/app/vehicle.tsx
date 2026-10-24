import React, {useCallback, useEffect, useState} from "react";
import {ActivityIndicator, Linking, RefreshControl, ScrollView, StyleSheet, Text, View} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {ApiError} from "../api/client";
import {useTerminal} from "../state/TerminalContext";
import {
    AssignedVehicle,
    SupplierProfile,
    TRANSPORT_TYPE_LABELS,
    VEHICLE_TYPE_LABELS,
    expiryState,
    findAssignedVehicle,
    formatMaxLoad,
    label,
    vehicleMakeModel,
} from "../terminal/vehicle";
import {Banner, Card, IconButton, Pill, SectionLabel} from "../ui/components";
import {Icon} from "../ui/Icon";
import {colors, radius, spacing, typography} from "../ui/theme";

type Loaded = {profile: SupplierProfile; assigned: AssignedVehicle | null};

function Row({label: title, value}: {label: string; value?: string | null}) {
    if (!value) {
        return null;
    }
    return (
        <View style={styles.row}>
            <Text style={styles.rowLabel}>{title}</Text>
            <Text selectable style={styles.rowValue}>{value}</Text>
        </View>
    );
}

export default function VehicleScreen() {
    const insets = useSafeAreaInsets();
    const {client, supplierConfiguration} = useTerminal();
    const [data, setData] = useState<Loaded | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notSupplier, setNotSupplier] = useState(false);
    const knownSupplierCode = supplierConfiguration?.supplierCode || null;

    const fetchVehicle = useCallback(() => {
        if (!client) {
            return Promise.resolve();
        }
        const supplierCode = knownSupplierCode
            ? Promise.resolve(knownSupplierCode)
            : client.myConfiguration().then((configuration) => configuration.supplierCode);
        return supplierCode
            .then((code) => Promise.all([client.supplierProfile(code), client.carriers()]))
            .then(([profile, carriers]) => {
                setData({profile, assigned: findAssignedVehicle(carriers, profile.vehicleId)});
                setError(null);
            })
            .catch((exception: Error) => {
                if (exception instanceof ApiError && exception.status === 404) {
                    setNotSupplier(true);
                } else {
                    setError(exception.message);
                }
            })
            .finally(() => setLoading(false));
    }, [client, knownSupplierCode]);

    useEffect(() => {
        fetchVehicle();
    }, [fetchVehicle]);

    const refresh = () => {
        setRefreshing(true);
        fetchVehicle().finally(() => setRefreshing(false));
    };

    if (loading) {
        return <ActivityIndicator style={styles.loader} color={colors.primary}/>;
    }

    const profile = data?.profile;
    const assigned = data?.assigned;
    const vehicle = assigned?.vehicle;
    const carrier = assigned?.carrier;
    const license = profile?.driverLicense;
    const adr = profile?.dangerousGoodCertification;
    const area = profile?.deliveryArea;
    const licenseState = expiryState(license?.drivingLicenseExpiryDate);
    const adrState = adr ? (adr.valid ? expiryState(adr.expiryDate) : {tone: "danger" as const, label: "Nieważny"}) : null;

    return (
        <ScrollView
            style={styles.root}
            contentContainerStyle={[styles.content, {paddingBottom: insets.bottom + spacing.xl}]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary}/>}
        >
            {notSupplier ? (
                <Banner tone="info" title="To konto nie jest kurierem"
                        description="Dane pojazdu są dostępne tylko dla kurierów zarejestrowanych w managerze."/>
            ) : null}
            {error ? <Banner tone="danger" title="Nie udało się pobrać danych pojazdu" description={error}
                             action={{label: "Ponów", onPress: refresh}}/> : null}

            {profile ? (
                vehicle && carrier ? (
                    <Card style={styles.hero}>
                        <View style={styles.heroTop}>
                            <View style={styles.heroIcon}>
                                <Icon name="truck" size={26} color={colors.primaryText}/>
                            </View>
                            <View style={styles.heroText}>
                                <SectionLabel>Twój pojazd</SectionLabel>
                                <Text selectable style={styles.plate}>{vehicle.registrationNumber}</Text>
                                {vehicleMakeModel(vehicle) ? <Text style={styles.makeModel}>{vehicleMakeModel(vehicle)}</Text> : null}
                            </View>
                        </View>
                        <View style={styles.pills}>
                            {vehicle.vehicleType ? <Pill label={label(VEHICLE_TYPE_LABELS, vehicle.vehicleType) || ""}/> : null}
                            <Pill tone={vehicle.active ? "success" : "danger"} dot label={vehicle.active ? "Aktywny" : "Wycofany"}/>
                        </View>
                        <Row label="Ładowność" value={formatMaxLoad(vehicle.maxLoadKg)}/>
                        <Row label="Przyczepa / naczepa" value={vehicle.trailerRegistrationNumber}/>
                    </Card>
                ) : (
                    <Banner tone="warning" title="Brak przypisanego pojazdu"
                            description={profile.vehicleId
                                ? "Przypisany pojazd nie istnieje już u żadnego przewoźnika. Zgłoś to dyspozytorowi."
                                : "Dyspozytor nie przypisał Ci jeszcze pojazdu."}/>
                )
            ) : null}

            {carrier ? (
                <Card>
                    <View style={styles.cardHeader}>
                        <View style={styles.cardHeaderText}>
                            <SectionLabel>Przewoźnik</SectionLabel>
                            <Text style={styles.title}>{carrier.name}</Text>
                        </View>
                        {carrier.phone ? (
                            <IconButton icon="phone" label={`Zadzwoń do przewoźnika: ${carrier.phone}`} tone="success" size={42}
                                        onPress={() => Linking.openURL(`tel:${carrier.phone}`)}/>
                        ) : null}
                    </View>
                    <Row label="Rodzaj transportu" value={label(TRANSPORT_TYPE_LABELS, carrier.defaultTransportType)}/>
                    <Row label="Telefon" value={carrier.phone}/>
                    <Row label="E-mail" value={carrier.email}/>
                    <Row label="NIP" value={carrier.taxId}/>
                    {!carrier.active ? <Text style={styles.warning}>Przewoźnik jest nieaktywny.</Text> : null}
                </Card>
            ) : null}

            {profile ? (
                <Card>
                    <SectionLabel>Uprawnienia kierowcy</SectionLabel>
                    <Row label="Prawo jazdy" value={license?.number || "Brak danych"}/>
                    {license?.number ? <Pill tone={licenseState.tone} dot label={licenseState.label}/> : null}
                    <View style={styles.spacer}/>
                    <Row label="Certyfikat ADR" value={adr?.certificateNumber || "Brak"}/>
                    {adrState ? <Pill tone={adrState.tone} dot label={adrState.label}/> : null}
                    <Row label="Wydany przez" value={adr?.authority}/>
                </Card>
            ) : null}

            {area && (area.areaName || area.city || area.postalCodes?.length) ? (
                <Card>
                    <SectionLabel>Obszar doręczeń</SectionLabel>
                    <Row label="Nazwa" value={area.areaName}/>
                    <Row label="Miasto" value={[area.city, area.district].filter(Boolean).join(", ")}/>
                    <Row label="Region" value={area.region}/>
                    {area.postalCodes?.length ? (
                        <View style={styles.codes}>
                            {area.postalCodes.map((code) => (
                                <Text key={code} style={styles.code}>{code}</Text>
                            ))}
                        </View>
                    ) : null}
                </Card>
            ) : null}

            {profile ? (
                <Text style={styles.footnote}>Zmiany pojazdu i uprawnień wprowadza dyspozytor w panelu managera.</Text>
            ) : null}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.background},
    loader: {flex: 1, backgroundColor: colors.background},
    content: {padding: spacing.lg, gap: spacing.md},
    hero: {borderRadius: radius.xl, gap: spacing.sm},
    heroTop: {flexDirection: "row", alignItems: "center", gap: spacing.md},
    heroIcon: {
        width: 52, height: 52, borderRadius: radius.lg, backgroundColor: colors.primary,
        alignItems: "center", justifyContent: "center",
    },
    heroText: {flex: 1},
    plate: {color: colors.text, fontSize: 28, fontWeight: "800", letterSpacing: 1.5, ...typography.code},
    makeModel: {color: colors.textSecondary, fontSize: 15, fontWeight: "600"},
    pills: {flexDirection: "row", flexWrap: "wrap", gap: spacing.sm},
    cardHeader: {flexDirection: "row", alignItems: "center", gap: spacing.md},
    cardHeaderText: {flex: 1},
    title: {color: colors.text, fontSize: 18, fontWeight: "800"},
    row: {flexDirection: "row", justifyContent: "space-between", gap: spacing.md, paddingVertical: 6},
    rowLabel: {color: colors.textMuted, fontSize: 14},
    rowValue: {color: colors.text, fontSize: 14, fontWeight: "600", flexShrink: 1, textAlign: "right"},
    warning: {color: colors.warningText, fontSize: 13, fontWeight: "600", marginTop: spacing.xs},
    spacer: {height: spacing.sm},
    codes: {flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs},
    code: {
        color: colors.textSecondary, fontSize: 13, paddingHorizontal: spacing.sm, paddingVertical: 3,
        borderRadius: radius.sm, backgroundColor: colors.surfaceRaised, ...typography.code,
    },
    footnote: {color: colors.textMuted, fontSize: 13, textAlign: "center"},
});
