import {router} from "expo-router";
import React, {useCallback, useEffect, useState} from "react";
import {ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {useTerminal} from "../state/TerminalContext";
import {ProcessSummary, hasNextPage, outcomeTone, pageItems, parcelCount, summarizeProcess} from "../terminal/processes";
import {formatDateTime} from "../terminal/shipmentLookup";
import {Banner, Pill} from "../ui/components";
import {Icon} from "../ui/Icon";
import {colors, modeMeta, radius, spacing} from "../ui/theme";

const PAGE_SIZE = 20;

function ProcessRow({process}: {process: ProcessSummary}) {
    const meta = process.mode ? modeMeta(process.mode) : null;
    const newNumbers = process.parcels.filter((parcel) => parcel.newTrackingNumber).length;
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${process.title}, ${process.outcomeLabel}`}
            onPress={() => router.push({pathname: "/process", params: {processId: process.id}})}
            style={({pressed}) => [styles.row, pressed && styles.pressed]}
        >
            <View style={styles.rowIcon}>
                <Icon name={meta?.icon || "list"} size={22} color={meta?.color || colors.textMuted}/>
            </View>
            <View style={styles.rowText}>
                <Text style={styles.title} numberOfLines={1}>{process.title}</Text>
                {process.subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{process.subtitle}</Text> : null}
                <View style={styles.pills}>
                    <Pill tone={outcomeTone(process.outcome)} dot label={process.outcomeLabel}/>
                    {process.parcels.length ? <Pill label={parcelCount(process.parcels.length)}/> : null}
                    {newNumbers ? <Pill tone="info" label={newNumbers === 1 ? "Nowy numer" : `Nowe numery: ${newNumbers}`}/> : null}
                </View>
                {process.createdAt ? <Text style={styles.time}>{formatDateTime(process.createdAt)}</Text> : null}
            </View>
            <Icon name="chevronRight" size={20} color={colors.textMuted}/>
        </Pressable>
    );
}

export default function ProcessesScreen() {
    const insets = useSafeAreaInsets();
    const {client} = useTerminal();
    const [processes, setProcesses] = useState<ProcessSummary[]>([]);
    const [page, setPage] = useState(0);
    const [more, setMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchFirstPage = useCallback(() => {
        if (!client) {
            return Promise.resolve();
        }
        return client.myProcesses(0, PAGE_SIZE)
            .then((loaded) => {
                setProcesses(pageItems(loaded).map(summarizeProcess));
                setPage(0);
                setMore(hasNextPage(loaded));
                setError(null);
            })
            .catch((exception: Error) => setError(exception.message))
            .finally(() => setLoading(false));
    }, [client]);

    useEffect(() => {
        fetchFirstPage();
    }, [fetchFirstPage]);

    const refresh = () => {
        setRefreshing(true);
        fetchFirstPage().finally(() => setRefreshing(false));
    };

    const loadMore = () => {
        if (!client || !more || loadingMore) {
            return;
        }
        setLoadingMore(true);
        client.myProcesses(page + 1, PAGE_SIZE)
            .then((loaded) => {
                const next = pageItems(loaded).map(summarizeProcess);
                setProcesses((current) => [...current, ...next.filter((item) => !current.some((known) => known.id === item.id))]);
                setPage(page + 1);
                setMore(hasNextPage(loaded));
            })
            .catch((exception: Error) => setError(exception.message))
            .finally(() => setLoadingMore(false));
    };

    if (loading) {
        return <ActivityIndicator style={styles.loader} color={colors.primary}/>;
    }

    return (
        <View style={styles.root}>
            {error ? (
                <View style={styles.banner}>
                    <Banner tone="danger" title="Nie udało się pobrać procesów" description={error} action={{label: "Ponów", onPress: refresh}}/>
                </View>
            ) : null}
            <FlatList
                data={processes}
                keyExtractor={(item) => item.id}
                renderItem={({item}) => <ProcessRow process={item}/>}
                contentContainerStyle={[styles.list, {paddingBottom: insets.bottom + spacing.lg}]}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary}/>}
                onEndReached={loadMore}
                onEndReachedThreshold={0.4}
                ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footer} color={colors.primary}/> : undefined}
                ListEmptyComponent={error ? undefined : (
                    <Text style={styles.empty}>Nie masz jeszcze żadnych operacji. Pojawią się tu po wysłaniu skanów.</Text>
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.background},
    loader: {flex: 1, backgroundColor: colors.background},
    banner: {paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md},
    list: {paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm},
    row: {
        flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md,
        borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    },
    pressed: {opacity: 0.85, transform: [{scale: 0.985}]},
    rowIcon: {
        width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surfaceRaised,
        alignItems: "center", justifyContent: "center",
    },
    rowText: {flex: 1, gap: 4},
    title: {color: colors.text, fontSize: 16, fontWeight: "700"},
    subtitle: {color: colors.textSecondary, fontSize: 14},
    pills: {flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: 2},
    time: {color: colors.textMuted, fontSize: 13},
    footer: {marginVertical: spacing.md},
    empty: {color: colors.textMuted, fontSize: 14, textAlign: "center", marginTop: spacing.xl},
});
