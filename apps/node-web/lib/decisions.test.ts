import assert from "node:assert/strict";
import test from "node:test";
import { answeredNote, approvalsForRun, decisionBody, decisionsForJob, decisionView } from "./decisions";
import type { AgentDecision, ApprovalRecord } from "./types";

const decision = (more: Partial<AgentDecision> = {}, detail: AgentDecision["detail"] = {}): AgentDecision => ({
  id: "d1",
  source: "ensemble",
  event: "permission",
  toolName: "Permission",
  title: "Run npm install?",
  detail,
  cwd: null,
  canAnswer: true,
  status: "pending",
  requestedAt: "2026-10-26T10:00:00.000Z",
  expiresAt: "2026-10-27T10:00:00.000Z",
  ...more,
});

test("a run's permission: once, for this run only off a computer, and never for a push", () => {
  assert.deepEqual(decisionView(decision({}, { command: "npm i" })), { kind: "permission", forRun: true, confirm: false });
  assert.deepEqual(decisionView(decision({}, { command: "npm i", deviceId: "d", deviceName: "MacBook" })), { kind: "permission", forRun: false, confirm: false });
  assert.deepEqual(decisionView(decision({ toolName: "git push" }, { command: "git push" })), { kind: "permission", forRun: false, confirm: false });
  assert.deepEqual(decisionView(decision({}, { deviceId: "d", confirm: true })), { kind: "permission", forRun: false, confirm: true });
  assert.deepEqual(decisionView(decision({}, { deviceId: "d", deviceName: "MacBook", tier: "high_risk" })), { kind: "on-computer", computer: "MacBook" });
  assert.deepEqual(decisionView(decision({ canAnswer: false })), { kind: "elsewhere" });
  // An editor's own cards keep Allow once and Deny; their multiple-choice questions go to Ensemble.
  assert.deepEqual(decisionView(decision({ source: "claude" }, { command: "rm -rf build" })), { kind: "permission", forRun: false, confirm: false });
  assert.deepEqual(decisionView(decision({ source: "claude", event: "PreToolUse" }, { options: ["A", "B"] })), { kind: "in-ensemble" });
});

test("a run's question: its options, the recommended one, and a typed answer only when allowed", () => {
  const options = ["Postgres", "SQLite"];
  assert.deepEqual(decisionView(decision({ event: "question" }, { options, recommended: "SQLite", deviceId: "d" })), { kind: "question", options, recommended: "SQLite", custom: false, confirm: false });
  assert.deepEqual(decisionView(decision({ event: "question" }, { options, recommended: "MySQL", allowCustom: true, deviceId: "d" })), { kind: "question", options, recommended: null, custom: true, confirm: false });
  assert.equal((decisionView(decision({ event: "question" }, {})) as { custom: boolean }).custom, true);
  assert.equal((decisionView(decision({ event: "question" }, { deviceId: "d" })) as { custom: boolean }).custom, false);
});

test("the answer sent, and the note shown after", () => {
  assert.deepEqual(decisionBody({ allow: true }), { decision: "allow", scope: "once" });
  assert.deepEqual(decisionBody({ allow: true, forRun: true }), { decision: "allow", scope: "session" });
  assert.deepEqual(decisionBody({ allow: false, forRun: true }), { decision: "deny", scope: "once" });
  assert.deepEqual(decisionBody({ allow: true, answer: "  SQLite ", confirmed: true }), { decision: "allow", scope: "once", reason: "SQLite", confirmed: true });
  const permission = decisionView(decision());
  assert.equal(answeredNote(permission, { decision: "allow", scope: "session" }), "Allowed for this run.");
  assert.equal(answeredNote(permission, { decision: "deny", scope: "once" }), "Denied. The agent was told.");
  assert.equal(answeredNote(decisionView(decision({ event: "question" })), { decision: "allow", scope: "once", reason: "x" }), "Answer sent. The agent continues.");
});

test("a run card shows only its own pending cards, oldest first", () => {
  const rows = [
    decision({ id: "b", requestedAt: "2026-10-26T10:05:00.000Z" }, { jobId: "job-1" }),
    decision({ id: "a" }, { jobId: "job-1" }),
    decision({ id: "c" }, { jobId: "job-2" }),
    decision({ id: "d", status: "decided" }, { jobId: "job-1" }),
    decision({ id: "e" }, null),
  ];
  assert.deepEqual(decisionsForJob(rows, "job-1").map((row) => row.id), ["a", "b"]);
  assert.deepEqual(decisionsForJob(rows, null), []);
  const approval = (id: string, runId: string, decided: string | null = null): ApprovalRecord => ({ id, runId, taskId: null, kind: "publish", title: "Push", preview: null, decision: decided, requestedAt: "2026-10-26T10:00:00.000Z" });
  assert.deepEqual(approvalsForRun([approval("x", "run-1"), approval("y", "run-2"), approval("z", "run-1", "approved")], "run-1").map((row) => row.id), ["x"]);
});
