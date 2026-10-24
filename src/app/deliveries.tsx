import {router} from "expo-router";
import React, {useCallback, useEffect, useMemo, useState} from "react";
import {ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {ApiError} from "../api/client";
import {useTerminal} from "../state/TerminalContext";
import {
    DELIVERY_METHOD_LABELS,
    Delivery,
    DeliveryTab,
    ShipmentSummary,
    attemptsLabel,
    deliveriesForTab,
    deliveryTone,
    isOverdue,
    statusLabel,
} from "../terminal/deliveries";
import {formatDateTime, partyAddress, partyName} from "../terminal/shipmentLookup";
import {Banner, Chip, Pill} from "../ui/components";
import {Icon} from "../ui/Icon";
import {colors, radius, spacing, typography} from "../ui/theme";

const orNull = (value: string) => (value && value !== "—" ? value : null);

function DeliveryRow({delivery, shipment}: {delivery: Delivery; shipment?: ShipmentSummary | null}) {
    const attempts = attemptsLabel(delivery);
    const overdue = isOverdue(delivery);
    const title = shipment?.trackingNumber || (delivery.targetType === "PALLET" ? `Paleta ${delivery.targetId}` : `Przesyłka ${delivery.targetId}`);
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${title}, ${statusLabel(delivery.deliveryStatus)}`}
            onPress={() => router.push({pathname: "/delivery", params: {deliveryId: delivery.id}})}
            style={({pressed}) => [styles.row, pressed && styles.pressed]}
        >
            <View style={styles.rowText}>
                <View style={styles.rowHeader}>
                    <Text style={styles.code} numberOfLines={1}>{title}</Text>
                    {delivery.type === "RETURN" ? <Pill tone="warning" label="Zwrot"/> : null}
                </View>
                {shipment?.recipient ? <Text style={styles.recipient} numberOfLines={1}>{shipment.recipient}</Text> : null}
                {shipment?.address ? <Text style={styles.address} numberOfLines={2}>{shipment.address}</Text> : null}
                <View style={styles.pills}>
                    <Pill tone={deliveryTone(delivery)} dot label={statusLabel(delivery.deliveryStatus)}/>
                    {delivery.method && delivery.method !== "COURIER" ? <Pill label={DELIVERY_METHOD_LABELS[delivery.method]}/> : null}
                    {attempts ? <Pill tone="warning" label={attempts}/> : null}
                </View>
                {delivery.plannedAt ? (
                    <Text style={[styles.meta, overdue && styles.overdue]}>
                        {overdue ? "Po terminie · " : "Plan: "}{formatDateTime(delivery.plannedAt)}
                    </Text>
                ) : null}
            </View>
            <Icon name="chevronRight" size={20} color={colors.textMuted}/>
        </Pressable>
    );
}

export default function DeliveriesScreen() {
    const insets = useSafeAreaInsets();
    const {client} = useTerminal();
    const [deliveries, setDeliveries] = useState<Delivery[]>([]);
    const [shipments, setShipments] = useState<Record<string, ShipmentSummary | null>>({});
    const [tab, setTab] = useState<DeliveryTab>("OPEN");
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notSupplier, setNotSupplier] = useState(false);

    const fetchDeliveries = useCallback(() => {
        if (!client) {
            return Promise.resolve();
        }
        // Always ask for the id: a cached configuration may hold an id rounded by an older app version.
        return client.myConfiguration()
            .then((configuration) => client.supplierDeliveries(configuration.supplierId))
            .then((loaded) => {
                setDeliveries(loaded);
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
    }, [client]);

    useEffect(() => {
        fetchDeliveries();
    }, [fetchDeliveries]);

    // Tracking number and recipient come from the shipment; each shipment is fetched once.
    useEffect(() => {
        if (!client) {
            return;
        }
        const missing = deliveries
            .map((delivery) => delivery.shipmentId)
            .filter((id): id is string => id !== null && !Object.prototype.hasOwnProperty.call(shipments, id));
        if (!missing.length) {
            return;
        }
        Promise.all(missing.map((shipmentId) => client.shipmentById(shipmentId)
            .then((details): [string, ShipmentSummary | null] => [shipmentId, {
                trackingNumber: details.shipment.trackingNumber.value,
                recipient: orNull(partyName(details.shipment.recipient)),
                address: orNull(partyAddress(details.shipment.recipient)),
            }])
            .catch((): [string, ShipmentSummary | null] => [shipmentId, null])))
            .then((entries) => setShipments((current) => ({...current, ...Object.fromEntries(entries)})));
    }, [client, deliveries, shipments]);

    const refresh = () => {
        setRefreshing(true);
        fetchDeliveries().finally(() => setRefreshing(false));
    };

    const openCount = useMemo(() => deliveriesForTab(deliveries, "OPEN").length, [deliveries]);
    const visible = useMemo(() => deliveriesForTab(deliveries, tab), [deliveries, tab]);

    if (loading) {
        return <ActivityIndicator style={styles.loader} color={colors.primary}/>;
    }

    return (
        <View style={styles.root}>
            <View style={styles.tabs}>
                <Chip label={`Do zrobienia (${openCount})`} selected={tab === "OPEN"} onPress={() => setTab("OPEN")}/>
                <Chip label={`Zakończone (${deliveries.length - openCount})`} selected={tab === "DONE"} onPress={() => setTab("DONE")}/>
            </View>
            {notSupplier ? (
                <View style={styles.banner}>
                    <Banner tone="info" title="To konto nie jest kurierem" description="Lista dostaw jest dostępna tylko dla kurierów."/>
                </View>
            ) : null}
            {error ? (
                <View style={styles.banner}>
                    <Banner tone="danger" title="Nie udało się pobrać dostaw" description={error} action={{label: "Ponów", onPress: refresh}}/>
                </View>
            ) : null}
            <FlatList
                data={visible}
                keyExtractor={(item) => item.id}
                renderItem={({item}) => (
                    <DeliveryRow delivery={item} shipment={item.shipmentId ? shipments[item.shipmentId] : null}/>
                )}
                contentContainerStyle={[styles.list, {paddingBottom: insets.bottom + spacing.lg}]}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary}/>}
                ListEmptyComponent={error || notSupplier ? undefined : (
                    <Text style={styles.empty}>{tab === "OPEN" ? "Nie masz przypisanych dostaw do realizacji." : "Brak zakończonych dostaw."}</Text>
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.background},
    loader: {flex: 1, backgroundColor: colors.background},
    tabs: {flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md},
    banner: {paddingHorizontal: spacing.lg, paddingBottom: spacing.md},
    list: {paddingHorizontal: spacing.lg, gap: spacing.sm},
    row: {
        flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md,
        borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    },
    pressed: {opacity: 0.85, transform: [{scale: 0.985}]},
    rowText: {flex: 1, gap: 4},
    rowHeader: {flexDirection: "row", alignItems: "center", gap: spacing.sm},
    code: {color: colors.text, fontSize: 16, fontWeight: "800", flexShrink: 1, ...typography.code},
    recipient: {color: colors.text, fontSize: 15, fontWeight: "600"},
    address: {color: colors.textSecondary, fontSize: 14},
    pills: {flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: 2},
    meta: {color: colors.textMuted, fontSize: 13},
    overdue: {color: colors.dangerText, fontWeight: "700"},
    empty: {color: colors.textMuted, fontSize: 14, textAlign: "center", marginTop: spacing.xl},
});
