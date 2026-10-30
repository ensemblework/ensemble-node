/**
 * A plan card as people read it (Ensemble's mission projection; build blocks B1, B2, B6): the
 * mission's status, each step's state and result kept apart, what holds a waiting step, a step's
 * attempts and the requirements ledger. Plans made before outcomes existed (contract 1, status
 * "done") read the same way with what they have.
 */
import type { Attempt, Candidate, Check, MissionStatus, PlanData, PlanStep, Requirement, RequirementStatus, StepOutcome } from "./types";

export type Tone = "muted" | "accent" | "ok" | "warn" | "danger";
export type Badge = { label: string; tone: Tone };

export type MissionView = { status: Exclude<MissionStatus, "done">; label: string; tone: Tone; live: boolean };

const MISSION: Record<Exclude<MissionStatus, "done">, Badge & { live: boolean }> = {
  draft: { label: "Planning", tone: "accent", live: true },
  running: { label: "Running", tone: "accent", live: true },
  reporting: { label: "Reporting", tone: "accent", live: true },
  succeeded: { label: "Succeeded", tone: "ok", live: false },
  partially_completed: { label: "Partly done", tone: "warn", live: false },
  failed: { label: "Failed", tone: "danger", live: false },
  stopped: { label: "Stopped", tone: "muted", live: false },
};

/** The mission's status. A plan from before outcomes ended "done": it is treated as succeeded and keeps its word. A status this site does not know yet is taken as still going, so Stop stays. */
export function missionView(status: string | null | undefined): MissionView {
  if (status === "done") return { status: "succeeded", label: "Done", tone: "ok", live: false };
  const known = status && status in MISSION ? (status as keyof typeof MISSION) : null;
  if (!known) return { status: "running", label: status ? status.replace(/_/g, " ").replace(/^./, (first) => first.toUpperCase()) : "Running", tone: "muted", live: true };
  const { label, tone, live } = MISSION[known];
  return { status: known, label, tone, live };
}

/** Outcomes that let the steps after it start. */
const SATISFIED: ReadonlySet<string> = new Set(["done", "pass"]);
/** Outcomes that hold the steps after it until a repair or a decision. */
const HOLDING: ReadonlySet<string> = new Set(["fail", "blocked", "unverified"]);
const ENDED: ReadonlySet<string> = new Set(["done", "blocked", "skipped", "stopped"]);

/** A step's current outcome; a step from before outcomes has the one its status implies. */
export function stepOutcome(step: Pick<PlanStep, "status" | "outcome">): StepOutcome {
  if (step.outcome) return step.outcome;
  return step.status === "done" ? "done" : step.status === "blocked" ? "blocked" : "unknown";
}

/** Steps that finished with a result the next steps can use. */
export function planProgress(plan: Pick<PlanData, "steps">): { done: number; total: number } {
  const steps = Array.isArray(plan.steps) ? plan.steps : [];
  return { done: steps.filter((step) => step.status === "done" && SATISFIED.has(stepOutcome(step))).length, total: steps.length };
}

/**
 * The step that holds a waiting one: an earlier step that failed, is blocked or unverified, or ended
 * without a result, found through the steps it waits on. Ensemble says which (`heldBy`); for cards
 * that do not, the same rule as Ensemble's (missions-core heldBy) works it out. Null when nothing
 * holds it.
 */
export function holderOf(step: PlanStep, steps: readonly PlanStep[], seen: Set<string> = new Set()): PlanStep | null {
  if (step.status !== "waiting" || step.held === false || seen.has(step.id)) return null;
  if (step.heldBy) {
    const named = steps.find((row) => row.id === step.heldBy) ?? steps.find((row) => row.handle === step.heldBy);
    if (named) return named;
  }
  seen.add(step.id);
  for (const id of step.after ?? []) {
    const before = steps.find((row) => row.id === id);
    if (!before) continue;
    const outcome = stepOutcome(before);
    if ((ENDED.has(before.status) && !SATISFIED.has(outcome)) || HOLDING.has(outcome)) return before;
    const deeper = holderOf(before, steps, seen);
    if (deeper) return deeper;
  }
  return null;
}

