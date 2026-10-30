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

/** Pending questions a run asked: the cards whose job is this one, oldest first. */
export function decisionsForJob(decisions: readonly AgentDecision[] | undefined, jobId: string | null | undefined): AgentDecision[] {
  if (!jobId) return [];
  return (decisions ?? []).filter((row) => row.status === "pending" && ofJob(row, jobId)).sort((a, b) => Date.parse(a.requestedAt) - Date.parse(b.requestedAt));
}

/** A run's questions that are no longer waiting (answered here or anywhere, or expired), oldest first: its checkpoints. */
export function answeredForJob(decisions: readonly AgentDecision[] | undefined, jobId: string | null | undefined): AgentDecision[] {
  if (!jobId) return [];
  return (decisions ?? []).filter((row) => row.status !== "pending" && ofJob(row, jobId)).sort((a, b) => Date.parse(a.requestedAt) - Date.parse(b.requestedAt));
}

/** Run approvals waiting for this run: by its run, or by its job when Ensemble says. */
export function approvalsForRun(approvals: readonly ApprovalRecord[] | undefined, runId: string | null | undefined, jobId?: string | null): ApprovalRecord[] {
  if (!runId && !jobId) return [];
  return (approvals ?? []).filter((row) => !row.decision && ((runId && row.runId === runId) || (jobId && row.jobId === jobId)));
}
