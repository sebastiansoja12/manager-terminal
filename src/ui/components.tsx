import {router, usePathname} from "expo-router";
import React from "react";
import {ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {Icon, IconName} from "./Icon";
import {colors, radius, spacing, typography} from "./theme";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

type ButtonProps = {
    label: string;
    onPress: () => void;
    variant?: ButtonVariant;
    icon?: IconName;
    disabled?: boolean;
    loading?: boolean;
    large?: boolean;
    style?: ViewStyle;
};

const buttonTextColor: Record<ButtonVariant, string> = {
    primary: colors.primaryText,
    secondary: colors.text,
    danger: colors.dangerText,
    ghost: colors.primary,
};

export function Button({label, onPress, variant = "primary", icon, disabled, loading, large, style}: ButtonProps) {
    const inactive = disabled || loading;
    const textColor = buttonTextColor[variant];
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityState={{disabled: Boolean(inactive), busy: Boolean(loading)}}
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
                ? <ActivityIndicator color={textColor}/>
                : (
                    <>
                        {icon ? <Icon name={icon} size={large ? 22 : 18} color={textColor} strokeWidth={2.4}/> : null}
                        <Text style={[styles.buttonText, {color: textColor}, large && styles.largeText]}>{label}</Text>
                    </>
                )}
        </Pressable>
    );
}

type IconButtonProps = {
    icon: IconName;
    label: string;
    onPress: () => void;
    tone?: "neutral" | "primary" | "success" | "info" | "danger";
    size?: number;
    disabled?: boolean;
    style?: ViewStyle;
};

const iconButtonTones = {
    neutral: {background: colors.surface, border: colors.border, color: colors.text},
    primary: {background: colors.primary, border: colors.primary, color: colors.primaryText},
    success: {background: colors.successSurface, border: colors.successSurface, color: colors.successText},
    info: {background: colors.infoSurface, border: colors.infoSurface, color: colors.infoText},
    danger: {background: "transparent", border: "transparent", color: "#F87171"},
};

export function IconButton({icon, label, onPress, tone = "neutral", size = 44, disabled, style}: IconButtonProps) {
    const palette = iconButtonTones[tone];
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            disabled={disabled}
            onPress={onPress}
            hitSlop={6}
            style={({pressed}) => [
                styles.iconButton,
                {width: size, height: size, backgroundColor: palette.background, borderColor: palette.border},
                disabled && styles.disabled,
                pressed && styles.pressed,
                style,
            ]}
        >
            <Icon name={icon} size={Math.round(size * 0.45)} color={palette.color}/>
        </Pressable>
    );
}

type FieldProps = TextInputProps & {
    label: string;
    icon?: IconName;
    hideLabel?: boolean;
    inputRef?: React.Ref<React.ComponentRef<typeof TextInput>>;
};

export function Field({label, icon, hideLabel, inputRef, style, ...props}: FieldProps) {
    return (
        <View style={styles.field}>
            {hideLabel ? null : <Text style={styles.label}>{label}</Text>}
            <View style={styles.inputBox}>
                {icon ? <Icon name={icon} size={18} color={colors.textMuted}/> : null}
                <TextInput
                    ref={inputRef}
                    accessibilityLabel={label}
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[styles.input, style]}
                    {...props}
                />
            </View>
        </View>
    );
}

export type BannerTone = "success" | "warning" | "danger" | "info";

const bannerPalette: Record<BannerTone, {background: string; border: string; icon: IconName; iconColor: string}> = {
    success: {background: colors.successSurface, border: colors.success, icon: "check", iconColor: colors.successText},
    warning: {background: colors.warningSurface, border: colors.warning, icon: "alert", iconColor: colors.warning},
    danger: {background: colors.dangerSurface, border: colors.danger, icon: "alert", iconColor: colors.dangerText},
    info: {background: colors.infoSurface, border: colors.info, icon: "info", iconColor: colors.infoText},
};

type BannerProps = {
    tone: BannerTone;
    title: string;
    description?: string | null;
    icon?: IconName;
    action?: {label: string; onPress: () => void} | null;
};

