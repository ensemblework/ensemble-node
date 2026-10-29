import assert from "node:assert/strict";
import test from "node:test";
import { attemptLabel, attemptsToShow, blockedReason, candidateLabel, checkTally, heldState, isWorkCard, ledgerSummary, missionView, planProgress, requirementBadge, stepBadges, stepKindLine, stepName, stepRequirements, verdictLabel } from "./plan";
import type { PlanStep } from "./types";

const step = (id: string, extra: Partial<PlanStep> = {}): PlanStep => ({
  id,
  nodeId: `n-${id}`,
  handle: id,
  name: id,
  brief: `Do ${id}`,
  after: [],
  status: "waiting",
  result: null,
  progress: null,
  startedAt: null,
  endedAt: null,
  ...extra,
});

test("a mission's status; a plan from before outcomes that ended 'done' reads as ended, not running", () => {
  assert.deepEqual(missionView("running"), { status: "running", label: "Running", tone: "accent", live: true });
  assert.equal(missionView("reporting").live, true);
  assert.equal(missionView("draft").live, true);
  assert.deepEqual(missionView("succeeded"), { status: "succeeded", label: "Succeeded", tone: "ok", live: false });
  assert.deepEqual(missionView("partially_completed"), { status: "partially_completed", label: "Partly done", tone: "warn", live: false });
  assert.equal(missionView("failed").tone, "danger");
  assert.equal(missionView("stopped").live, false);
  assert.deepEqual(missionView("done"), { status: "succeeded", label: "Done", tone: "ok", live: false });
  assert.equal(missionView("waiting_for_device").label, "Waiting for device", "a status this site does not know shows its words");
  assert.equal(missionView("waiting_for_device").live, true, "and keeps Stop");
});

test("progress counts steps with a result the next steps can use", () => {
  const steps = [step("a", { status: "done", outcome: "done" }), step("b", { status: "done", outcome: "fail", kind: "verify" }), step("c", { status: "done" }), step("d", { status: "working" })];
  assert.deepEqual(planProgress({ steps }), { done: 2, total: 4 });
});

test("a waiting step is held by a failed, blocked or unverified step before it; Ensemble's word wins", () => {
  const build = step("builder", { status: "done", outcome: "done", kind: "build" });
  const verify = step("tester", { status: "done", outcome: "fail", kind: "verify", after: ["builder"] });
  const next = step("builder2", { after: ["tester"] });
  const docs = step("docs", { after: ["builder2"] });
  const steps = [build, verify, next, docs];
  assert.deepEqual(heldState(next, steps), { held: true, holder: verify });
  assert.equal(heldState(docs, steps).holder?.id, "tester", "held through the step it waits on");
  assert.deepEqual(heldState({ ...next, held: false }, steps), { held: false, holder: null }, "Ensemble says it is not held");
  assert.equal(heldState({ ...docs, held: true, heldBy: "tester" }, steps).holder, verify);
  assert.deepEqual(heldState({ ...docs, held: true, heldBy: null }, [build, { ...verify, outcome: "pass" }, next, docs]), { held: true, holder: null }, "held, by a step Ensemble did not name");
  assert.equal(heldState(step("x", { after: ["builder"] }), steps).held, false, "a build that is done lets the next start");
  assert.equal(heldState(step("y", { after: ["u"] }), [step("u", { status: "done", outcome: "unverified" })]).held, true);
  // A plan from before outcomes: a blocked step holds; a done one does not.
  assert.equal(heldState(step("z", { after: ["old"] }), [step("old", { status: "blocked" })]).held, true);
  assert.equal(heldState(step("z", { after: ["old"] }), [step("old", { status: "done" })]).held, false);
  assert.equal(stepName(next, steps), "@builder2");
  assert.equal(stepName(build, [build, step("again", { handle: "builder" })]), "@builder (step 1)");
});

