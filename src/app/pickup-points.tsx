import {router, useLocalSearchParams} from "expo-router";
import React, {useCallback, useEffect, useState} from "react";
import {ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {ApiError} from "../api/client";
import {useTerminal} from "../state/TerminalContext";
import {
    PICKUP_POINT_TYPE_LABELS,
    PickupPoint,
    pickupPointAddress,
    pickupPointId,
    pickupPointState,
} from "../terminal/pickupPoints";
import {Banner, Chip, Field, Pill} from "../ui/components";
import {Icon} from "../ui/Icon";
import {colors, radius, spacing} from "../ui/theme";

const describeError = (error: Error) => (error instanceof ApiError && error.status === 403
    ? "Twoje konto nie ma uprawnień do odczytu punktów odbioru. Poproś administratora o dostęp."
    : error.message);

function PointRow({point}: {point: PickupPoint}) {
    const state = pickupPointState(point);
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${point.name}, ${pickupPointAddress(point)}`}
            onPress={() => router.push({pathname: "/pickup-point", params: {pickupPointId: pickupPointId(point), name: point.name}})}
            style={({pressed}) => [styles.row, pressed && styles.pressed]}
        >
            <View style={styles.rowIcon}>
                <Icon name={point.type === "PARCEL_LOCKER" ? "package" : "mapPin"} size={22} color={colors.primary}/>
            </View>
            <View style={styles.rowText}>
                <Text style={styles.name} numberOfLines={1}>{point.name}</Text>
                <Text style={styles.address} numberOfLines={2}>{pickupPointAddress(point)}</Text>
                <View style={styles.rowPills}>
                    <Pill label={PICKUP_POINT_TYPE_LABELS[point.type]}/>
                    <Pill tone={state.tone} dot label={state.label}/>
                </View>
            </View>
            <Icon name="chevronRight" size={20} color={colors.textMuted}/>
        </Pressable>
    );
}

export default function PickupPointsScreen() {
    const insets = useSafeAreaInsets();
    const {client} = useTerminal();
    const params = useLocalSearchParams<{query?: string}>();
    const [query, setQuery] = useState(params.query || "");
    const [submittedQuery, setSubmittedQuery] = useState(params.query || "");
    const [collectionOnly, setCollectionOnly] = useState(true);
    const [points, setPoints] = useState<PickupPoint[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchPoints = useCallback(() => {
        if (!client) {
            return Promise.resolve();
        }
        return client.pickupPoints(submittedQuery, collectionOnly)
            .then((page) => {
                setPoints(page.items);
                setTotal(page.totalElements);
                setError(null);
            })
            .catch((exception: Error) => setError(describeError(exception)))
            .finally(() => setLoading(false));
    }, [client, submittedQuery, collectionOnly]);

    useEffect(() => {
        fetchPoints();
    }, [fetchPoints]);

    const search = () => {
        setLoading(true);
        setSubmittedQuery(query.trim());
    };

    const toggleCollection = () => {
        setLoading(true);
        setCollectionOnly((current) => !current);
    };

    const refresh = () => {
        setRefreshing(true);
        fetchPoints().finally(() => setRefreshing(false));
    };

    return (
        <View style={styles.root}>
            <View style={styles.filters}>
                <Field label="Szukaj punktu" hideLabel icon="search" placeholder="Miasto, kod pocztowy, ulica lub nazwa"
                       value={query} onChangeText={setQuery} onSubmitEditing={search} returnKeyType="search"/>
                <View style={styles.chips}>
                    <Chip label="Tylko z odbiorem paczek" icon="check" selected={collectionOnly} onPress={toggleCollection}/>
                </View>
            </View>
            {error ? (
                <View style={styles.banner}>
                    <Banner tone="danger" title="Nie udało się pobrać punktów odbioru" description={error}
                            action={{label: "Ponów", onPress: refresh}}/>
                </View>
            ) : null}
            {loading ? (
                <ActivityIndicator style={styles.loader} color={colors.primary}/>
            ) : (
                <FlatList
                    data={points}
                    keyExtractor={pickupPointId}
                    renderItem={({item}) => <PointRow point={item}/>}
                    contentContainerStyle={[styles.list, {paddingBottom: insets.bottom + spacing.lg}]}
                    keyboardShouldPersistTaps="handled"
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary}/>}
                    ListHeaderComponent={points.length && total > points.length ? (
                        <Text style={styles.more}>Pokazano {points.length} z {total}. Zawęź wyszukiwanie, aby zobaczyć resztę.</Text>
                    ) : undefined}
                    ListEmptyComponent={error ? undefined : (
                        <Text style={styles.empty}>
                            {submittedQuery ? `Brak aktywnych punktów dla „${submittedQuery}”.` : "Brak aktywnych punktów odbioru."}
                        </Text>
                    )}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.background},
    filters: {paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.sm},
    chips: {flexDirection: "row", flexWrap: "wrap", gap: spacing.sm},
    banner: {paddingHorizontal: spacing.lg, paddingBottom: spacing.md},
    loader: {marginTop: spacing.xxl},
    list: {paddingHorizontal: spacing.lg, gap: spacing.sm},
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
    name: {color: colors.text, fontSize: 16, fontWeight: "700"},
    address: {color: colors.textSecondary, fontSize: 14},
    rowPills: {flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: 2},
    more: {color: colors.textMuted, fontSize: 13, marginBottom: spacing.xs},
    empty: {color: colors.textMuted, fontSize: 14, textAlign: "center", marginTop: spacing.xl},
});
