import assert from "node:assert/strict";
import test from "node:test";
import { asksForIds, formatEntityText, messageRefs, readableBody, type EntityRef } from "./entity-text";

const APP = "https://app.example.test";
const BRIEF = "3f2a9c1e-7b44-4d2a-9a51-0c8f5e6d7b10";
const CALL = "8d1b2c3e-4f50-4a61-8b72-9c83d4e5f601";
const ROOM = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const UNKNOWN = "deadbeef-0000-4000-8000-000000000001";
const refs: EntityRef[] = [
  { kind: "task", id: BRIEF, label: "Draft brief" },
  { kind: "task", id: CALL, label: "Call Mira" },
  { kind: "room", id: ROOM, label: "Launch room" },
];

test("known ids become linked titles; record links show their label; unknown ids stay", () => {
  assert.equal(
    formatEntityText(`Added “Draft brief” (${BRIEF}) and ${CALL}; posted in ${ROOM}. Also ${UNKNOWN}.`, refs, { app: APP }),
    `Added “[Draft brief](${APP}/tasks/${BRIEF})” and [Call Mira](${APP}/tasks/${CALL}); posted in [Launch room](/r/${ROOM}). Also ${UNKNOWN}.`,
  );
  assert.equal(formatEntityText(`See [@Draft brief](ensemble://task/${BRIEF})`, [], { app: APP }), `See [Draft brief](${APP}/tasks/${BRIEF})`);
  assert.equal(formatEntityText(`Added 2 task(s): “A” (${UNKNOWN}); “B” (${UNKNOWN}).`, [], { plain: true }), "Added 2 task(s): “A”; “B”.", "an older receipt loses the ids beside its titles");
});

test("code, quotes, URLs and link targets keep their ids", () => {
  const text = [`Inline \`${BRIEF}\``, "```", BRIEF, "```", `> ${BRIEF}`, `${APP}/tasks/${BRIEF} and [web](https://x.dev/${BRIEF})`].join("\n");
  assert.equal(formatEntityText(text, refs, { app: APP }), text);
});

test("ids stay when someone asked for them", () => {
  assert.equal(asksForIds("what's the task id?"), true);
  assert.equal(asksForIds("I'd like that"), false);
  assert.equal(formatEntityText(`Draft brief is ${BRIEF}`, refs, { showIds: true, app: APP }), `Draft brief is ${BRIEF}`);
});

test("while streaming, a half-written known id or record link never shows", () => {
  assert.equal(formatEntityText(`Added “Draft brief” (${BRIEF.slice(0, 7)}`, refs, { streaming: true }), "Added “Draft brief”");
  assert.equal(formatEntityText(`See [@Call Mira](ensemble://task/${CALL.slice(0, 5)}`, refs, { streaming: true }), "See Call Mira");
  assert.equal(formatEntityText("A face", refs, { streaming: true }), "A face");
});

test("records that share a title stay apart, and a message's refs come from it and its tool chips", () => {
  const same: EntityRef[] = [
    { kind: "task", id: BRIEF, label: "Review", detail: "due 2026-11-02" },
    { kind: "task", id: CALL, label: "Review" },
  ];
  assert.equal(formatEntityText(`${BRIEF} then ${CALL}`, same, { plain: true }), "Review (due 2026-11-02) then Review (2)");
  assert.deepEqual(messageRefs({ refs: [refs[2]], tools: [{ refs: [refs[0]] }, { refs: [{ id: 1 }] }] }), [refs[2], refs[0]]);
});

test("previews, quotes and copies read a node's records by title and leave people's words alone", () => {
  const body = `Done: Added “Draft brief” (${BRIEF}).`;
  assert.equal(readableBody({ authorKind: "node", body, data: { tools: [{ refs: [refs[0]] }] } }), "Done: Added “Draft brief”.");
  assert.equal(readableBody({ authorKind: "human", body, data: {} }), body);
});

test("a record link right after its own title links that title once, never repeating it (plan briefs, §4.11)", () => {
  const brief = `implement ONLY Expire Needs Me requests when their task ends (ensemble://task/${BRIEF}), read its page. Ensure terminal tasks cannot leave actionable stale requests; push to testing.`;
  const clean = "implement ONLY Expire Needs Me requests when their task ends, read its page. Ensure terminal tasks cannot leave actionable stale requests; push to testing.";
  const linked = `implement ONLY [Expire Needs Me requests when their task ends](${APP}/tasks/${BRIEF}), read its page. Ensure terminal tasks cannot leave actionable stale requests; push to testing.`;
  // The task's label is its title, or its title with the start of its description.
  for (const label of ["Expire Needs Me requests when their task ends", "Expire Needs Me requests when their task ends. Ensure terminal tasks cannot leave actionable stale"]) {
    const known: EntityRef[] = [{ kind: "task", id: BRIEF, label }];
    assert.equal(formatEntityText(brief, known, { app: APP }), linked, label);
    assert.equal(formatEntityText(brief, known, { plain: true }), clean, label);
    assert.equal(formatEntityText(brief.replace(`ensemble://task/${BRIEF}`, BRIEF), known, { plain: true }), clean, `bare id, ${label}`);
    assert.equal(readableBody({ authorKind: "node", body: brief, data: { refs: known } }), clean, `copy, ${label}`);
  }
  // A quoted title keeps its quotes; other words before the link are not taken for the title.
  assert.equal(formatEntityText(`See “Draft brief” (ensemble://task/${BRIEF}).`, refs, { app: APP }), `See “[Draft brief](${APP}/tasks/${BRIEF})”.`);
  assert.equal(formatEntityText(`Read the brief (ensemble://task/${BRIEF}).`, refs, { plain: true }), "Read the brief (Draft brief).");
  assert.equal(formatEntityText(`Relaunch (ensemble://task/${BRIEF}).`, [{ kind: "task", id: BRIEF, label: "Launch" }], { plain: true }), "Relaunch (Launch).");
  // While streaming, the link is held back with its bracket until the bracket closes.
  assert.equal(formatEntityText(`Expire Needs Me requests when their task ends (ensemble://task/${BRIEF}`, [], { streaming: true }), "Expire Needs Me requests when their task ends");
});

test("a record link to a record the text does not name shows as its kind when asked", () => {
  const text = `Do the task (ensemble://task/${UNKNOWN}), then the page ensemble://page/${UNKNOWN}.`;
  assert.equal(formatEntityText(text, [], { app: APP }), text, "addresses stay by default");
  assert.equal(formatEntityText(text, [], { app: APP, kindLinks: true }), `Do the task ([task](${APP}/tasks/${UNKNOWN})), then the page [page](${APP}/pages/${UNKNOWN}).`);
});
