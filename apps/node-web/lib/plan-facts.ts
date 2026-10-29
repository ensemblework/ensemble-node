/**
 * A plan's facts in words (Ensemble docs/35 §6.3, §8.15): where its work happens and how its builds
 * share the folder, what an attempt built or tested, what an integration step brings in, and a passing
 * check that a later change no longer covers.
 */
import { candidateLabel } from "./plan";
import type { Attempt, Candidate, IntegrateHow, PlanConstraints, PlanStep } from "./types";

/** How an integration step combines the builds, as Ensemble decides it: nothing committed means patches. */
export function integrateHow(constraints: Pick<PlanConstraints, "parallel" | "integrate" | "publish"> | null | undefined): IntegrateHow {
  if (constraints?.publish === "none") return "patch";
  return constraints?.integrate ?? (constraints?.parallel === "snapshots" ? "patch" : "merge");
}

const THEN: Record<IntegrateHow, string> = { merge: "then merged", rebase: "then rebased", patch: "then applied as patches" };

/** "One at a time in the checkout", "Each build in its own worktree, then merged"; null when the plan works in no folder. */
export function parallelWords(constraints: PlanConstraints | null | undefined): string | null {
  const mode = constraints?.parallel;
  if (!mode && !constraints?.folder) return null;
  if (mode === "worktrees") return `Each build in its own worktree, ${THEN[integrateHow(constraints)]}`;
  if (mode === "snapshots") return `Each build in its own copy, ${THEN.patch}`;
  return "One at a time in the checkout";
}

const PUBLISH: Record<string, string> = { none: "Nothing committed", commit: "Commits, never pushes", push: "Pushes", pr: "Opens a pull request" };

/** The plan's facts on one line, in order: where, which branch, what it publishes, how builds share the folder. */
export function planFacts(constraints: PlanConstraints | null | undefined): string[] {
  if (!constraints) return [];
  const where = constraints.folder?.trim() || (constraints.repos ?? []).filter(Boolean).join(", ");
  const computer = constraints.computer?.trim();
  return [
    where ? `In ${where}${computer && computer !== "any" ? ` on ${computer}` : ""}` : null,
    constraints.branch?.trim() ? `branch ${constraints.branch.trim()}` : null,
    constraints.publish ? (PUBLISH[constraints.publish] ?? null) : null,
    parallelWords(constraints),
  ].filter((fact): fact is string => Boolean(fact));
}

/** "built 1a2b3c4 on feature-x", "tested 1a2b3c4": what an attempt produced or checked. */
export function candidateWords(candidate: Candidate | null | undefined, verb: "built" | "tested"): string | null {
  const shown = candidateLabel(candidate);
  return shown ? `${verb} ${shown.short}` : null;
}

/** A step's own attempts are built, a check's tested. */
export const attemptVerb = (kind: PlanStep["kind"]): "built" | "tested" => (kind === "verify" ? "tested" : "built");

/** "a", "a and b", "a, b and c". */
export function andList(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** The builds an integration step brings in, each as "@builder's" (with its place when one node has several steps). */
export function integratedSteps(step: Pick<PlanStep, "integrates">, steps: readonly Pick<PlanStep, "id" | "handle">[]): Array<{ id: string; label: string }> {
  return (step.integrates ?? []).flatMap((id) => {
    const at = steps.findIndex((row) => row.id === id);
    if (at < 0) return [];
    const handle = steps[at]!.handle;
    const twice = steps.filter((row) => row.handle === handle).length > 1;
    return [{ id, label: `@${handle}'s${twice ? ` (step ${at + 1})` : ""}` }];
  });
}

/** "Brings in @a's and @b's work". */
export function integratesLine(parts: ReadonlyArray<{ label: string }>): string | null {
  return parts.length ? `Brings in ${andList(parts.map((row) => row.label))} work` : null;
}

const key = (candidate: Candidate | null | undefined) => candidate?.commit?.trim() || candidate?.contentHash?.trim() || null;
const short = (value: string) => value.slice(0, 7);

/** What a passing check tested: its passing attempt's candidate, else the build it checks as it was when the check passed. */
function testedFor(step: Pick<PlanStep, "attempts" | "verifies">, steps: readonly Pick<PlanStep, "id" | "attempts">[]): string | null {
  const passed = [...(step.attempts ?? [])].reverse().find((row) => row.outcome === "pass");
  if (!passed) return null;
  const own = key(passed.candidate);
  if (own) return own;
  const build = steps.find((row) => row.id === step.verifies);
  const done = [...(build?.attempts ?? [])].reverse().find((row: Attempt) => row.outcome === "done" && key(row.candidate) && row.endedAt && (!passed.endedAt || row.endedAt <= passed.endedAt));
  return key(done?.candidate);
}

/**
 * A passing check that a later change in the same place no longer covers (`staleAfter`): "Passed for
 * 1a2b3c4, but @builder's step then changed it (9f8e7d6): this pass doesn't cover that change."
 */
export function staleNote(step: Pick<PlanStep, "staleAfter" | "attempts" | "verifies">, steps: readonly Pick<PlanStep, "id" | "attempts">[]): string | null {
  const after = step.staleAfter;
  if (!after?.candidate) return null;
  const tested = testedFor(step, steps);
  const changed = `@${after.handle}'s step then changed it (${short(after.candidate)})`;
  return tested ? `Passed for ${short(tested)}, but ${changed}: this pass doesn't cover that change.` : `It passed, but ${changed}: this pass doesn't cover that change.`;
}
