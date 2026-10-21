import type {ScanMode} from "../terminal/types";

export const colors = {
    background: "#0B1220",
    surface: "#131C2E",
    surfaceRaised: "#1B2740",
    border: "#2A3955",
    text: "#F1F5F9",
    textMuted: "#94A3B8",
    primary: "#F59E0B",
    primaryText: "#1A1205",
    success: "#22C55E",
    successSurface: "#0F2E1C",
    warning: "#FBBF24",
    warningSurface: "#33270A",
    danger: "#EF4444",
    dangerSurface: "#3A1212",
    info: "#38BDF8",
    infoSurface: "#0C2A3A",
};

export const spacing = {xs: 4, sm: 8, md: 12, lg: 16, xl: 24};

export const radius = {sm: 8, md: 12, lg: 16};

export const MODES: {mode: ScanMode; label: string; hint: string}[] = [
    {mode: "COLLECT", label: "Odbiór", hint: "Paczki odebrane od klienta — numery śledzenia"},
    {mode: "PALLET", label: "Paleta", hint: "Skan palety — jeden numer palety"},
    {mode: "RETURN", label: "Zwrot", hint: "Zwrot przesyłek — numeryczne ID przesyłki"},
    {mode: "REJECT", label: "Odmowa", hint: "Odmowa przyjęcia — numeryczne ID przesyłki"},
    {mode: "MISS", label: "Nieobecny", hint: "Nieudane doręczenie — numeryczne ID przesyłki"},
];

export const modeLabel = (mode: ScanMode) => MODES.find((entry) => entry.mode === mode)?.label || mode;
