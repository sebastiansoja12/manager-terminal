import React, {useRef, useState} from "react";
import {ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from "react-native";
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
    statusTone,
} from "../terminal/shipmentLookup";
import {BarcodeCamera} from "../ui/BarcodeCamera";
import {Banner, Button, Card, Field} from "../ui/components";
import {colors, radius, spacing} from "../ui/theme";

const WEB_KEEP_FOCUS_ON_SUBMIT = Platform.OS === "web" ? {blurOnSubmit: false} : {};
const HISTORY_LIMIT = 15;

const toneColors = {
    success: {background: colors.successSurface, border: colors.success},
    warning: {background: colors.warningSurface, border: colors.warning},
    danger: {background: colors.dangerSurface, border: colors.danger},
    info: {background: colors.infoSurface, border: colors.info},
};

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

function PartyCard({title, party}: {title: string; party: ShipmentParty}) {
    return (
        <Card>
            <Text style={styles.sectionTitle}>{title}</Text>
            <Text style={styles.partyName}>{partyName(party)}</Text>
            <Text style={styles.partyAddress}>{partyAddress(party)}</Text>
            {party.telephoneNumber ? (
                <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`tel:${party.telephoneNumber}`)} hitSlop={8}>
                    <Text style={styles.link}>📞 {party.telephoneNumber}</Text>
                </Pressable>
            ) : null}
            {party.email ? <Text style={styles.partyAddress}>✉️ {party.email}</Text> : null}
        </Card>
    );
}

