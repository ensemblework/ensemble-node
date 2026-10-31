/** Pure rules for answering a run's questions from Node: what a card offers, and which cards belong to a run. */
import type { AgentDecision, ApprovalRecord, DecisionBody } from "./types";

/**
 * How Node can answer a question from an agent.
 * - elsewhere: someone else answers it (the person whose computer runs it).
 * - in-ensemble: an editor's own multiple-choice question; answer it in Ensemble.
 * - on-computer: that computer takes this kind of approval only on itself; Deny works here.
 * - question: a run asks; pick an option (the recommended one is marked) or, when allowed, type an answer.
 * - permission: Allow once or Deny; `forRun` adds Allow for this run; `confirm` asks again before allowing.
 */
export type DecisionView =
  | { kind: "elsewhere" }
  | { kind: "in-ensemble" }
  | { kind: "on-computer"; computer: string }
  | { kind: "question"; options: string[]; recommended: string | null; custom: boolean; confirm: boolean }
  | { kind: "permission"; forRun: boolean; confirm: boolean };

type Decidable = Pick<AgentDecision, "canAnswer" | "detail" | "event" | "source" | "toolName">;

export function decisionView(decision: Decidable): DecisionView {
  const detail = decision.detail ?? {};
  if (decision.canAnswer === false) return { kind: "elsewhere" };
  const device = Boolean(detail.deviceId);
  if (device && (detail.tier === "run_branch_push" || detail.tier === "high_risk")) return { kind: "on-computer", computer: detail.deviceName?.trim() || "that computer" };
  const options = (detail.options ?? []).filter((option) => typeof option === "string" && option.length > 0);
  const confirm = detail.confirm === true;
  const ensemble = decision.source === "ensemble";
  if (decision.event === "question" || options.length) {
    if (!ensemble) return options.length ? { kind: "in-ensemble" } : { kind: "permission", forRun: false, confirm };
    return {
      kind: "question",
      options,
      recommended: detail.recommended && options.includes(detail.recommended) ? detail.recommended : null,
      // A computer takes typed words only when it asked for them; a run on this server takes any answer.
      custom: detail.allowCustom === true || (!options.length && !device),
      confirm,
    };
  }
  // A computer's answers from the web are once only; a push is confirmed each time.
  return { kind: "permission", forRun: ensemble && !device && decision.toolName !== "git push", confirm };
}

/** A run's question or permission as its card in the chat carries it (`data.type: "run_decision"`). */
export type RunDecisionCard = {
  decisionId?: string;
  jobId?: string;
  event?: string;
  title?: string;
  command?: string | null;
  options?: unknown;
  allowCustom?: boolean;
  recommended?: string | null;
};

/**
 * How a run's card in the chat is answered: as Ensemble's own row says when it is loaded (a risky one
 * confirmed first, one only its computer approves, someone else's), else from the card. Options and
 * typed answers are answered here, whichever agent asked.
 */
export function runDecisionView(card: RunDecisionCard, live?: AgentDecision | null): DecisionView {
  if (live) {
    const view = decisionView(live);
    if (view.kind !== "in-ensemble") return view;
  }
  const raw = Array.isArray(live?.detail?.options) ? live.detail.options : Array.isArray(card.options) ? card.options : [];
  const options = [...new Set(raw.filter((option): option is string => typeof option === "string" && option.trim().length > 0))];
  const confirm = live?.detail?.confirm === true;
  if ((live?.event ?? card.event) === "question" || options.length) {
    const recommended = live?.detail?.recommended ?? card.recommended ?? null;
    return { kind: "question", options, recommended: recommended && options.includes(recommended) ? recommended : null, custom: card.allowCustom === true || live?.detail?.allowCustom === true || !options.length, confirm };
  }
  // A computer's answers from the web are once only: "for this run" only when Ensemble's own row allows it.
  return { kind: "permission", forRun: false, confirm };
}

