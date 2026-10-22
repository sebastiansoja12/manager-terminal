import {router} from "expo-router";
import React, {useState} from "react";
import {ScrollView, StyleSheet, Text, View} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {useTerminal} from "../state/TerminalContext";
import {Button, Tile} from "../ui/components";
import {colors, spacing} from "../ui/theme";

export default function HomeScreen() {
    const insets = useSafeAreaInsets();
    const {user, device, pairKey, pending, logout} = useTerminal();
    const [signingOut, setSigningOut] = useState(false);
    const pendingCount = Object.values(pending).reduce((total, items) => total + items.length, 0);
    const displayName = `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || user?.username;

    const openScanning = () => {
        router.push(pairKey ? "/scan-menu" : "/device");
    };

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
        <ScrollView
            style={styles.root}
            contentContainerStyle={[styles.content, {paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl}]}
        >
            <View style={styles.header}>
                <Text style={styles.kicker}>Manager Terminal</Text>
                <Text style={styles.title}>Cześć{displayName ? `, ${displayName}` : ""}</Text>
                <Text style={styles.subtitle}>{user?.departmentCode ? `Oddział ${user.departmentCode}` : "Wybierz, co chcesz zrobić"}</Text>
            </View>

            <View style={styles.tiles}>
                <Tile
                    icon="📦"
                    title="Skanowanie"
                    subtitle={pairKey ? "Odbiór, paleta, zwrot, odmowa, nieobecny" : "Najpierw sparuj urządzenie"}
                    badge={pendingCount ? String(pendingCount) : null}
                    onPress={openScanning}
                />
                <Tile
                    icon="🔍"
                    title="Sprawdź przesyłkę"
                    subtitle="Zeskanuj lub wpisz numer śledzenia"
                    onPress={() => router.push("/shipment-lookup")}
                />
                <Tile
                    icon="⚙️"
                    title="Ustawienia"
                    subtitle="Twoja konfiguracja przesyłek, doręczeń i zastępstwa"
                    onPress={() => router.push("/settings")}
                />
                <Tile
                    icon="📱"
                    title="Urządzenie"
                    subtitle={pairKey && device ? `Sparowane: ${device.deviceId}` : "Niesparowane"}
                    onPress={() => router.push("/device")}
                />
            </View>

            <Button label="Wyloguj" variant="danger" onPress={signOut} loading={signingOut}/>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.background},
    content: {paddingHorizontal: spacing.lg, gap: spacing.xl},
    header: {gap: spacing.xs},
    kicker: {color: colors.primary, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8},
    title: {color: colors.text, fontSize: 28, fontWeight: "800"},
    subtitle: {color: colors.textMuted, fontSize: 15},
    tiles: {gap: spacing.md},
});