export function Banner({tone, title, description, icon, action}: BannerProps) {
    const palette = bannerPalette[tone];
    return (
        <View accessibilityRole="alert" style={[styles.banner, {backgroundColor: palette.background, borderColor: palette.border}]}>
            <Icon name={icon || palette.icon} size={20} color={palette.iconColor} strokeWidth={2.4}/>
            <View style={styles.bannerText}>
                <Text style={styles.bannerTitle}>{title}</Text>
                {description ? <Text style={styles.bannerDescription}>{description}</Text> : null}
            </View>
            {action ? (
                <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={8}
                           style={({pressed}) => [styles.bannerAction, {backgroundColor: palette.border}, pressed && styles.pressed]}>
                    <Text style={styles.bannerActionText}>{action.label}</Text>
                </Pressable>
            ) : null}
        </View>
    );
}

type TileProps = {
    icon: IconName;
    iconColor?: string;
    title: string;
    subtitle?: string | null;
    badge?: string | null;
    onPress: () => void;
    style?: ViewStyle;
};

export function Tile({icon, iconColor = colors.text, title, subtitle, badge, onPress, style}: TileProps) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={badge ? `${title}, ${badge}` : title}
            onPress={onPress}
            style={({pressed}) => [styles.tile, pressed && styles.pressed, style]}
        >
            <View style={styles.tileIcon}>
                <Icon name={icon} size={22} color={iconColor}/>
            </View>
            <View style={styles.tileText}>
                <Text style={styles.tileTitle}>{title}</Text>
                {subtitle ? <Text style={styles.tileSubtitle}>{subtitle}</Text> : null}
            </View>
            {badge ? <Badge value={badge}/> : null}
            <Icon name="chevronRight" size={20} color={colors.textMuted}/>
        </Pressable>
    );
}

export function Badge({value, style}: {value: string; style?: ViewStyle}) {
    return (
        <View style={[styles.badge, style]}>
            <Text style={styles.badgeText}>{value}</Text>
        </View>
    );
}

type ChipProps = {
    label: string;
    selected?: boolean;
    onPress?: () => void;
    icon?: IconName;
    iconColor?: string;
};

export function Chip({label, selected, onPress, icon, iconColor}: ChipProps) {
    const content = (
        <>
            {icon ? <Icon name={icon} size={15} color={selected ? colors.primaryText : iconColor || colors.textSecondary} strokeWidth={2.4}/> : null}
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
        </>
    );
    if (!onPress) {
        return <View style={[styles.chip, selected && styles.chipSelected]}>{content}</View>;
    }
    return (
        <Pressable
            accessibilityRole="tab"
            accessibilityState={{selected: Boolean(selected)}}
            onPress={onPress}
            style={({pressed}) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}
        >
            {content}
        </Pressable>
    );
}

export type PillTone = "success" | "warning" | "danger" | "info" | "neutral";

const pillPalette: Record<PillTone, {background: string; color: string}> = {
    success: {background: colors.successSurface, color: colors.successText},
    warning: {background: colors.warningSurface, color: colors.warning},
    danger: {background: colors.dangerSurface, color: colors.dangerText},
    info: {background: colors.infoSurface, color: colors.infoText},
    neutral: {background: colors.surfaceRaised, color: colors.textSecondary},
};

export function Pill({label, tone = "neutral", dot}: {label: string; tone?: PillTone; dot?: boolean}) {
    const palette = pillPalette[tone];
    return (
        <View style={[styles.pill, {backgroundColor: palette.background}]}>
            {dot ? <View style={[styles.pillDot, {backgroundColor: palette.color}]}/> : null}
            <Text style={[styles.pillText, {color: palette.color}]}>{label}</Text>
        </View>
    );
}

export function SectionLabel({children, right}: {children: string; right?: React.ReactNode}) {
    return (
        <View style={styles.sectionLabelRow}>
            <Text style={typography.overline}>{children}</Text>
            {right}
        </View>
    );
}

export function Card({children, style}: {children: React.ReactNode; style?: ViewStyle | ViewStyle[]}) {
    return <View style={[styles.card, style]}>{children}</View>;
}

const NAV_ITEMS: {href: "/home" | "/scan-menu" | "/shipment-lookup" | "/history"; label: string; icon: IconName}[] = [
    {href: "/home", label: "Start", icon: "home"},
    {href: "/scan-menu", label: "Skanuj", icon: "scanLine"},
    {href: "/shipment-lookup", label: "Szukaj", icon: "search"},
    {href: "/history", label: "Historia", icon: "history"},
];

