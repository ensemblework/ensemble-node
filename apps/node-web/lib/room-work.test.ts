import assert from "node:assert/strict";
import test from "node:test";
import { boardGroups, canStartTask, contractChanges, decisionMeta, digestSections, digestTitle, dueWords, eventSubjects, modeWords, offerOpen, offerState, pageRole, priorityWord, resultState, spaceLine, startable, taskPeople, taskStatus, waitsForMe } from "./room-work";
import type { BoardTask } from "./types";

const task = (id: string, status: string, extra: Partial<BoardTask> = {}): BoardTask => ({ id, title: id, status, priority: null, due: null, assignee: null, requestedBy: null, peerRequestId: null, madeBy: null, updatedAt: "2026-10-30T10:00:00Z", ...extra });

test("the room's space says whose it is and what I am there; its offer what I said", () => {
  const view = { space: { id: "s1", name: "Launch space", ownerId: "mira", ownerName: "Mira", role: "editor" as const }, offer: null };
  assert.equal(spaceLine(view, "ben"), "Its work lives in Mira's space “Launch space”. You are an editor there.");
  assert.equal(spaceLine({ ...view, space: { ...view.space, role: "owner" } }, "mira"), "Its work lives in your space “Launch space”. It is yours.");
  assert.equal(spaceLine({ ...view, space: { ...view.space, role: null } }, "ana"), "Its work lives in Mira's space “Launch space”. You are not in it.");
  assert.equal(spaceLine({ space: null, offer: null }, "ana"), null);
  assert.deepEqual(offerState("pending"), { label: "Waiting for you", tone: "warn" });
  assert.deepEqual(offerState("joined"), { label: "Joined", tone: "ok" });
  assert.equal(offerState("declined").label, "Not now");
  assert.equal(offerState("expired").label, "Ended");
  assert.deepEqual([offerOpen("pending"), offerOpen("declined"), offerOpen("joined"), offerOpen("expired")], [true, true, false, false], "not now can still become join");
});

test("the board shows proposed tasks first, then by status; empty groups go", () => {
  const groups = boardGroups([task("a", "todo"), task("b", "proposed"), task("c", "done"), task("d", "in_progress"), task("e", "blocked"), task("f", "waiting_approval"), task("g", "someday")]);
  assert.deepEqual(groups.map((group) => [group.id, group.tasks.map((row) => row.id)]), [["proposed", ["b"]], ["in_progress", ["d"]], ["waiting", ["e", "f"]], ["todo", ["a"]], ["other", ["g"]], ["done", ["c"]]]);
  assert.deepEqual(boardGroups([]), []);
  assert.deepEqual(taskStatus("in_progress"), { label: "In progress", tone: "accent" });
  assert.equal(taskStatus("weird_one").label, "weird one");
  assert.deepEqual(priorityWord("p0"), { label: "High", tone: "warn" });
  assert.equal(priorityWord("p1"), null, "medium is the usual and says nothing");
  assert.equal(priorityWord("critical")?.label, "Critical");
});

test("a task says who it is with, who asked for it and which node made it for whom", () => {
  const handleOf = (id: string) => (id === "n-lead" ? "ben-lead" : null);
  assert.deepEqual(taskPeople({ assignee: { accountId: "me", name: "Mira" }, requestedBy: { accountId: "ben", name: "Ben", node: { id: "n-lead", name: "Lead" } }, madeBy: null }, "me", handleOf), ["with you", "asked by Ben through @ben-lead"]);
  assert.deepEqual(taskPeople({ assignee: { accountId: "ana", name: "Ana" }, requestedBy: { accountId: "me", name: "Mira", node: null }, madeBy: { node: { id: "n-steward", name: "Steward" }, for: { accountId: "me", name: "Mira" } } }, "me", handleOf), ["with Ana", "asked by you", "Steward for you"]);
  assert.deepEqual(taskPeople({ assignee: null, requestedBy: null, madeBy: null }, "me"), ["nobody's yet"]);
  assert.equal(waitsForMe(task("p", "proposed", { assignee: { accountId: "me", name: "Mira" }, peerRequestId: "r1" }), "me"), true, "decided on my lead's card");
  assert.equal(canStartTask(task("p", "proposed", { assignee: { accountId: "me", name: "Mira" }, peerRequestId: "r1" }), "me"), false, "a request is accepted, not started");
  assert.equal(canStartTask(task("s", "proposed", { assignee: { accountId: "me", name: "Mira" } }), "me"), true, "a steward's proposal is started");
  assert.equal(canStartTask(task("t", "in_progress", { assignee: { accountId: "me", name: "Mira" } }), "me"), false);
  assert.equal(canStartTask(task("u", "todo", { assignee: { accountId: "ben", name: "Ben" } }), "me"), false, "only the person it is with");
});

