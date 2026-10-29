import assert from "node:assert/strict";
import test from "node:test";
import { andList, attemptVerb, candidateWords, integratedSteps, integrateHow, integratesLine, parallelWords, planFacts, staleNote } from "./plan-facts";
import type { Attempt, PlanStep } from "./types";

test("how a plan's builds share its folder, in short words", () => {
  assert.equal(parallelWords(null), null);
  assert.equal(parallelWords({}), null, "no folder, no parallel: nothing to say");
  assert.equal(parallelWords({ folder: "ensemble" }), "One at a time in the checkout", "serial is the default");
  assert.equal(parallelWords({ parallel: "serial" }), "One at a time in the checkout");
  assert.equal(parallelWords({ parallel: "worktrees" }), "Each build in its own worktree, then merged");
  assert.equal(parallelWords({ parallel: "worktrees", integrate: "rebase" }), "Each build in its own worktree, then rebased");
  assert.equal(parallelWords({ parallel: "worktrees", integrate: "merge", publish: "none" }), "Each build in its own worktree, then applied as patches", "nothing committed: patches");
  assert.equal(parallelWords({ parallel: "snapshots" }), "Each build in its own copy, then applied as patches");
  assert.equal(integrateHow({ parallel: "snapshots" }), "patch");
  assert.equal(integrateHow(undefined), "merge");
});

test("a plan's facts on one line", () => {
  assert.deepEqual(planFacts({ folder: "ensemble", computer: "Laptop", branch: "testing", publish: "commit", parallel: "worktrees" }), ["In ensemble on Laptop", "branch testing", "Commits, never pushes", "Each build in its own worktree, then merged"]);
  assert.deepEqual(planFacts({ repos: ["acme/web", "acme/api"], computer: "any", publish: "pr" }), ["In acme/web, acme/api", "Opens a pull request"]);
  assert.deepEqual(planFacts(null), []);
});

test("what an attempt built or tested", () => {
  assert.equal(candidateWords({ commit: "1a2b3c4d5e6f", branch: "feature-x" }, "built"), "built 1a2b3c4 on feature-x");
  assert.equal(candidateWords({ commit: "1a2b3c4d5e6f" }, "tested"), "tested 1a2b3c4");
  assert.equal(candidateWords({ contentHash: "3fa2b1c0d9e8" }, "built"), "built content 3fa2b1c0");
  assert.equal(candidateWords(undefined, "built"), null);
  assert.equal(attemptVerb("verify"), "tested");
  assert.equal(attemptVerb("build"), "built");
});

const step = (id: string, handle: string, extra: Partial<PlanStep> = {}): PlanStep => ({ id, nodeId: handle, handle, name: handle, brief: "", after: [], status: "done", result: null, progress: null, startedAt: null, endedAt: null, ...extra });
const attempt = (n: number, outcome: string, extra: Partial<Attempt> = {}): Attempt => ({ n, reason: "first", outcome, summary: null, startedAt: null, endedAt: `2026-10-29T10:0${n}:00Z`, ...extra });

test("what an integration step brings in", () => {
  const steps = [step("a", "builder"), step("b", "designer"), step("c", "builder"), step("i", "lead", { integrates: ["a", "b", "gone"] })];
  assert.deepEqual(integratedSteps(steps[3]!, steps), [{ id: "a", label: "@builder's (step 1)" }, { id: "b", label: "@designer's" }]);
  assert.equal(integratesLine(integratedSteps(steps[3]!, steps)), "Brings in @builder's (step 1) and @designer's work");
  assert.equal(integratesLine([]), null);
  assert.equal(andList(["a", "b", "c"]), "a, b and c");
  assert.equal(andList(["a"]), "a");
});

test("a pass that a later change no longer covers says so", () => {
  const build = step("b1", "builder", { kind: "build", attempts: [attempt(1, "done", { candidate: { commit: "1a2b3c4aaaa" } })] });
  const check = step("v1", "tester", { kind: "verify", verifies: "b1", outcome: "pass", attempts: [attempt(2, "pass")], staleAfter: { step: "b2", handle: "designer", candidate: "9f8e7d6bbbb", at: "2026-10-29T10:05:00Z" } });
  assert.equal(staleNote(check, [build, check]), "Passed for 1a2b3c4, but @designer's step then changed it (9f8e7d6): this pass doesn't cover that change.", "the build it checked, as it was then");
  const own = { ...check, attempts: [attempt(2, "pass", { candidate: { commit: "5e5e5e5e5e" } })] };
  assert.equal(staleNote(own, [build, own])?.startsWith("Passed for 5e5e5e5,"), true, "its own tested commit first");
  assert.equal(staleNote({ ...check, attempts: [] }, [check]), "It passed, but @designer's step then changed it (9f8e7d6): this pass doesn't cover that change.");
  assert.equal(staleNote({ ...check, staleAfter: null }, [check]), null);
  const named = { ...check, staleAfter: { ...check.staleAfter!, tested: "4d4d4d4d4d4d" } };
  assert.equal(staleNote(named, [build, named])?.startsWith("Passed for 4d4d4d4,"), true, "what Ensemble says the pass tested comes first");
});
