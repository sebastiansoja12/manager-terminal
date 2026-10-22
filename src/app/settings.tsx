import {router, Stack} from "expo-router";
import React, {useCallback, useEffect, useMemo, useState} from "react";
import {ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {ApiError} from "../api/client";
import {useTerminal} from "../state/TerminalContext";
import {
    CATEGORY_LABELS,
    ConfigurationDraft,
    ConfigurationParameter,
    ConfigurationRevision,
    fieldLabel,
    FieldErrors,
    GROUPS,
    isDraftDirty,
    isProofOfDeliveryForced,
    LABEL_FORMATS,
    PARAMETER_LABELS,
    SETTING_LABELS,
    SettingDefinition,
    SettingGroup,
    SORT_ORDERS,
    SubstituteCandidate,
    SupplierConfiguration,
    SupplierSetting,
    toDraft,
    toFieldErrors,
    toggleSetting,
    toUpdate,
    validateDraft,
    VIOLATION_MESSAGES,
} from "../terminal/supplierConfiguration";
import {Banner, BannerTone, Button, Card, Field} from "../ui/components";
import {colors, radius, spacing} from "../ui/theme";

type Tab = SettingGroup | "SUBSTITUTE" | "HISTORY";

type Feedback = {tone: BannerTone; title: string; description?: string | null};

const TABS: {tab: Tab; label: string}[] = [
    ...GROUPS.map(({group, label}) => ({tab: group as Tab, label})),
    {tab: "SUBSTITUTE", label: "Zastępstwo"},
    {tab: "HISTORY", label: "Historia"},
];

const candidateName = (candidate: SubstituteCandidate) => (
    `${candidate.firstName || ""} ${candidate.lastName || ""}`.trim() || candidate.supplierCode
);

const formatDateTime = (iso: string) => new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});

const historyValue = (value: string | null) => {
    if (value === null) {
        return "brak";
    }
    if (value === "true") {
        return "wł.";
    }
    if (value === "false") {
        return "wył.";
    }
    return value;
};

const confirmReset = (onConfirm: () => void) => {
    const message = "Ustawienia zostaną zastąpione wartościami domyślnymi dozwolonymi przez firmę. Zmiana trafi do historii.";
    if (Platform.OS === "web") {
        if (window.confirm(`Przywrócić ustawienia domyślne?\n\n${message}`)) {
            onConfirm();
        }
        return;
    }
    Alert.alert("Przywrócić ustawienia domyślne?", message, [
        {text: "Anuluj", style: "cancel"},
        {text: "Przywróć", style: "destructive", onPress: onConfirm},
    ]);
};

