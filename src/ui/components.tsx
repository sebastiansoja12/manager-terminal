import React from "react";
import {ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle} from "react-native";
import {colors, radius, spacing} from "./theme";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

type ButtonProps = {
    label: string;
    onPress: () => void;
    variant?: ButtonVariant;
    disabled?: boolean;
    loading?: boolean;
    large?: boolean;
    style?: ViewStyle;
};

export function Button({label, onPress, variant = "primary", disabled, loading, large, style}: ButtonProps) {
    const inactive = disabled || loading;
    return (
        <Pressable
            accessibilityRole="button"
            disabled={inactive}
            onPress={onPress}
            style={({pressed}) => [
                styles.button,
                styles[variant],
                large && styles.large,
                inactive && styles.disabled,
                pressed && !inactive && styles.pressed,
                style,
            ]}
        >
            {loading
                ? <ActivityIndicator color={variant === "primary" ? colors.primaryText : colors.text}/>
                : <Text style={[styles.buttonText, variant === "primary" && styles.primaryText, large && styles.largeText]}>{label}</Text>}
        </Pressable>
    );
}

type FieldProps = TextInputProps & {
    label: string;
    inputRef?: React.Ref<React.ComponentRef<typeof TextInput>>;
};

export function Field({label, inputRef, style, ...props}: FieldProps) {
    return (
        <View style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
                ref={inputRef}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, style]}
                {...props}
            />
        </View>
    );
}

export type BannerTone = "success" | "warning" | "danger" | "info";

const bannerColors: Record<BannerTone, {background: string; border: string}> = {
    success: {background: colors.successSurface, border: colors.success},
    warning: {background: colors.warningSurface, border: colors.warning},
    danger: {background: colors.dangerSurface, border: colors.danger},
    info: {background: colors.infoSurface, border: colors.info},
};

export function Banner({tone, title, description}: {tone: BannerTone; title: string; description?: string | null}) {
    return (
        <View style={[styles.banner, {backgroundColor: bannerColors[tone].background, borderColor: bannerColors[tone].border}]}>
            <Text style={styles.bannerTitle}>{title}</Text>
            {description ? <Text style={styles.bannerDescription}>{description}</Text> : null}
        </View>
    );
}

export function Card({children, style}: {children: React.ReactNode; style?: ViewStyle}) {
    return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
    button: {
        minHeight: 48,
        borderRadius: radius.md,
        paddingHorizontal: spacing.lg,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "transparent",
    },
    primary: {backgroundColor: colors.primary},
    secondary: {backgroundColor: colors.surfaceRaised, borderColor: colors.border},
    danger: {backgroundColor: colors.dangerSurface, borderColor: colors.danger},
    ghost: {backgroundColor: "transparent"},
    large: {minHeight: 60},
    disabled: {opacity: 0.45},
    pressed: {opacity: 0.8, transform: [{scale: 0.99}]},
    buttonText: {color: colors.text, fontSize: 16, fontWeight: "600"},
    primaryText: {color: colors.primaryText},
    largeText: {fontSize: 18, fontWeight: "700"},
    field: {gap: spacing.xs},
    label: {color: colors.textMuted, fontSize: 13, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5},
    input: {
        minHeight: 48,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        color: colors.text,
        paddingHorizontal: spacing.md,
        fontSize: 17,
    },
    banner: {borderRadius: radius.md, borderWidth: 1, padding: spacing.md, gap: 2},
    bannerTitle: {color: colors.text, fontSize: 16, fontWeight: "700"},
    bannerDescription: {color: colors.text, fontSize: 14, opacity: 0.85},
    card: {
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.lg,
        gap: spacing.md,
    },
});
