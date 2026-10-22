import * as Haptics from "expo-haptics";
import {router, Stack, useLocalSearchParams} from "expo-router";
import React, {useRef, useState} from "react";
import {Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {AddScanResult, useTerminal} from "../state/TerminalContext";
import {modeIsSingleScan, modeRequiresShipmentId, TerminalFaultError} from "../terminal/soap";
import {isScanRequired} from "../terminal/supplierConfiguration";
import type {ScanMode, TerminalResult} from "../terminal/types";
import {BarcodeCamera} from "../ui/BarcodeCamera";
import {Banner, BannerTone, Button, Card, Field} from "../ui/components";
import {colors, MODES, modeLabel, radius, spacing} from "../ui/theme";

const REJECT_REASONS = ["Odbiorca odmówił", "Uszkodzona paczka", "Błędny adres", "Odbiorca nieobecny"];

const WEB_KEEP_FOCUS_ON_SUBMIT = Platform.OS === "web" ? {blurOnSubmit: false} : {};

type Feedback = {tone: BannerTone; title: string; description?: string | null};

const scanFeedback: Record<AddScanResult, {tone: BannerTone; title: string}> = {
    added: {tone: "success", title: "Dodano"},
    replaced: {tone: "info", title: "Zastąpiono poprzedni skan"},
    duplicate: {tone: "warning", title: "Już zeskanowano"},
    invalid: {tone: "danger", title: "Nieprawidłowy kod"},
};

const haptic = (tone: BannerTone) => {
    if (Platform.OS === "web") {
        return;
    }
    const type = tone === "success" || tone === "info"
        ? Haptics.NotificationFeedbackType.Success
        : tone === "warning" ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Error;
    Haptics.notificationAsync(type).catch(() => undefined);
};

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("pl-PL", {hour: "2-digit", minute: "2-digit", second: "2-digit"});

const isPairKeyFault = (message: string) => /pair key|device.*(not found|inactive)/i.test(message);

export default function ScannerScreen() {
    const insets = useSafeAreaInsets();
    const {user, device, pending, options, setOptions, addScan, removeScan, clearScans, send, unpair, supplierConfiguration} = useTerminal();
    const params = useLocalSearchParams<{mode?: string}>();
    const mode: ScanMode = MODES.find((entry) => entry.mode === params.mode)?.mode || "COLLECT";
    const [code, setCode] = useState("");
    const [cameraOn, setCameraOn] = useState(false);
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<TerminalResult | null>(null);
    const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

    const items = pending[mode];
    const needsShipmentId = modeRequiresShipmentId(mode);
    const hint = MODES.find((entry) => entry.mode === mode)?.hint;
    const scanRequired = isScanRequired(supplierConfiguration, mode);

    const handleCode = (value: string) => {
        const outcome = addScan(mode, value);
        const base = scanFeedback[outcome];
        const description = outcome === "invalid" && needsShipmentId
            ? `${value.trim() || "(pusty)"} — w tym trybie wymagane jest numeryczne ID przesyłki`
            : value.trim();
        setFeedback({...base, description});
        haptic(base.tone);
        setResult(null);
    };

    const submitInput = () => {
        handleCode(code);
        setCode("");
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const validationError = (): string | null => {
        if (!items.length) {
            return "Lista jest pusta — zeskanuj co najmniej jeden kod.";
        }
        if (mode === "REJECT" && !options.rejectReason.trim()) {
            return "Podaj powód odmowy.";
        }
        if (mode === "RETURN" && !options.returnToken.trim()) {
            return "Podaj token zwrotu.";
        }
        return null;
    };

    const submit = async () => {
        const error = validationError();
        if (error) {
            setFeedback({tone: "warning", title: "Nie można wysłać", description: error});
            haptic("warning");
            return;
        }
        setSending(true);
        setFeedback({tone: "info", title: "Wysyłanie do managera…", description: `${items.length} szt.`});
        try {
            const response = await send(mode);
            setResult(response);
            const partial = !response.success && response.details.some((detail) => detail.success);
            const tone: BannerTone = response.success ? "success" : partial ? "warning" : "danger";
            setFeedback({
                tone,
                title: response.success ? "Wysłano pomyślnie" : partial ? "Wysłano częściowo" : "Manager odrzucił zgłoszenie",
                description: response.processId ? `Proces ${response.processId}` : null,
            });
            haptic(tone);
        } catch (exception) {
            const message = (exception as Error).message;
            setFeedback({
                tone: "danger",
                title: exception instanceof TerminalFaultError ? "Błąd managera" : "Błąd wysyłki",
                description: `${message}. Kody pozostały na liście.`,
            });
            haptic("danger");
            if (isPairKeyFault(message)) {
                await unpair();
                router.replace("/device");
            }
        } finally {
            setSending(false);
        }
    };

    return (
        <View style={styles.root}>
            <Stack.Screen options={{
                title: modeLabel(mode),
                headerRight: () => (
                    <View style={styles.headerActions}>
                        <Pressable onPress={() => router.push("/history")} hitSlop={8}><Text style={styles.headerLink}>Historia</Text></Pressable>
                    </View>
                ),
            }}/>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <View style={styles.status}>
                    <View style={styles.statusDot}/>
                    <Text style={styles.statusText} numberOfLines={1}>
                        {user?.username} · {device?.departmentCode || user?.departmentCode || "—"} · {device?.deviceId}
                    </Text>
                </View>

                <Text style={styles.hint}>{hint}</Text>
                {scanRequired ? (
                    <Text style={styles.scanRequired}>Wymagane skanowanie — ręczne dodawanie kodów jest wyłączone w Twoich ustawieniach.</Text>
                ) : null}

                {cameraOn ? <BarcodeCamera onScan={handleCode}/> : null}

                <View style={styles.scanRow}>
                    <View style={styles.scanInput}>
                        <Field
                            label={needsShipmentId ? "ID przesyłki" : mode === "PALLET" ? "Numer palety" : "Numer śledzenia"}
                            inputRef={inputRef}
                            value={code}
                            onChangeText={setCode}
                            onSubmitEditing={submitInput}
                            submitBehavior="submit"
                            {...WEB_KEEP_FOCUS_ON_SUBMIT}
                            returnKeyType="done"
                            autoFocus
                            keyboardType={needsShipmentId ? "number-pad" : "default"}
                            placeholder="Zeskanuj lub wpisz kod"
                            showSoftInputOnFocus={!cameraOn}
                        />
                    </View>
                    {scanRequired ? null : (
                        <Button label="Dodaj" variant="secondary" onPress={submitInput} disabled={!code.trim()} style={styles.addButton}/>
                    )}
                </View>
                <Button label={cameraOn ? "Wyłącz aparat" : "Skanuj aparatem"} variant="secondary" onPress={() => setCameraOn((value) => !value)}/>

                {feedback ? <Banner tone={feedback.tone} title={feedback.title} description={feedback.description}/> : null}

                {needsShipmentId ? (
                    <Card>
                        <Field
                            label="Kod dostawcy (opcjonalnie)"
                            value={options.supplierCode}
                            onChangeText={(supplierCode) => setOptions({...options, supplierCode})}
                            placeholder="np. SUP-01"
                            autoCapitalize="characters"
                        />
                        {mode === "REJECT" ? (
                            <>
                                <View style={styles.reasons}>
                                    {REJECT_REASONS.map((reason) => (
                                        <Pressable key={reason} onPress={() => setOptions({...options, rejectReason: reason})}
                                                   style={[styles.reason, options.rejectReason === reason && styles.modeActive]}>
                                            <Text style={[styles.modeText, options.rejectReason === reason && styles.modeTextActive]}>{reason}</Text>
                                        </Pressable>
                                    ))}
                                </View>
                                <Field label="Powód odmowy" value={options.rejectReason}
                                       onChangeText={(rejectReason) => setOptions({...options, rejectReason})}/>
                            </>
                        ) : null}
                        {mode === "RETURN" ? (
                            <Field label="Token zwrotu" value={options.returnToken}
                                   onChangeText={(returnToken) => setOptions({...options, returnToken})} placeholder="ReturnToken"/>
                        ) : null}
                    </Card>
                ) : null}

                {result && (result.details.length || result.summary) ? (
                    <Card>
                        <Text style={styles.sectionTitle}>Odpowiedź managera — {modeLabel(result.mode)}</Text>
                        {result.summary ? <Text style={styles.itemMeta}>{result.summary}</Text> : null}
                        {result.details.map((detail, index) => (
                            <View key={`${detail.code}-${index}`} style={styles.resultRow}>
                                <Text style={[styles.resultMark, {color: detail.success ? colors.success : colors.danger}]}>
                                    {detail.success ? "✓" : "✕"}
                                </Text>
                                <View style={{flex: 1}}>
                                    <Text style={styles.itemCode}>{detail.code || "—"}</Text>
                                    {detail.message ? <Text style={styles.itemMeta}>{detail.message}</Text> : null}
                                </View>
                            </View>
                        ))}
                    </Card>
                ) : null}

                <Card>
                    <View style={styles.listHeader}>
                        <Text style={styles.sectionTitle}>
                            {modeIsSingleScan(mode) ? "Zeskanowana paleta" : `Do wysłania: ${items.length}`}
                        </Text>
                        {items.length ? <Button label="Wyczyść" variant="ghost" onPress={() => clearScans(mode)}/> : null}
                    </View>
                    {!items.length ? <Text style={styles.empty}>Brak zeskanowanych kodów.</Text> : null}
                    {items.map((item) => (
                        <View key={item.code} style={styles.item}>
                            <View style={{flex: 1}}>
                                <Text style={styles.itemCode}>{item.code}</Text>
                                <Text style={styles.itemMeta}>{formatTime(item.scannedAt)}</Text>
                            </View>
                            <Pressable onPress={() => removeScan(mode, item.code)} hitSlop={8} style={styles.remove}>
                                <Text style={styles.removeText}>Usuń</Text>
                            </Pressable>
                        </View>
                    ))}
                </Card>
            </ScrollView>

            <View style={[styles.bottomBar, {paddingBottom: Math.max(insets.bottom, spacing.md)}]}>
                <Button
                    label={`Wyślij do managera${items.length ? ` (${items.length})` : ""}`}
                    onPress={submit}
                    loading={sending}
                    disabled={!items.length}
                    large
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.background},
    content: {padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl},
    headerActions: {flexDirection: "row", gap: spacing.md, paddingRight: spacing.sm},
    headerLink: {color: colors.primary, fontWeight: "600", fontSize: 15},
    status: {flexDirection: "row", alignItems: "center", gap: spacing.sm},
    statusDot: {width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success},
    statusText: {color: colors.textMuted, fontSize: 13, flex: 1},
    modeActive: {backgroundColor: colors.primary, borderColor: colors.primary},
    modeText: {color: colors.text, fontWeight: "600", fontSize: 15},
    modeTextActive: {color: colors.primaryText},
    hint: {color: colors.textMuted, fontSize: 13},
    scanRequired: {color: colors.warning, fontSize: 13, fontWeight: "600"},
    scanRow: {flexDirection: "row", alignItems: "flex-end", gap: spacing.sm},
    scanInput: {flex: 1},
    addButton: {minWidth: 84},
    reasons: {flexDirection: "row", flexWrap: "wrap", gap: spacing.sm},
    reason: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceRaised,
    },
    sectionTitle: {color: colors.text, fontSize: 16, fontWeight: "700"},
    listHeader: {flexDirection: "row", alignItems: "center", justifyContent: "space-between"},
    empty: {color: colors.textMuted},
    item: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: spacing.sm,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
    },
    itemCode: {color: colors.text, fontSize: 16, fontWeight: "600", fontVariant: ["tabular-nums"]},
    itemMeta: {color: colors.textMuted, fontSize: 13},
    remove: {paddingHorizontal: spacing.sm, paddingVertical: spacing.xs},
    removeText: {color: colors.danger, fontWeight: "600"},
    resultRow: {flexDirection: "row", gap: spacing.sm, alignItems: "flex-start"},
    resultMark: {fontSize: 18, fontWeight: "800", width: 20},
    bottomBar: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
});