/** The whole card as Ensemble keeps it: its question, and once settled how and by whom. */
export type RunDecisionCardData = RunDecisionCard & {
  status?: "pending" | "answered" | "expired" | "closed" | string;
  runTitle?: string | null;
  cwd?: string | null;
  answer?: string | null;
  decision?: "allow" | "deny" | null;
  scope?: string | null;
  answeredAt?: string | null;
  answeredBy?: "owner" | "node" | "elsewhere" | null;
  plan?: { id?: string; step?: string } | null;
};

/** Ensemble's row for a card whose row is not loaded: enough to answer it. */
export function runDecisionRow(card: RunDecisionCard & { cwd?: string | null }): AgentDecision {
  return {
    id: card.decisionId ?? "",
    source: "other",
    event: card.event ?? "permission",
    toolName: "",
    title: card.title ?? "",
    detail: { command: card.command ?? null, options: Array.isArray(card.options) ? (card.options as string[]) : [], allowCustom: card.allowCustom === true, recommended: card.recommended ?? null, ...(card.jobId ? { jobId: card.jobId } : {}) },
    cwd: card.cwd ?? null,
    status: "pending",
    requestedAt: "",
    expiresAt: "",
  };
}

/** What to send for an answer. A question's answer travels as `reason`. */
export function decisionBody(choice: { allow: boolean; forRun?: boolean; answer?: string | null; confirmed?: boolean }): DecisionBody {
  const answer = choice.answer?.trim();
  return {
    decision: choice.allow ? "allow" : "deny",
    scope: choice.allow && choice.forRun ? "session" : "once",
    ...(answer ? { reason: answer } : {}),
    ...(choice.confirmed ? { confirmed: true as const } : {}),
  };
}

/** The note shown once an answer is sent. */
export function answeredNote(view: DecisionView, body: DecisionBody): string {
  if (view.kind === "question") return body.decision === "allow" ? "Answer sent. The agent continues." : "Skipped. The agent will choose and say what it chose.";
  if (body.decision === "deny") return "Denied. The agent was told.";
  return body.scope === "session" ? "Allowed for this run." : "Allowed once.";
}

/** Whether a question from an agent belongs to this run: its job asked (`detail.jobId`), or its run's session is the job (`sessionId`). */
const ofJob = (row: Pick<AgentDecision, "detail" | "sessionId">, jobId: string) => row.detail?.jobId === jobId || row.sessionId === jobId;

/**
 * Pending questions a run asked: the cards whose job is this one, oldest first. Those with their own card
 * in the chat (`hasCard`) are answered there, so the run card does not show them twice.
 */
export function decisionsForJob(decisions: readonly AgentDecision[] | undefined, jobId: string | null | undefined, hasCard?: (decisionId: string) => boolean): AgentDecision[] {
  if (!jobId) return [];
  return (decisions ?? []).filter((row) => row.status === "pending" && ofJob(row, jobId) && !hasCard?.(row.id)).sort((a, b) => Date.parse(a.requestedAt) - Date.parse(b.requestedAt));
}

/** A run's questions that are no longer waiting (answered here or anywhere, or expired), oldest first: its checkpoints. Those with their own card keep their checkpoint there. */
export function answeredForJob(decisions: readonly AgentDecision[] | undefined, jobId: string | null | undefined, hasCard?: (decisionId: string) => boolean): AgentDecision[] {
  if (!jobId) return [];
  return (decisions ?? []).filter((row) => row.status !== "pending" && ofJob(row, jobId) && !hasCard?.(row.id)).sort((a, b) => Date.parse(a.requestedAt) - Date.parse(b.requestedAt));
}

/** Run approvals waiting for this run: by its run, or by its job when Ensemble says. */
export function approvalsForRun(approvals: readonly ApprovalRecord[] | undefined, runId: string | null | undefined, jobId?: string | null): ApprovalRecord[] {
  if (!runId && !jobId) return [];
  return (approvals ?? []).filter((row) => !row.decision && ((runId && row.runId === runId) || (jobId && row.jobId === jobId)));
}
