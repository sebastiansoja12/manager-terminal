import {router} from "expo-router";
import React, {useCallback, useEffect, useState} from "react";
import {ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View} from "react-native";
import {ApiError, ManagerDevice} from "../api/client";
import {useTerminal} from "../state/TerminalContext";
import {BarcodeCamera} from "../ui/BarcodeCamera";
import {Banner, Button, Card, Field} from "../ui/components";
import {colors, radius, spacing} from "../ui/theme";

const deviceKey = (device: ManagerDevice, index: number) => device.deviceId?.value || String(index);

export default function DeviceScreen() {
    const {client, user, device: pairedDevice, pairKey, pair, savePairKey, unpair, logout} = useTerminal();
    const [devices, setDevices] = useState<ManagerDevice[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [externalSystemId, setExternalSystemId] = useState("");
    const [manualPairKey, setManualPairKey] = useState("");
    const [showManual, setShowManual] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [pairing, setPairing] = useState(false);
    const [pairError, setPairError] = useState<string | null>(null);

    const [reloadCount, setReloadCount] = useState(0);
    const pairedDeviceId = pairedDevice?.deviceId;

    const applyDevices = useCallback((loaded: ManagerDevice[]) => {
        setDevices(loaded);
        setLoading(false);
        const pairedIndex = loaded.findIndex((device) => device.deviceId?.value === pairedDeviceId);
        if (pairedIndex >= 0) {
            setSelectedKey(deviceKey(loaded[pairedIndex], pairedIndex));
        } else if (loaded.length === 1) {
            setSelectedKey(deviceKey(loaded[0], 0));
        }
    }, [pairedDeviceId]);

    const handleLoadError = useCallback(async (exception: unknown) => {
        if (exception instanceof ApiError && exception.status === 401) {
            await logout();
            router.replace("/login");
            return;
        }
        setLoadError((exception as Error).message);
        setLoading(false);
    }, [logout]);

    useEffect(() => {
        if (!client) {
            return;
        }
        let cancelled = false;
        client.currentUserDevices().then(
            (loaded) => {
                if (!cancelled) {
                    applyDevices(loaded);
                }
            },
            (exception) => {
                if (!cancelled) {
                    handleLoadError(exception);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [client, reloadCount, applyDevices, handleLoadError]);

    const reload = () => {
        setLoading(true);
        setLoadError(null);
        setReloadCount((count) => count + 1);
    };

    const selectedDevice = devices.find((device, index) => deviceKey(device, index) === selectedKey) || null;

    const runPairing = async (action: () => Promise<void>) => {
        setPairing(true);
        setPairError(null);
        try {
            await action();
            router.replace("/home");
        } catch (exception) {
            setPairError((exception as Error).message);
        } finally {
            setPairing(false);
        }
    };

    const submitPair = () => {
        if (selectedDevice && externalSystemId.trim()) {
            runPairing(() => pair(selectedDevice, externalSystemId));
        }
    };

    const submitManual = () => {
        if (selectedDevice && manualPairKey.trim()) {
            runPairing(() => savePairKey(selectedDevice, manualPairKey));
        }
    };

    const signOut = async () => {
        await logout();
        router.replace("/login");
    };

    return (
        <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Card>
                <Text style={styles.heading}>Zalogowano jako {user?.username}</Text>
                <Text style={styles.muted}>Oddział: {user?.departmentCode || "—"}</Text>
                {pairKey && pairedDevice ? (
                    <Banner tone="success" title="Urządzenie sparowane" description={pairedDevice.deviceId}/>
                ) : (
                    <Banner tone="info" title="Sparuj telefon z urządzeniem w managerze"
                            description="Wybierz urządzenie przypisane do Ciebie i podaj jego identyfikator zewnętrzny (lub zeskanuj go z etykiety)."/>
                )}
            </Card>

            <Card>
                <View style={styles.row}>
                    <Text style={styles.heading}>Twoje urządzenia</Text>
                    <Button label="Odśwież" variant="ghost" onPress={reload}/>
                </View>
                {loading ? <ActivityIndicator color={colors.primary}/> : null}
                {loadError ? <Banner tone="danger" title="Nie udało się pobrać urządzeń" description={loadError}/> : null}
                {!loading && !loadError && !devices.length ? (
                    <Banner tone="warning" title="Brak urządzeń"
                            description="Administrator musi dodać urządzenie i przypisać je do Twojego konta w managerze."/>
                ) : null}
                {devices.map((device, index) => {
                    const key = deviceKey(device, index);
                    const selected = key === selectedKey;
                    return (
                        <Pressable key={key} onPress={() => setSelectedKey(key)} style={[styles.device, selected && styles.deviceSelected]}>
                            <Text style={styles.deviceId}>{device.deviceId?.value || "—"}</Text>
                            <Text style={styles.muted}>
                                {[device.deviceType, device.depotCode?.value, device.version?.value ? `v${device.version.value}` : null,
                                    device.active === false ? "nieaktywne" : null].filter(Boolean).join(" · ")}
                            </Text>
                        </Pressable>
                    );
                })}
            </Card>

            {selectedDevice ? (
                <Card>
                    <Text style={styles.heading}>Parowanie</Text>
                    <Field
                        label="Identyfikator zewnętrzny urządzenia"
                        value={externalSystemId}
                        onChangeText={setExternalSystemId}
                        placeholder="externalSystemId"
                        onSubmitEditing={submitPair}
                    />
                    <Button label={scanning ? "Zamknij aparat" : "Zeskanuj z etykiety"} variant="secondary" onPress={() => setScanning((value) => !value)}/>
                    {scanning ? (
                        <BarcodeCamera height={200} onScan={(code) => {
                            setExternalSystemId(code);
                            setScanning(false);
                        }}/>
                    ) : null}
                    {pairError ? <Banner tone="danger" title="Parowanie nieudane" description={pairError}/> : null}
                    <Button label="Sparuj urządzenie" onPress={submitPair} disabled={!externalSystemId.trim()} loading={pairing} large/>

                    <Pressable onPress={() => setShowManual((value) => !value)}>
                        <Text style={styles.link}>{showManual ? "Ukryj ręczny klucz" : "Mam już klucz parowania (PairKey)"}</Text>
                    </Pressable>
                    {showManual ? (
                        <>
                            <Field label="Klucz parowania" value={manualPairKey} onChangeText={setManualPairKey} placeholder="PairKey"/>
                            <Button label="Użyj klucza" variant="secondary" onPress={submitManual} disabled={!manualPairKey.trim()}/>
                        </>
                    ) : null}
                </Card>
            ) : null}

            <View style={styles.footer}>
                {pairKey ? <Button label="Rozparuj to urządzenie" variant="secondary" onPress={unpair}/> : null}
                <Button label="Wyloguj" variant="danger" onPress={signOut}/>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.background},
    content: {padding: spacing.lg, gap: spacing.lg},
    heading: {color: colors.text, fontSize: 18, fontWeight: "700"},
    muted: {color: colors.textMuted, fontSize: 14},
    row: {flexDirection: "row", alignItems: "center", justifyContent: "space-between"},
    device: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        padding: spacing.md,
        backgroundColor: colors.surfaceRaised,
        gap: 2,
    },
    deviceSelected: {borderColor: colors.primary, borderWidth: 2},
    deviceId: {color: colors.text, fontSize: 15, fontWeight: "600"},
    link: {color: colors.info, fontSize: 14, fontWeight: "600", textAlign: "center", paddingVertical: spacing.xs},
    footer: {gap: spacing.md, paddingBottom: spacing.xl},
});
