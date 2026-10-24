import {router} from "expo-router";
import React, {useMemo, useState} from "react";
import {Pressable, ScrollView, StyleSheet, Text, View} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {useTerminal} from "../state/TerminalContext";
import {dayStats, outboxItemCount} from "../terminal/outbox";
import type {ScanMode} from "../terminal/types";
import {Badge, Banner, BottomNav, Button, Card, Pill, SectionLabel, Tile} from "../ui/components";
import {Icon} from "../ui/Icon";
import {colors, MODES, modeMeta, radius, spacing} from "../ui/theme";

const greeting = (hour: number) => (hour < 5 ? "Dobry wieczór" : hour < 18 ? "Dzień dobry" : "Dobry wieczór");

const initials = (first?: string | null, last?: string | null, username?: string) => {
    const letters = `${first?.[0] || ""}${last?.[0] || ""}`.trim();
    return (letters || username?.slice(0, 2) || "?").toUpperCase();
};

const formatTime = (iso: string | null) => (iso
    ? new Date(iso).toLocaleTimeString("pl-PL", {hour: "2-digit", minute: "2-digit"})
    : null);

const formatToday = () => new Date().toLocaleDateString("pl-PL", {weekday: "short", day: "numeric", month: "short"});

export default function HomeScreen() {
    const insets = useSafeAreaInsets();
    const {
        user, device, updateRequired, pending, history, outbox, connection, retrying, lastMode, operatorSessionExpiresAt,
        logout, retryOutbox,
    } = useTerminal();
    const [signingOut, setSigningOut] = useState(false);
    const pendingCount = Object.values(pending).reduce((total, items) => total + items.length, 0);
    const queuedCount = outboxItemCount(outbox);
    const blockedCount = outbox.filter((entry) => entry.blocked).length;
    const stats = useMemo(() => dayStats(history), [history]);
    const firstName = user?.firstName || user?.username;
    const department = device?.departmentCode || user?.departmentCode;
    const sessionEnds = formatTime(operatorSessionExpiresAt);
    const last = modeMeta(lastMode);

    const openMode = (mode: ScanMode) => router.push({pathname: "/scanner", params: {mode}});

    const signOut = async () => {
        setSigningOut(true);
        try {
            await logout();
            router.replace("/login");
        } finally {
            setSigningOut(false);
        }
    };

    return (
        <View style={styles.root}>
            <ScrollView contentContainerStyle={[styles.content, {paddingTop: insets.top + spacing.xl}]}>
                <View style={styles.header}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{initials(user?.firstName, user?.lastName, user?.username)}</Text>
                    </View>
                    <View style={styles.headerText}>
                        <Text style={styles.greeting}>{greeting(new Date().getHours())}</Text>
                        <Text style={styles.name} numberOfLines={1}>{firstName}</Text>
                    </View>
                    <Pressable accessibilityRole="button" accessibilityLabel="Urządzenie" onPress={() => router.push("/device")}
                               style={({pressed}) => [styles.headerButton, pressed && styles.pressed]}>
                        <Icon name="device" size={20}/>
                        {updateRequired ? <View style={styles.headerDot}/> : null}
                    </Pressable>
                </View>

                <View style={styles.pills}>
                    {connection === "offline"
                        ? <Pill tone="warning" dot label="Brak połączenia"/>
                        : <Pill tone={connection === "online" ? "success" : "neutral"} dot label={connection === "online" ? "Połączono" : "Łączenie…"}/>}
                    {department ? <Pill label={`Oddział ${department}`}/> : null}
                    {sessionEnds ? <Pill label={`Sesja do ${sessionEnds}`}/> : null}
                </View>

                {updateRequired ? (
                    <Banner tone="warning" title="Dostępna nowa wersja aplikacji" description="Zaktualizuj aplikację, aby uniknąć błędów wysyłki."/>
                ) : null}

                {outbox.length ? (
                    <Banner
                        tone={blockedCount ? "danger" : "warning"}
                        icon={blockedCount ? "alert" : "wifiOff"}
                        title={blockedCount
                            ? `${blockedCount} ${blockedCount === 1 ? "wysyłka wymaga" : "wysyłki wymagają"} uwagi`
                            : `${queuedCount} szt. czeka na wysłanie`}
                        description={blockedCount ? "Manager odrzucił wysyłkę — sprawdź w historii." : "Wyślemy automatycznie, gdy wróci połączenie."}
                        action={blockedCount
                            ? {label: "Pokaż", onPress: () => router.push("/history")}
                            : retrying ? null : {label: "Ponów", onPress: () => retryOutbox()}}
                    />
                ) : null}

                <Card style={styles.dayCard}>
                    <SectionLabel right={<Text style={styles.muted}>{formatToday()}</Text>}>Twój dzień</SectionLabel>
                    <View style={styles.stats}>
                        <View style={styles.stat}>
                            <Text style={styles.statValue}>{stats.sent}</Text>
                            <Text style={styles.statLabel}>wysłane</Text>
                        </View>
                        <View style={styles.stat}>
                            <Text style={[styles.statValue, {color: colors.successText}]}>{stats.delivered}</Text>
                            <Text style={styles.statLabel}>doręczone</Text>
                        </View>
                        <View style={styles.stat}>
                            <Text style={[styles.statValue, {color: colors.primary}]}>{pendingCount + queuedCount}</Text>
                            <Text style={styles.statLabel}>do wysłania</Text>
                        </View>
                    </View>
                    {stats.failed ? (
                        <Text style={styles.failedNote}>{stats.failed} szt. odrzuconych przez managera</Text>
                    ) : null}
                </Card>

                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Skanuj, tryb ${last.label}`}
                    onPress={() => openMode(lastMode)}
                    style={({pressed}) => [styles.cta, pressed && styles.pressed]}
                >
                    <View style={styles.ctaIcon}>
                        <Icon name="scan" size={28} color={colors.primaryText}/>
                    </View>
                    <View style={styles.ctaText}>
                        <Text style={styles.ctaTitle}>Skanuj</Text>
                        <Text style={styles.ctaSubtitle}>Tryb: {last.label}</Text>
                    </View>
                    <Icon name="chevronRight" size={24} color={colors.primaryText} strokeWidth={2.6}/>
                </Pressable>

                <SectionLabel>Tryby</SectionLabel>
                <View style={styles.modes}>
                    {MODES.map((entry) => {
                        const count = pending[entry.mode].length;
                        return (
                            <Pressable
                                key={entry.mode}
                                accessibilityRole="button"
                                accessibilityLabel={count ? `${entry.label}, ${count} do wysłania` : entry.label}
                                onPress={() => openMode(entry.mode)}
                                style={({pressed}) => [styles.mode, pressed && styles.pressed]}
                            >
                                <Icon name={entry.icon} size={24} color={entry.color}/>
                                <Text style={styles.modeLabel}>{entry.label}</Text>
                                {count ? <Badge value={String(count)} style={styles.modeBadge}/> : null}
                            </Pressable>
                        );
                    })}
                </View>

                <View style={styles.links}>
                    <Tile icon="list" iconColor={colors.primary} title="Moje dostawy" subtitle="Przypisane do Ciebie, próby i komentarze"
                          onPress={() => router.push("/deliveries")}/>
                    <Tile icon="history" iconColor={colors.primary} title="Moje procesy" subtitle="Co zarejestrowano, wynik i nowe numery paczek"
                          onPress={() => router.push("/processes")}/>
                    <Tile icon="search" iconColor={colors.infoText} title="Sprawdź przesyłkę" subtitle="Status, odbiorca i historia zdarzeń"
                          onPress={() => router.push("/shipment-lookup")}/>
                    <Tile icon="truck" iconColor={colors.primary} title="Moje auto" subtitle="Pojazd, przewoźnik i uprawnienia kierowcy"
                          onPress={() => router.push("/vehicle")}/>
                    <Tile icon="mapPin" iconColor={colors.primary} title="Punkty odbioru" subtitle="Adresy, godziny otwarcia i nawigacja"
                          onPress={() => router.push("/pickup-points")}/>
                    <Tile icon="message" iconColor={colors.primary} title="Czat" subtitle="Wiadomości do dyspozytora i zespołu"
                          onPress={() => router.push("/chat")}/>
                    <Tile icon="settings" title="Ustawienia" subtitle="Twoja konfiguracja przesyłek i doręczeń"
                          onPress={() => router.push("/settings")}/>
                </View>

                <Button label="Wyloguj" icon="logout" variant="ghost" onPress={signOut} loading={signingOut}/>
            </ScrollView>
            <BottomNav badges={{"/history": outbox.length}}/>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.background},
    content: {paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.lg},
    pressed: {opacity: 0.85, transform: [{scale: 0.985}]},
    header: {flexDirection: "row", alignItems: "center", gap: spacing.md},
    avatar: {width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center"},
    avatarText: {color: colors.primaryText, fontSize: 17, fontWeight: "800"},
    headerText: {flex: 1, gap: 2},
    greeting: {color: colors.textMuted, fontSize: 14},
    name: {color: colors.text, fontSize: 22, fontWeight: "800"},
    headerButton: {
        width: 46, height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
        backgroundColor: colors.surface, alignItems: "center", justifyContent: "center",
    },
    headerDot: {position: "absolute", top: 9, right: 9, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.warning},
    pills: {flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: -spacing.xs},
    dayCard: {borderRadius: radius.xl},
    muted: {color: colors.textMuted, fontSize: 13},
    stats: {flexDirection: "row", gap: spacing.md},
    stat: {flex: 1, gap: 2},
    statValue: {color: colors.text, fontSize: 30, fontWeight: "800", fontVariant: ["tabular-nums"]},
    statLabel: {color: colors.textMuted, fontSize: 13},
    failedNote: {color: colors.dangerText, fontSize: 13, fontWeight: "600"},
    cta: {
        flexDirection: "row", alignItems: "center", gap: spacing.lg, padding: spacing.lg + 2,
        borderRadius: radius.xl, backgroundColor: colors.primary,
    },
    ctaIcon: {width: 56, height: 56, borderRadius: radius.lg, backgroundColor: "rgba(26,18,5,0.12)", alignItems: "center", justifyContent: "center"},
    ctaText: {flex: 1, gap: 2},
    ctaTitle: {color: colors.primaryText, fontSize: 21, fontWeight: "800"},
    ctaSubtitle: {color: colors.primaryText, fontSize: 14, fontWeight: "600", opacity: 0.8},
    modes: {flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: -spacing.sm},
    mode: {
        flexGrow: 1, flexBasis: "30%", minHeight: 84, alignItems: "center", justifyContent: "center", gap: spacing.sm,
        borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    },
    modeLabel: {color: colors.text, fontSize: 14, fontWeight: "700"},
    modeBadge: {position: "absolute", top: spacing.sm, right: spacing.sm},
    links: {gap: spacing.sm},
});
