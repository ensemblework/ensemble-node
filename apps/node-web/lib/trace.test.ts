import assert from "node:assert/strict";
import test from "node:test";
import { callRows, callSummary, compactCount, costLine, decisionLine, droppedWords, givenLines, loopLine, messageTurn, modelLine, reportLines, sectionRows, summaryParts, traceOutcome, traceSummary, turnLive, verificationWords } from "./trace";
import type { TurnRecord, TurnTraceRecord, TurnTraceView } from "./types";

const turn: TurnRecord = {
  id: "t1",
  nodeId: "n1",
  roomId: "r1",
  reason: "message",
  private: false,
  lane: "conv:r1:s",
  audience: "owner",
  triggerMessageId: "m1",
  planId: null,
  planStep: null,
  attempt: 0,
  originTurnId: null,
  status: "done",
  outcome: "done",
  placement: { loop: "ensemble-api", inference: "included", toolsAt: "server", conversation: "ensemble" },
  model: "gpt-5-mini",
  credits: 3.2,
  error: null,
  createdAt: "2026-11-21T10:00:00.000Z",
  finishedAt: "2026-11-21T10:00:14.000Z",
};

const trace: TurnTraceRecord = {
  nodeId: "n1",
  createdAt: "2026-11-21T10:00:14.000Z",
  instructionVersion: "1a2b3c4d5e6f7a8b",
  instructionHash: "ffff",
  sections: {
    hashes: { stable: "a", context: "b", volatile: "c" },
    list: [
      { name: "constitution/01-identity", tier: "stable", chars: 4000, tokens: 1000 },
      { name: "node/57-memories", tier: "context", chars: 800, tokens: 200 },
      { name: "node/20-charter", tier: "stable", chars: 1200, tokens: 300 },
      { name: "node/80-packet-new", tier: "volatile", chars: 400, tokens: 100 },
    ],
    dropped: [{ name: "node/58-workspace", tier: "context", reason: "budget", tokens: 120, items: 3 }],
  },
  toolSchemaHash: "abc",
  toolCount: 34,
  modelRequested: "gpt-6-luna",
  modelSent: "gpt-5-mini",
  modelReported: "gpt-5-mini-2025-08-07",
  provider: "ensemble",
  effort: "low",
  placement: { loop: "ensemble-api", inference: "included", toolsAt: "server", conversation: "ensemble" },
  tokensIn: 12_431,
  tokensOut: 812,
  credits: 3.2,
  costUsd: null,
  calls: [
    { name: "hub_search_tasks", ms: 420, state: "ok", resultChars: 4100, shownChars: 1200, offloaded: true, readOnly: true },
    { name: "hub_create_tasks", ms: 12_300, state: "awaiting_approval", resultChars: 300, shownChars: 300, offloaded: false, readOnly: false },
    { name: "web_fetch", ms: 2500, state: "failed", resultChars: 40, shownChars: 40, offloaded: false, readOnly: true },
  ],
  selected: null,
  verification: { checks: ["files"], rounds: [{ round: 1, problems: "the report file is not in the chat" }, { round: 2, problems: null }], passed: true },
  report: { kind: "reply", outcome: "partial", stated: "done", chars: 812, held: 1, messages: [{ id: "m2", kind: "text" }], artifacts: [{ id: "e1", kind: "screenshot", to: "chat" }, { id: "e2", kind: "report", to: "chat" }, { id: "f1", kind: "file", to: "files" }], remaining: "Book the venue", verified: true },
  loop: { kind: "ensemble", config: "2026-11-20.1:abcd", steps: 6, cap: 40, retries: 1, nudges: 0, compactions: 1, offloaded: 1, runaway: null, paused: false },
  error: null,
};

const view: TurnTraceView = { turn, trace, decisions: [] };
const noDashes = (text: string) => assert.doesNotMatch(text, /\u2014|--/, `no em dash or double hyphen in "${text}"`);

test("a trace's one line says how the turn ended, with which model, how many tokens and how long", () => {
  const line = traceSummary(view);
  assert.equal(line, "Partly done · gpt-5-mini-2025-08-07 · 12.4k tokens in, 812 out · 14s");
  noDashes(line);
  assert.equal(traceSummary({ ...view, trace: null, turn: { ...turn, status: "running", outcome: "running", finishedAt: null } }), "Running · gpt-5-mini", "no trace yet while it runs: the turn's own words");
});

