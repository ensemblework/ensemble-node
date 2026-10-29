import assert from "node:assert/strict";
import test from "node:test";
import { agentName, cardLink, handOverChoices, moveQueued, newestSessionCards, observedMissing, queuedLine, queueOrder, runsCount, sessionActions, sessionAgent, sessionLatest, sessionLive, sessionManager, sessionPlace, sessionStatus, settingsLine, settingsRows, settingValue, withoutQueued } from "./session";
import type { QueuedRun } from "./types";

test("settings asked for, sent and reported read side by side; not reported is said, and changes are marked", () => {
  const rows = settingsRows({
    requested: { agent: "claude-code", model: "opus", effort: "high", context: "long_context" },
    resolved: { agent: "claude-code", model: "claude-opus-4-6", effort: "high", context: "default" },
    observed: { agent: "claude-code", model: "not_reported", effort: "not_reported", context: "not_reported" },
  });
  assert.deepEqual(rows.map((row) => [row.label, row.requested, row.resolved, row.observed, row.mismatch]), [
    ["Agent", "Claude Code", "Claude Code", "Claude Code", false],
    ["Model", "opus", "claude-opus-4-6", "not reported", false],
    ["Thinking", "high", "high", "not reported", false],
    ["Context", "long context", "default", "not reported", true],
  ]);
  assert.equal(settingsRows({ resolved: { model: "gpt-5.3-codex" }, observed: { model: "gpt-5-mini" } })[0]!.mismatch, true, "the engine ran another model");
  assert.deepEqual(settingsRows(null), []);
  assert.equal(settingsLine({ agent: "codex", model: "gpt-5.3-codex", effort: "high", context: "long_context", fast: true }), "Codex · gpt-5.3-codex · high thinking · long context · fast mode");
  assert.equal(settingsLine({ model: "opus", effort: "not_reported", context: "default" }), "opus · thinking not reported");
  assert.equal(settingsLine(undefined), "");
  assert.equal(observedMissing({ resolved: { model: "x" }, observed: { model: "not_reported" } }), true);
  assert.equal(observedMissing({ resolved: { model: "x" } }), true);
  assert.equal(observedMissing({ resolved: { model: "x" }, observed: { model: "x" } }), false);
  assert.equal(settingValue("fast", false), "off");
  assert.equal(agentName("cursor-agent"), "Cursor");
  assert.equal(agentName("my-agent"), "my-agent");
});

test("a session's agent: the name for people and the id for logic, from a card or the session read", () => {
  assert.deepEqual(sessionAgent({ agent: "Claude Code", agentId: "claude-code" }), { id: "claude-code", name: "Claude Code" }, "a card: agent is the name");
  assert.deepEqual(sessionAgent(null, { agent: "copilot-cli", agentName: "GitHub Copilot" }), { id: "copilot-cli", name: "GitHub Copilot" }, "the session read: agent is the id");
  assert.deepEqual(sessionAgent({ agent: "Codex", agentId: "codex" }, { agent: "copilot-cli", agentName: "GitHub Copilot" }), { id: "copilot-cli", name: "GitHub Copilot" }, "the session read is newer");
  assert.deepEqual(sessionAgent(null, { agent: "cursor-agent", agentName: null }), { id: "cursor-agent", name: "Cursor" }, "an id is never shown as it is");
  assert.deepEqual(sessionAgent({ agent: "claude-code" }), { id: "claude-code", name: "Claude Code" }, "a card from before agentId");
  assert.deepEqual(sessionAgent({ agent: "Team agent" }), { id: null, name: "Team agent" }, "a name it does not know is not taken for an id");
  assert.deepEqual(sessionAgent({ agent: " ", agentId: null }, undefined), { id: null, name: null });
});

test("a session says what it may be told now", () => {
  assert.deepEqual(sessionActions("running"), ["steer", "queue", "replace", "stop"]);
  assert.deepEqual(sessionActions("waiting_approval"), ["steer", "queue", "replace", "stop"]);
  assert.deepEqual(sessionActions("idle"), ["queue"]);
  assert.deepEqual(sessionActions("stopping"), []);
  assert.deepEqual(sessionActions("closed"), []);
  assert.deepEqual(sessionStatus("waiting_approval"), { label: "Needs you", tone: "warn" });
  assert.deepEqual(sessionStatus("paused_for_login"), { label: "Paused for login", tone: "muted" });
});

