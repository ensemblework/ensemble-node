import assert from "node:assert/strict";
import test from "node:test";
import { messageTask, workBoard } from "./work";
import type { Message } from "./types";

const message = (id: string, seq: number, extra: Partial<Message>): Message => ({
  id,
  roomId: "room",
  seq,
  authorKind: "node",
  authorAccountId: "me",
  authorNodeId: "lead",
  kind: "text",
  body: "",
  data: {},
  private: false,
  mentions: [],
  rootMessageId: null,
  clientId: null,
  createdAt: "2026-10-29T10:00:00Z",
  ...extra,
});
const step = (id: string, extra: Record<string, unknown> = {}) => ({ id, nodeId: id, handle: id, name: id, brief: `Do ${id}. Then more.`, after: [], status: "waiting", result: null, progress: null, startedAt: null, endedAt: null, ...extra });
const owners: Record<string, string> = { lead: "me", builder: "me", theirs: "ben" };
const ownerOf = (id: string | null) => (id ? owners[id] : null);

test("the work board lists my live plans, work and sessions, newest first, from what is loaded", () => {
  const messages = [
    message("plan", 1, { kind: "plan", body: "Plan", data: { type: "plan", leadNodeId: "lead", leadHandle: "lead", status: "running", goal: "Ship the login page", steps: [step("a", { status: "done" }), step("b", { status: "working" })] } }),
    message("old", 2, { kind: "plan", data: { type: "plan", leadNodeId: "lead", leadHandle: "lead", status: "done", steps: [step("a", { status: "done" })] } }),
    message("work", 3, { kind: "plan", data: { type: "plan", kind: "self", leadNodeId: "lead", leadHandle: "lead", status: "running", steps: [step("lead", { status: "working", progress: "Reading the pricing page" })] } }),
    message("run1", 4, { kind: "run", authorNodeId: "builder", body: "Fix the redirect", data: { jobId: "j1", status: "running", session: { id: "s1", status: "running", queue: [{ jobId: "j2", title: "Tests", prompt: "Tests", position: 1 }] } } }),
    message("run2", 5, { kind: "run", authorNodeId: "builder", body: "Tests", data: { jobId: "j2", status: "queued", delivery: "queue", session: { id: "s1", status: "running", queue: [] } } }),
    message("step-run", 6, { kind: "run", authorNodeId: "builder", planId: "plan", body: "Step run", data: { jobId: "j3", status: "running" } }),
    message("done-run", 7, { kind: "run", authorNodeId: "builder", body: "Done run", data: { jobId: "j4", status: "succeeded" } }),
    message("stopped-run", 8, { kind: "run", authorNodeId: "builder", body: "Taken over", data: { jobId: "j5", status: "running", quiet: "replaced" } }),
    message("their-run", 9, { kind: "run", authorNodeId: "theirs", body: "Theirs", data: { jobId: "j6", status: "running" } }),
    message("their-plan", 10, { kind: "plan", authorAccountId: "ben", data: { type: "plan", leadNodeId: "theirs", leadHandle: "theirs", status: "running", steps: [step("x")] } }),
  ];
  assert.deepEqual(workBoard(messages, "me", ownerOf), [
    { kind: "session", id: "s1", messageId: "run1", title: "Fix the redirect", detail: "Running · 1 queued" },
    { kind: "work", id: "work", messageId: "work", title: "Do lead.", detail: "Reading the pricing page" },
    { kind: "plan", id: "plan", messageId: "plan", title: "Ship the login page", detail: "1 of 2 done" },
  ]);
  assert.deepEqual(workBoard([messages[1]!, messages[6]!], "me", ownerOf), [], "nothing live: Stop need not ask");
  const reporting = message("p", 1, { kind: "plan", body: "Here is the plan. It has steps.", data: { type: "plan", leadNodeId: "lead", leadHandle: "lead", status: "reporting", steps: [step("a")] } });
  assert.deepEqual(workBoard([reporting], "me", ownerOf), [{ kind: "plan", id: "p", messageId: "p", title: "Here is the plan.", detail: "Reporting" }]);
});

test("a routine's run is on the board, marked so its chip opens its card: it is not in the timeline", () => {
  const run = message("m1", 3, { kind: "plan", planId: "routine-1", body: "Work", data: { type: "plan", kind: "self", leadNodeId: "lead", leadHandle: "lead", status: "running", goal: "Morning summary", routine: { id: "routine-1", runId: "run-1", title: "Morning summary", notify: "always" }, steps: [step("lead", { status: "working", progress: "Reading the board" })] } });
  assert.deepEqual(workBoard([run], "me", ownerOf), [{ kind: "work", id: "m1", messageId: "m1", title: "Morning summary", detail: "Reading the board", routineId: "routine-1" }]);
  assert.equal(workBoard([{ ...run, data: { ...run.data, routine: undefined } }], "me", ownerOf)[0]?.routineId, "routine-1", "its planId says so too");
});

test("a node's message about a task assigned to it names the task and its due day, never a status that may be stale", () => {
  assert.deepEqual(messageTask({ task: { id: "t1", title: " Fix the login redirect ", due: "2026-11-03T12:00:00Z", status: "todo" } }, "UTC"), { id: "t1", title: "Fix the login redirect", due: "3 Nov" });
  assert.deepEqual(messageTask({ task: { id: "t2", title: "Write tests", dueAt: null } }), { id: "t2", title: "Write tests", due: null });
  assert.equal(messageTask({ task: { id: "t3", title: "" } }), null);
  assert.equal(messageTask({ task: "t4" }), null);
  assert.equal(messageTask({}), null);
  assert.equal(messageTask(null), null);
});
