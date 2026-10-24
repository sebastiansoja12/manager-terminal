import {router, Stack, useLocalSearchParams} from "expo-router";
import React, {useCallback, useEffect, useState} from "react";
import {ActivityIndicator, ScrollView, StyleSheet, Text, View} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {ApiError} from "../api/client";
import {useTerminal} from "../state/TerminalContext";
import {ProcessParcel, ProcessSummary, outcomeTone, parcelCount, summarizeProcess} from "../terminal/processes";
import {formatDateTime} from "../terminal/shipmentLookup";
import {Banner, Button, Card, Pill, SectionLabel} from "../ui/components";
import {Icon} from "../ui/Icon";
import {colors, modeMeta, radius, spacing, typography} from "../ui/theme";

const OUTCOME_DESCRIPTIONS = {
    SUCCESS: "Wszystko zostało zarejestrowane.",
    PARTIAL: "Część paczek się nie udała — sprawdź szczegóły poniżej.",
    FAILED: "Operacja się nie udała.",
    PENDING: "Manager jeszcze przetwarza tę operację.",
} as const;

const openParcel = (trackingNumber: string) => router.push({pathname: "/shipment-lookup", params: {code: trackingNumber}});

function ParcelRow({parcel}: {parcel: ProcessParcel}) {
    const icon = parcel.success === true ? "check" : parcel.success === false ? "alert" : "clock";
    const color = parcel.success === true ? colors.successText : parcel.success === false ? colors.dangerText : colors.textMuted;
    return (
        <View style={styles.parcel}>
            <View style={styles.parcelHeader}>
                <Icon name={icon} size={18} color={color}/>
                <Text selectable style={styles.code}>{parcel.trackingNumber || "Bez numeru"}</Text>
            </View>
            {parcel.message ? <Text style={[styles.message, parcel.success === false && styles.messageFailed]}>{parcel.message}</Text> : null}
            {parcel.newTrackingNumber ? (
                <View style={styles.newNumber}>
                    <Text style={styles.newNumberLabel}>Nowy numer przesyłki</Text>
                    <Text selectable style={styles.newNumberValue}>{parcel.newTrackingNumber}</Text>
                </View>
            ) : null}
            <View style={styles.actions}>
                {parcel.trackingNumber ? (
                    <Button label="Pokaż paczkę" icon="search" variant="secondary" onPress={() => openParcel(parcel.trackingNumber)}
                            style={styles.action}/>
                ) : null}
                {parcel.newTrackingNumber ? (
                    <Button label="Pokaż nową" icon="package" variant="secondary"
                            onPress={() => openParcel(parcel.newTrackingNumber as string)} style={styles.action}/>
                ) : null}
            </View>
        </View>
    );
}

export default function ProcessScreen() {
    const insets = useSafeAreaInsets();
    const {client} = useTerminal();
    const {processId} = useLocalSearchParams<{processId: string}>();
    const [process, setProcess] = useState<ProcessSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchProcess = useCallback(() => {
        if (!client || !processId) {
            return;
        }
        client.process(processId)
            .then((loaded) => {
                setProcess(summarizeProcess(loaded));
                setError(null);
            })
            .catch((exception: Error) => setError(exception instanceof ApiError && exception.status === 404
                ? "Nie znaleziono tej operacji."
                : exception.message))
            .finally(() => setLoading(false));
    }, [client, processId]);

    useEffect(() => {
        fetchProcess();
    }, [fetchProcess]);

    const retry = () => {
        setLoading(true);
        fetchProcess();
    };

    if (loading) {
        return <ActivityIndicator style={styles.loader} color={colors.primary}/>;
    }

    if (!process) {
        return (
            <View style={styles.content}>
                <Stack.Screen options={{title: "Operacja"}}/>
                <Banner tone="danger" title="Nie udało się pobrać operacji" description={error} action={{label: "Ponów", onPress: retry}}/>
            </View>
        );
    }

    const meta = process.mode ? modeMeta(process.mode) : null;
    const tone = outcomeTone(process.outcome);
    const succeeded = process.parcels.filter((parcel) => parcel.success === true).length;

    return (
        <ScrollView style={styles.root} contentContainerStyle={[styles.content, {paddingBottom: insets.bottom + spacing.xl}]}>
            <Stack.Screen options={{title: meta?.label || "Operacja"}}/>

            <Card>
                <View style={styles.header}>
                    <View style={styles.headerIcon}>
                        <Icon name={meta?.icon || "list"} size={26} color={meta?.color || colors.textMuted}/>
                    </View>
                    <View style={styles.headerText}>
                        <Text style={styles.title}>{process.title}</Text>
                        {process.createdAt ? <Text style={styles.time}>{formatDateTime(process.createdAt)}</Text> : null}
                    </View>
                </View>
                {process.subtitle ? <Text style={styles.subtitle}>{process.subtitle}</Text> : null}
            </Card>

            <Banner
                tone={tone}
                title={process.outcomeLabel}
                description={process.problem || OUTCOME_DESCRIPTIONS[process.outcome]}
            />

            {process.parcels.length ? (
                <Card>
                    <SectionLabel right={<Pill label={`${succeeded}/${process.parcels.length} udanych`}/>}>
                        {`Paczki (${parcelCount(process.parcels.length)})`}
                    </SectionLabel>
                    {process.parcels.map((parcel, index) => (
                        <View key={`${parcel.trackingNumber}-${index}`} style={index ? styles.separated : undefined}>
                            <ParcelRow parcel={parcel}/>
                        </View>
                    ))}
                </Card>
            ) : (
                <Text style={styles.empty}>Ta operacja nie dotyczyła konkretnych paczek.</Text>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.background},
    loader: {flex: 1, backgroundColor: colors.background},
    content: {padding: spacing.lg, gap: spacing.md},
    header: {flexDirection: "row", alignItems: "center", gap: spacing.md},
    headerIcon: {
        width: 52, height: 52, borderRadius: radius.lg, backgroundColor: colors.surfaceRaised,
        alignItems: "center", justifyContent: "center",
    },
    headerText: {flex: 1, gap: 2},
    title: {color: colors.text, fontSize: 18, fontWeight: "800"},
    time: {color: colors.textMuted, fontSize: 13},
    subtitle: {color: colors.textSecondary, fontSize: 14, marginTop: spacing.sm},
    parcel: {gap: spacing.xs, paddingVertical: spacing.sm},
    separated: {borderTopWidth: 1, borderTopColor: colors.border},
    parcelHeader: {flexDirection: "row", alignItems: "center", gap: spacing.sm},
    code: {color: colors.text, fontSize: 16, fontWeight: "800", ...typography.code},
    message: {color: colors.textSecondary, fontSize: 14},
    messageFailed: {color: colors.dangerText},
    newNumber: {
        marginTop: spacing.xs, padding: spacing.sm, borderRadius: radius.md,
        backgroundColor: colors.infoSurface, gap: 2,
    },
    newNumberLabel: {color: colors.infoText, fontSize: 12, fontWeight: "700"},
    newNumberValue: {color: colors.text, fontSize: 16, fontWeight: "800", ...typography.code},
    actions: {flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs},
    action: {flex: 1},
    empty: {color: colors.textMuted, fontSize: 14, textAlign: "center"},
});