test("queued messages move up and down, and go, keeping a numbered order", () => {
  const queue: QueuedRun[] = [
    { jobId: "c", title: "", prompt: "Then the docs\nwith care", position: 3 },
    { jobId: "a", title: "Add tests", prompt: "Add tests", position: 1 },
    { jobId: "b", title: "Fix lint", prompt: "Fix lint", position: 2 },
  ];
  assert.deepEqual(queueOrder(queue).map((row) => row.jobId), ["a", "b", "c"]);
  assert.deepEqual(moveQueued(queue, "b", -1)?.map((row) => [row.jobId, row.position]), [["b", 1], ["a", 2], ["c", 3]]);
  assert.deepEqual(moveQueued(queue, "b", 1)?.map((row) => row.jobId), ["a", "c", "b"]);
  assert.equal(moveQueued(queue, "a", -1), null, "the first cannot move earlier");
  assert.equal(moveQueued(queue, "c", 1), null, "the last cannot move later");
  assert.equal(moveQueued(queue, "x", 1), null);
  assert.deepEqual(withoutQueued(queue, "a").map((row) => [row.jobId, row.position]), [["b", 1], ["c", 2]]);
  assert.equal(queuedLine(queue[0]!), "Then the docs");
  assert.equal(queuedLine(queue[1]!), "Add tests");
});

test("a session's state as Ensemble says it: working and waiting take the same controls as a run going on", () => {
  assert.deepEqual(sessionStatus("working"), { label: "Working", tone: "accent" });
  assert.deepEqual(sessionStatus("waiting"), { label: "Needs you", tone: "warn" });
  assert.deepEqual(sessionActions("working"), ["steer", "queue", "replace", "stop"]);
  assert.deepEqual(sessionActions("waiting"), ["steer", "queue", "replace", "stop"]);
  assert.deepEqual(sessionActions("queued"), ["queue"]);
});

test("who manages a session, and who it can be handed to", () => {
  assert.equal(sessionManager({ nodeId: "lead" }, null), "lead");
  assert.equal(sessionManager({ nodeId: "lead" }, { nodeId: "designer" }), "designer", "the session read wins");
  assert.equal(sessionManager({ nodeId: "lead" }, { nodeId: null }), null, "no node manages it now");
  assert.equal(sessionManager({}, undefined), null);
  const nodes = [
    { id: "lead", name: "Lead", parentNodeId: null },
    { id: "scout", name: "Scout", parentNodeId: "lead" },
    { id: "designer", name: "Designer", parentNodeId: null },
    { id: "builder", name: "Builder" },
  ];
  assert.deepEqual(handOverChoices(nodes, "lead").map((row) => row.id), ["builder", "designer"], "never a helper or the node that has it");
  assert.deepEqual(handOverChoices(nodes, null).map((row) => row.id), ["builder", "designer", "lead"]);
});

test("each session's newest card in a conversation", () => {
  const card = (id: string, seq: number, session: string | null, kind = "run") => ({ id, seq, kind, createdAt: `2026-10-29T10:0${seq}:00Z`, data: session ? { session: { id: session } } : {} });
  const newest = newestSessionCards([card("a", 1, "s1"), card("b", 2, "s2"), card("c", 3, "s1"), card("d", 4, null), card("e", 5, "s1", "text")]);
  assert.equal(newest.get("s1"), "c");
  assert.equal(newest.get("s2"), "b");
  assert.equal(newest.size, 2);
});

test("a session in the list: where it runs, its newest task, its runs, and whether it is going on", () => {
  assert.equal(sessionPlace({ folder: "ensemble", computer: "Laptop" }), "ensemble on Laptop");
  assert.equal(sessionPlace({ folder: "its own checkout", computer: null }), "its own checkout");
  assert.equal(sessionLatest({ title: "Fix the login redirect", latestTask: "Add tests for it" }), "Add tests for it");
  assert.equal(sessionLatest({ title: "Fix the login redirect", latestTask: "Fix the login redirect" }), null, "said once");
  assert.equal(runsCount(1), "1 run");
  assert.equal(runsCount(4), "4 runs");
  assert.equal(sessionLive("working"), true);
  assert.equal(sessionLive("queued"), true);
  assert.equal(sessionLive("idle"), false);
  assert.equal(sessionLive(undefined), false);
});

test("a session's or a run's card, as a link into its conversation", () => {
  assert.deepEqual(cardLink({ messageId: "m1", roomId: "crew" }), { href: "/r/crew#m-m1", roomId: "crew", messageId: "m1" });
  assert.equal(cardLink({ messageId: null, roomId: "crew" }), null);
  assert.equal(cardLink({ messageId: "m1" }), null, "a run from before roomId");
  assert.equal(cardLink(null), null, "a Hub or CLI session has no card");
});
