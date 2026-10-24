import {Stack} from "expo-router";
import {StatusBar} from "expo-status-bar";
import React from "react";
import {SafeAreaProvider} from "react-native-safe-area-context";
import {TerminalProvider} from "../state/TerminalContext";
import {colors} from "../ui/theme";

export default function RootLayout() {
    return (
        <SafeAreaProvider>
            <TerminalProvider>
                <StatusBar style="light"/>
                <Stack
                    screenOptions={{
                        headerStyle: {backgroundColor: colors.background},
                        headerShadowVisible: false,
                        headerTintColor: colors.text,
                        headerTitleStyle: {fontWeight: "800", fontSize: 18},
                        headerBackButtonDisplayMode: "minimal",
                        contentStyle: {backgroundColor: colors.background},
                    }}
                >
                    <Stack.Screen name="index" options={{headerShown: false}}/>
                    <Stack.Screen name="activate" options={{title: "Aktywacja", headerBackVisible: false}}/>
                    <Stack.Screen name="login" options={{title: "", headerBackVisible: false}}/>
                    <Stack.Screen name="home" options={{headerShown: false}}/>
                    <Stack.Screen name="scan-menu" options={{title: "Skanowanie"}}/>
                    <Stack.Screen name="shipment-lookup" options={{title: "Sprawdź przesyłkę"}}/>
                    <Stack.Screen name="device" options={{title: "Urządzenie"}}/>
                    <Stack.Screen name="scanner" options={{title: "Terminal"}}/>
                    <Stack.Screen name="history" options={{title: "Historia"}}/>
                    <Stack.Screen name="settings" options={{title: "Moje ustawienia"}}/>
                    <Stack.Screen name="chat" options={{title: "Czat"}}/>
                    <Stack.Screen name="chat-thread" options={{title: "Rozmowa"}}/>
                    <Stack.Screen name="pickup-points" options={{title: "Punkty odbioru"}}/>
                    <Stack.Screen name="pickup-point" options={{title: "Punkt odbioru"}}/>
                    <Stack.Screen name="vehicle" options={{title: "Moje auto"}}/>
                    <Stack.Screen name="deliveries" options={{title: "Moje dostawy"}}/>
                    <Stack.Screen name="delivery" options={{title: "Dostawa"}}/>
                    <Stack.Screen name="processes" options={{title: "Moje procesy"}}/>
                    <Stack.Screen name="process" options={{title: "Operacja"}}/>
                </Stack>
            </TerminalProvider>
        </SafeAreaProvider>
    );
}