export function BottomNav({badges}: {badges?: Partial<Record<string, number>>}) {
    const insets = useSafeAreaInsets();
    const pathname = usePathname();
    const open = (href: (typeof NAV_ITEMS)[number]["href"]) => {
        if (href === pathname) {
            return;
        }
        if (href === "/home") {
            router.dismissTo("/home");
        } else {
            router.navigate(href);
        }
    };
    return (
        <View style={[styles.nav, {marginBottom: Math.max(insets.bottom, spacing.md)}]} accessibilityRole="tablist">
            {NAV_ITEMS.map((item) => {
                const active = pathname === item.href;
                const count = badges?.[item.href] || 0;
                return (
                    <Pressable
                        key={item.href}
                        accessibilityRole="tab"
                        accessibilityLabel={count ? `${item.label}, ${count}` : item.label}
                        accessibilityState={{selected: active}}
                        onPress={() => open(item.href)}
                        style={({pressed}) => [styles.navItem, active && styles.navItemActive, pressed && styles.pressed]}
                    >
                        <View>
                            <Icon name={item.icon} size={22} color={active ? colors.primary : colors.textMuted}/>
                            {count ? <Badge value={String(count)} style={styles.navBadge}/> : null}
                        </View>
                        <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    button: {
        minHeight: 48,
        borderRadius: radius.md,
        paddingHorizontal: spacing.lg,
        flexDirection: "row",
        gap: spacing.sm,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "transparent",
    },
    primary: {backgroundColor: colors.primary},
    secondary: {backgroundColor: colors.surfaceRaised, borderColor: colors.border},
    danger: {backgroundColor: colors.dangerSurface, borderColor: colors.danger},
    ghost: {backgroundColor: "transparent"},
    large: {minHeight: 58, borderRadius: radius.lg},
    disabled: {opacity: 0.45},
    pressed: {opacity: 0.82, transform: [{scale: 0.985}]},
    buttonText: {fontSize: 16, fontWeight: "700"},
    largeText: {fontSize: 17, fontWeight: "800"},
    iconButton: {borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center"},
    field: {gap: spacing.xs},
    label: {...typography.overline},
    inputBox: {
        minHeight: 50,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.md,
    },
    input: {flex: 1, minHeight: 48, color: colors.text, fontSize: 16},
    banner: {flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md},
    bannerText: {flex: 1, gap: 2},
    bannerTitle: {color: colors.text, fontSize: 15, fontWeight: "700"},
    bannerDescription: {color: colors.text, fontSize: 13, opacity: 0.85},
    bannerAction: {paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm},
    bannerActionText: {color: colors.primaryText, fontSize: 13, fontWeight: "800"},
    tile: {
        minHeight: 72,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
    },
    tileIcon: {
        width: 44,
        height: 44,
        borderRadius: radius.md,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.surfaceRaised,
    },
    tileText: {flex: 1, gap: 2},
    tileTitle: {color: colors.text, fontSize: 16, fontWeight: "700"},
    tileSubtitle: {color: colors.textMuted, fontSize: 13},
    badge: {
        minWidth: 22,
        height: 22,
        paddingHorizontal: 6,
        borderRadius: 11,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.primary,
    },
    badgeText: {color: colors.primaryText, fontSize: 12, fontWeight: "800"},
    chip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        minHeight: 38,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
    },
    chipSelected: {backgroundColor: colors.primary, borderColor: colors.primary},
    chipText: {color: colors.textSecondary, fontSize: 14, fontWeight: "600"},
    chipTextSelected: {color: colors.primaryText, fontWeight: "800"},
    pill: {flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, alignSelf: "flex-start"},
    pillDot: {width: 7, height: 7, borderRadius: 4},
    pillText: {fontSize: 12, fontWeight: "700"},
    sectionLabelRow: {flexDirection: "row", alignItems: "center", justifyContent: "space-between"},
    card: {
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.lg,
        gap: spacing.md,
    },
    nav: {
        marginHorizontal: spacing.md,
        padding: spacing.sm,
        flexDirection: "row",
        gap: spacing.xs,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
    },
    navItem: {flex: 1, alignItems: "center", gap: 4, paddingVertical: spacing.sm, borderRadius: radius.lg},
    navItemActive: {backgroundColor: colors.surfaceRaised},
    navLabel: {color: colors.textMuted, fontSize: 11, fontWeight: "600"},
    navLabelActive: {color: colors.primary, fontWeight: "800"},
    navBadge: {position: "absolute", top: -6, right: -12, minWidth: 18, height: 18, paddingHorizontal: 4},
});
