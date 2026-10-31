import assert from "node:assert/strict";
import test from "node:test";
import {
  canDelete,
  canPin,
  dayLabel,
  firstUnread,
  highlightParts,
  inTimeline,
  keepOlder,
  matchesAuthor,
  mentionsMe,
  messagePreview,
  optimisticMessage,
  plainPreview,
  reactionRows,
  resendInput,
  sendBody,
  snippet,
  takeEmails,
  toggleReaction,
} from "./chat";

test("view filters match what the server sends for people and nodes", () => {
  assert.equal(matchesAuthor({ authorKind: "system" }, "people"), true);
  assert.equal(matchesAuthor({ authorKind: "node" }, "people"), false);
  assert.equal(matchesAuthor({ authorKind: "node" }, "nodes"), true);
  assert.equal(matchesAuthor({ authorKind: "human" }, "nodes"), false);
  assert.equal(mentionsMe({ mentions: [{ kind: "node", id: "me" }, { kind: "human", id: "me" }] }, "me"), true);
  assert.equal(mentionsMe({ mentions: [{ kind: "node", id: "me" }] }, "me"), false);
});

test("reactions toggle mine and list who reacted in the room's order", () => {
  const once = toggleReaction({ "👍": ["ben"] }, "👍", "me");
  assert.deepEqual(once, { "👍": ["ben", "me"] });
  assert.deepEqual(toggleReaction(toggleReaction({}, "🔥", "me"), "🔥", "me"), {});
  const rows = reactionRows({ "🔥": ["ben"], "👍": ["ben", "me"] }, ["👍", "❤️", "🔥"], "me", (id) => (id === "ben" ? "Ben" : "?"));
  assert.deepEqual(rows, [
    { emoji: "👍", count: 2, mine: true, names: "You, Ben" },
    { emoji: "🔥", count: 1, mine: false, names: "Ben" },
  ]);
});

test("days read as Today, Yesterday or a date", () => {
  const now = Date.parse("2026-10-23T12:00:00");
  assert.equal(dayLabel("2026-10-23T08:00:00", now), "Today");
  assert.equal(dayLabel("2026-10-22T23:00:00", now), "Yesterday");
  assert.match(dayLabel("2026-10-19T10:00:00", now), /19 October/);
  assert.match(dayLabel("2025-12-01T10:00:00", now), /2025/);
});

test("the New divider starts at the first unread message someone else wrote", () => {
  const list = [
    { id: "a", seq: 4, authorKind: "human" as const, authorAccountId: "me", kind: "text" as const },
    { id: "b", seq: 5, authorKind: "human" as const, authorAccountId: "me", kind: "text" as const },
    { id: "c", seq: 6, authorKind: "system" as const, authorAccountId: "me", kind: "status" as const },
    { id: "d", seq: 7, authorKind: "node" as const, authorAccountId: "me", kind: "text" as const },
  ];
  assert.equal(firstUnread(list, 4, "me"), "d");
  assert.equal(firstUnread(list, 7, "me"), null);
});

test("only public text and run cards pin; only my own text deletes", () => {
  const base = { id: "m1", kind: "text" as const, private: false, data: {}, authorKind: "human" as const, authorAccountId: "me" };
  assert.equal(canPin(base), true);
  assert.equal(canPin({ ...base, private: true }), false);
  assert.equal(canPin({ ...base, data: { deleted: true } }), false);
  assert.equal(canPin({ ...base, kind: "approval" }), false);
  assert.equal(canPin({ ...base, id: "local-1" }), false);
  assert.equal(canDelete(base, "me"), true);
  assert.equal(canDelete(base, "ben"), false);
  assert.equal(canDelete({ ...base, authorKind: "node" }, "me"), false);
});

test("search results highlight every word and cut around the first hit", () => {
  assert.deepEqual(highlightParts("Ship the login page", "login ship"), [
    { text: "Ship", hit: true },
    { text: " the ", hit: false },
    { text: "login", hit: true },
    { text: " page", hit: false },
  ]);
  assert.deepEqual(highlightParts("a+b", "a+"), [{ text: "a+", hit: true }, { text: "b", hit: false }]);
  const long = `${"x ".repeat(100)}needle ${"y ".repeat(100)}`;
  const cut = snippet(long, "needle", 10);
  assert.ok(cut.startsWith("…") && cut.endsWith("…") && cut.includes("needle"));
});

test("emails come out of what was typed or pasted", () => {
  assert.deepEqual(takeEmails("Ben@x.dev, asha@y.dev; kofi"), { emails: ["ben@x.dev", "asha@y.dev"], rest: "kofi" });
  assert.deepEqual(takeEmails("ben@x.dev ben@x.dev", true), { emails: ["ben@x.dev"], rest: "" });
  assert.deepEqual(takeEmails("ben@x.dev"), { emails: [], rest: "ben@x.dev" });
});

