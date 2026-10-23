import {router} from "expo-router";
import React, {useMemo, useState} from "react";
import {Alert, Platform, ScrollView, StyleSheet, Text, View} from "react-native";
import {useTerminal} from "../state/TerminalContext";
import {historyStatus, HistoryStatus, OutboxEntry} from "../terminal/outbox";
import {modeIsDeliveryProcess} from "../terminal/soap";
import type {HistoryEntry} from "../terminal/types";
import {Banner, BottomNav, Button, Card, Chip, Pill, PillTone, SectionLabel} from "../ui/components";
import {Icon, IconName} from "../ui/Icon";
import {colors, modeLabel, radius, spacing, typography} from "../ui/theme";

type Filter = "all" | "errors" | "queued";

const STATUS_META: Record<HistoryStatus, {label: string; tone: PillTone; icon: IconName}> = {
    ok: {label: "OK", tone: "success", icon: "check"},
    partial: {label: "Częściowo", tone: "warning", icon: "alert"},
    error: {label: "Błąd", tone: "danger", icon: "close"},
};

const iconTone: Record<PillTone, {background: string; color: string}> = {
    success: {background: colors.successSurface, color: colors.successText},
    warning: {background: colors.warningSurface, color: colors.warning},
    danger: {background: colors.dangerSurface, color: colors.dangerText},
    info: {background: colors.infoSurface, color: colors.infoText},
    neutral: {background: colors.surfaceRaised, color: colors.textSecondary},
};

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("pl-PL", {hour: "2-digit", minute: "2-digit"});

const dayLabel = (iso: string) => {
    const date = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) {
        return "Dziś";
    }
    if (date.toDateString() === yesterday.toDateString()) {
        return "Wczoraj";
    }
    return date.toLocaleDateString("pl-PL", {weekday: "long", day: "numeric", month: "long"});
};

const confirm = (title: string, message: string, actionLabel: string, onConfirm: () => void) => {
    if (Platform.OS === "web") {
        if (window.confirm(`${title}\n\n${message}`)) {
            onConfirm();
        }
        return;
    }
    Alert.alert(title, message, [
        {text: "Anuluj", style: "cancel"},
        {text: actionLabel, style: "destructive", onPress: onConfirm},
    ]);
};

function RowIcon({tone, icon}: {tone: PillTone; icon: IconName}) {
    const palette = iconTone[tone];
    return (
        <View style={[styles.rowIcon, {backgroundColor: palette.background}]}>
            <Icon name={icon} size={18} color={palette.color} strokeWidth={2.6}/>
        </View>
    );
}

function OutboxCard({entry}: {entry: OutboxEntry}) {
    const {retryOutbox, restoreOutboxEntry, discardOutboxEntry, retrying} = useTerminal();
    return (
        <Card style={styles.entryCard}>
            <View style={styles.entryHeader}>
                <RowIcon tone={entry.blocked ? "danger" : "warning"} icon={entry.blocked ? "alert" : "clock"}/>
                <View style={styles.flex}>
                    <Text style={styles.entryTitle}>{modeLabel(entry.mode)} · {entry.items.length} szt.</Text>
                    <Text style={styles.meta}>
                        {formatTime(entry.queuedAt)} · {entry.attempts} {entry.attempts === 1 ? "próba" : "prób"}
                    </Text>
                </View>
                <Pill tone={entry.blocked ? "danger" : "warning"} label={entry.blocked ? "Wymaga uwagi" : "Oczekuje"}/>
            </View>
            {entry.lastError ? <Text style={entry.blocked ? styles.failure : styles.meta}>{entry.lastError}</Text> : null}
            <View style={styles.entryActions}>
                <Button label="Ponów" icon="refresh" variant="secondary" loading={retrying} style={styles.flex}
                        onPress={() => retryOutbox(entry.id)}/>
                <Button label="Na listę" icon="list" variant="secondary" style={styles.flex}
                        onPress={() => {
                            restoreOutboxEntry(entry.id);
                            router.push({pathname: "/scanner", params: {mode: entry.mode}});
                        }}/>
                <Button label="Usuń" variant="ghost"
                        onPress={() => confirm("Usunąć wysyłkę z kolejki?", `${entry.items.length} szt. nie trafi do managera.`, "Usuń",
                            () => discardOutboxEntry(entry.id))}/>
            </View>
        </Card>
    );
}

function HistoryCard({entry}: {entry: HistoryEntry}) {
    const status = historyStatus(entry);
    const meta = STATUS_META[status];
    const failed = entry.details.filter((detail) => !detail.success);
    return (
        <Card style={styles.entryCard}>
            <View style={styles.entryHeader}>
                <RowIcon tone={meta.tone} icon={meta.icon}/>
                <View style={styles.flex}>
                    <Text style={styles.entryTitle}>{modeLabel(entry.mode)} · {entry.itemCount} szt.</Text>
                    <Text style={styles.meta}>{formatTime(entry.sentAt)}{entry.processId ? ` · proces ${entry.processId}` : ""}</Text>
                </View>
                <Pill tone={meta.tone} label={meta.label}/>
            </View>
            {entry.summary ? <Text style={styles.meta}>{entry.summary}</Text> : null}
            {failed.map((detail, index) => (
                <View key={`${detail.code}-${index}`} style={styles.failedRow}>
                    <View style={styles.flex}>
                        <Text style={styles.failedCode} selectable>{detail.code || "—"}</Text>
                        <Text style={styles.meta}>{detail.message || "błąd"}</Text>
                    </View>
                    {entry.mode !== "PALLET" && !modeIsDeliveryProcess(entry.mode) && detail.code ? (
                        <Button label="Sprawdź" variant="secondary" style={styles.smallButton}
                                onPress={() => router.push({pathname: "/shipment-lookup", params: {code: detail.code}})}/>
                    ) : null}
                </View>
            ))}
        </Card>
    );
}

