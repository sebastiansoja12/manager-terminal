import {Redirect, router} from "expo-router";
import React, {useState} from "react";
import {Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View} from "react-native";
import {useTerminal} from "../state/TerminalContext";
import {Banner, Button, Card, Field} from "../ui/components";
import {Icon} from "../ui/Icon";
import {colors, radius, spacing} from "../ui/theme";

const ASSIGNMENT_MODE_LABELS: Record<string, string> = {
    PERSONAL: "osobiste",
    SHARED: "wspólne dla oddziału",
};

const confirmDeregistration = (onConfirm: () => void) => {
    const message = "Urządzenie trzeba będzie aktywować ponownie kodem z panelu managera.";
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

export default function LoginScreen() {
    const {pairKey, device, serverUrl, login, deregister} = useTerminal();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!pairKey) {
        return <Redirect href="/activate"/>;
    }

    const canSubmit = username.trim() && password;

    const submit = async () => {
        if (!canSubmit || loading) {
            return;
        }
        setLoading(true);
        setError(null);
        try {
            await login(username, password);
            setPassword("");
            router.replace("/home");
        } catch (exception) {
            setError((exception as Error).message);
        } finally {
            setLoading(false);
        }
    };

    const deviceDescription = [
        device?.deviceType,
        device?.departmentCode ? `oddział ${device.departmentCode}` : null,
        device?.assignmentMode ? ASSIGNMENT_MODE_LABELS[device.assignmentMode] : null,
    ].filter(Boolean).join(" · ");

    return (
        <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <View style={styles.hero}>
                    <View style={styles.logo}>
                        <Icon name="scan" size={30} color={colors.primaryText}/>
                    </View>
                    <Text style={styles.title}>Manager Terminal</Text>
                    <Text style={styles.subtitle}>Zaloguj się na tym urządzeniu, aby rozpocząć pracę.</Text>
                </View>
                <Banner tone="info" title={device?.deviceId || "Urządzenie aktywne"} description={deviceDescription || serverUrl}/>
                <Card>
                    <Field label="Login" value={username} onChangeText={setUsername} placeholder="np. s-soja" textContentType="username"/>
                    <Field
                        label="Hasło"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                        textContentType="password"
                        returnKeyType="go"
                        onSubmitEditing={submit}
                    />
                    {error ? <Banner tone="danger" title="Nie udało się zalogować" description={error}/> : null}
                    <Button label="Zaloguj" onPress={submit} disabled={!canSubmit} loading={loading} large/>
                </Card>
                <Pressable onPress={() => confirmDeregistration(async () => {
                    await deregister();
                    router.replace("/activate");
                })}>
                    <Text style={styles.link}>To nie to urządzenie? Wyrejestruj je</Text>
                </Pressable>
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
    link: {color: colors.info, fontSize: 14, fontWeight: "600", textAlign: "center", paddingVertical: spacing.xs},
});
