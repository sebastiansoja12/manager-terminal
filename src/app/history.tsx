import React from "react";
import {ScrollView, StyleSheet, Text, View} from "react-native";
import {useTerminal} from "../state/TerminalContext";
import {Button, Card} from "../ui/components";
import {colors, modeLabel, spacing} from "../ui/theme";

const formatDateTime = (iso: string) => new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

export default function HistoryScreen() {
    const {history, clearHistory} = useTerminal();

    return (
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
            {!history.length ? <Text style={styles.empty}>Nic jeszcze nie wysłano.</Text> : null}
            {history.map((entry) => {
                const failed = entry.details.filter((detail) => !detail.success);
                return (
                    <Card key={entry.id}>
                        <View style={styles.row}>
                            <Text style={styles.title}>{modeLabel(entry.mode)} · {entry.itemCount} szt.</Text>
                            <Text style={[styles.status, {color: entry.success ? colors.success : failed.length < entry.details.length ? colors.warning : colors.danger}]}>
                                {entry.success ? "OK" : failed.length < entry.details.length ? "Częściowo" : "Błąd"}
                            </Text>
                        </View>
                        <Text style={styles.meta}>{formatDateTime(entry.sentAt)}{entry.processId ? ` · proces ${entry.processId}` : ""}</Text>
                        {entry.summary ? <Text style={styles.meta}>{entry.summary}</Text> : null}
                        {failed.map((detail, index) => (
                            <Text key={`${detail.code}-${index}`} style={styles.failure}>✕ {detail.code}: {detail.message || "błąd"}</Text>
                        ))}
                    </Card>
                );
            })}
            {history.length ? <Button label="Wyczyść historię" variant="danger" onPress={clearHistory}/> : null}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.background},
    content: {padding: spacing.lg, gap: spacing.md},
    empty: {color: colors.textMuted, textAlign: "center", marginTop: spacing.xl},
    row: {flexDirection: "row", justifyContent: "space-between", alignItems: "center"},
    title: {color: colors.text, fontSize: 16, fontWeight: "700"},
    status: {fontWeight: "700"},
    meta: {color: colors.textMuted, fontSize: 13},
    failure: {color: colors.danger, fontSize: 13},
});
