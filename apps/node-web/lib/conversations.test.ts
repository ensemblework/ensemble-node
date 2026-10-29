import assert from "node:assert/strict";
import test from "node:test";
import type { Message, Room } from "./types";
import { optimisticMessage } from "./chat";
import { mergeConversationSnapshot, recentConversations, roomWithMessage } from "./conversations";

const room = (id: string, kind: Room["kind"], lastMessageAt: string | null, unread = 0): Room => ({
  id, kind, title: id, createdBy: "me", lastMessageAt, lastSeq: 10,
  members: [], leadNodeIds: [], pinned: [], invites: [], unread,
});
const message = (id: string, seq: number): Message => ({
  ...optimisticMessage("a", "me", { body: id, private: false, clientId: id }, new Date("2026-10-26T12:00:00Z")),
  id, seq, authorKind: "node", authorNodeId: "n", sending: false,
});

test("direct chats and groups sort together by latest interaction, without mutating the cached list", () => {
  const list = [room("old", "dm", "2026-10-25"), room("crew", "crew", "2026-10-26T12:00:00Z", 2), room("room", "room", "2026-10-26T13:00:00Z"), room("empty", "dm", null)];
  assert.deepEqual(recentConversations(list).map(row => row.id), ["room", "crew", "old", "empty"]);
  assert.equal(list[0]?.id, "old");
  assert.deepEqual(recentConversations(list, "groups").map(row => row.id), ["room", "crew"]);
  assert.deepEqual(recentConversations(list, "unread").map(row => row.id), ["crew"]);
  assert.deepEqual(recentConversations(list, "all", "CREW").map(row => row.id), ["crew"]);
  const withHelper = [...list, room("helper", "task", "2026-10-27T09:00:00Z", 3)];
  assert.deepEqual(recentConversations(withHelper).map(row => row.id), ["room", "crew", "old", "empty"], "a helper's room shows in its parent's chat, not the list");
  assert.deepEqual(recentConversations(withHelper, "unread").map(row => row.id), ["crew"]);
});

test("new messages update the preview and unread once; reactions and earlier edits never reorder or double-count", () => {
  const initial = room("a", "crew", "2026-10-25");
  const next = message("new", 11);
  const once = roomWithMessage(initial, next, "me");
  assert.equal(once.unread, 1);
  assert.equal(once.last?.body, "new");
  assert.equal(roomWithMessage(once, next, "me").unread, 1);
  assert.equal(roomWithMessage(once, message("older", 9), "me"), once);
  const edited = roomWithMessage(once, { ...next, data: { reactions: { "👍": ["me"] } } }, "me");
  assert.equal(edited.lastMessageAt, once.lastMessageAt);
  assert.equal(edited.unread, 1);
});

test("a plan step's card shows inside its plan card: no preview and no unread", () => {
  const initial = room("a", "crew", "2026-10-25");
  assert.equal(roomWithMessage(initial, { ...message("run", 11), kind: "run", planId: "plan-1" }, "me"), initial);
});

test("sending moves a chat immediately; confirmation replaces its pending preview without unread or duplicate ordering", () => {
  const initial = room("a", "dm", "2026-10-25");
  const local = optimisticMessage("a", "me", { body: "My draft", private: true, clientId: "c1" });
  const sending = roomWithMessage(initial, local, "me");
  assert.equal(sending.lastSeq, 10, "local sequence is never treated as a server sequence");
  assert.equal(sending.unread, 0);
  const confirmed = { ...local, id: "server", seq: 11, sending: false };
  const done = roomWithMessage(sending, confirmed, "me");
  assert.equal(done.last?.id, "server");
  assert.equal(done.last?.sending, false);
  assert.equal(done.unread, 0);
  assert.equal(done.lastSeq, 11);
});

test("a bootstrap refresh cannot restore an unread badge after reading or erase a newer unsent preview", () => {
  const old = room("a", "dm", "2026-10-25", 3);
  const read = { ...old, readSeq: 10, unread: 0 };
  assert.equal(mergeConversationSnapshot([read], [old])[0]?.unread, 0);
  const local = optimisticMessage("a", "me", { body: "Draft", private: true, clientId: "pending" });
  const pending = roomWithMessage(read, local, "me");
  assert.equal(mergeConversationSnapshot([pending], [old])[0]?.last?.body, "Draft");
  const live = roomWithMessage(read, message("New reply", 11), "me");
  assert.equal(mergeConversationSnapshot([live], [old])[0]?.last?.body, "New reply");
  assert.equal(mergeConversationSnapshot([live], [old])[0]?.unread, 1);
});
