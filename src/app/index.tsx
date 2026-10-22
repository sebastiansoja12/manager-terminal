import {Redirect} from "expo-router";
import React from "react";
import {ActivityIndicator, View} from "react-native";
import {useTerminal} from "../state/TerminalContext";
import {colors} from "../ui/theme";

export default function Index() {
    const {ready, user} = useTerminal();

    if (!ready) {
        return (
            <View style={{flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background}}>
                <ActivityIndicator color={colors.primary} size="large"/>
            </View>
        );
    }
    if (!user) {
        return <Redirect href="/login"/>;
    }
    return <Redirect href="/home"/>;
}