export default function ShipmentLookupScreen() {
    const {client} = useTerminal();
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

    const clear = () => {
        setCode("");
        setDetails(null);
        setError(null);
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const shipment = details?.shipment;
    const events = details ? routeEvents(details).slice(0, HISTORY_LIMIT) : [];
    const tone = shipment ? toneColors[statusTone(shipment.shipmentStatus)] : null;

    return (
        <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.searchRow}>
                <View style={styles.searchInput}>
                    <Field
                        label="Numer śledzenia"
                        inputRef={inputRef}
                        value={code}
                        onChangeText={setCode}
                        onSubmitEditing={() => search(code)}
                        submitBehavior="submit"
                        {...WEB_KEEP_FOCUS_ON_SUBMIT}
                        returnKeyType="search"
                        autoFocus
                        autoCapitalize="characters"
                        placeholder="Zeskanuj lub wpisz numer"
                        showSoftInputOnFocus={!cameraOn}
                    />
                </View>
                <Button label="Szukaj" onPress={() => search(code)} disabled={!code.trim() || loading} style={styles.searchButton}/>
            </View>
            <Button
                label={cameraOn ? "Wyłącz aparat" : "Skanuj aparatem"}
                variant="secondary"
                onPress={() => setCameraOn((value) => !value)}
            />
            {cameraOn ? <BarcodeCamera onScan={search}/> : null}

            {loading ? <ActivityIndicator color={colors.primary} size="large" style={styles.loader}/> : null}
            {error ? <Banner tone="danger" title="Nie można wyświetlić przesyłki" description={error}/> : null}

            {shipment && tone ? (
                <>
                    <View style={[styles.statusCard, {backgroundColor: tone.background, borderColor: tone.border}]}>
                        <Text style={styles.statusLabel}>Status</Text>
                        <Text style={styles.statusValue}>
                            {SHIPMENT_STATUS_LABELS[shipment.shipmentStatus] || shipment.shipmentStatus}
                        </Text>
                        <Text selectable style={styles.trackingNumber}>{shipment.trackingNumber.value}</Text>
                        {shipment.locked ? <Text style={styles.statusHint}>Przesyłka zablokowana do edycji</Text> : null}
                    </View>

                    <PartyCard title="Odbiorca" party={shipment.recipient}/>
                    <PartyCard title="Nadawca" party={shipment.sender}/>

                    <Card>
                        <Text style={styles.sectionTitle}>Paczka</Text>
                        <DetailRow label="Waga" value={formatWeight(shipment.weight)}/>
                        <DetailRow label="Wymiary" value={formatDimensions(shipment.dimensions)}/>
                        <DetailRow label="Opakowanie" value={packagingLabel(shipment.packagingType)}/>
                        <DetailRow label="Usługa" value={serviceLevelLabel(shipment.serviceLevel)}/>
                        <DetailRow label="Priorytet" value={priorityLabel(shipment.shipmentPriority)}/>
                        <DetailRow label="Zawartość" value={shipment.contentDescription}/>
                        <DetailRow label="Referencja klienta" value={shipment.customerReference}/>
                        <DetailRow label="Utworzona" value={formatDateTime(shipment.createdAt)}/>
                        <DetailRow label="Zmieniona" value={formatDateTime(shipment.updatedAt)}/>
                    </Card>

                    {shipment.signature ? (
                        <Card>
                            <Text style={styles.sectionTitle}>Potwierdzenie odbioru</Text>
                            <DetailRow label="Podpisał(a)" value={shipment.signature.signerName}/>
                            <DetailRow label="Data" value={formatDateTime(shipment.signature.signedAt)}/>
                        </Card>
                    ) : null}

                    <Card>
                        <Text style={styles.sectionTitle}>Historia zdarzeń</Text>
                        {!events.length ? <Text style={styles.empty}>Brak zarejestrowanych zdarzeń.</Text> : null}
                        {events.map((event) => {
                            const location = eventLocation(event);
                            return (
                                <View key={`${event.id}-${event.processType}`} style={styles.event}>
                                    <View style={styles.eventDot}/>
                                    <View style={styles.eventText}>
                                        <Text style={styles.eventTitle}>{eventTitle(event)}</Text>
                                        <Text style={styles.eventMeta}>
                                            {formatDateTime(event.timestamp)}{location ? ` · ${location}` : ""}
                                            {event.username ? ` · ${event.username}` : ""}
                                        </Text>
                                        {event.description ? <Text style={styles.eventMeta}>{event.description}</Text> : null}
                                    </View>
                                </View>
                            );
                        })}
                    </Card>

                    <Button label="Sprawdź kolejną przesyłkę" variant="secondary" onPress={clear}/>
                </>
            ) : null}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.background},
    content: {padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl},
    searchRow: {flexDirection: "row", alignItems: "flex-end", gap: spacing.sm},
    searchInput: {flex: 1},
    searchButton: {minWidth: 92},
    loader: {marginTop: spacing.lg},
    statusCard: {borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: 2},
    statusLabel: {color: colors.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6},
    statusValue: {color: colors.text, fontSize: 24, fontWeight: "800"},
    trackingNumber: {color: colors.text, fontSize: 16, fontWeight: "600", fontVariant: ["tabular-nums"], marginTop: spacing.xs},
    statusHint: {color: colors.warning, fontSize: 13, fontWeight: "600", marginTop: spacing.xs},
    sectionTitle: {color: colors.textMuted, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5},
    partyName: {color: colors.text, fontSize: 18, fontWeight: "700"},
    partyAddress: {color: colors.text, fontSize: 15, opacity: 0.9},
    link: {color: colors.primary, fontSize: 16, fontWeight: "600"},
    detailRow: {flexDirection: "row", justifyContent: "space-between", gap: spacing.md},
    detailLabel: {color: colors.textMuted, fontSize: 14},
    detailValue: {color: colors.text, fontSize: 14, fontWeight: "600", flexShrink: 1, textAlign: "right"},
    empty: {color: colors.textMuted},
    event: {flexDirection: "row", gap: spacing.md, paddingVertical: spacing.xs},
    eventDot: {width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary, marginTop: 5},
    eventText: {flex: 1, gap: 2},
    eventTitle: {color: colors.text, fontSize: 15, fontWeight: "600"},
    eventMeta: {color: colors.textMuted, fontSize: 13},
});
