import {BarcodeScanningResult, CameraView, useCameraPermissions} from "expo-camera";
import React, {useCallback, useRef, useState} from "react";
import {Pressable, StyleSheet, Text, View} from "react-native";
import {Button} from "./components";
import {colors, radius, spacing} from "./theme";

const REPEAT_COOLDOWN_MS = 2000;

type Props = {
    onScan: (code: string) => void;
    height?: number;
};

export function BarcodeCamera({onScan, height = 240}: Props) {
    const [permission, requestPermission] = useCameraPermissions();
    const [torch, setTorch] = useState(false);
    const lastScan = useRef<{code: string; at: number} | null>(null);

    const handleScan = useCallback((result: BarcodeScanningResult) => {
        const code = result.data?.trim();
        if (!code) {
            return;
        }
        const now = Date.now();
        if (lastScan.current && lastScan.current.code === code && now - lastScan.current.at < REPEAT_COOLDOWN_MS) {
            return;
        }
        lastScan.current = {code, at: now};
        onScan(code);
    }, [onScan]);

    if (!permission) {
        return <View style={[styles.placeholder, {height}]}/>;
    }

    if (!permission.granted) {
        return (
            <View style={[styles.placeholder, {height}]}>
                <Text style={styles.placeholderText}>Aparat jest potrzebny do skanowania kodów kreskowych.</Text>
                <Button label="Zezwól na aparat" onPress={requestPermission}/>
            </View>
        );
    }

    return (
        <View style={[styles.container, {height}]}>
            <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                enableTorch={torch}
                barcodeScannerSettings={{
                    barcodeTypes: ["code128", "code39", "code93", "ean13", "ean8", "itf14", "qr", "datamatrix", "pdf417", "upc_a"],
                }}
                onBarcodeScanned={handleScan}
            />
            <View pointerEvents="none" style={styles.frame}/>
            <Pressable style={styles.torch} onPress={() => setTorch((value) => !value)}>
                <Text style={styles.torchText}>{torch ? "Latarka: wł." : "Latarka: wył."}</Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#000"},
    placeholder: {
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
        padding: spacing.lg,
        gap: spacing.md,
    },
    placeholderText: {color: colors.textMuted, textAlign: "center"},
    frame: {
        position: "absolute",
        left: "12%",
        right: "12%",
        top: "30%",
        bottom: "30%",
        borderWidth: 2,
        borderColor: colors.primary,
        borderRadius: radius.sm,
    },
    torch: {
        position: "absolute",
        right: spacing.sm,
        top: spacing.sm,
        backgroundColor: "rgba(0,0,0,0.6)",
        borderRadius: radius.sm,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
    },
    torchText: {color: colors.text, fontSize: 12, fontWeight: "600"},
});
