import * as Haptics from "expo-haptics";
import {router, Stack, useLocalSearchParams} from "expo-router";
import React, {useEffect, useRef, useState} from "react";
import {Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {AddScanResult, useTerminal} from "../state/TerminalContext";
import {isDeviceCredentialFault, isOperatorSessionFault} from "../terminal/activation";
import {modeIsDeliveryProcess, modeIsSingleScan, TerminalFaultError} from "../terminal/soap";
import {isScanRequired, isSignatureRequired} from "../terminal/supplierConfiguration";
import type {ScanMode, TerminalResult} from "../terminal/types";
import {BarcodeCamera} from "../ui/BarcodeCamera";
import {Banner, BannerTone, Button, Card, Chip, Field, IconButton, SectionLabel} from "../ui/components";
import {Icon, IconName} from "../ui/Icon";
import {SignaturePad} from "../ui/SignaturePad";
import {colors, MODES, modeLabel, modeMeta, radius, spacing, typography} from "../ui/theme";

const REJECT_REASONS = ["Odbiorca odmówił", "Uszkodzona paczka", "Błędny adres", "Odbiorca nieobecny"];

const WEB_KEEP_FOCUS_ON_SUBMIT = Platform.OS === "web" ? {blurOnSubmit: false} : {};
// Hardware scanners in keyboard mode type into the focused field, so Android and web keep the field focused
// after a code is added; only the on-screen keyboard is hidden. iOS cannot focus without the keyboard.
const KEEP_FOCUS_FOR_HARDWARE_SCANNER = Platform.OS !== "ios";

type Feedback = {tone: BannerTone; title: string; description?: string | null};

const scanFeedback: Record<AddScanResult, {tone: BannerTone; title: string}> = {
    added: {tone: "success", title: "Dodano"},
    replaced: {tone: "info", title: "Zastąpiono poprzedni skan"},
    duplicate: {tone: "warning", title: "Już zeskanowano"},
    invalid: {tone: "danger", title: "Nieprawidłowy kod"},
};

const feedbackPalette: Record<BannerTone, {background: string; border: string; badge: string; icon: IconName; iconColor: string; text: string}> = {
    success: {background: colors.successSurface, border: colors.success, badge: colors.success, icon: "check", iconColor: "#052E16", text: "#BBF7D0"},
    info: {background: colors.infoSurface, border: colors.info, badge: colors.info, icon: "refresh", iconColor: "#082F49", text: colors.infoText},
    warning: {background: colors.warningSurface, border: colors.warning, badge: colors.warning, icon: "alert", iconColor: colors.primaryText, text: colors.warningText},
    danger: {background: colors.dangerSurface, border: colors.danger, badge: colors.danger, icon: "close", iconColor: "#FFFFFF", text: colors.dangerText},
};

const haptic = (tone: BannerTone) => {
    if (Platform.OS === "web") {
        return;
    }
    if (tone === "danger") {
        // Two strong pulses for an error, so it can be told apart from a duplicate without looking.
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined), 180);
        return;
    }
    const type = tone === "success" || tone === "info"
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning;
    Haptics.notificationAsync(type).catch(() => undefined);
};

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("pl-PL", {hour: "2-digit", minute: "2-digit", second: "2-digit"});

function ScanFeedback({feedback}: {feedback: Feedback}) {
    const palette = feedbackPalette[feedback.tone];
    return (
        <View accessibilityRole="alert" accessibilityLiveRegion="polite"
              style={[styles.feedback, {backgroundColor: palette.background, borderColor: palette.border}]}>
            <View style={[styles.feedbackBadge, {backgroundColor: palette.badge}]}>
                <Icon name={palette.icon} size={22} color={palette.iconColor} strokeWidth={3}/>
            </View>
            <View style={styles.feedbackText}>
                <Text style={styles.feedbackTitle}>{feedback.title}</Text>
                {feedback.description ? (
                    <Text style={[styles.feedbackDescription, {color: palette.text}]} numberOfLines={3}>{feedback.description}</Text>
                ) : null}
            </View>
        </View>
    );
}

