import {Stack, useLocalSearchParams} from "expo-router";
import React, {useCallback, useEffect, useState} from "react";
import {ActivityIndicator, Linking, Platform, ScrollView, StyleSheet, Text, View} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {ApiError} from "../api/client";
import {useTerminal} from "../state/TerminalContext";
import {
    PICKUP_POINT_TYPE_LABELS,
    PickupPoint,
    SHIPMENT_SIZE_LABELS,
    acceptsCollection,
    pickupPointAddress,
    pickupPointState,
    weeklyHours,
} from "../terminal/pickupPoints";
import {Banner, Button, Card, Pill, SectionLabel} from "../ui/components";
import {colors, spacing, typography} from "../ui/theme";

const TODAY_INDEX = (new Date().getDay() + 6) % 7;

const mapsUrl = (point: PickupPoint) => {
    const target = point.coordinates
        ? `${point.coordinates.latitude},${point.coordinates.longitude}`
        : pickupPointAddress(point);
    return Platform.OS === "ios"
        ? `maps:0,0?q=${encodeURIComponent(target)}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(target)}`;
};

function Row({label, value}: {label: string; value?: string | null}) {
    if (!value) {
        return null;
    }
    return (
        <View style={styles.row}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={styles.rowValue}>{value}</Text>
        </View>
    );
}

export default function PickupPointScreen() {
    const insets = useSafeAreaInsets();
    const {client} = useTerminal();
    const {pickupPointId, name} = useLocalSearchParams<{pickupPointId: string; name?: string}>();
    const [point, setPoint] = useState<PickupPoint | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchPoint = useCallback(() => {
        if (!client || !pickupPointId) {
            return;
        }
        client.pickupPoint(pickupPointId)
            .then((loaded) => {
                setPoint(loaded);
                setError(null);
            })
            .catch((exception: Error) => setError(exception instanceof ApiError && exception.status === 404
                ? "Punkt odbioru nie istnieje lub został usunięty."
                : exception.message))
            .finally(() => setLoading(false));
    }, [client, pickupPointId]);

    useEffect(() => {
        fetchPoint();
    }, [fetchPoint]);

    const retry = () => {
        setLoading(true);
        fetchPoint();
    };

    if (loading) {
        return <ActivityIndicator style={styles.loader} color={colors.primary}/>;
    }

    if (!point) {
        return (
            <View style={styles.content}>
                <Stack.Screen options={{title: name || "Punkt odbioru"}}/>
                <Banner tone="danger" title="Nie udało się pobrać punktu" description={error} action={{label: "Ponów", onPress: retry}}/>
            </View>
        );
    }

    const state = pickupPointState(point);
    const hours = weeklyHours(point);
    const phone = point.contact?.telephoneNumber;

    return (
        <ScrollView style={styles.root} contentContainerStyle={[styles.content, {paddingBottom: insets.bottom + spacing.xl}]}>
            <Stack.Screen options={{title: point.name}}/>
            <View style={styles.pills}>
                <Pill label={PICKUP_POINT_TYPE_LABELS[point.type]}/>
                <Pill tone={state.tone} dot label={state.label}/>
                {acceptsCollection(point) ? <Pill tone="info" label="Przyjmuje paczki do odbioru"/> : null}
            </View>
            {point.statusReason ? <Banner tone="warning" title="Uwaga" description={point.statusReason}/> : null}

            <Card>
                <SectionLabel>Adres</SectionLabel>
                <Text selectable style={styles.address}>{pickupPointAddress(point)}</Text>
                {point.accessInstructions ? <Text style={styles.instructions}>{point.accessInstructions}</Text> : null}
                <View style={styles.actions}>
                    <Button label="Nawiguj" icon="navigate" onPress={() => Linking.openURL(mapsUrl(point))} style={styles.action}/>
                    {phone ? (
                        <Button label="Zadzwoń" icon="phone" variant="secondary" onPress={() => Linking.openURL(`tel:${phone}`)}
                                style={styles.action}/>
                    ) : null}
                </View>
            </Card>

            {hours.length ? (
                <Card>
                    <SectionLabel>Godziny otwarcia</SectionLabel>
                    {hours.map((entry, index) => (
                        <View key={entry.day} style={styles.hoursRow}>
                            <Text style={[styles.day, index === TODAY_INDEX && styles.today]}>{entry.label}</Text>
                            <Text style={[styles.hours, index === TODAY_INDEX && styles.today]}>{entry.hours}</Text>
                        </View>
                    ))}
                </Card>
            ) : null}

            <Card>
                <SectionLabel>Szczegóły</SectionLabel>
                <Row label="Kod punktu" value={point.code}/>
                <Row label="Oddział" value={point.department?.code}/>
                <Row label="Rozmiary paczek" value={point.servicePolicy?.allowedShipmentSizes
                    .map((size) => SHIPMENT_SIZE_LABELS[size]).join(", ")}/>
                <Row label="Towary niebezpieczne" value={point.servicePolicy
                    ? (point.servicePolicy.acceptsDangerousGoods ? "Przyjmuje" : "Nie przyjmuje")
                    : null}/>
                <Row label="E-mail" value={point.contact?.email}/>
                <Row label="Telefon" value={phone}/>
            </Card>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.background},
    loader: {flex: 1, backgroundColor: colors.background},
    content: {padding: spacing.lg, gap: spacing.md},
    pills: {flexDirection: "row", flexWrap: "wrap", gap: spacing.sm},
    address: {color: colors.text, fontSize: 17, fontWeight: "700"},
    instructions: {color: colors.textSecondary, fontSize: 14, marginTop: spacing.sm},
    actions: {flexDirection: "row", gap: spacing.sm, marginTop: spacing.md},
    action: {flex: 1},
    hoursRow: {flexDirection: "row", justifyContent: "space-between", paddingVertical: 6},
    day: {color: colors.textMuted, fontSize: 15, width: 56},
    hours: {color: colors.text, fontSize: 15, ...typography.code},
    today: {color: colors.primary, fontWeight: "800"},
    row: {flexDirection: "row", justifyContent: "space-between", gap: spacing.md, paddingVertical: 6},
    rowLabel: {color: colors.textMuted, fontSize: 14},
    rowValue: {color: colors.text, fontSize: 14, fontWeight: "600", flexShrink: 1, textAlign: "right"},
});