test("a step's status and outcome badges keep running and passing apart", () => {
  const steps = [step("t", { status: "done", outcome: "pass", kind: "verify" })];
  assert.deepEqual(stepBadges(steps[0]!, steps), { status: { label: "Finished", tone: "muted" }, outcome: { label: "Pass", tone: "ok" }, held: false, holder: null });
  assert.equal(stepBadges(step("f", { status: "done", outcome: "fail" }), []).outcome?.label, "Fail");
  assert.deepEqual(stepBadges(step("b", { status: "done", outcome: "done" }), []).outcome, null, "Done is not said twice");
  assert.deepEqual(stepBadges(step("b", { status: "done" }), []).status, { label: "Done", tone: "ok" }, "a plan from before outcomes");
  assert.equal(stepBadges(step("u", { status: "blocked", outcome: "unverified" }), []).outcome?.label, "Unverified");
  assert.equal(stepBadges(step("w", { status: "working", outcome: "unknown" }), []).outcome, null);
  assert.equal(stepBadges(step("h", { after: ["t"] }), [step("t", { status: "done", outcome: "fail" })]).status.label, "Held");
  assert.equal(stepKindLine({ kind: "verify", executor: "session" }), "Verify · agent session");
  assert.equal(stepKindLine({}), "");
});

test("attempts are labelled by why they ran, and listed when they say something", () => {
  assert.equal(attemptLabel({ n: 1, reason: "first" }), "Attempt 1");
  assert.equal(attemptLabel({ n: 2, reason: "repair" }), "Attempt 2 · repair");
  assert.equal(attemptLabel({ n: 2, reason: "retest" }), "Attempt 2 · retest");
  assert.equal(attemptLabel({ n: 3, reason: "nudge" }), "Attempt 3 · asked to report");
  const first = { n: 1, reason: "first" as const, outcome: "fail", summary: null, startedAt: null, endedAt: null };
  assert.deepEqual(attemptsToShow({ attempts: [first] }), []);
  assert.deepEqual(attemptsToShow({ attempts: [{ ...first, checks: [{ name: "build", verdict: "fail" }] }] }).length, 1);
  assert.deepEqual(attemptsToShow({ attempts: [{ ...first, n: 2, reason: "repair" }, first] }).map((row) => row.n), [1, 2]);
  assert.deepEqual(attemptsToShow({}), []);
});

test("candidates, checks and the requirements ledger read in a line", () => {
  assert.deepEqual(candidateLabel({ commit: "a1b2c3d4e5f6", branch: "testing", repo: "ensemble" }), { short: "a1b2c3d on testing", full: "ensemble · testing · commit a1b2c3d4e5f6" });
  assert.equal(candidateLabel({ contentHash: "0123456789abcdef" })?.short, "content 01234567");
  assert.equal(candidateLabel({ branch: "main" }), null);
  assert.equal(candidateLabel(undefined), null);
  assert.equal(checkTally([{ verdict: "pass" }, { verdict: "pass" }, { verdict: "fail" }]), "2 of 3 checks passed · 1 failed");
  assert.equal(checkTally([{ verdict: "pass" }]), "1 of 1 check passed");
  assert.equal(checkTally([]), null);
  const requirements = [
    { id: "r1", text: "Tables keep pipes", status: "accepted" as const, acceptance: [] },
    { id: "r2", text: "Expire Needs Me", status: "failed" as const, acceptance: [] },
    { id: "r3", text: "Docs", status: "deferred" as const, acceptance: [] },
  ];
  assert.equal(ledgerSummary(requirements), "1 of 3 accepted · 1 failed · 1 deferred");
  assert.deepEqual(requirementBadge("in_progress"), { label: "In progress", tone: "accent" });
  assert.deepEqual(stepRequirements({ requirementIds: ["r2", "missing"] }, { requirements }).map((row) => row.id), ["r2"]);
  assert.equal(isWorkCard({ kind: "self", steps: [step("me")] }), true);
  assert.equal(isWorkCard({ kind: "plan", steps: [step("me")] }), false);
  assert.equal(isWorkCard({ steps: [step("a")] }), false, "a plan from before kinds");
  assert.equal(blockedReason("login_required"), "It needs a sign-in");
  assert.equal(blockedReason("unknown"), null);
  assert.equal(verdictLabel("skipped"), "Skipped");
});
