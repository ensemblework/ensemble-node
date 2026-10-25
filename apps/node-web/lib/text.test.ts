import assert from "node:assert/strict";
import test from "node:test";
import { ago, insertMention, linkTarget, matchHandles, mergeMessage, modelLabel, pieces, typingMention } from "./text";

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

test("a model shows its name, version and relative credits when the server sends them", () => {
  assert.equal(modelLabel({ label: "GPT-6.1 Sol (2026-09-29)", relativeCost: 20 }), "GPT-6.1 Sol (2026-09-29) · 20× credits");
  assert.equal(modelLabel({ label: "GPT-5 mini (2025-08-07)" }), "GPT-5 mini (2025-08-07)");
});

test("Markdown links keep their label; rooms open here, Ensemble paths in Ensemble", () => {
  assert.deepEqual(pieces("See [Draft brief](https://app.example.test/tasks/1) in [Launch](/r/2).", new Set()), [
    { text: "See " },
    { text: "Draft brief", link: "https://app.example.test/tasks/1" },
    { text: " in " },
    { text: "Launch", link: "/r/2" },
    { text: "." },
  ]);
  assert.deepEqual(linkTarget("/r/2", "https://app.example.test"), { href: "/r/2", here: true });
  assert.deepEqual(linkTarget("/tasks/1", "https://app.example.test"), { href: "https://app.example.test/tasks/1", here: false });
  assert.deepEqual(linkTarget("https://x.dev", "https://app.example.test"), { href: "https://x.dev", here: false });
});
