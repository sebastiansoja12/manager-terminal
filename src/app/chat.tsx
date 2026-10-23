import {router} from "expo-router";
import React, {useCallback, useEffect, useMemo, useState} from "react";
import {ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {useTerminal} from "../state/TerminalContext";
import {ChatUser, chatDirectory, chatInitials, filterChatUsers, identifierValue} from "../terminal/chat";
import {Banner, Field} from "../ui/components";
import {Icon} from "../ui/Icon";
import {colors, radius, spacing} from "../ui/theme";

function UserRow({user, ownDepartment}: {user: ChatUser; ownDepartment: boolean}) {
    const details = [user.departmentCode && `Oddział ${user.departmentCode}`, user.username !== user.name && user.username]
        .filter(Boolean)
        .join(" · ");
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Napisz do: ${user.name}`}
            onPress={() => router.push({pathname: "/chat-thread", params: {userId: user.id, name: user.name}})}
            style={({pressed}) => [styles.row, pressed && styles.pressed]}
        >
            <View style={[styles.avatar, ownDepartment && styles.avatarOwn]}>
                <Text style={[styles.avatarText, ownDepartment && styles.avatarTextOwn]}>{chatInitials(user.name)}</Text>
            </View>
            <View style={styles.rowText}>
                <Text style={styles.name} numberOfLines={1}>{user.name}</Text>
                {details ? <Text style={styles.details} numberOfLines={1}>{details}</Text> : null}
            </View>
            <Icon name="chevronRight" size={20} color={colors.textMuted}/>
        </Pressable>
    );
}

export default function ChatScreen() {
    const insets = useSafeAreaInsets();
    const {client, user, device} = useTerminal();
    const [users, setUsers] = useState<ChatUser[]>([]);
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const departmentCode = device?.departmentCode || user?.departmentCode || null;
    const currentUserId = user ? identifierValue(user.userId) : "";

    const fetchUsers = useCallback(() => {
        if (!client) {
            return Promise.resolve();
        }
        return client.chatUsers()
            .then((loaded) => {
                setUsers(chatDirectory(loaded, currentUserId, departmentCode));
                setError(null);
            })
            .catch((exception: Error) => setError(exception.message))
            .finally(() => setLoading(false));
    }, [client, currentUserId, departmentCode]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const refresh = () => {
        setRefreshing(true);
        fetchUsers().finally(() => setRefreshing(false));
    };

    const visible = useMemo(() => filterChatUsers(users, query), [users, query]);

    return (
        <View style={styles.root}>
            <View style={styles.search}>
                <Field label="Szukaj osoby" hideLabel icon="search" placeholder="Imię, nazwisko, login lub oddział"
                       value={query} onChangeText={setQuery} returnKeyType="search"/>
            </View>
            {error ? (
                <View style={styles.banner}>
                    <Banner tone="danger" title="Nie udało się pobrać listy osób" description={error}
                            action={{label: "Ponów", onPress: () => refresh()}}/>
                </View>
            ) : null}
            {loading ? (
                <ActivityIndicator style={styles.loader} color={colors.primary}/>
            ) : (
                <FlatList
                    data={visible}
                    keyExtractor={(item) => item.id}
                    renderItem={({item}) => (
                        <UserRow user={item} ownDepartment={departmentCode !== null && item.departmentCode === departmentCode}/>
                    )}
                    contentContainerStyle={[styles.list, {paddingBottom: insets.bottom + spacing.lg}]}
                    keyboardShouldPersistTaps="handled"
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary}/>}
                    ListEmptyComponent={error ? undefined : (
                        <Text style={styles.empty}>{query.trim() ? "Nikt nie pasuje do wyszukiwania." : "Brak innych osób w organizacji."}</Text>
                    )}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.background},
    search: {paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md},
    banner: {paddingHorizontal: spacing.lg, paddingBottom: spacing.md},
    loader: {marginTop: spacing.xxl},
    list: {paddingHorizontal: spacing.lg, gap: spacing.sm},
    row: {
        flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md,
        borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    },
    pressed: {opacity: 0.85, transform: [{scale: 0.985}]},
    avatar: {
        width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surfaceRaised,
        alignItems: "center", justifyContent: "center",
    },
    avatarOwn: {backgroundColor: colors.primary},
    avatarText: {color: colors.text, fontSize: 15, fontWeight: "800"},
    avatarTextOwn: {color: colors.primaryText},
    rowText: {flex: 1, gap: 2},
    name: {color: colors.text, fontSize: 16, fontWeight: "700"},
    details: {color: colors.textMuted, fontSize: 13},
    empty: {color: colors.textMuted, fontSize: 14, textAlign: "center", marginTop: spacing.xl},
});
