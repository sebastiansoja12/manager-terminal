import {router} from "expo-router";
import React from "react";
import {ScrollView, StyleSheet, View} from "react-native";
import {useTerminal} from "../state/TerminalContext";
import {BottomNav, SectionLabel, Tile} from "../ui/components";
import {colors, MODES, spacing} from "../ui/theme";

export default function ScanMenuScreen() {
    const {pending, outbox} = useTerminal();

    return (
        <View style={styles.root}>
            <ScrollView contentContainerStyle={styles.content}>
                <SectionLabel>Wybierz tryb</SectionLabel>
                {MODES.map((entry) => {
                    const count = pending[entry.mode].length;
                    return (
                        <Tile
                            key={entry.mode}
                            icon={entry.icon}
                            iconColor={entry.color}
                            title={entry.label}
                            subtitle={entry.hint}
                            badge={count ? String(count) : null}
                            onPress={() => router.push({pathname: "/scanner", params: {mode: entry.mode}})}
                        />
                    );
                })}
            </ScrollView>
            <BottomNav badges={{"/history": outbox.length}}/>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.background},
    content: {padding: spacing.lg, gap: spacing.sm},
});
