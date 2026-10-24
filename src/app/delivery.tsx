import * as Haptics from "expo-haptics";
import {router, Stack, useLocalSearchParams} from "expo-router";
import React, {useCallback, useEffect, useState} from "react";
import {ActivityIndicator, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, View} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {ApiError} from "../api/client";
import {useTerminal} from "../state/TerminalContext";
import {
    ATTEMPT_STATUSES,
    AttemptStatus,
    DELIVERY_METHOD_LABELS,
    Delivery,
    DeliveryStep,
    LIFECYCLE_LABELS,
    attemptsLabel,
    deliveryTone,
    isOpen,
    isOverdue,
    latestStep,
    statusLabel,
} from "../terminal/deliveries";
import {formatDateTime, partyAddress, partyName, ShipmentLookupDetails} from "../terminal/shipmentLookup";
import type {ScanMode} from "../terminal/types";
import {Banner, Button, Card, Chip, IconButton, Pill, SectionLabel} from "../ui/components";
import type {IconName} from "../ui/Icon";
import {colors, radius, spacing, typography} from "../ui/theme";

const SCAN_ACTIONS: {mode: ScanMode; label: string; icon: IconName; primary?: boolean}[] = [
    {mode: "HANDOVER", label: "Doręcz", icon: "check", primary: true},
    {mode: "MISS", label: "Nieobecny", icon: "door"},
    {mode: "REJECT", label: "Odmowa", icon: "reject"},
];

const OUTCOME_LABELS: Record<string, string> = {IN_PROGRESS: "W toku", SUCCEEDED: "Udana", FAILED: "Nieudana"};

const mapsUrl = (address: string) => (Platform.OS === "ios"
    ? `maps:0,0?q=${encodeURIComponent(address)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`);

const describeError = (error: Error) => (error instanceof ApiError && error.status === 409
    ? "Dostawa jest zakończona lub anulowana — nie można jej już zmienić."
    : error.message);

function StepRow({step, last}: {step: DeliveryStep; last: boolean}) {
    const failed = step.outcome === "FAILED";
    return (
        <View style={styles.step}>
            <View style={styles.stepRail}>
                <View style={[styles.stepDot, failed && styles.stepDotFailed, step.outcome === "SUCCEEDED" && styles.stepDotSucceeded]}/>
                {last ? null : <View style={styles.stepLine}/>}
            </View>
            <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>
                    {statusLabel(step.deliveryStatus)}{step.outcome ? ` · ${OUTCOME_LABELS[step.outcome] || step.outcome}` : ""}
                </Text>
                {step.attemptedAt ? <Text style={styles.stepMeta}>{formatDateTime(step.attemptedAt)}</Text> : null}
                {step.comment ? <Text style={[styles.stepComment, failed && styles.stepCommentFailed]}>{step.comment}</Text> : null}
            </View>
        </View>
    );
}