test("how a turn ended: its report first, else its own outcome", () => {
  assert.deepEqual(traceOutcome(view), { label: "Partly done", tone: "warn" });
  assert.deepEqual(traceOutcome({ turn, trace: { ...trace, report: { kind: "reply", outcome: "done" } } }), { label: "Done", tone: "ok" });
  assert.deepEqual(traceOutcome({ turn: { ...turn, outcome: "parked" }, trace: { ...trace, report: null } }), { label: "Waiting for your answer", tone: "warn" });
  assert.equal(traceOutcome({ turn: { ...turn, outcome: "coalesced" }, trace: null }).label, "Taken over");
  assert.equal(traceOutcome({ turn: { ...turn, outcome: "retry" }, trace: null }).label, "Rate limited");
  assert.equal(traceOutcome({ turn: { ...turn, outcome: "cancelled" }, trace: null }).label, "Stopped");
  assert.equal(traceOutcome({ turn: { ...turn, outcome: null, status: "failed" }, trace: null }).label, "Failed", "an older turn without an outcome reads its status");
  assert.equal(traceOutcome({ turn: { ...turn, outcome: "waiting_on_device" }, trace: null }).label, "Waiting on device", "words this site does not know yet show as they are");
  assert.deepEqual(traceOutcome({ turn, trace: { ...trace, report: { kind: "step", tool: "node_step_report", outcome: "pass", checks: 3, passed: 3 } } }), { label: "Passed", tone: "ok" });
  assert.deepEqual(traceOutcome({ turn, trace: { ...trace, report: { kind: "step", reported: false } } }), { label: "No report", tone: "warn" });
  assert.equal(turnLive({ status: "running", outcome: "waiting_approval", finishedAt: null }), true);
  assert.equal(turnLive(turn), false);
});

test("the model chain shows only when the models differ", () => {
  assert.deepEqual(modelLine(trace), { model: "gpt-5-mini-2025-08-07", detail: "Asked for gpt-6-luna · sent gpt-5-mini · reported gpt-5-mini-2025-08-07" });
  assert.deepEqual(modelLine({ modelRequested: "gpt-5-mini", modelSent: "gpt-5-mini", modelReported: "gpt-5-mini" }), { model: "gpt-5-mini", detail: null });
  assert.deepEqual(modelLine({ modelRequested: "gpt-5-mini", modelSent: "gpt-5-mini", modelReported: null }), { model: "gpt-5-mini", detail: null });
  assert.deepEqual(modelLine({ modelRequested: "claude-sonnet", modelSent: null, modelReported: "claude-sonnet-4-5" }), { model: "claude-sonnet-4-5", detail: "Asked for claude-sonnet · reported claude-sonnet-4-5" });
  assert.deepEqual(modelLine(null, "gpt-4.1-mini"), { model: "gpt-4.1-mini", detail: null });
});

test("counts, cost and sizes read at a glance", () => {
  assert.deepEqual([0, 812, 1000, 1234, 12_431, 99_950, 123_456, 999_600, 1_500_000].map(compactCount), ["0", "812", "1k", "1.2k", "12.4k", "100k", "123k", "1M", "1.5M"]);
  assert.equal(costLine({ credits: 3.24, costUsd: null }), "3.2 credits");
  assert.equal(costLine({ credits: 0.04, costUsd: null }), "under 0.1 credits");
  assert.equal(costLine({ credits: null, costUsd: 0.0042 }), "about $0.0042");
  assert.equal(costLine({ credits: 0, costUsd: 0 }), null, "the owner's AI plan costs nothing here");
});

test("the instructions' parts keep their order, with each tier's tokens and what was left out", () => {
  const { rows, tiers, total, dropped } = sectionRows(trace.sections);
  assert.deepEqual(rows.map((row) => row.name), ["constitution/01-identity", "node/57-memories", "node/20-charter", "node/80-packet-new"]);
  assert.deepEqual(tiers, [{ tier: "stable", tokens: 1300 }, { tier: "context", tokens: 200 }, { tier: "volatile", tokens: 100 }]);
  assert.equal(total, 1600);
  assert.equal(droppedWords(dropped[0]!), "node/58-workspace · 3 items · 120 tokens");
  assert.deepEqual(sectionRows(null), { rows: [], tiers: [], total: 0, dropped: [] });
});

test("each tool call says how it went, how long it took and how much of its result the model saw", () => {
  const rows = callRows(trace.calls);
  assert.deepEqual(
    rows.map(({ label, state, stateText, time, sizes, offloaded }) => ({ label, state, stateText, time, sizes, offloaded })),
    [
      { label: "Search tasks", state: "ok", stateText: "Done", time: "0.4s", sizes: "4.1k → 1.2k chars", offloaded: true },
      { label: "Create tasks", state: "held", stateText: "Held for you", time: "12s", sizes: "300 chars", offloaded: false },
      { label: "Web fetch", state: "failed", stateText: "Failed", time: "2.5s", sizes: "40 chars", offloaded: false },
    ],
  );
  assert.equal(callSummary(rows, trace.toolCount), "3 calls · 1 failed · 1 held · 34 tools offered");
  assert.equal(callSummary([], null), "No tool calls");
  assert.deepEqual(callRows("not a list"), []);
});

