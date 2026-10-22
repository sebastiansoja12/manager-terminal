import {router} from "expo-router";
import React, {useState} from "react";
import {KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View} from "react-native";
import {useTerminal} from "../state/TerminalContext";
import {Banner, Button, Card, Field} from "../ui/components";
import {colors, spacing} from "../ui/theme";

export default function LoginScreen() {
    const {serverUrl, login} = useTerminal();
    const [url, setUrl] = useState(serverUrl);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canSubmit = url.trim() && username.trim() && password;

    const submit = async () => {
        if (!canSubmit || loading) {
            return;
        }
        setLoading(true);
        setError(null);
        try {
            await login(url, username, password);
            setPassword("");
            router.replace("/home");
        } catch (exception) {
            setError((exception as Error).message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <View style={styles.hero}>
                    <Text style={styles.title}>Manager Terminal</Text>
                    <Text style={styles.subtitle}>Terminal kuriera i pracownika magazynu</Text>
                </View>
                <Card>
                    <Field
                        label="Adres serwera"
                        value={url}
                        onChangeText={setUrl}
                        placeholder="http://192.168.1.10:8080/v1/api"
                        keyboardType="url"
                    />
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
                <Text style={styles.footnote}>
                    Adres to URL API managera razem z context path, np. /v1/api. Telefon musi być w tej samej sieci co serwer.
                </Text>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.background},
    content: {padding: spacing.lg, gap: spacing.lg, flexGrow: 1, justifyContent: "center"},
    hero: {gap: spacing.xs, marginBottom: spacing.sm},
    title: {color: colors.primary, fontSize: 30, fontWeight: "800"},
    subtitle: {color: colors.textMuted, fontSize: 16},
    footnote: {color: colors.textMuted, fontSize: 13, lineHeight: 18},
});
