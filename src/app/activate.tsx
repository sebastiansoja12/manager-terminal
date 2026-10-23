import {router} from "expo-router";
import React, {useCallback, useState} from "react";
import {KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View} from "react-native";
import {useTerminal} from "../state/TerminalContext";
import {formatActivationCode, isActivationCodeComplete, parseActivationQr} from "../terminal/activation";
import {BarcodeCamera} from "../ui/BarcodeCamera";
import {Banner, Button, Card, Field} from "../ui/components";
import {Icon} from "../ui/Icon";
import {colors, radius, spacing} from "../ui/theme";

export default function ActivateScreen() {
    const {serverUrl: storedServerUrl, activate} = useTerminal();
    const [scanning, setScanning] = useState(true);
    const [serverUrl, setServerUrl] = useState(storedServerUrl);
    const [activationCode, setActivationCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const runActivation = useCallback(async (url: string, code: string) => {
        setLoading(true);
        setError(null);
        try {
            await activate(url, code);
            router.replace("/login");
        } catch (exception) {
            setError((exception as Error).message);
        } finally {
            setLoading(false);
        }
    }, [activate]);

    const handleScan = useCallback((raw: string) => {
        if (loading) {
            return;
        }
        const request = parseActivationQr(raw);
        if (!request) {
            setError("To nie jest kod aktywacyjny z panelu managera.");
            return;
        }
        setScanning(false);
        setServerUrl(request.serverUrl);
        setActivationCode(request.activationCode);
        runActivation(request.serverUrl, request.activationCode);
    }, [loading, runActivation]);

    const canSubmit = serverUrl.trim() && isActivationCodeComplete(activationCode);

    return (
        <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <View style={styles.hero}>
                    <View style={styles.logo}>
                        <Icon name="scan" size={30} color={colors.primaryText}/>
                    </View>
                    <Text style={styles.title}>Manager Terminal</Text>
                    <Text style={styles.subtitle}>Aktywuj to urządzenie, aby mogło łączyć się z managerem.</Text>
                </View>
                <Card>
                    <Text style={styles.heading}>Zeskanuj kod z panelu</Text>
                    <Text style={styles.muted}>
                        Zaloguj się w panelu managera, otwórz „Moje urządzenie” → „Sparuj telefon” i zeskanuj kod QR.
                        Jeśli telefonu nie ma jeszcze w systemie, zostanie dodany jako Twoje urządzenie.
                    </Text>
                    {scanning ? <BarcodeCamera height={260} onScan={handleScan}/> : null}
                    <Button
                        label={scanning ? "Wpisz kod ręcznie" : "Skanuj kod QR"}
                        variant="secondary"
                        onPress={() => setScanning((value) => !value)}
                    />
                </Card>
                {!scanning ? (
                    <Card>
                        <Field
                            label="Adres serwera"
                            value={serverUrl}
                            onChangeText={setServerUrl}
                            placeholder="http://192.168.1.10:8080/v1/api"
                            keyboardType="url"
                        />
                        <Field
                            label="Kod aktywacyjny"
                            value={activationCode}
                            onChangeText={(value) => setActivationCode(formatActivationCode(value))}
                            placeholder="ABCD-EFGH"
                            autoCapitalize="characters"
                            maxLength={9}
                            returnKeyType="go"
                            onSubmitEditing={() => canSubmit && runActivation(serverUrl, activationCode)}
                        />
                        <Button
                            label="Aktywuj urządzenie"
                            onPress={() => runActivation(serverUrl, activationCode)}
                            disabled={!canSubmit}
                            loading={loading}
                            large
                        />
                    </Card>
                ) : null}
                {error ? <Banner tone="danger" title="Aktywacja nieudana" description={error}/> : null}
                {loading && scanning ? <Banner tone="info" title="Aktywowanie urządzenia…"/> : null}
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.background},
    content: {padding: spacing.lg, gap: spacing.lg, flexGrow: 1, justifyContent: "center"},
    hero: {gap: spacing.xs, marginBottom: spacing.sm},
    logo: {
        width: 60, height: 60, borderRadius: radius.lg, backgroundColor: colors.primary,
        alignItems: "center", justifyContent: "center", marginBottom: spacing.sm,
    },
    title: {color: colors.text, fontSize: 30, fontWeight: "800"},
    subtitle: {color: colors.textMuted, fontSize: 16},
    heading: {color: colors.text, fontSize: 18, fontWeight: "700"},
    muted: {color: colors.textMuted, fontSize: 14, lineHeight: 20},
});
