import {Platform} from "react-native";
import type {ScanMode} from "../terminal/types";
import type {IconName} from "./Icon";

export const colors = {
    background: "#0B1220",
    surface: "#131C2E",
    surfaceRaised: "#1B2740",
    surfaceHighlight: "#16233A",
    border: "#24324D",
    text: "#F1F5F9",
    textSecondary: "#CBD5E1",
    textMuted: "#94A3B8",
    textFaint: "#475569",
    primary: "#F59E0B",
    primaryText: "#1A1205",
    success: "#22C55E",
    successText: "#4ADE80",
    successSurface: "#0F2E1C",
    warning: "#FBBF24",
    warningText: "#FDE68A",
    warningSurface: "#33270A",
    danger: "#EF4444",
    dangerText: "#FCA5A5",
    dangerSurface: "#3A1212",
    info: "#38BDF8",
    infoText: "#7DD3FC",
    infoSurface: "#0C2A3A",
    violet: "#C4B5FD",
};

export const spacing = {xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32};

export const radius = {sm: 10, md: 14, lg: 18, xl: 24, pill: 999};

export const fonts = {
    mono: Platform.select({ios: "Menlo", android: "monospace", default: "ui-monospace, Menlo, monospace"}),
};

export const typography = {
    overline: {color: colors.textMuted, fontSize: 12, fontWeight: "700" as const, textTransform: "uppercase" as const, letterSpacing: 0.6},
    code: {fontFamily: fonts.mono, fontVariant: ["tabular-nums" as const]},
};

export type ModeMeta = {mode: ScanMode; label: string; hint: string; icon: IconName; color: string};

export const MODES: ModeMeta[] = [
    {mode: "COLLECT", label: "Odbiór", hint: "Paczki odebrane od klienta — numery śledzenia", icon: "collect", color: colors.info},
    {mode: "HANDOVER", label: "Doręczenie", hint: "Wydanie paczki odbiorcy — numery śledzenia, podpis odbiorcy", icon: "handover", color: colors.successText},
    {mode: "PALLET", label: "Paleta", hint: "Skan palety — jeden numer palety", icon: "pallet", color: colors.violet},
    {mode: "RETURN", label: "Zwrot", hint: "Zwrot przesyłek — numery śledzenia i token zwrotu", icon: "return", color: colors.warning},
    {mode: "REJECT", label: "Odmowa", hint: "Odmowa przyjęcia — numery śledzenia i powód", icon: "reject", color: "#F87171"},
    {mode: "MISS", label: "Nieobecny", hint: "Nieudane doręczenie — numery śledzenia", icon: "door", color: colors.textMuted},
];

export const modeMeta = (mode: ScanMode) => MODES.find((entry) => entry.mode === mode) || MODES[0];

export const modeLabel = (mode: ScanMode) => MODES.find((entry) => entry.mode === mode)?.label || mode;
