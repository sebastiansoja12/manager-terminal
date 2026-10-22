import {router} from "expo-router";
import React from "react";
import {ScrollView, StyleSheet} from "react-native";
import {useTerminal} from "../state/TerminalContext";
import type {ScanMode} from "../terminal/types";
import {Tile} from "../ui/components";
import {colors, MODES, spacing} from "../ui/theme";

const MODE_ICONS: Record<ScanMode, string> = {
    COLLECT: "📥",
    PALLET: "🧱",
    RETURN: "↩️",
    REJECT: "⛔",
    MISS: "🚪",
};

export default function ScanMenuScreen() {
    const {pending} = useTerminal();

    return (
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
            {MODES.map((entry) => {
                const count = pending[entry.mode].length;
                return (
                    <Tile
                        key={entry.mode}
                        icon={MODE_ICONS[entry.mode]}
                        title={entry.label}
                        subtitle={entry.hint}
                        badge={count ? String(count) : null}
                        onPress={() => router.push({pathname: "/scanner", params: {mode: entry.mode}})}
                    />
                );
            })}
            <Tile
                icon="🕘"
                title="Historia wysyłek"
                subtitle="Wyniki ostatnich wysyłek do managera"
                onPress={() => router.push("/history")}
            />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.background},
    content: {padding: spacing.lg, gap: spacing.md},
});