export default function HistoryScreen() {
    const {history, outbox, clearHistory, retryOutbox, retrying, connection} = useTerminal();
    const [filter, setFilter] = useState<Filter>(outbox.some((entry) => entry.blocked) ? "queued" : "all");
    const errorCount = history.filter((entry) => historyStatus(entry) !== "ok").length;
    const retryable = outbox.filter((entry) => !entry.blocked);

    const groups = useMemo(() => {
        const visible = filter === "errors" ? history.filter((entry) => historyStatus(entry) !== "ok") : history;
        const result: {label: string; entries: HistoryEntry[]}[] = [];
        for (const entry of visible) {
            const label = dayLabel(entry.sentAt);
            const group = result[result.length - 1];
            if (group && group.label === label) {
                group.entries.push(entry);
            } else {
                result.push({label, entries: [entry]});
            }
        }
        return result;
    }, [history, filter]);

    const showOutbox = filter !== "errors" && outbox.length > 0;
    const showHistory = filter !== "queued";
    const nothing = (!showOutbox || !outbox.length) && (!showHistory || !groups.length);

    return (
        <View style={styles.root}>
            <ScrollView contentContainerStyle={styles.content}>
                {retryable.length ? (
                    <Banner
                        tone="warning"
                        icon="wifiOff"
                        title={`${retryable.length} ${retryable.length === 1 ? "wysyłka czeka" : "wysyłki czekają"} na sieć`}
                        description={connection === "offline" ? "Wyślą się same po odzyskaniu połączenia." : "Wysyłamy automatycznie co 30 s."}
                        action={retrying ? null : {label: "Ponów", onPress: () => retryOutbox()}}
                    />
                ) : null}

                <View style={styles.filters} accessibilityRole="tablist">
                    <Chip label="Wszystkie" selected={filter === "all"} onPress={() => setFilter("all")}/>
                    <Chip label={errorCount ? `Błędy · ${errorCount}` : "Błędy"} selected={filter === "errors"} onPress={() => setFilter("errors")}/>
                    <Chip label={outbox.length ? `Kolejka · ${outbox.length}` : "Kolejka"} selected={filter === "queued"} onPress={() => setFilter("queued")}/>
                </View>

                {showOutbox ? (
                    <>
                        <SectionLabel>Kolejka offline</SectionLabel>
                        {outbox.map((entry) => <OutboxCard key={entry.id} entry={entry}/>)}
                    </>
                ) : null}

                {showHistory ? groups.map((group) => (
                    <View key={group.label} style={styles.group}>
                        <SectionLabel>{group.label}</SectionLabel>
                        {group.entries.map((entry) => <HistoryCard key={entry.id} entry={entry}/>)}
                    </View>
                )) : null}

                {nothing ? (
                    <View style={styles.emptyBox}>
                        <Icon name="history" size={36} color={colors.textFaint}/>
                        <Text style={styles.emptyTitle}>
                            {filter === "queued" ? "Kolejka jest pusta" : filter === "errors" ? "Brak błędów" : "Nic jeszcze nie wysłano"}
                        </Text>
                    </View>
                ) : null}

                {history.length && showHistory ? (
                    <Button label="Wyczyść historię" icon="trash" variant="ghost"
                            onPress={() => confirm("Wyczyścić historię?", "Wyniki wysyłek znikną z tego telefonu.", "Wyczyść", clearHistory)}/>
                ) : null}
            </ScrollView>
            <BottomNav badges={{"/history": outbox.length}}/>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.background},
    content: {padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.xl},
    flex: {flex: 1},
    filters: {flexDirection: "row", flexWrap: "wrap", gap: spacing.sm},
    group: {gap: spacing.sm},
    entryCard: {padding: spacing.md, gap: spacing.sm},
    entryHeader: {flexDirection: "row", alignItems: "center", gap: spacing.md},
    rowIcon: {width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center"},
    entryTitle: {color: colors.text, fontSize: 15, fontWeight: "700"},
    meta: {color: colors.textMuted, fontSize: 13},
    failure: {color: colors.dangerText, fontSize: 13},
    entryActions: {flexDirection: "row", gap: spacing.sm},
    failedRow: {
        flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md,
        borderRadius: radius.md, backgroundColor: colors.background,
    },
    failedCode: {color: colors.dangerText, fontSize: 14, fontWeight: "600", ...typography.code},
    smallButton: {minHeight: 38, paddingHorizontal: spacing.md},
    emptyBox: {alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xxl},
    emptyTitle: {color: colors.textMuted, fontSize: 15, fontWeight: "600"},
});
