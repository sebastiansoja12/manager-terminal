import {BarcodeScanningResult, CameraView, useCameraPermissions} from "expo-camera";
import React, {useCallback, useRef, useState} from "react";
import {Pressable, StyleSheet, Text, View} from "react-native";
import {Button} from "./components";
import {Icon} from "./Icon";
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
            <View pointerEvents="none" style={styles.frame}>
                <View style={[styles.corner, styles.topLeft]}/>
                <View style={[styles.corner, styles.topRight]}/>
                <View style={[styles.corner, styles.bottomLeft]}/>
                <View style={[styles.corner, styles.bottomRight]}/>
                <View style={styles.laser}/>
            </View>
            <Pressable
                accessibilityRole="switch"
                accessibilityLabel="Latarka"
                accessibilityState={{checked: torch}}
                hitSlop={6}
                style={[styles.torch, torch && styles.torchOn]}
                onPress={() => setTorch((value) => !value)}
            >
                <Icon name="flashlight" size={20} color={torch ? colors.primaryText : colors.text}/>
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
        top: "26%",
        bottom: "26%",
    },
    corner: {position: "absolute", width: 30, height: 30, borderColor: colors.primary},
    topLeft: {left: 0, top: 0, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: radius.md},
    topRight: {right: 0, top: 0, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: radius.md},
    bottomLeft: {left: 0, bottom: 0, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: radius.md},
    bottomRight: {right: 0, bottom: 0, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: radius.md},
    laser: {position: "absolute", left: 12, right: 12, top: "50%", height: 2, backgroundColor: "#F87171", opacity: 0.9},
    torch: {
        position: "absolute",
        right: spacing.md,
        top: spacing.md,
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(11,18,32,0.7)",
    },
    torchOn: {backgroundColor: colors.primary},
});