/** Whether a waiting step is held, and by which step when that is known. */
export function heldState(step: PlanStep, steps: readonly PlanStep[]): { held: boolean; holder: PlanStep | null } {
  if (step.status !== "waiting" || step.held === false) return { held: false, holder: null };
  const holder = holderOf(step, steps);
  return { held: step.held === true || Boolean(holder), holder };
}

/** How a step is named on its card: `@handle`, with its place when one node has several steps. */
export function stepName(step: Pick<PlanStep, "id" | "handle">, steps: readonly Pick<PlanStep, "id" | "handle">[]): string {
  const same = steps.filter((row) => row.handle === step.handle);
  return same.length > 1 ? `@${step.handle} (step ${steps.findIndex((row) => row.id === step.id) + 1})` : `@${step.handle}`;
}

const STATUS: Record<string, Badge> = {
  waiting: { label: "Waiting", tone: "muted" },
  working: { label: "Working", tone: "accent" },
  done: { label: "Done", tone: "ok" },
  blocked: { label: "Blocked", tone: "warn" },
  skipped: { label: "Skipped", tone: "muted" },
  stopped: { label: "Stopped", tone: "muted" },
};

const OUTCOME: Record<string, Badge> = {
  done: { label: "Done", tone: "ok" },
  pass: { label: "Pass", tone: "ok" },
  fail: { label: "Fail", tone: "danger" },
  blocked: { label: "Blocked", tone: "warn" },
  unverified: { label: "Unverified", tone: "warn" },
};

export function outcomeBadge(outcome: string | null | undefined): Badge | null {
  return (outcome && OUTCOME[outcome]) || null;
}

/**
 * A step's two badges: whether it ran (status) and what came of it (outcome). A step that ran with a
 * verdict reads "Finished" and its verdict; the outcome is left out where it would only repeat the
 * status ("Done", "Blocked").
 */
export function stepBadges(step: PlanStep, steps: readonly PlanStep[]): { status: Badge; outcome: Badge | null; held: boolean; holder: PlanStep | null } {
  const { held, holder } = heldState(step, steps);
  const outcome = stepOutcome(step);
  const verdict = outcomeBadge(outcome);
  if (held) return { status: { label: "Held", tone: "warn" }, outcome: null, held, holder };
  const status = STATUS[step.status] ?? { label: step.status, tone: "muted" as const };
  if (step.status === "done" && verdict && outcome !== "done") return { status: { label: "Finished", tone: "muted" }, outcome: verdict, held, holder };
  const repeats = (step.status === "done" && outcome === "done") || (step.status === "blocked" && outcome === "blocked") || step.status === "working" || step.status === "waiting";
  return { status, outcome: repeats ? null : verdict, held, holder };
}

const KIND: Record<string, string> = { build: "Build", verify: "Verify", write: "Write", research: "Research" };
const EXECUTOR: Record<string, string> = { self: "on its own", session: "agent session", helper: "helper" };

/** "Verify · agent session": what a step does and who does it; empty for a plan from before kinds. */
export function stepKindLine(step: Pick<PlanStep, "kind" | "executor">): string {
  return [step.kind ? KIND[step.kind] : null, step.executor ? EXECUTOR[step.executor] : null].filter(Boolean).join(" · ");
}

const REASON: Record<string, string> = { repair: "repair", retest: "retest", nudge: "asked to report" };

/** "Attempt 2 · repair", "Attempt 2 · retest"; the first is just "Attempt 1". */
export function attemptLabel(attempt: Pick<Attempt, "n" | "reason">): string {
  const reason = REASON[attempt.reason];
  return `Attempt ${attempt.n}${reason ? ` · ${reason}` : ""}`;
}

/** A step's attempts, oldest first: listed only when there was more than one, or the one has checks or a candidate. */
export function attemptsToShow(step: Pick<PlanStep, "attempts">): Attempt[] {
  const attempts = Array.isArray(step.attempts) ? [...step.attempts].sort((a, b) => a.n - b.n) : [];
  return attempts.length > 1 || attempts.some((row) => row.checks?.length || row.candidate) ? attempts : [];
}

