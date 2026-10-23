import {Redirect} from "expo-router";
import React from "react";
import {ActivityIndicator, View} from "react-native";
import {useTerminal} from "../state/TerminalContext";
import {colors} from "../ui/theme";

const sessionExpired = (expiresAt: string | null) => !expiresAt || new Date(expiresAt).getTime() <= Date.now();

export default function Index() {
    const {ready, pairKey, user, operatorSessionExpiresAt} = useTerminal();

    if (!ready) {
        return (
            <View style={{flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background}}>
                <ActivityIndicator color={colors.primary} size="large"/>
            </View>
        );
    }
    if (!pairKey) {
        return <Redirect href="/activate"/>;
    }
    if (!user || sessionExpired(operatorSessionExpiresAt)) {
        return <Redirect href="/login"/>;
    }
    return <Redirect href="/home"/>;
}