export default function SettingsScreen() {
    const insets = useSafeAreaInsets();
    const {client, storeSupplierConfiguration} = useTerminal();
    const [configuration, setConfiguration] = useState<SupplierConfiguration | null>(null);
    const [draft, setDraft] = useState<ConfigurationDraft | null>(null);
    const [candidates, setCandidates] = useState<SubstituteCandidate[]>([]);
    const [history, setHistory] = useState<ConfigurationRevision[] | null>(null);
    const [tab, setTab] = useState<Tab>("SHIPMENTS");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const [conflict, setConflict] = useState(false);
    const [notSupplier, setNotSupplier] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

    const apply = useCallback((loaded: SupplierConfiguration) => {
        setConfiguration(loaded);
        setDraft(toDraft(loaded));
        setFieldErrors({});
        storeSupplierConfiguration(loaded);
    }, [storeSupplierConfiguration]);

    const fetchConfiguration = useCallback(() => {
        if (!client) {
            return;
        }
        Promise.all([client.myConfiguration(), client.substituteCandidates()])
            .then(([loaded, loadedCandidates]) => {
                apply(loaded);
                setCandidates(loadedCandidates);
            })
            .catch((error: Error) => {
                if (error instanceof ApiError && error.status === 404) {
                    setNotSupplier(true);
                } else {
                    setFeedback({tone: "danger", title: "Nie udało się pobrać ustawień", description: error.message});
                }
            })
            .finally(() => setLoading(false));
    }, [apply, client]);

    useEffect(() => {
        fetchConfiguration();
    }, [fetchConfiguration]);

    const load = () => {
        setLoading(true);
        setFeedback(null);
        setConflict(false);
        setHistory(null);
        fetchConfiguration();
    };

    useEffect(() => {
        if (tab === "HISTORY" && history === null && client) {
            client.myConfigurationHistory()
                .then(setHistory)
                .catch((error: Error) => {
                    setHistory([]);
                    setFeedback({tone: "danger", title: "Nie udało się pobrać historii", description: error.message});
                });
        }
    }, [client, history, tab]);

    const dirty = useMemo(() => Boolean(configuration && draft && isDraftDirty(configuration, draft)), [configuration, draft]);

    const change = (next: ConfigurationDraft, field?: SupplierSetting | ConfigurationParameter) => {
        setDraft(next);
        setFeedback(null);
        if (field) {
            setFieldErrors((current) => ({...current, [field]: undefined}));
        }
    };

    const handleError = (error: unknown) => {
        if (error instanceof ApiError && error.status === 409) {
            setConflict(true);
            return;
        }
        const errors = error instanceof ApiError ? toFieldErrors(error.details) : {};
        if (Object.keys(errors).length) {
            setFieldErrors(errors);
            setFeedback({tone: "warning", title: "Popraw zaznaczone pola"});
            return;
        }
        setFeedback({tone: "danger", title: "Nie udało się zapisać ustawień", description: (error as Error).message});
    };

    const save = async () => {
        if (!client || !configuration || !draft) {
            return;
        }
        const errors = validateDraft(draft);
        if (Object.keys(errors).length) {
            setFieldErrors(errors);
            setFeedback({tone: "warning", title: "Popraw zaznaczone pola"});
            return;
        }
        setSaving(true);
        try {
            apply(await client.updateMyConfiguration(toUpdate(draft, configuration.version)));
            setHistory(null);
            setFeedback({tone: "success", title: "Zapisano ustawienia"});
        } catch (error) {
            handleError(error);
        } finally {
            setSaving(false);
        }
    };

    const reset = () => confirmReset(async () => {
        if (!client || !configuration) {
            return;
        }
        setSaving(true);
        try {
            apply(await client.resetMyConfiguration(configuration.version));
            setHistory(null);
            setFeedback({tone: "success", title: "Przywrócono ustawienia domyślne"});
        } catch (error) {
            handleError(error);
        } finally {
            setSaving(false);
        }
    });

    const cancel = () => {
        if (configuration) {
            setDraft(toDraft(configuration));
        }
        setFieldErrors({});
        setFeedback(null);
        if (router.canGoBack()) {
            router.back();
        }
    };

    const renderSetting = (definition: SettingDefinition) => {
        if (!configuration || !draft) {
            return null;
        }
        const {setting} = definition;
        const locked = configuration.enforcedSettings[setting] !== undefined;
        const forced = setting === "REQUIRE_PROOF_OF_DELIVERY" && isProofOfDeliveryForced(draft.settings);
        const text = SETTING_LABELS[setting];
        const error = fieldErrors[setting];
        return (
            <View key={setting} style={[styles.setting, locked && styles.settingLocked]}>
                <View style={styles.settingRow}>
                    <View style={styles.settingText}>
                        <Text style={styles.settingLabel}>{text.label}</Text>
                        <Text style={styles.category}>{CATEGORY_LABELS[definition.category]}</Text>
                    </View>
                    <Switch
                        accessibilityLabel={text.label}
                        value={draft.settings[setting]}
                        disabled={locked || forced || saving}
                        onValueChange={(enabled) => change(toggleSetting(configuration, draft, setting, enabled), setting)}
                        trackColor={{false: colors.border, true: colors.primary}}
                        thumbColor={colors.text}
                    />
                </View>
                {text.description ? <Text style={styles.description}>{text.description}</Text> : null}
                {locked ? <Text style={styles.lock}>🔒 Wymuszone przez politykę firmy — nie możesz tego zmienić</Text> : null}
                {!locked && forced ? <Text style={styles.lock}>Wymagane, bo włączono podpis lub zdjęcie doręczenia</Text> : null}
                {error ? <Text style={styles.error}>{VIOLATION_MESSAGES[error]}</Text> : null}
            </View>
        );
    };

    const renderChoice = <Value extends string | number | null>(
        options: {value: Value; label: string}[],
        selected: Value,
        onSelect: (value: Value) => void,
    ) => (
        <View style={styles.choices}>
            {options.map((option) => {
                const active = option.value === selected;
                return (
                    <Pressable
                        key={String(option.value)}
                        accessibilityRole="radio"
                        accessibilityState={{checked: active}}
                        disabled={saving}
                        onPress={() => onSelect(option.value)}
                        style={[styles.choice, active && styles.choiceActive]}
                    >
                        <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{option.label}</Text>
                    </Pressable>
                );
            })}
        </View>
    );

    const parameterError = (parameter: ConfigurationParameter) => {
        const error = fieldErrors[parameter];
        return error ? <Text style={styles.error}>{VIOLATION_MESSAGES[error]}</Text> : null;
    };

    const renderParameters = (group: SettingGroup) => {
        if (!draft) {
            return null;
        }
        if (group === "DELIVERIES") {
            return (
                <Card>
                    <Field
                        label={PARAMETER_LABELS.MAX_DELIVERY_ATTEMPTS}
                        value={draft.maxDeliveryAttempts}
                        keyboardType="number-pad"
                        editable={!saving}
                        onChangeText={(maxDeliveryAttempts) => change({...draft, maxDeliveryAttempts}, "MAX_DELIVERY_ATTEMPTS")}
                    />
                    {parameterError("MAX_DELIVERY_ATTEMPTS")}
                </Card>
            );
        }
        if (group === "ROUTES") {
            return (
                <Card>
                    <Field
                        label={PARAMETER_LABELS.MAX_SHIPMENTS_PER_ROUTE}
                        value={draft.maxShipmentsPerRoute}
                        keyboardType="number-pad"
                        placeholder="Brak limitu"
                        editable={!saving}
                        onChangeText={(maxShipmentsPerRoute) => change({...draft, maxShipmentsPerRoute}, "MAX_SHIPMENTS_PER_ROUTE")}
                    />
                    {parameterError("MAX_SHIPMENTS_PER_ROUTE")}
                </Card>
            );
        }
        if (group === "PREFERENCES") {
            return (
                <Card>
                    <Text style={styles.parameterLabel}>{PARAMETER_LABELS.PREFERRED_LABEL_FORMAT}</Text>
                    {renderChoice(LABEL_FORMATS, draft.preferredLabelFormat,
                        (preferredLabelFormat) => change({...draft, preferredLabelFormat}, "PREFERRED_LABEL_FORMAT"))}
                    <Text style={styles.parameterLabel}>{PARAMETER_LABELS.DEFAULT_SHIPMENT_SORT_ORDER}</Text>
                    {renderChoice(SORT_ORDERS, draft.defaultShipmentSortOrder,
                        (defaultShipmentSortOrder) => change({...draft, defaultShipmentSortOrder}, "DEFAULT_SHIPMENT_SORT_ORDER"))}
                </Card>
            );
        }
        return null;
    };

    const renderSubstitute = () => {
        if (!draft) {
            return null;
        }
        const selectedCode = draft.substituteSupplierCode.trim();
        const updateSubstitute = (substituteSupplierCode: string) => (
            change({...draft, substituteSupplierCode}, "SUBSTITUTE_SUPPLIER_ID")
        );
        return (
            <>
                <Card>
                    <Field
                        label={PARAMETER_LABELS.SUBSTITUTE_SUPPLIER_ID}
                        value={draft.substituteSupplierCode}
                        placeholder="np. KUR-02"
                        editable={!saving}
                        onChangeText={updateSubstitute}
                    />
                    <Text style={styles.description}>
                        Wpisz kod kuriera (ten sam, którym loguje się do systemu) albo wybierz go poniżej.
                        Wskazanie zastępcy nie przekazuje automatycznie Twoich przesyłek.
                    </Text>
                    {parameterError("SUBSTITUTE_SUPPLIER_ID")}
                    {selectedCode ? (
                        <Button label="Usuń zastępstwo" variant="ghost" onPress={() => updateSubstitute("")} disabled={saving}/>
                    ) : null}
                </Card>
                <Card>
                    <Text style={styles.parameterLabel}>Aktywni kurierzy</Text>
                    {!candidates.length ? (
                        <Text style={styles.description}>Brak innych aktywnych kurierów. Zastępcą może zostać tylko aktywny kurier.</Text>
                    ) : null}
                    {candidates.map((candidate) => {
                        const active = candidate.supplierCode === selectedCode;
                        return (
                            <Pressable
                                key={candidate.supplierCode}
                                accessibilityRole="radio"
                                accessibilityState={{checked: active}}
                                disabled={saving}
                                onPress={() => updateSubstitute(candidate.supplierCode)}
                                style={[styles.candidate, active && styles.choiceActive]}
                            >
                                <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{candidateName(candidate)}</Text>
                                <Text style={[styles.candidateCode, active && styles.choiceTextActive]}>{candidate.supplierCode}</Text>
                            </Pressable>
                        );
                    })}
                </Card>
            </>
        );
    };

    const renderHistory = () => {
        if (history === null) {
            return <ActivityIndicator color={colors.primary}/>;
        }
        if (!history.length) {
            return <Text style={styles.empty}>Brak zmian ustawień.</Text>;
        }
        return history.map((revision) => (
            <Card key={revision.revisionId}>
                <Text style={styles.settingLabel}>
                    {revision.changeType === "RESET_TO_DEFAULTS" ? "Przywrócenie domyślnych" : "Zmiana ustawień"}
                </Text>
                <Text style={styles.description}>
                    {formatDateTime(revision.changedAt)} · użytkownik {revision.changedBy ?? "nieznany"}
                </Text>
                {revision.changes.map((entry) => (
                    <Text key={entry.field} style={styles.historyChange}>
                        {fieldLabel(entry.field)}: {historyValue(entry.previousValue)} → {historyValue(entry.newValue)}
                    </Text>
                ))}
            </Card>
        ));
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator color={colors.primary} size="large"/>
            </View>
        );
    }

    if (notSupplier) {
        return (
            <View style={[styles.root, styles.content]}>
                <Banner tone="info" title="Brak ustawień kuriera" description="To konto nie jest powiązane z kurierem, więc nie ma własnej konfiguracji."/>
            </View>
        );
    }

    return (
        <View style={styles.root}>
            <Stack.Screen options={{title: "Moje ustawienia"}}/>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsBar} contentContainerStyle={styles.tabs}>
                {TABS.map((entry) => {
                    const active = entry.tab === tab;
                    return (
                        <Pressable
                            key={entry.tab}
                            accessibilityRole="tab"
                            accessibilityState={{selected: active}}
                            onPress={() => setTab(entry.tab)}
                            style={[styles.tab, active && styles.tabActive]}
                        >
                            <Text style={[styles.tabText, active && styles.tabTextActive]}>{entry.label}</Text>
                        </Pressable>
                    );
                })}
            </ScrollView>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                {conflict ? (
                    <Card style={styles.conflict}>
                        <Banner tone="warning" title="Ustawienia zmieniły się w międzyczasie"
                                description="Ktoś (np. administrator) zapisał nowszą wersję. Wczytaj dane ponownie, aby kontynuować."/>
                        <Button label="Wczytaj ponownie" variant="secondary" onPress={load}/>
                    </Card>
                ) : null}
                {feedback ? <Banner tone={feedback.tone} title={feedback.title} description={feedback.description}/> : null}
                {configuration && tab !== "HISTORY" && tab !== "SUBSTITUTE" ? (
                    <>
                        {configuration.definitions.filter((definition) => definition.group === tab).map(renderSetting)}
                        {renderParameters(tab)}
                    </>
                ) : null}
                {tab === "SUBSTITUTE" ? renderSubstitute() : null}
                {tab === "HISTORY" ? renderHistory() : null}
            </ScrollView>
            {configuration ? (
                <View style={[styles.bottomBar, {paddingBottom: Math.max(insets.bottom, spacing.md)}]}>
                    {dirty ? <Text style={styles.dirty}>Masz niezapisane zmiany</Text> : null}
                    <View style={styles.actions}>
                        <Button label="Anuluj" variant="ghost" onPress={cancel} disabled={saving} style={styles.action}/>
                        <Button label="Domyślne" variant="secondary" onPress={reset} disabled={saving || conflict} style={styles.action}/>
                    </View>
                    <Button label="Zapisz zmiany" onPress={save} loading={saving} disabled={!dirty || conflict} large/>
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.background},
    center: {flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background},
    tabsBar: {flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface},
    tabs: {gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm},
    tab: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.border,
    },
    tabActive: {backgroundColor: colors.primary, borderColor: colors.primary},
    tabText: {color: colors.text, fontWeight: "600", fontSize: 14},
    tabTextActive: {color: colors.primaryText},
    content: {padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl},
    setting: {
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        gap: spacing.xs,
    },
    settingLocked: {borderStyle: "dashed"},
    settingRow: {flexDirection: "row", alignItems: "center", gap: spacing.md},
    settingText: {flex: 1, gap: 2},
    settingLabel: {color: colors.text, fontSize: 15, fontWeight: "600"},
    category: {color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4},
    description: {color: colors.textMuted, fontSize: 13},
    lock: {color: colors.warning, fontSize: 13, fontWeight: "600"},
    error: {color: colors.danger, fontSize: 13, fontWeight: "600"},
    parameterLabel: {color: colors.textMuted, fontSize: 13, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5},
    choices: {flexDirection: "row", flexWrap: "wrap", gap: spacing.sm},
    choice: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceRaised,
    },
    choiceActive: {backgroundColor: colors.primary, borderColor: colors.primary},
    choiceText: {color: colors.text, fontWeight: "600"},
    choiceTextActive: {color: colors.primaryText},
    candidate: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceRaised,
    },
    candidateCode: {color: colors.textMuted, fontSize: 13, fontVariant: ["tabular-nums"]},
    empty: {color: colors.textMuted, textAlign: "center", marginTop: spacing.lg},
    historyChange: {color: colors.text, fontSize: 14},
    conflict: {gap: spacing.sm},
    bottomBar: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        gap: spacing.sm,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    dirty: {color: colors.warning, fontSize: 13, fontWeight: "600", textAlign: "center"},
    actions: {flexDirection: "row", gap: spacing.sm},
    action: {flex: 1},
});
