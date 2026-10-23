import {router} from "expo-router";
import React, {useState} from "react";
import {Alert, Platform, ScrollView, StyleSheet, Text, View} from "react-native";
import {APP_VERSION, useTerminal} from "../state/TerminalContext";
import {Banner, Button, Card} from "../ui/components";
import {colors, spacing} from "../ui/theme";

const ASSIGNMENT_MODE_LABELS: Record<string, string> = {
    PERSONAL: "Osobiste",
    SHARED: "Wspólne dla oddziału",
};

const formatDateTime = (iso: string | null) => (iso
    ? new Date(iso).toLocaleString("pl-PL", {day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"})
    : "—");

const confirmDeregistration = (onConfirm: () => void) => {
    const message = "Zostaniesz wylogowany, a urządzenie trzeba będzie aktywować ponownie kodem z panelu managera.";
    if (Platform.OS === "web") {
        if (window.confirm(`Wyrejestrować to urządzenie?\n\n${message}`)) {
            onConfirm();
        }
        return;
    }
    Alert.alert("Wyrejestrować to urządzenie?", message, [
        {text: "Anuluj", style: "cancel"},
        {text: "Wyrejestruj", style: "destructive", onPress: onConfirm},
    ]);
};

function Row({label, value}: {label: string; value: string}) {
    return (
        <View style={styles.row}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.value}>{value}</Text>
        </View>
    );
}

export default function DeviceScreen() {
    const {device, serverUrl, user, operatorSessionExpiresAt, updateRequired, deregister} = useTerminal();
    const [working, setWorking] = useState(false);

    const runDeregistration = () => confirmDeregistration(async () => {
        setWorking(true);
        try {
            await deregister();
            router.replace("/activate");
        } finally {
            setWorking(false);
        }
    });

    return (
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
            {updateRequired ? (
                <Banner tone="warning" title="Dostępna jest nowa wersja aplikacji" description="Zaktualizuj aplikację, aby uniknąć błędów wysyłki."/>
            ) : null}
            <Card>
                <Text style={styles.heading}>To urządzenie</Text>
                <Row label="Identyfikator" value={device?.deviceId || "—"}/>
                <Row label="Typ" value={device?.deviceType || "—"}/>
                <Row label="Oddział" value={device?.departmentCode || "—"}/>
                <Row label="Tryb przypisania" value={device?.assignmentMode ? ASSIGNMENT_MODE_LABELS[device.assignmentMode] : "—"}/>
                <Row label="Wersja aplikacji" value={APP_VERSION}/>
                <Row label="Serwer" value={serverUrl || "—"}/>
            </Card>
            <Card>
                <Text style={styles.heading}>Sesja</Text>
                <Row label="Zalogowany" value={user?.username || "—"}/>
                <Row label="Sesja ważna do" value={formatDateTime(operatorSessionExpiresAt)}/>
            </Card>
            <Button label="Wyrejestruj to urządzenie" variant="danger" onPress={runDeregistration} loading={working}/>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.background},
    content: {padding: spacing.lg, gap: spacing.lg},
    heading: {color: colors.text, fontSize: 18, fontWeight: "700"},
    row: {flexDirection: "row", justifyContent: "space-between", gap: spacing.md},
    label: {color: colors.textMuted, fontSize: 14},
    value: {color: colors.text, fontSize: 14, fontWeight: "600", flexShrink: 1, textAlign: "right"},
});
