import assert from "node:assert/strict";
import test from "node:test";
import { ago, insertMention, matchHandles, mergeMessage, pieces, typingMention } from "./text";

test("time ago is short", () => {
  const now = Date.parse("2026-10-19T12:00:00Z");
  assert.equal(ago("2026-10-19T11:59:50Z", now), "now");
  assert.equal(ago("2026-10-19T11:30:00Z", now), "30m");
  assert.equal(ago("2026-10-19T09:00:00Z", now), "3h");
  assert.equal(ago("2026-10-17T12:00:00Z", now), "2d");
  assert.equal(ago(null, now), "");
});

test("message pieces mark known mentions, code and links only", () => {
  const handles = new Set(["manager", "mira"]);
  assert.deepEqual(pieces("@manager ask mira@example.com and @stranger `@tester` https://x.dev/a", handles), [
    { text: "@manager", mention: "manager" },
    { text: " ask mira@example.com and @stranger " },
    { text: "@tester", code: true },
    { text: " " },
    { text: "https://x.dev/a", link: "https://x.dev/a" },
  ]);
  assert.deepEqual(pieces("plain", handles), [{ text: "plain" }]);
});

test("the composer finds the @ being typed and inserts the chosen handle", () => {
  assert.deepEqual(typingMention("hi @man", 7), { start: 3, query: "man" });
  assert.equal(typingMention("mail mira@ex", 12), null);
  assert.deepEqual(typingMention("@", 1), { start: 0, query: "" });
  assert.deepEqual(insertMention("hi @man there", 3, 7, "manager"), { value: "hi @manager  there", cursor: 12 });
  const options = [
    { handle: "manager", label: "Manager" },
    { handle: "docs", label: "Docs writer" },
    { handle: "mira", label: "Mira" },
  ];
  assert.deepEqual(matchHandles(options, "m").map((row) => row.handle), ["manager", "mira"]);
  assert.deepEqual(matchHandles(options, "writer").map((row) => row.handle), ["docs"]);
});

test("messages merge by id or clientId, in seq order", () => {
  const list = [{ id: "a", seq: 1, clientId: null }, { id: "tmp", seq: 99, clientId: "c1" }];
  const merged = mergeMessage(list, { id: "b", seq: 2, clientId: "c1" });
  assert.deepEqual(merged.map((row) => row.id), ["a", "b"]);
  assert.deepEqual(mergeMessage(merged, { id: "a", seq: 1, clientId: null }).length, 2);
});