test("a refetch keeps earlier pages and messages still on their way", () => {
  type Row = { id: string; seq: number; clientId: string | null; sending?: boolean };
  const current: Row[] = [
    { id: "old", seq: 1, clientId: null },
    { id: "mid", seq: 3, clientId: null },
    { id: "local-c9", seq: Number.MAX_SAFE_INTEGER, clientId: "c9", sending: true },
  ];
  const fresh: Row[] = [{ id: "mid", seq: 3, clientId: null }, { id: "new", seq: 4, clientId: null }];
  assert.deepEqual(keepOlder(current, fresh, 2).map((row) => row.id), ["old", "mid", "new", "local-c9"]);
  // A short page is the whole room: nothing older to keep.
  assert.deepEqual(keepOlder(current, fresh, 50).map((row) => row.id), ["mid", "new", "local-c9"]);
  // The sent message arrived: its local copy goes.
  assert.deepEqual(keepOlder(current, [...fresh, { id: "sent", seq: 5, clientId: "c9" }], 50).map((row) => row.id), ["mid", "new", "sent"]);
});

test("previews drop Markdown marks and line breaks", () => {
  assert.equal(plainPreview("You have **3 tasks**:\n1. Review `api.ts`\n- ship\n```\npnpm test\n```\n> done"), "You have 3 tasks: Review api.ts ship done");
});

test("a message sends its files by id, and shows them while it is on its way", () => {
  const files = [{ id: "f1", name: "plan.pdf", kind: "pdf", size: 2048 }, { id: "f2", name: "shot.png", kind: "image", size: 900 }];
  const replyTo = { id: "m0", seq: 3, authorKind: "node" as const, handle: "manager", excerpt: "Plan?" };
  assert.deepEqual(sendBody({ body: "", private: true, clientId: "c1", replyTo, files }), { body: "", private: true, clientId: "c1", replyToId: "m0", files: ["f1", "f2"] });
  assert.deepEqual(sendBody({ body: "hi", private: false, clientId: "c2", files: [] }), { body: "hi", private: false, clientId: "c2" }, "no files: no files field");
  const shown = optimisticMessage("r1", "me", { body: "", private: false, clientId: "c1", files });
  assert.equal(shown.id, "local-c1");
  assert.equal(shown.sending, true);
  assert.deepEqual(shown.data.files, files);
});

test("retrying a failed message sends the same words, files and clientId", () => {
  const files = [{ id: "f1", name: "plan.pdf", kind: "pdf", size: 2048 }];
  const replyTo = { id: "m0", seq: 3, authorKind: "human" as const, handle: "ben", excerpt: "Look" };
  const failed = { ...optimisticMessage("r1", "me", { body: "See this", private: true, clientId: "c1", replyTo, files }), sending: false, failed: "Ensemble cannot be reached." };
  const again = resendInput(failed);
  assert.deepEqual(again, { body: "See this", private: true, clientId: "c1", replyTo, files });
  assert.deepEqual(sendBody(again).files, ["f1"], "the files go by id again, nothing is uploaded");
});

test("a message with only files previews as its files", () => {
  const file = { id: "f1", name: "plan.pdf", kind: "pdf", size: 2048 };
  assert.equal(messagePreview({ authorKind: "human", body: "", data: { files: [file] } }), "📎 plan.pdf");
  assert.equal(messagePreview({ authorKind: "human", body: "", data: { files: [file, { ...file, id: "f2" }] } }), "📎 2 files");
  assert.equal(messagePreview({ authorKind: "human", body: "**Look**", data: { files: [file] } }), "Look");
  assert.equal(messagePreview({ authorKind: "human", body: "", data: { files: [file], deleted: true } }), "Message deleted");
  const media = [{ evidenceId: "e1", kind: "video", name: "demo.mp4", mime: "video/mp4" }, { evidenceId: "e2", kind: "screenshot", name: "a.png", mime: "image/png" }];
  assert.equal(messagePreview({ authorKind: "node", body: "", data: { media } }), "📎 1 picture, 1 video", "a node's media without words");
  assert.equal(messagePreview({ authorKind: "node", body: "", data: { media: [{ evidenceId: "z", kind: "file", name: "site.zip", mime: "application/zip" }] } }), "📎 site.zip", "one file by its name");
  assert.equal(messagePreview({ authorKind: "human", body: "", data: { media } }), "", "only a node's message carries media");
});

test("a plan step's run card shows in its plan, but a question to its owner always shows in the chat", () => {
  assert.equal(inTimeline({ planId: null, kind: "text" }), true);
  assert.equal(inTimeline({ planId: "plan-1", kind: "run" }), false);
  assert.equal(inTimeline({ planId: "plan-1", kind: "approval" }), true);
  assert.equal(inTimeline({ kind: "plan" }), true);
});
