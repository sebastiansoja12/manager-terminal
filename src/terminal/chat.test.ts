import assert from "node:assert/strict";
import {test} from "node:test";
import {
    chatDirectory,
    chatInitials,
    createClientMessageId,
    filterChatUsers,
    identifierValue,
    mapChatMessage,
    mergeChatMessages,
} from "./chat.ts";
import type {ChatMessage, ChatUserApi} from "./chat.ts";

const users: ChatUserApi[] = [
    {userId: {value: 1}, username: "me", firstName: "Jan", lastName: "Kurier", departmentCode: "KT1"},
    {userId: {value: 2}, username: "zofia", firstName: "Zofia", lastName: "Nowak", departmentCode: "WA1"},
    {userId: {value: 3}, username: "adam", firstName: "Adam", lastName: "Wiśniewski", departmentCode: "KT1"},
    {userId: {value: 4}, username: "old", firstName: "Stary", lastName: "Użytkownik", departmentCode: "KT1", deleted: true},
    {userId: 5, username: "dispatch", departmentCode: "KT1", role: "MANAGER"},
];

const message = (clientMessageId: string, sentAt: string, status: ChatMessage["status"] = "SENT"): ChatMessage => ({
    id: status === "SENT" ? clientMessageId : null,
    clientMessageId,
    body: clientMessageId,
    sentAt,
    outgoing: true,
    status,
});

test("reads wrapped and plain identifiers", () => {
    assert.equal(identifierValue({value: 42}), "42");
    assert.equal(identifierValue("123456789012345678"), "123456789012345678");
    assert.equal(identifierValue(7), "7");
});

test("directory skips current and deleted users and lists own department first", () => {
    const directory = chatDirectory(users, "1", "KT1");
    assert.deepEqual(directory.map((user) => user.id), ["3", "5", "2"]);
    assert.equal(directory[1].name, "dispatch");
});

test("filters directory by name, login and department", () => {
    const directory = chatDirectory(users, "1", "KT1");
    assert.deepEqual(filterChatUsers(directory, "nowak").map((user) => user.id), ["2"]);
    assert.deepEqual(filterChatUsers(directory, "DISP").map((user) => user.id), ["5"]);
    assert.deepEqual(filterChatUsers(directory, "wa1").map((user) => user.id), ["2"]);
    assert.equal(filterChatUsers(directory, "  ").length, 3);
});

test("builds initials from the display name", () => {
    assert.equal(chatInitials("Adam Wiśniewski"), "AW");
    assert.equal(chatInitials("dispatch"), "D");
    assert.equal(chatInitials(""), "?");
});

test("marks messages sent by the current user as outgoing", () => {
    const api = {id: "9", conversationId: "1", senderUserId: {value: 1}, clientMessageId: "c-1", body: "Hej", sentAt: "2026-10-23T08:00:00Z"};
    assert.equal(mapChatMessage(api, "1").outgoing, true);
    assert.equal(mapChatMessage(api, "2").outgoing, false);
});

test("merge replaces local copies and orders messages by send time", () => {
    const merged = mergeChatMessages(
        [message("b", "2026-10-23T08:02:00Z", "SENDING"), message("a", "2026-10-23T08:01:00Z")],
        [message("b", "2026-10-23T08:02:01Z"), message("c", "2026-10-23T08:00:00Z")],
    );
    assert.deepEqual(merged.map((entry) => entry.clientMessageId), ["c", "a", "b"]);
    assert.equal(merged[2].status, "SENT");
});

test("creates UUID v4 client message identifiers", () => {
    const id = createClientMessageId();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.notEqual(id, createClientMessageId());
});