/** What a build produced or a verification tested, short ("a1b2c3d on testing") and in full for its tooltip. */
export function candidateLabel(candidate: Candidate | null | undefined): { short: string; full: string } | null {
  if (!candidate) return null;
  const commit = candidate.commit?.trim();
  const hash = candidate.contentHash?.trim();
  const url = candidate.url?.trim();
  const head = commit ? commit.slice(0, 7) : hash ? `content ${hash.slice(0, 8)}` : url ? url.replace(/^https?:\/\//, "") : null;
  if (!head) return null;
  const branch = candidate.branch?.trim();
  const full = [candidate.repo ?? candidate.folder, branch, commit ? `commit ${commit}` : hash ? `content hash ${hash}` : null, url].filter(Boolean).join(" · ");
  return { short: branch ? `${head} on ${branch}` : head, full };
}

/** "2 of 3 checks passed · 1 failed". */
export function checkTally(checks: readonly Pick<Check, "verdict">[] | null | undefined): string | null {
  const list = checks ?? [];
  if (!list.length) return null;
  const count = (verdict: Check["verdict"]) => list.filter((check) => check.verdict === verdict).length;
  const passed = count("pass");
  const rest = (["fail", "blocked", "skipped"] as const).filter((verdict) => count(verdict)).map((verdict) => `${count(verdict)} ${verdict === "fail" ? "failed" : verdict}`);
  return [`${passed} of ${list.length} ${list.length === 1 ? "check" : "checks"} passed`, ...rest].join(" · ");
}

const REQUIREMENT: Record<RequirementStatus, Badge> = {
  open: { label: "Open", tone: "muted" },
  in_progress: { label: "In progress", tone: "accent" },
  accepted: { label: "Accepted", tone: "ok" },
  failed: { label: "Failed", tone: "danger" },
  deferred: { label: "Deferred", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

export function requirementBadge(status: string): Badge {
  return REQUIREMENT[status as RequirementStatus] ?? { label: status, tone: "muted" };
}

/** The ledger's one line: "3 of 5 accepted · 1 failed · 1 deferred". */
export function ledgerSummary(requirements: readonly Pick<Requirement, "status">[]): string {
  const count = (status: RequirementStatus) => requirements.filter((row) => row.status === status).length;
  const rest = (["failed", "in_progress", "open", "deferred", "cancelled"] as const).filter((status) => count(status)).map((status) => `${count(status)} ${REQUIREMENT[status].label.toLowerCase()}`);
  return [`${count("accepted")} of ${requirements.length} accepted`, ...rest].join(" · ");
}

/** The requirements a step covers, as the ledger names them. */
export function stepRequirements(step: Pick<PlanStep, "requirementIds">, plan: Pick<PlanData, "requirements">): Requirement[] {
  const all = Array.isArray(plan.requirements) ? plan.requirements : [];
  return (step.requirementIds ?? []).flatMap((id) => all.filter((row) => row.id === id));
}

/** A node's own piece of work (`kind: "self"`, one step) shows as a compact work card. */
export function isWorkCard(plan: Pick<PlanData, "kind" | "steps">): boolean {
  return plan.kind === "self" && (plan.steps?.length ?? 0) <= 1;
}

const BLOCKED: Record<string, string> = {
  needs_owner: "It needs you",
  login_required: "It needs a sign-in",
  missing_access: "It is missing access",
  environment: "Something on the computer is in the way",
  no_report: "It ended without a report",
  no_progress: "It made no progress",
};

/** Why a worker was blocked, in words; null when it did not say. */
export const blockedReason = (blockedBy: string | null | undefined): string | null => (blockedBy && BLOCKED[blockedBy]) || null;

const VERDICT: Record<string, string> = { pass: "Passed", fail: "Failed", blocked: "Blocked", skipped: "Skipped" };

/** A check's verdict in words, for screen readers and tooltips. */
export const verdictLabel = (verdict: string): string => VERDICT[verdict] ?? verdict;
