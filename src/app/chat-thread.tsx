import {Stack, useLocalSearchParams} from "expo-router";
import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {
    ActivityIndicator, AppState, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {useTerminal} from "../state/TerminalContext";
import {
    CHAT_MESSAGE_MAX_LENGTH,
    ChatMessage,
    createClientMessageId,
    formatChatTime,
    identifierValue,
    mapChatMessage,
    mergeChatMessages,
} from "../terminal/chat";
import {Banner, IconButton} from "../ui/components";
import {colors, radius, spacing} from "../ui/theme";

const POLL_INTERVAL_MS = 5000;

function MessageBubble({message, onRetry}: {message: ChatMessage; onRetry: (message: ChatMessage) => void}) {
    const failed = message.status === "FAILED";
    const meta = message.status === "SENDING" ? "Wysyłanie…" : failed ? "Nie wysłano · dotknij, aby ponowić" : formatChatTime(message.sentAt);
    return (
        <Pressable
            disabled={!failed}
            accessibilityRole={failed ? "button" : undefined}
            accessibilityLabel={failed ? `Ponów wysłanie: ${message.body}` : undefined}
            onPress={() => onRetry(message)}
            style={[styles.bubbleRow, message.outgoing ? styles.bubbleRowOutgoing : null]}
        >
            <View style={[
                styles.bubble,
                message.outgoing ? styles.bubbleOutgoing : styles.bubbleIncoming,
                failed && styles.bubbleFailed,
            ]}>
                <Text selectable style={[styles.body, message.outgoing && styles.bodyOutgoing]}>{message.body}</Text>
                <Text style={[styles.meta, message.outgoing && styles.metaOutgoing, failed && styles.metaFailed]}>{meta}</Text>
            </View>
        </Pressable>
    );
}

export default function ChatThreadScreen() {
    const insets = useSafeAreaInsets();
    const {userId, name} = useLocalSearchParams<{userId: string; name?: string}>();
    const {client, user} = useTerminal();
    const currentUserId = user ? identifierValue(user.userId) : "";
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [draft, setDraft] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const loadingRef = useRef(false);

    const refresh = useCallback((id: string) => {
        if (!client || loadingRef.current) {
            return Promise.resolve();
        }
        loadingRef.current = true;
        return client.chatMessages(id)
            .then((loaded) => {
                setMessages((current) => mergeChatMessages(current, loaded.map((message) => mapChatMessage(message, currentUserId))));
                setError(null);
            })
            .catch((exception: Error) => setError(exception.message))
            .finally(() => {
                loadingRef.current = false;
            });
    }, [client, currentUserId]);

    const openConversation = useCallback(() => {
        if (!client || !userId) {
            return;
        }
        client.openDirectConversation(userId)
            .then((conversation) => {
                const id = identifierValue(conversation.id);
                setConversationId(id);
                return refresh(id);
            })
            .catch((exception: Error) => setError(exception.message))
            .finally(() => setLoading(false));
    }, [client, userId, refresh]);

    useEffect(() => {
        openConversation();
    }, [openConversation]);

    const retry = () => {
        if (conversationId) {
            refresh(conversationId);
            return;
        }
        setLoading(true);
        setError(null);
        openConversation();
    };

    useEffect(() => {
        if (!conversationId) {
            return;
        }
        let timer: ReturnType<typeof setInterval> | null = null;
        const start = () => {
            if (!timer) {
                timer = setInterval(() => refresh(conversationId), POLL_INTERVAL_MS);
            }
        };
        const stop = () => {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
        };
        if (AppState.currentState === "active") {
            start();
        }
        const subscription = AppState.addEventListener("change", (state) => {
            if (state === "active") {
                refresh(conversationId);
                start();
            } else {
                stop();
            }
        });
        return () => {
            stop();
            subscription.remove();
        };
    }, [conversationId, refresh]);

    const deliver = useCallback(async (message: ChatMessage) => {
        if (!client || !conversationId) {
            return;
        }
        setMessages((current) => mergeChatMessages(current, [{...message, status: "SENDING"}]));
        try {
            const sent = await client.sendChatMessage(conversationId, message.clientMessageId, message.body);
            setMessages((current) => mergeChatMessages(current, [mapChatMessage(sent, currentUserId)]));
        } catch {
            setMessages((current) => mergeChatMessages(current, [{...message, status: "FAILED"}]));
        }
    }, [client, conversationId, currentUserId]);

    const send = () => {
        const body = draft.trim();
        if (!body) {
            return;
        }
        setDraft("");
        deliver({
            id: null,
            clientMessageId: createClientMessageId(),
            body,
            sentAt: new Date().toISOString(),
            outgoing: true,
            status: "SENDING",
        });
    };

    const newestFirst = useMemo(() => [...messages].reverse(), [messages]);
    const canSend = Boolean(conversationId && draft.trim());

    return (
        <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}
                              keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 44 : 0}>
            <Stack.Screen options={{title: name || "Rozmowa"}}/>
            {error ? (
                <View style={styles.banner}>
                    <Banner tone="danger" title={conversationId ? "Brak połączenia z czatem" : "Nie udało się otworzyć rozmowy"}
                            description={error}
                            action={{label: "Ponów", onPress: retry}}/>
                </View>
            ) : null}
            {loading ? (
                <ActivityIndicator style={styles.loader} color={colors.primary}/>
            ) : (
                <FlatList
                    inverted
                    data={newestFirst}
                    keyExtractor={(item) => item.clientMessageId}
                    renderItem={({item}) => <MessageBubble message={item} onRetry={deliver}/>}
                    contentContainerStyle={styles.messages}
                    keyboardShouldPersistTaps="handled"
                    ListEmptyComponent={conversationId ? (
                        <Text style={[styles.empty, styles.flipped]}>Napisz pierwszą wiadomość do {name || "tej osoby"}.</Text>
                    ) : undefined}
                />
            )}
            <View style={[styles.composer, {paddingBottom: Math.max(insets.bottom, spacing.md)}]}>
                <TextInput
                    accessibilityLabel="Treść wiadomości"
                    placeholder="Wiadomość"
                    placeholderTextColor={colors.textMuted}
                    value={draft}
                    onChangeText={setDraft}
                    maxLength={CHAT_MESSAGE_MAX_LENGTH}
                    multiline
                    editable={Boolean(conversationId)}
                    style={styles.input}
                />
                <IconButton icon="arrowRight" label="Wyślij" tone="primary" size={48} disabled={!canSend} onPress={send}/>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: {flex: 1, backgroundColor: colors.background},
    banner: {paddingHorizontal: spacing.lg, paddingBottom: spacing.sm},
    loader: {flex: 1},
    messages: {flexGrow: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm},
    bubbleRow: {flexDirection: "row", justifyContent: "flex-start"},
    bubbleRowOutgoing: {justifyContent: "flex-end"},
    bubble: {maxWidth: "82%", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg, gap: 4},
    bubbleIncoming: {backgroundColor: colors.surfaceRaised, borderBottomLeftRadius: radius.sm / 2},
    bubbleOutgoing: {backgroundColor: colors.primary, borderBottomRightRadius: radius.sm / 2},
    bubbleFailed: {backgroundColor: colors.dangerSurface, borderWidth: 1, borderColor: colors.danger},
    body: {color: colors.text, fontSize: 16, lineHeight: 22},
    bodyOutgoing: {color: colors.primaryText},
    meta: {color: colors.textMuted, fontSize: 11, alignSelf: "flex-end"},
    metaOutgoing: {color: colors.primaryText, opacity: 0.7},
    metaFailed: {color: colors.dangerText, opacity: 1},
    empty: {color: colors.textMuted, fontSize: 14, textAlign: "center", marginTop: spacing.xl},
    flipped: {transform: [{scaleY: -1}]},
    composer: {
        flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm,
        borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface,
    },
    input: {
        flex: 1, minHeight: 48, maxHeight: 140, paddingHorizontal: spacing.md, paddingTop: 13, paddingBottom: 13,
        borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background,
        color: colors.text, fontSize: 16,
    },
});