export default function ScannerScreen() {
    const insets = useSafeAreaInsets();
    const {
        pending, options, setOptions, addScan, removeScan, clearScans, send, logout, deregister, supplierConfiguration,
        setLastMode, cameraPreferred, setCameraPreferred, outbox,
    } = useTerminal();
    const params = useLocalSearchParams<{mode?: string}>();
    const mode: ScanMode = MODES.find((entry) => entry.mode === params.mode)?.mode || "COLLECT";
    const [code, setCode] = useState("");
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<TerminalResult | null>(null);
    const [signatureKey, setSignatureKey] = useState(0);
    const [softKeyboard, setSoftKeyboard] = useState(true);
    const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

    const items = pending[mode];
    const meta = modeMeta(mode);
    const deliveryProcess = modeIsDeliveryProcess(mode);
    const scanRequired = isScanRequired(supplierConfiguration, mode);
    const signatureRequired = mode === "HANDOVER" && isSignatureRequired(supplierConfiguration);
    const queuedForMode = outbox.filter((entry) => entry.mode === mode).reduce((total, entry) => total + entry.items.length, 0);

    useEffect(() => {
        setLastMode(mode);
    }, [mode, setLastMode]);

    const switchMode = (next: ScanMode) => {
        if (next === mode) {
            return;
        }
        router.setParams({mode: next});
        setFeedback(null);
        setResult(null);
        setCode("");
    };

    const handleCode = (value: string) => {
        const outcome = addScan(mode, value);
        const base = scanFeedback[outcome];
        const description = value.trim() || "(pusty kod)";
        setFeedback({...base, description});
        haptic(base.tone);
        setResult(null);
    };

    const hideKeyboard = () => {
        setSoftKeyboard(false);
        Keyboard.dismiss();
        if (KEEP_FOCUS_FOR_HARDWARE_SCANNER) {
            setTimeout(() => inputRef.current?.focus(), 0);
        } else {
            inputRef.current?.blur();
        }
    };

    const showKeyboard = () => {
        if (softKeyboard) {
            return;
        }
        setSoftKeyboard(true);
        // The field may already be focused without the keyboard; refocusing makes the keyboard appear.
        inputRef.current?.blur();
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    const submitInput = () => {
        handleCode(code);
        setCode("");
        hideKeyboard();
    };

    const handleCameraScan = (value: string) => {
        handleCode(value);
        setCameraPreferred(false);
        hideKeyboard();
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
        if (signatureRequired && !options.signature) {
            return "Wymagany jest podpis odbiorcy — włączono to w Twoich ustawieniach.";
        }
        if (mode === "HANDOVER" && options.signature && !options.recipientName.trim()) {
            return "Podaj imię i nazwisko osoby podpisującej.";
        }
        return null;
    };

    const resetSignature = () => {
        if (mode === "HANDOVER") {
            setOptions({...options, recipientName: "", signature: ""});
            setSignatureKey((value) => value + 1);
        }
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
            const outcome = await send(mode);
            resetSignature();
            if (outcome.status === "queued") {
                setResult(null);
                setFeedback({
                    tone: "warning",
                    title: "Brak połączenia — zapisano w kolejce",
                    description: `${outcome.entry.items.length} szt. wyślemy automatycznie, gdy wróci sieć.`,
                });
                haptic("warning");
                return;
            }
            const response = outcome.result;
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
            if (isDeviceCredentialFault(message)) {
                await deregister();
                router.replace("/activate");
            } else if (isOperatorSessionFault(message)) {
                await logout();
                router.replace("/login");
            }
        } finally {
            setSending(false);
        }
    };

    const fieldLabel = mode === "PALLET" ? "Numer palety" : "Numer śledzenia";

    return (
        <View style={styles.root}>
            <Stack.Screen options={{
                title: modeLabel(mode),
                headerRight: () => (
                    <Pressable accessibilityRole="button" accessibilityLabel="Historia wysyłek" onPress={() => router.push("/history")} hitSlop={10}>
                        <Icon name="history" size={22} color={colors.primary}/>
                    </Pressable>
                ),
            }}/>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modes}
                            accessibilityRole="tablist" style={styles.modesScroll}>
                    {MODES.map((entry) => {
                        const count = pending[entry.mode].length;
                        return (
                            <Chip
                                key={entry.mode}
                                label={count ? `${entry.label} · ${count}` : entry.label}
                                icon={entry.icon}
                                iconColor={entry.color}
                                selected={entry.mode === mode}
                                onPress={() => switchMode(entry.mode)}
                            />
                        );
                    })}
                </ScrollView>

                {cameraPreferred ? <BarcodeCamera height={240} onScan={handleCameraScan}/> : null}

                {feedback ? <ScanFeedback feedback={feedback}/> : (
                    <Text style={styles.hint}>{meta.hint}</Text>
                )}

                {mode === "MISS" ? (
                    <Chip label="Punkty odbioru w okolicy" icon="mapPin" iconColor={colors.primary}
                          onPress={() => router.push("/pickup-points")}/>
                ) : null}

                <View style={styles.scanRow}>
                    <View style={styles.scanInput}>
                        <Field
                            label={fieldLabel}
                            hideLabel
                            icon="keyboard"
                            inputRef={inputRef}
                            value={code}
                            onChangeText={setCode}
                            onSubmitEditing={submitInput}
                            submitBehavior="submit"
                            {...WEB_KEEP_FOCUS_ON_SUBMIT}
                            returnKeyType="done"
                            autoFocus
                            placeholder={`${fieldLabel} — zeskanuj lub wpisz`}
                            showSoftInputOnFocus={softKeyboard && !cameraPreferred}
                            onPressIn={showKeyboard}
                        />
                    </View>
                    {scanRequired ? null : (
                        <Button label="Dodaj" variant="secondary" onPress={submitInput} disabled={!code.trim()} style={styles.addButton}/>
                    )}
                    <IconButton
                        icon="camera"
                        label={cameraPreferred ? "Wyłącz aparat" : "Skanuj aparatem"}
                        tone={cameraPreferred ? "primary" : "neutral"}
                        size={50}
                        onPress={() => {
                            Keyboard.dismiss();
                            setCameraPreferred(!cameraPreferred);
                        }}
                    />
                </View>
                {scanRequired ? (
                    <Text style={styles.scanRequired}>Wymagane skanowanie — ręczne dodawanie kodów jest wyłączone w Twoich ustawieniach.</Text>
                ) : null}

                {deliveryProcess ? (
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
                                <SectionLabel>Powód odmowy</SectionLabel>
                                <View style={styles.reasons}>
                                    {REJECT_REASONS.map((reason) => (
                                        <Chip key={reason} label={reason} selected={options.rejectReason === reason}
                                              onPress={() => setOptions({...options, rejectReason: reason})}/>
                                    ))}
                                </View>
                                <Field label="Inny powód" hideLabel value={options.rejectReason} placeholder="Wpisz inny powód"
                                       onChangeText={(rejectReason) => setOptions({...options, rejectReason})}/>
                            </>
                        ) : null}
                        {mode === "RETURN" ? (
                            <Field label="Token zwrotu" value={options.returnToken}
                                   onChangeText={(returnToken) => setOptions({...options, returnToken})} placeholder="ReturnToken"/>
                        ) : null}
                    </Card>
                ) : null}

                {mode === "HANDOVER" ? (
                    <Card>
                        <Field
                            label={`Odbiorca${options.signature ? " *" : " (opcjonalnie)"}`}
                            icon="user"
                            value={options.recipientName}
                            onChangeText={(recipientName) => setOptions({...options, recipientName})}
                            placeholder="Imię i nazwisko osoby odbierającej"
                            autoCapitalize="words"
                        />
                        <SignaturePad
                            key={signatureKey}
                            required={signatureRequired}
                            onChange={(signature) => setOptions({...options, signature})}
                        />
                    </Card>
                ) : null}

                {result && (result.details.length || result.summary) ? (
                    <Card>
                        <SectionLabel>{`Odpowiedź managera — ${modeLabel(result.mode)}`}</SectionLabel>
                        {result.summary ? <Text style={styles.itemMeta}>{result.summary}</Text> : null}
                        {result.details.map((detail, index) => (
                            <View key={`${detail.code}-${index}`} style={styles.resultRow}>
                                <Icon name={detail.success ? "check" : "close"} size={18}
                                      color={detail.success ? colors.successText : colors.dangerText} strokeWidth={3}/>
                                <View style={styles.flex}>
                                    <Text style={styles.itemCode}>{detail.code || "—"}</Text>
                                    {detail.message ? <Text style={styles.itemMeta}>{detail.message}</Text> : null}
                                </View>
                            </View>
                        ))}
                    </Card>
                ) : null}

                {queuedForMode ? (
                    <Banner tone="warning" icon="wifiOff" title={`${queuedForMode} szt. czeka w kolejce offline`}
                            description="Wyślą się same po odzyskaniu połączenia."
                            action={{label: "Pokaż", onPress: () => router.push("/history")}}/>
                ) : null}

                <View style={styles.listHeader}>
                    <Text style={styles.sectionTitle}>
                        {modeIsSingleScan(mode) ? "Zeskanowana paleta" : "Do wysłania "}
                        {modeIsSingleScan(mode) ? null : <Text style={styles.count}>{items.length}</Text>}
                    </Text>
                    {items.length ? <Button label="Wyczyść" variant="ghost" onPress={() => clearScans(mode)}/> : null}
                </View>
                {!items.length ? (
                    <View style={styles.emptyBox}>
                        <Icon name={meta.icon} size={28} color={colors.textFaint}/>
                        <Text style={styles.empty}>Brak zeskanowanych kodów</Text>
                    </View>
                ) : (
                    <View style={styles.list}>
                        {items.map((item, index) => (
                            <View key={item.code} style={[styles.item, index === 0 && styles.itemLatest, index > 0 && styles.itemDivider]}>
                                <View style={[styles.itemDot, index === 0 && {backgroundColor: colors.success}]}/>
                                <View style={styles.flex}>
                                    <Text style={styles.itemCode} selectable>{item.code}</Text>
                                    <Text style={styles.itemMeta}>{formatTime(item.scannedAt)}</Text>
                                </View>
                                <IconButton icon="trash" label={`Usuń ${item.code}`} tone="danger" size={40}
                                            onPress={() => removeScan(mode, item.code)}/>
                            </View>
                        ))}
                    </View>
                )}
            </ScrollView>

            <View style={[styles.bottomBar, {paddingBottom: Math.max(insets.bottom, spacing.md)}]}>
                <Button
                    label={`${mode === "HANDOVER" ? "Wydaj i wyślij" : "Rejestruj"}${items.length ? ` (${items.length})` : ""}`}
                    icon="upload"
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
    content: {padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.xl},
    flex: {flex: 1},
    modesScroll: {marginHorizontal: -spacing.lg, flexGrow: 0},
    modes: {gap: spacing.sm, paddingHorizontal: spacing.lg},
    hint: {color: colors.textMuted, fontSize: 13},
    feedback: {flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1},
    feedbackBadge: {width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center"},
    feedbackText: {flex: 1, gap: 2},
    feedbackTitle: {color: colors.text, fontSize: 17, fontWeight: "800"},
    feedbackDescription: {fontSize: 14, fontWeight: "600", ...typography.code},
    scanRequired: {color: colors.warning, fontSize: 13, fontWeight: "600"},
    scanRow: {flexDirection: "row", alignItems: "center", gap: spacing.sm},
    scanInput: {flex: 1},
    addButton: {minWidth: 76, minHeight: 50},
    reasons: {flexDirection: "row", flexWrap: "wrap", gap: spacing.sm},
    sectionTitle: {color: colors.text, fontSize: 17, fontWeight: "800"},
    count: {color: colors.primary},
    listHeader: {flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xs},
    emptyBox: {
        alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl, borderRadius: radius.lg,
        borderWidth: 1, borderStyle: "dashed", borderColor: colors.border,
    },
    empty: {color: colors.textMuted, fontSize: 14},
    list: {borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden"},
    item: {flexDirection: "row", alignItems: "center", gap: spacing.md, paddingLeft: spacing.lg, paddingRight: spacing.xs, paddingVertical: spacing.sm},
    itemLatest: {backgroundColor: colors.surfaceHighlight},
    itemDivider: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border},
    itemDot: {width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textFaint},
    itemCode: {color: colors.text, fontSize: 16, fontWeight: "600", ...typography.code},
    itemMeta: {color: colors.textMuted, fontSize: 13},
    resultRow: {flexDirection: "row", gap: spacing.sm, alignItems: "flex-start"},
    bottomBar: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
});
