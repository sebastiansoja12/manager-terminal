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
                        headerStyle: {backgroundColor: colors.surface},
                        headerTintColor: colors.text,
                        headerTitleStyle: {fontWeight: "700"},
                        contentStyle: {backgroundColor: colors.background},
                    }}
                >
                    <Stack.Screen name="index" options={{headerShown: false}}/>
                    <Stack.Screen name="login" options={{title: "Logowanie", headerBackVisible: false}}/>
                    <Stack.Screen name="device" options={{title: "Urządzenie"}}/>
                    <Stack.Screen name="scanner" options={{title: "Terminal", headerBackVisible: false}}/>
                    <Stack.Screen name="history" options={{title: "Historia wysyłek"}}/>
                </Stack>
            </TerminalProvider>
        </SafeAreaProvider>
    );
}