test("decisions read as what was decided and why", () => {
  const named = decisionLine({ kind: "route", configVersion: "2026-11-21.1:9f8e", ambiguous: false, choice: { reason: "mentioned", woken: [{ nodeId: "n1" }] } });
  assert.deepEqual(named, { kind: "Routing", text: "Named in the message · woke 1 node", rules: "2026-11-21.1" });
  assert.equal(decisionLine({ kind: "route", configVersion: "x", ambiguous: false, choice: { reason: "none", brake: "streak", woken: [] } }).text, "Nobody woken · the streak brake");
  assert.equal(decisionLine({ kind: "route", configVersion: "x", ambiguous: false, choice: { reason: "lead", capped: 6, woken: [{}, {}] } }).text, "The lead answers · fan-out capped · woke 2 nodes");
  assert.deepEqual(decisionLine({ kind: "skill", configVersion: "v1", ambiguous: true, choice: { reason: "best_match" } }), { kind: "Skills", text: "Best match · a model decided", rules: "v1" });
  assert.equal(decisionLine({ kind: "handoff", configVersion: "", ambiguous: false, choice: {} }).kind, "Handoff");
});

test("the answer check and the report say what the reply did and what is left", () => {
  assert.deepEqual(verificationWords(trace.verification), { line: "Passed · checked files", tone: "ok", rounds: ["Round 1: the report file is not in the chat", "Round 2: passed"] });
  assert.equal(verificationWords({ checks: ["screenshot_shown"], rounds: [], passed: false })?.line, "Did not pass · checked screenshot shown");
  assert.equal(verificationWords(null), null);
  const lines = reportLines(trace.report);
  assert.deepEqual(lines, ["The reply itself says: done", "2 files reached the chat", "1 file saved in your Files", "1 change held for your approval", "Left to do: Book the venue"]);
  assert.deepEqual(reportLines({ kind: "reply", outcome: "done", emptyReply: true, falseClaims: 2 }), ["The model wrote no reply, so the reply says what its tools did.", "2 claims of something sent taken out: it never reached the chat."]);
  assert.deepEqual(reportLines({ kind: "step", tool: "node_step_report", outcome: "fail", checks: 4, passed: 3, evidence: 2, summary: "The login test fails on Safari." }), ["Checks: 3 of 4 passed", "2 pieces of evidence", "The login test fails on Safari."]);
  assert.deepEqual(reportLines({ kind: "step", reported: false }), ["The step sent no report."]);
  for (const line of [...lines, verificationWords(trace.verification)!.line]) noDashes(line);
});

test("how the loop ran, on Ensemble or on the owner's agent", () => {
  assert.equal(loopLine(trace.loop, trace.placement), "Ensemble's loop · Included AI · 6 of 40 steps · 1 retry · 1 compaction · 1 long result kept");
  assert.equal(
    loopLine({ kind: "subscription", agent: "copilot-cli", computer: "Laptop", session: { resumed: false, restart: "context_full" }, calls: 14, ownTools: true, outside: 2, followUps: ["check"] }, { loop: "subscription-cli", inference: "owner-subscription", toolsAt: "dev-1", conversation: "agent-app" }),
    "GitHub Copilot on Laptop · Your AI plan · new session (context full) · 14 calls · its own tools too · 2 exchanges from its own app · then check",
  );
  assert.equal(loopLine(null, { inference: "owner-key" }), "Your API key");
  assert.equal(loopLine(null, null), null);
});

test("what the turn was given: skills with scores, memories and why, workspace items, and what was left out", () => {
  const given = givenLines({
    terms: ["login", "redirect"],
    skills: [{ name: "debugging", source: "bundled", score: 7.25, why: ["keyword"] }, { name: "planning", score: 1 }],
    inline: { name: "debugging", chars: 1400, cut: false },
    memories: [{ id: "a", key: "coding agent", pinned: true, why: "pinned" }, { id: "b", why: "relevant" }],
    context: [{ id: "t", kind: "task", title: "Fix the login redirect", score: 0.823 }],
    left: { memories: 3, context: 0 },
  });
  assert.deepEqual(given, {
    skills: ["debugging · 7.3 · in full", "planning · 1"],
    memories: ["“coding agent” · pinned", "A memory · relevant"],
    context: ["Fix the login redirect · task · 0.82"],
    left: "Left out: 3 memories",
    terms: "login, redirect",
  });
  assert.deepEqual(givenLines({ inline: { name: "browser", cut: true } }).skills, ["browser · in full, cut"], "a skill given in full that the list does not name");
  assert.deepEqual(givenLines(null), { skills: [], memories: [], context: [], left: null, terms: null });
});