export default function DeliveryScreen() {
    const insets = useSafeAreaInsets();
    const {client, addScan} = useTerminal();
    const {deliveryId} = useLocalSearchParams<{deliveryId: string}>();
    const [delivery, setDelivery] = useState<Delivery | null>(null);
    const [shipment, setShipment] = useState<ShipmentLookupDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [attemptStatus, setAttemptStatus] = useState<AttemptStatus | null>(null);
    const [attemptComment, setAttemptComment] = useState("");
    const [stepComment, setStepComment] = useState("");
    const [saving, setSaving] = useState<"attempt" | "comment" | null>(null);
    const [feedback, setFeedback] = useState<{tone: "success" | "danger"; title: string; description?: string} | null>(null);

    const fetchDelivery = useCallback(() => {
        if (!client || !deliveryId) {
            return;
        }
        client.delivery(deliveryId)
            .then((loaded) => {
                setDelivery(loaded);
                setError(null);
                return loaded.shipmentId
                    ? client.shipmentById(loaded.shipmentId).then(setShipment).catch(() => setShipment(null))
                    : undefined;
            })
            .catch((exception: Error) => setError(exception instanceof ApiError && exception.status === 404
                ? "Dostawa nie istnieje."
                : exception.message))
            .finally(() => setLoading(false));
    }, [client, deliveryId]);

    useEffect(() => {
        fetchDelivery();
    }, [fetchDelivery]);

    const retry = () => {
        setLoading(true);
        fetchDelivery();
    };

    const trackingNumber = shipment?.shipment.trackingNumber.value || null;

    const openScanner = (mode: ScanMode) => {
        if (!trackingNumber) {
            return;
        }
        const outcome = addScan(mode, trackingNumber);
        if (Platform.OS !== "web") {
            Haptics.notificationAsync(outcome === "invalid"
                ? Haptics.NotificationFeedbackType.Error
                : Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        }
        router.push({pathname: "/scanner", params: {mode}});
    };

    const registerAttempt = () => {
        if (!client || !delivery || !attemptStatus) {
            return;
        }
        setSaving("attempt");
        setFeedback(null);
        client.registerDeliveryAttempt(delivery.id, attemptStatus, attemptComment.trim() || null)
            .then((updated) => {
                setDelivery(updated);
                setAttemptStatus(null);
                setAttemptComment("");
                setFeedback({tone: "success", title: "Próba zapisana"});
            })
            .catch((exception: Error) => setFeedback({tone: "danger", title: "Nie zapisano próby", description: describeError(exception)}))
            .finally(() => setSaving(null));
    };

    const step = delivery ? latestStep(delivery) : null;

    const commentStep = () => {
        if (!client || !delivery || !step || !stepComment.trim()) {
            return;
        }
        setSaving("comment");
        setFeedback(null);
        client.commentDeliveryStep(delivery.id, step.stepNumber, stepComment.trim())
            .then((updated) => {
                setDelivery(updated);
                setStepComment("");
                setFeedback({tone: "success", title: "Komentarz zapisany"});
            })
            .catch((exception: Error) => setFeedback({tone: "danger", title: "Nie zapisano komentarza", description: describeError(exception)}))
            .finally(() => setSaving(null));
    };

    if (loading) {
        return <ActivityIndicator style={styles.loader} color={colors.primary}/>;
    }

    if (!delivery) {
        return (
            <View style={styles.content}>
                <Stack.Screen options={{title: "Dostawa"}}/>
                <Banner tone="danger" title="Nie udało się pobrać dostawy" description={error} action={{label: "Ponów", onPress: retry}}/>
            </View>
        );
    }

    const open = isOpen(delivery);
    const recipient = shipment?.shipment.recipient;
    const address = recipient ? partyAddress(recipient) : null;
    const attempts = attemptsLabel(delivery);
    const steps = [...delivery.steps].sort((left, right) => right.stepNumber - left.stepNumber);

    return (
        <ScrollView style={styles.root} contentContainerStyle={[styles.content, {paddingBottom: insets.bottom + spacing.xl}]}
                    keyboardShouldPersistTaps="handled">
            <Stack.Screen options={{title: trackingNumber || "Dostawa"}}/>

            <View style={styles.pills}>
                <Pill tone={deliveryTone(delivery)} dot label={statusLabel(delivery.deliveryStatus)}/>
                <Pill label={LIFECYCLE_LABELS[delivery.lifecycleStatus] || delivery.lifecycleStatus}/>
                {delivery.type === "RETURN" ? <Pill tone="warning" label="Zwrot"/> : null}
                {attempts ? <Pill tone="warning" label={attempts}/> : null}
            </View>

            {feedback ? <Banner tone={feedback.tone} title={feedback.title} description={feedback.description}/> : null}

            {recipient ? (
                <Card>
                    <View style={styles.partyRow}>
                        <View style={styles.partyText}>
                            <SectionLabel>Odbiorca</SectionLabel>
                            <Text style={styles.partyName}>{partyName(recipient)}</Text>
                            {address && address !== "—" ? <Text style={styles.partyAddress}>{address}</Text> : null}
                        </View>
                        <View style={styles.partyActions}>
                            {recipient.telephoneNumber ? (
                                <IconButton icon="phone" label={`Zadzwoń: ${recipient.telephoneNumber}`} tone="success" size={42}
                                            onPress={() => Linking.openURL(`tel:${recipient.telephoneNumber}`)}/>
                            ) : null}
                            {address && address !== "—" ? (
                                <IconButton icon="navigate" label="Nawiguj do adresu" tone="info" size={42}
                                            onPress={() => Linking.openURL(mapsUrl(address))}/>
                            ) : null}
                        </View>
                    </View>
                </Card>
            ) : null}

            <Card>
                <SectionLabel>Dostawa</SectionLabel>
                <Row label="Numer śledzenia" value={trackingNumber}/>
                <Row label="Sposób" value={delivery.method ? DELIVERY_METHOD_LABELS[delivery.method] : null}/>
                <Row label="Plan" value={delivery.plannedAt
                    ? `${formatDateTime(delivery.plannedAt)}${isOverdue(delivery) ? " (po terminie)" : ""}`
                    : null}/>
                <Row label="Wymagany podpis" value={delivery.signatureRequired ? "Tak" : null}/>
                <Row label="Doręczona" value={formatDateTime(delivery.deliveredAt)}/>
                {delivery.instructions ? <Text style={styles.instructions}>{delivery.instructions}</Text> : null}
            </Card>

            {open && trackingNumber ? (
                <View style={styles.actions}>
                    {SCAN_ACTIONS.map((action) => (
                        <Button key={action.mode} label={action.label} icon={action.icon}
                                variant={action.primary ? "primary" : "secondary"} onPress={() => openScanner(action.mode)}
                                style={styles.action}/>
                    ))}
                </View>
            ) : null}

            {open ? (
                <Card>
                    <SectionLabel>Zgłoś próbę doręczenia</SectionLabel>
                    <View style={styles.chips}>
                        {ATTEMPT_STATUSES.map((entry) => (
                            <Chip key={entry.status} label={entry.label} selected={attemptStatus === entry.status}
                                  onPress={() => setAttemptStatus((current) => (current === entry.status ? null : entry.status))}/>
                        ))}
                    </View>
                    {attemptStatus ? (
                        <Text style={styles.hint}>{ATTEMPT_STATUSES.find((entry) => entry.status === attemptStatus)?.description}</Text>
                    ) : null}
                    <TextInput
                        accessibilityLabel="Komentarz do próby"
                        placeholder="Komentarz (opcjonalnie)"
                        placeholderTextColor={colors.textMuted}
                        value={attemptComment}
                        onChangeText={setAttemptComment}
                        multiline
                        maxLength={500}
                        style={styles.input}
                    />
                    <Button label="Zapisz próbę" icon="check" disabled={!attemptStatus} loading={saving === "attempt"}
                            onPress={registerAttempt}/>
                </Card>
            ) : null}

            <Card>
                <SectionLabel right={<Text style={styles.count}>{delivery.steps.length}</Text>}>Kroki dostawy</SectionLabel>
                {steps.length ? steps.map((entry, index) => (
                    <StepRow key={entry.stepNumber} step={entry} last={index === steps.length - 1}/>
                )) : <Text style={styles.hint}>Brak zarejestrowanych kroków.</Text>}
                {step ? (
                    <View style={styles.commentBox}>
                        <TextInput
                            accessibilityLabel="Komentarz do ostatniego kroku"
                            placeholder="Dodaj komentarz do ostatniego kroku"
                            placeholderTextColor={colors.textMuted}
                            value={stepComment}
                            onChangeText={setStepComment}
                            multiline
                            maxLength={500}
                            style={styles.input}
                        />
                        <Button label="Zapisz komentarz" variant="secondary" disabled={!stepComment.trim()}
                                loading={saving === "comment"} onPress={commentStep}/>
                    </View>
                ) : null}
            </Card>
        </ScrollView>
    );
}

function Row({label, value}: {label: string; value?: string | null}) {
    if (!value) {
        return null;
    }
    return (
        <View style={styles.row}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text selectable style={styles.rowValue}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.background},
    loader: {flex: 1, backgroundColor: colors.background},
    content: {padding: spacing.lg, gap: spacing.md},
    pills: {flexDirection: "row", flexWrap: "wrap", gap: spacing.sm},
    partyRow: {flexDirection: "row", alignItems: "center", gap: spacing.md},
    partyText: {flex: 1, gap: 2},
    partyName: {color: colors.text, fontSize: 17, fontWeight: "700"},
    partyAddress: {color: colors.textSecondary, fontSize: 14},
    partyActions: {flexDirection: "row", gap: spacing.sm},
    row: {flexDirection: "row", justifyContent: "space-between", gap: spacing.md, paddingVertical: 6},
    rowLabel: {color: colors.textMuted, fontSize: 14},
    rowValue: {color: colors.text, fontSize: 14, fontWeight: "600", flexShrink: 1, textAlign: "right", ...typography.code},
    instructions: {color: colors.warningText, fontSize: 14, marginTop: spacing.sm},
    actions: {flexDirection: "row", gap: spacing.sm},
    action: {flex: 1, paddingHorizontal: spacing.sm},
    chips: {flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm},
    hint: {color: colors.textMuted, fontSize: 13, marginBottom: spacing.sm},
    input: {
        minHeight: 48, maxHeight: 120, paddingHorizontal: spacing.md, paddingTop: 12, paddingBottom: 12, marginBottom: spacing.sm,
        borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background,
        color: colors.text, fontSize: 15,
    },
    count: {color: colors.textMuted, fontSize: 13},
    step: {flexDirection: "row", gap: spacing.md},
    stepRail: {alignItems: "center", width: 12},
    stepDot: {width: 12, height: 12, borderRadius: 6, backgroundColor: colors.info, marginTop: 4},
    stepDotFailed: {backgroundColor: colors.danger},
    stepDotSucceeded: {backgroundColor: colors.success},
    stepLine: {flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2},
    stepBody: {flex: 1, gap: 2, paddingBottom: spacing.md},
    stepTitle: {color: colors.text, fontSize: 15, fontWeight: "700"},
    stepMeta: {color: colors.textMuted, fontSize: 13},
    stepComment: {color: colors.textSecondary, fontSize: 14},
    stepCommentFailed: {color: colors.dangerText},
    commentBox: {marginTop: spacing.sm},
});
