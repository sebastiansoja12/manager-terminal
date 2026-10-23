import * as Haptics from "expo-haptics";
import {router, useLocalSearchParams} from "expo-router";
import React, {useEffect, useRef, useState} from "react";
import {ActivityIndicator, Keyboard, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {ApiError} from "../api/client";
import {useTerminal} from "../state/TerminalContext";
import {
    eventLocation,
    eventTitle,
    formatDateTime,
    formatDimensions,
    formatWeight,
    normalizeTrackingNumber,
    packagingLabel,
    partyAddress,
    partyName,
    priorityLabel,
    routeEvents,
    serviceLevelLabel,
    SHIPMENT_STATUS_LABELS,
    ShipmentLookupDetails,
    ShipmentParty,
    STATUS_STEP_LABELS,
    statusStep,
    statusTone,
} from "../terminal/shipmentLookup";
import type {ScanMode} from "../terminal/types";
import {BarcodeCamera} from "../ui/BarcodeCamera";
import {Banner, Card, Field, IconButton, Pill, SectionLabel, Tile} from "../ui/components";
import {Icon, IconName} from "../ui/Icon";
import {colors, modeMeta, radius, spacing, typography} from "../ui/theme";

const WEB_KEEP_FOCUS_ON_SUBMIT = Platform.OS === "web" ? {blurOnSubmit: false} : {};
const HISTORY_LIMIT = 15;

const mapsUrl = (address: string) => (Platform.OS === "ios"
    ? `maps:0,0?q=${encodeURIComponent(address)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`);

function DetailRow({label, value}: {label: string; value?: string | null}) {
    if (!value) {
        return null;
    }
    return (
        <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{label}</Text>
            <Text style={styles.detailValue}>{value}</Text>
        </View>
    );
}

function PartyCard({title, party, actions}: {title: string; party: ShipmentParty; actions?: boolean}) {
    const address = partyAddress(party);
    return (
        <Card>
            <View style={styles.partyRow}>
                <View style={styles.partyIcon}>
                    <Icon name={actions ? "mapPin" : "user"} size={20}/>
                </View>
                <View style={styles.partyText}>
                    <SectionLabel>{title}</SectionLabel>
                    <Text style={styles.partyName}>{partyName(party)}</Text>
                    {address ? <Text style={styles.partyAddress}>{address}</Text> : null}
                    {party.email ? <Text style={styles.partyMeta}>{party.email}</Text> : null}
                    {!actions && party.telephoneNumber ? <Text style={styles.partyMeta}>{party.telephoneNumber}</Text> : null}
                </View>
                {actions ? (
                    <View style={styles.partyActions}>
                        {party.telephoneNumber ? (
                            <IconButton icon="phone" label={`Zadzwoń: ${party.telephoneNumber}`} tone="success" size={42}
                                        onPress={() => Linking.openURL(`tel:${party.telephoneNumber}`)}/>
                        ) : null}
                        {address ? (
                            <IconButton icon="navigate" label="Nawiguj do adresu" tone="info" size={42}
                                        onPress={() => Linking.openURL(mapsUrl(address))}/>
                        ) : null}
                    </View>
                ) : null}
            </View>
        </Card>
    );
}

type QuickAction = {mode: ScanMode; code: string; label: string; icon: IconName; primary?: boolean};

const quickActions = (details: ShipmentLookupDetails): QuickAction[] => {
    const trackingNumber = details.shipment.trackingNumber.value;
    const status = details.shipment.shipmentStatus;
    if (status === "DELIVERY" || status === "CANCELED") {
        return [];
    }
    return [
        {mode: "HANDOVER", code: trackingNumber, label: "Doręcz", icon: "check", primary: true},
        {mode: "MISS", code: trackingNumber, label: "Nieobecny", icon: "door"},
        {mode: "REJECT", code: trackingNumber, label: "Odmowa", icon: "reject"},
    ];
};

export default function ShipmentLookupScreen() {
    const insets = useSafeAreaInsets();
    const {client, addScan} = useTerminal();
    const params = useLocalSearchParams<{code?: string}>();
    const [code, setCode] = useState("");
    const [cameraOn, setCameraOn] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [details, setDetails] = useState<ShipmentLookupDetails | null>(null);
    const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

    const search = async (rawValue: string) => {
        const trackingNumber = normalizeTrackingNumber(rawValue);
        if (!trackingNumber) {
            setError("Wpisz lub zeskanuj numer śledzenia.");
            return;
        }
        if (!client) {
            setError("Brak połączenia z serwerem. Zaloguj się ponownie.");
            return;
        }
        setCode(trackingNumber);
        setCameraOn(false);
        Keyboard.dismiss();
        inputRef.current?.blur();
        setLoading(true);
        setError(null);
        setDetails(null);
        try {
            setDetails(await client.shipmentByTrackingNumber(trackingNumber));
        } catch (exception) {
            setError(exception instanceof ApiError && exception.status === 404
                ? `Nie znaleziono przesyłki ${trackingNumber}.`
                : (exception as Error).message);
        } finally {
            setLoading(false);
        }
    };

    const initialCode = params.code;
    useEffect(() => {
        if (!initialCode) {
            return;
        }
        // Search once for the code passed in from history; later searches are user-driven.
        const timer = setTimeout(() => search(initialCode), 0);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialCode]);

    const runQuickAction = (action: QuickAction) => {
        const outcome = addScan(action.mode, action.code);
        if (Platform.OS !== "web") {
            Haptics.notificationAsync(outcome === "invalid"
                ? Haptics.NotificationFeedbackType.Error
                : Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        }
        router.push({pathname: "/scanner", params: {mode: action.mode}});
    };

    const shipment = details?.shipment;
    const events = details ? routeEvents(details).slice(0, HISTORY_LIMIT) : [];
    const tone = shipment ? statusTone(shipment.shipmentStatus) : "info";
    const step = shipment ? statusStep(shipment.shipmentStatus) : null;
    const actions = details ? quickActions(details) : [];
    const parcelFacts = shipment
        ? [serviceLevelLabel(shipment.serviceLevel), formatWeight(shipment.weight), formatDimensions(shipment.dimensions)].filter(Boolean).join(" · ")
        : "";

    return (
        <View style={styles.root}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <View style={styles.searchRow}>
                    <View style={styles.searchInput}>
                        <Field
                            label="Numer śledzenia"
                            hideLabel
                            icon="search"
                            inputRef={inputRef}
                            value={code}
                            onChangeText={setCode}
                            onSubmitEditing={() => search(code)}
                            submitBehavior="submit"
                            {...WEB_KEEP_FOCUS_ON_SUBMIT}
                            returnKeyType="search"
                            autoFocus={!initialCode}
                            autoCapitalize="characters"
                            placeholder="Numer śledzenia"
                            showSoftInputOnFocus={!cameraOn}
                            style={typography.code}
                        />
                    </View>
                    <IconButton icon="camera" label={cameraOn ? "Wyłącz aparat" : "Skanuj aparatem"} size={50}
                                tone={cameraOn ? "primary" : "neutral"} onPress={() => {
                                    Keyboard.dismiss();
                                    setCameraOn((value) => !value);
                                }}/>
                    <IconButton icon="arrowRight" label="Szukaj" size={50} tone="primary"
                                disabled={!code.trim() || loading} onPress={() => search(code)}/>
                </View>
                {cameraOn ? <BarcodeCamera onScan={search}/> : null}

                {loading ? <ActivityIndicator color={colors.primary} size="large" style={styles.loader}/> : null}
                {error ? <Banner tone="danger" title="Nie można wyświetlić przesyłki" description={error}/> : null}

                {!shipment && !loading && !error ? (
                    <View style={styles.emptyBox}>
                        <Icon name="package" size={36} color={colors.textFaint}/>
                        <Text style={styles.emptyTitle}>Zeskanuj lub wpisz numer</Text>
                        <Text style={styles.emptyText}>Zobaczysz status, odbiorcę i historię zdarzeń przesyłki.</Text>
                    </View>
                ) : null}

                {shipment ? (
                    <>
                        <Card style={styles.statusCard}>
                            <View style={styles.statusHeader}>
                                <View style={styles.flex}>
                                    <Text selectable style={styles.trackingNumber}>{shipment.trackingNumber.value}</Text>
                                    {parcelFacts ? <Text style={styles.statusFacts}>{parcelFacts}</Text> : null}
                                </View>
                                <Pill tone={tone} label={SHIPMENT_STATUS_LABELS[shipment.shipmentStatus] || shipment.shipmentStatus}/>
                            </View>
                            {step !== null ? (
                                <View style={styles.progress}>
                                    <View style={styles.progressBars}>
                                        {STATUS_STEP_LABELS.map((label, index) => (
                                            <View key={label} style={[styles.progressBar, index <= step && {backgroundColor: tone === "success" ? colors.success : colors.info}]}/>
                                        ))}
                                    </View>
                                    <View style={styles.progressLabels}>
                                        {STATUS_STEP_LABELS.map((label, index) => (
                                            <Text key={label} style={[styles.progressLabel, index === step && styles.progressLabelActive]}>{label}</Text>
                                        ))}
                                    </View>
                                </View>
                            ) : null}
                            {shipment.locked ? (
                                <View style={styles.lockedRow}>
                                    <Icon name="lock" size={14} color={colors.warning}/>
                                    <Text style={styles.statusHint}>Przesyłka zablokowana do edycji</Text>
                                </View>
                            ) : null}
                        </Card>

                        <PartyCard title="Odbiorca" party={shipment.recipient} actions/>
                        {shipment.recipient.postalCode || shipment.recipient.city ? (
                            <Tile icon="mapPin" iconColor={colors.primary} title="Punkty odbioru blisko odbiorcy"
                                  subtitle={`Wyszukaj w: ${shipment.recipient.postalCode || shipment.recipient.city}`}
                                  onPress={() => router.push({
                                      pathname: "/pickup-points",
                                      params: {query: shipment.recipient.postalCode || shipment.recipient.city || ""},
                                  })}/>
                        ) : null}
                        <PartyCard title="Nadawca" party={shipment.sender}/>

                        {shipment.signature ? (
                            <Card>
                                <SectionLabel>Potwierdzenie odbioru</SectionLabel>
                                <DetailRow label="Podpisał(a)" value={shipment.signature.signerName}/>
                                <DetailRow label="Data" value={formatDateTime(shipment.signature.signedAt)}/>
                            </Card>
                        ) : null}

                        <Card style={styles.timelineCard}>
                            <SectionLabel>Historia zdarzeń</SectionLabel>
                            {!events.length ? <Text style={styles.emptyText}>Brak zarejestrowanych zdarzeń.</Text> : null}
                            <View>
                                {events.map((event, index) => {
                                    const location = eventLocation(event);
                                    const lastEvent = index === events.length - 1;
                                    return (
                                        <View key={`${event.id}-${event.processType}`} style={styles.event}>
                                            <View style={styles.eventRail}>
                                                <View style={[styles.eventDot, index === 0 && {backgroundColor: colors.info}]}/>
                                                {lastEvent ? null : <View style={styles.eventLine}/>}
                                            </View>
                                            <View style={[styles.eventText, !lastEvent && styles.eventSpacing]}>
                                                <Text style={[styles.eventTitle, index > 0 && styles.eventTitleOld]}>{eventTitle(event)}</Text>
                                                <Text style={styles.eventMeta}>
                                                    {formatDateTime(event.timestamp)}{location ? ` · ${location}` : ""}
                                                    {event.username ? ` · ${event.username}` : ""}
                                                </Text>
                                                {event.description ? <Text style={styles.eventMeta}>{event.description}</Text> : null}
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        </Card>

                        <Card>
                            <SectionLabel>Paczka</SectionLabel>
                            <DetailRow label="Opakowanie" value={packagingLabel(shipment.packagingType)}/>
                            <DetailRow label="Priorytet" value={priorityLabel(shipment.shipmentPriority)}/>
                            <DetailRow label="Zawartość" value={shipment.contentDescription}/>
                            <DetailRow label="Referencja klienta" value={shipment.customerReference}/>
                            <DetailRow label="Utworzona" value={formatDateTime(shipment.createdAt)}/>
                            <DetailRow label="Zmieniona" value={formatDateTime(shipment.updatedAt)}/>
                        </Card>
                    </>
                ) : null}
            </ScrollView>

            {actions.length ? (
                <View style={[styles.actionBar, {paddingBottom: Math.max(insets.bottom, spacing.md)}]}>
                    {actions.map((action) => (
                        <Pressable
                            key={action.mode}
                            accessibilityRole="button"
                            accessibilityLabel={`${action.label} — dodaj do trybu ${modeMeta(action.mode).label}`}
                            onPress={() => runQuickAction(action)}
                            style={({pressed}) => [styles.action, action.primary && styles.actionPrimary, pressed && styles.pressed]}
                        >
                            <Icon name={action.icon} size={20} color={action.primary ? colors.primaryText : modeMeta(action.mode).color}
                                  strokeWidth={2.4}/>
                            <Text style={[styles.actionText, action.primary && styles.actionTextPrimary]}>{action.label}</Text>
                        </Pressable>
                    ))}
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.background},
    content: {padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.xl},
    flex: {flex: 1},
    pressed: {opacity: 0.85, transform: [{scale: 0.985}]},
    searchRow: {flexDirection: "row", alignItems: "center", gap: spacing.sm},
    searchInput: {flex: 1},
    loader: {marginTop: spacing.lg},
    emptyBox: {alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl},
    emptyTitle: {color: colors.text, fontSize: 17, fontWeight: "700"},
    emptyText: {color: colors.textMuted, fontSize: 14, textAlign: "center"},
    statusCard: {borderRadius: radius.xl},
    statusHeader: {flexDirection: "row", alignItems: "flex-start", gap: spacing.md},
    trackingNumber: {color: colors.text, fontSize: 18, fontWeight: "700", ...typography.code},
    statusFacts: {color: colors.textMuted, fontSize: 13, marginTop: 2},
    progress: {gap: spacing.sm},
    progressBars: {flexDirection: "row", gap: 4},
    progressBar: {flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surfaceRaised},
    progressLabels: {flexDirection: "row", justifyContent: "space-between"},
    progressLabel: {color: colors.textMuted, fontSize: 11, fontWeight: "600"},
    progressLabelActive: {color: colors.text, fontWeight: "800"},
    lockedRow: {flexDirection: "row", alignItems: "center", gap: 6},
    statusHint: {color: colors.warning, fontSize: 13, fontWeight: "600"},
    partyRow: {flexDirection: "row", alignItems: "center", gap: spacing.md},
    partyIcon: {
        width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surfaceRaised,
        alignItems: "center", justifyContent: "center", alignSelf: "flex-start",
    },
    partyText: {flex: 1, gap: 2},
    partyName: {color: colors.text, fontSize: 16, fontWeight: "700"},
    partyAddress: {color: colors.textSecondary, fontSize: 14},
    partyMeta: {color: colors.textMuted, fontSize: 13},
    partyActions: {gap: spacing.sm},
    detailRow: {flexDirection: "row", justifyContent: "space-between", gap: spacing.md},
    detailLabel: {color: colors.textMuted, fontSize: 14},
    detailValue: {color: colors.text, fontSize: 14, fontWeight: "600", flexShrink: 1, textAlign: "right"},
    timelineCard: {gap: spacing.md},
    event: {flexDirection: "row", gap: spacing.md},
    eventRail: {width: 12, alignItems: "center"},
    eventDot: {width: 12, height: 12, borderRadius: 6, backgroundColor: colors.textFaint, marginTop: 4},
    eventLine: {width: 2, flex: 1, backgroundColor: colors.border, marginTop: 2},
    eventText: {flex: 1, gap: 2},
    eventSpacing: {paddingBottom: spacing.md},
    eventTitle: {color: colors.text, fontSize: 15, fontWeight: "700"},
    eventTitleOld: {color: colors.textSecondary, fontWeight: "600"},
    eventMeta: {color: colors.textMuted, fontSize: 13},
    actionBar: {
        flexDirection: "row",
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    action: {
        flex: 1, minHeight: 58, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
        backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center", gap: 2,
    },
    actionPrimary: {backgroundColor: colors.primary, borderColor: colors.primary},
    actionText: {color: colors.text, fontSize: 13, fontWeight: "700"},
    actionTextPrimary: {color: colors.primaryText, fontWeight: "800"},
});