test("a due date reads as today, a day, or overdue", () => {
  const now = Date.parse("2026-11-02T10:00:00Z");
  assert.deepEqual(dueWords("2026-11-02T18:00:00Z", now, "UTC"), { text: "Due today", late: false });
  assert.deepEqual(dueWords("2026-11-05T00:00:00Z", now, "UTC"), { text: "Due 5 Nov", late: false });
  assert.deepEqual(dueWords("2026-10-30T00:00:00Z", now, "UTC"), { text: "Overdue since 30 Oct", late: true });
  assert.equal(dueWords(null, now), null);
});

test("work starts privately with a shared result, or as a shared run; pages have roles; results say how they ended", () => {
  assert.equal(modeWords("private"), "Private work, shared result");
  assert.equal(modeWords("shared"), "Shared run");
  assert.equal(modeWords(null), null);
  assert.equal(pageRole("contract"), "Contract");
  assert.equal(pageRole("decisions"), "Decisions log");
  assert.deepEqual(resultState("succeeded"), { label: "Done", tone: "ok" });
  assert.deepEqual(resultState("succeeded", "fail"), { label: "Fail", tone: "danger" }, "a review's verdict first");
  assert.equal(resultState("partially_completed").label, "Partly done");
  assert.equal(resultState("weird_end").label, "weird end");
});

test("the lead's note links what it is about, shows a contract's change and offers what to start", () => {
  const items = [
    { kind: "assigned", subjectKind: "task", subjectId: "t1", title: "CSV export", spaceId: "s1" },
    { kind: "status", subjectKind: "task", subjectId: "t1", title: "CSV export", spaceId: "s1", from: "todo", to: "in_progress" },
    { kind: "mention", subjectKind: "comment", subjectId: "c1", title: "API notes", spaceId: "s1", pageKind: "page", pageId: "p1", excerpt: "@mira can you check" },
    { kind: "mention", subjectKind: "message", subjectId: "m9", title: "Launch", spaceId: null, seq: 12 },
    { kind: "contract_changed", subjectKind: "page", subjectId: "p2", title: "API contract", spaceId: "s1", diff: { added: ["GET /v2/export"], removed: ["GET /export", ""] }, tasks: [{ taskId: "t1", title: "CSV export" }, { bad: true }] },
  ];
  assert.deepEqual(eventSubjects(items), [
    { kind: "task", id: "t1", title: "CSV export", spaceId: "s1" },
    { kind: "page", id: "p1", title: "API notes", spaceId: "s1" },
    { kind: "message", id: "m9", title: "Launch", spaceId: null },
    { kind: "page", id: "p2", title: "API contract", spaceId: "s1" },
  ]);
  assert.deepEqual(contractChanges(items), [{ title: "API contract", added: ["GET /v2/export"], removed: ["GET /export"], tasks: [{ taskId: "t1", title: "CSV export" }] }]);
  assert.deepEqual(startable({ start: { taskIds: ["t1", "t1", "t7"] }, items }), [{ taskId: "t1", title: "CSV export" }, { taskId: "t7", title: "This task" }]);
  assert.deepEqual(startable(null), []);
});

test("a catch-up digest lists what needs me first, and says why it came", () => {
  const sections = digestSections({
    asked: [{ requestId: "r1", kind: "work", from: { name: "Ben" }, text: "Add the CSV export", status: "awaiting_owner" }],
    proposed: [{ taskId: "t2", title: "Fix the date filter", requestedBy: "Ana" }],
    events: [{}, {}],
    board: [{ taskId: "t3", title: "Landing copy", status: "done" }],
    results: [{ messageId: "m4", text: "Invoice download is ready." }],
    decisions: [{ messageId: "m5", text: "Ship on Friday" }],
    room: { messages: 3, from: ["Ben", "Ana"] },
  });
  assert.deepEqual(sections.map((section) => section.id), ["asked", "proposed", "events", "board", "results", "decisions", "room"]);
  assert.deepEqual(sections[0]!.rows, [{ text: "Ben asked for work: “Add the CSV export” (waiting for you)", requestId: "r1" }]);
  assert.equal(sections[1]!.rows[0]!.text, "“Fix the date filter”, asked by Ana");
  assert.equal(sections[2]!.rows[0]!.text, "2 changes on the room's board and pages");
  assert.equal(sections[3]!.rows[0]!.text, "“Landing copy” is done");
  assert.equal(sections[6]!.rows[0]!.text, "3 messages from Ben and Ana");
  assert.deepEqual(digestSections({}), []);
  assert.equal(digestTitle("back"), "While you were away");
  assert.equal(digestTitle("gap"), "Since you were last here");
});

test("a logged decision says who said it and who confirmed it", () => {
  const ben = { accountId: "ben", name: "Ben" };
  const me = { accountId: "me", name: "Mira" };
  assert.equal(decisionMeta({ saidBy: ben, loggedBy: me, replaced: false, supersedesId: null }, "me"), "Ben said it, you logged it");
  assert.equal(decisionMeta({ saidBy: me, loggedBy: me, replaced: true, supersedesId: "d0" }, "me"), "You said and logged it · replaces an earlier one · replaced since");
});
