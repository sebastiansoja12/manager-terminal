export type ApiIdentifier = number | string | {value: number | string};

export type ChatUserApi = {
    userId: ApiIdentifier;
    username: string;
    firstName?: string | null;
    lastName?: string | null;
    role?: string | null;
    departmentCode?: string | null;
    deleted?: boolean | null;
};

export type ChatConversationApi = {
    id: ApiIdentifier;
    participantUserId: ApiIdentifier;
    createdAt: string;
    lastMessageAt?: string | null;
};

export type ChatMessageApi = {
    id: ApiIdentifier;
    conversationId: ApiIdentifier;
    senderUserId: ApiIdentifier;
    clientMessageId: string;
    body: string;
    sentAt: string;
};

export type ChatUser = {
    id: string;
    username: string;
    name: string;
    role: string | null;
    departmentCode: string | null;
};

export type ChatMessageStatus = "SENT" | "SENDING" | "FAILED";

export type ChatMessage = {
    id: string | null;
    clientMessageId: string;
    body: string;
    sentAt: string;
    outgoing: boolean;
    status: ChatMessageStatus;
};

export const CHAT_MESSAGE_MAX_LENGTH = 2000;

export const identifierValue = (identifier: ApiIdentifier): string =>
    String(typeof identifier === "object" ? identifier.value : identifier);

export const chatUserName = (user: Pick<ChatUserApi, "firstName" | "lastName" | "username">) =>
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.username;

export const chatInitials = (name: string) => name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?";

// Active colleagues without the current operator: own department first, then alphabetically.
export const chatDirectory = (users: ChatUserApi[], currentUserId: string, departmentCode: string | null): ChatUser[] => users
    .filter((user) => !user.deleted && identifierValue(user.userId) !== currentUserId)
    .map((user) => ({
        id: identifierValue(user.userId),
        username: user.username,
        name: chatUserName(user),
        role: user.role || null,
        departmentCode: user.departmentCode || null,
    }))
    .sort((left, right) => {
        const leftOwn = departmentCode !== null && left.departmentCode === departmentCode;
        const rightOwn = departmentCode !== null && right.departmentCode === departmentCode;
        if (leftOwn !== rightOwn) {
            return leftOwn ? -1 : 1;
        }
        return left.name.localeCompare(right.name, "pl");
    });

export const filterChatUsers = (users: ChatUser[], query: string) => {
    const needle = query.trim().toLocaleLowerCase("pl");
    if (!needle) {
        return users;
    }
    return users.filter((user) => [user.name, user.username, user.departmentCode || ""]
        .some((value) => value.toLocaleLowerCase("pl").includes(needle)));
};

export const mapChatMessage = (message: ChatMessageApi, currentUserId: string): ChatMessage => ({
    id: identifierValue(message.id),
    clientMessageId: message.clientMessageId,
    body: message.body,
    sentAt: message.sentAt,
    outgoing: identifierValue(message.senderUserId) === currentUserId,
    status: "SENT",
});

// Server messages replace local copies with the same clientMessageId; the result is ordered by send time,
// because message identifiers are random and say nothing about order.
export const mergeChatMessages = (current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] => {
    const byClientId = new Map<string, ChatMessage>();
    for (const message of current) {
        byClientId.set(message.clientMessageId, message);
    }
    for (const message of incoming) {
        byClientId.set(message.clientMessageId, message);
    }
    return [...byClientId.values()].sort((left, right) => left.sentAt.localeCompare(right.sentAt));
};

export const createClientMessageId = (random: () => number = Math.random) => {
    const hex = Array.from({length: 32}, () => Math.floor(random() * 16).toString(16));
    hex[12] = "4";
    hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
    const value = hex.join("");
    return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
};

const sameDay = (left: Date, right: Date) => left.toDateString() === right.toDateString();

export const formatChatTime = (iso: string, now: Date = new Date()) => {
    const date = new Date(iso);
    const time = date.toLocaleTimeString("pl-PL", {hour: "2-digit", minute: "2-digit"});
    return sameDay(date, now) ? time : `${date.toLocaleDateString("pl-PL", {day: "numeric", month: "short"})}, ${time}`;
};