test("only a message one of my own nodes posted in a turn opens that turn's trace", () => {
  const owners: Record<string, string> = { mine: "me", bens: "ben" };
  const ownerOf = (nodeId: string) => owners[nodeId];
  assert.equal(messageTurn({ id: "m1", authorNodeId: "mine", data: { turnId: "t1" } }, "me", ownerOf), "t1");
  assert.equal(messageTurn({ id: "m2", authorNodeId: "bens", data: { turnId: "t2" } }, "me", ownerOf), null, "another person's node");
  assert.equal(messageTurn({ id: "m3", authorNodeId: "mine", data: {} }, "me", ownerOf), null, "posted outside a turn");
  assert.equal(messageTurn({ id: "m4", authorNodeId: null, data: { turnId: "t4" } }, "me", ownerOf), null, "a person's message");
  assert.equal(messageTurn({ id: "local-1", authorNodeId: "mine", data: { turnId: "t5" } }, "me", ownerOf), null, "not sent yet");
  assert.deepEqual(summaryParts(view), ["gpt-5-mini-2025-08-07", "12.4k tokens in, 812 out", "14s"]);
});

test("the agent's own calls are marked, with their time, what went in and out, and how they were answered", () => {
  const rows = callRows([
    { name: "hub_list_tasks", ms: 300, state: "ok", resultChars: 900, shownChars: 900, offloaded: false, readOnly: true },
    { kind: "own", name: "Edit", ms: 120, state: "ok", inChars: 80, outChars: 12, verdict: "asked" },
    { kind: "own", name: "Bash", ms: 2400, state: "ok", inChars: 30, outChars: 4100, verdict: "allowed" },
    { kind: "own", name: "write_file", ms: null, state: "failed", inChars: "unknown", outChars: "unknown", verdict: "refused" },
  ]);
  assert.deepEqual(
    rows.map(({ label, own, state, stateText, time, sizes, verdict }) => ({ label, own, state, stateText, time, sizes, verdict })),
    [
      { label: "List tasks", own: false, state: "ok", stateText: "Done", time: "0.3s", sizes: "900 chars", verdict: null },
      { label: "Edit", own: true, state: "ok", stateText: "Done", time: "0.1s", sizes: "80 in · 12 out", verdict: "asked you" },
      { label: "Bash", own: true, state: "ok", stateText: "Done", time: "2.4s", sizes: "30 in · 4.1k out", verdict: "allowed" },
      { label: "Write file", own: true, state: "failed", stateText: "Refused", time: "", sizes: "", verdict: "refused" },
    ],
  );
  assert.equal(callSummary(rows, 12), "4 calls · 3 own · 1 failed · 12 tools offered");
  for (const row of rows) noDashes(`${row.label} ${row.sizes} ${row.verdict ?? ""}`);
});

test("a newer trace keeps no titles, keys or words searched: what was given reads by kind and why", () => {
  const given = givenLines({
    config: { version: "2026-11-21.1", hash: "abcd" },
    skills: [{ skill: "debugging", source: "bundled", score: 7.25, why: ["keywords 2"] }, { skill: "8b0c2f9e-1111-4c1e-9a1a-2b3c4d5e6f70", source: "owner", score: 2, why: ["name"] }],
    inline: { skill: "debugging", source: "bundled", chars: 1400, cut: false },
    memories: [{ id: "a", scope: "owner", pinned: true, rank: 1, why: "pinned" }],
    context: [{ group: "overdue", kind: "task", id: "t1", score: null, why: ["overdue"] }, { group: "related", kind: "page", id: "p1", score: 0.734, why: ["relevant"] }],
    left: { memories: 0, context: 2 },
  });
  assert.deepEqual(given, {
    skills: ["debugging · 7.3 · in full", "Your skill · 2"],
    memories: ["A memory · pinned"],
    context: ["A task · overdue", "A page · relevant · 0.73"],
    left: "Left out: 2 workspace items",
    terms: null,
  });
  assert.deepEqual(givenLines({ inline: { skill: "4f1e", source: "owner", chars: 900, cut: true } }).skills, ["Your skill · in full, cut"], "an owner's skill is never named by its id");
});

test("a plan step's report in the trace reads its newer outcomes too", () => {
  assert.deepEqual(traceOutcome({ turn, trace: { ...trace, report: { kind: "step", tool: "node_step_report", outcome: "partial", summary: "Two of three pages done." } } }), { label: "Partly done", tone: "warn" });
  assert.equal(traceOutcome({ turn, trace: { ...trace, report: { kind: "step", outcome: "uncertain" } } }).label, "Uncertain");
  assert.equal(traceOutcome({ turn, trace: { ...trace, report: { kind: "step", outcome: "stopped" } } }).label, "Stopped");
});
