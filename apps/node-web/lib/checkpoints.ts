/**
 * Every question to the owner is a card in the chat where the node is talking. While it waits it stays
 * open; once answered it folds into a checkpoint: a small chip with one line saying what was decided,
 * which opens back into the card. These are the rules: which cards are still open, the chip's words for
 * each kind of card, the answer a computer's question sends, and the chips of a run's own questions.
 */
import { computerAction, runAgent, runAsk } from "./cards";
import { deviceCodeCommand } from "./device-code";
import { liveEndedText, liveOpen } from "./live-session";
import { loginCommand, loginProvider, loginPurpose, loginSite } from "./login";
import { TOOL_LABEL } from "./text";
import type { AgentDecision, DecisionBody } from "./types";

export type CheckpointTone = "ok" | "muted" | "danger" | "warn";
/** The chip's round icon: done, not done, went wrong, or ran out of time. */
export type CheckpointIcon = "check" | "x" | "alert" | "clock";
export type Checkpoint = { text: string; tone: CheckpointTone; icon: CheckpointIcon };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CardData = Record<string, any> | null | undefined;

/** A card waits for its owner (pending, or a code a sign-in asks for), or its computer or Ensemble is acting on the answer. */
const OPEN: ReadonlySet<string> = new Set(["pending", "needs_code", "applying", "saving", "working", "running"]);

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** Whether a card stays open in the chat: it waits for an answer, or the answer is being carried out; a live session's card while it lasts. */
export const cardOpen = (data: CardData): boolean => (data?.type === "live" ? liveOpen(data) : OPEN.has(text(data?.status) || "pending"));

/** An answer given here that the card does not show yet: the server updates the card soon after. A run's question also keeps allow or deny and its scope. */
export type LocalAnswer = { status: string; answer?: string | null; answeredAt: string; decision?: "allow" | "deny"; scope?: string };

/** The card as it should read now: its own data, or the answer just given here while the card still says pending. */
export function withLocalAnswer<T extends CardData>(data: T, local: LocalAnswer | null | undefined): T {
  if (!local || text(data?.status) !== "pending") return data;
  return { ...(data ?? {}), status: local.status, answer: local.answer ?? null, answeredAt: local.answeredAt, ...(local.decision ? { decision: local.decision } : {}), ...(local.scope ? { scope: local.scope } : {}) } as unknown as T;
}

/** How a run's question card reads straight after an answer here. */
export function runDecisionAnswered(body: DecisionBody, now = new Date()): LocalAnswer {
  return { status: "answered", answer: body.reason ?? null, answeredAt: now.toISOString(), decision: body.decision, scope: body.scope };
}

/** The options a computer's question offers (Once, This mission, Always for this folder), in its order. */
export function computerOptions(data: CardData): string[] {
  const options = Array.isArray(data?.options) ? data.options.filter((row: unknown): row is string => typeof row === "string" && row.trim().length > 0).map((row: string) => row.trim()) : [];
  return options.length ? [...new Set(options)].slice(0, 4) : ["Once"];
}

/**
 * The computer's answers as buttons, the lasting one first (the owner's rule: ask at most once per
 * folder): "Allow in this folder from now on", "Only this mission", "Just once". Each still sends the
 * computer's own words for it (`option`).
 */
export function computerChoices(data: CardData): Array<{ option: string; label: string }> {
  const rank = (option: string) => (/^always/i.test(option) ? 0 : /mission/i.test(option) ? 1 : /^once$/i.test(option) ? 2 : 3);
  const site = data?.scope === "origin";
  return computerOptions(data)
    .map((option, at) => ({ option, at }))
    .sort((a, b) => rank(a.option) - rank(b.option) || a.at - b.at)
    .map(({ option }) => ({
      option,
      label: /^always/i.test(option) ? (site ? "Allow this address from now on" : "Allow in this folder from now on") : /mission/i.test(option) ? "Only this mission" : /^once$/i.test(option) ? "Just once" : option,
    }));
}

/** What answering a computer's question sends to `POST /api/decisions/:id/decide`: the option picked travels as `reason`. */
export function computerDecision(option: string | null): DecisionBody {
  return option ? { decision: "allow", scope: "once", reason: option } : { decision: "deny", scope: "once" };
}

/** How the card reads straight after an answer here: allowed with the option, or not allowed. */
export function computerAnswered(option: string | null, now = new Date()): LocalAnswer {
  return { status: option ? "allowed" : "denied", answer: option ?? "No", answeredAt: now.toISOString() };
}

const handleOf = (value: unknown, fallback: string): string => {
  const slug = text(value).replace(/^@/, "");
  return slug ? `@${slug}` : fallback;
};

/** A site's address without its scheme: "https://github.com/login" → "github.com". */
export const siteName = loginSite;

/** "Create tasks, Update page +2": the calls a card held, by their labels. */
function callNames(data: CardData): string {
  const calls: unknown[] = Array.isArray(data?.calls) ? data.calls : [];
  const names = [...new Set(calls.map((call) => TOOL_LABEL(text((call as { name?: unknown })?.name) || "change")))];
  if (!names.length) return "the changes";
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3}` : names.join(", ");
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const ok = (value: string): Checkpoint => ({ text: value, tone: "ok", icon: "check" });
const no = (value: string): Checkpoint => ({ text: value, tone: "muted", icon: "x" });
const late = (value: string): Checkpoint => ({ text: value, tone: "muted", icon: "clock" });
const failed = (value: string): Checkpoint => ({ text: value, tone: "danger", icon: "alert" });

/**
 * The checkpoint's one line for a settled card: "Allowed @assistant-3 to browse walmart.com · Once",
 * "Ran as administrator: apt-get install -y xvfb · exit 0", "Saved secret STRIPE_KEY". `handle` is the
 * node's, `roomTitle` the conversation's.
 */
export function cardCheckpoint(data: CardData, context: { handle: string; roomTitle: string }): Checkpoint {
  const status = text(data?.status);
  const type = text(data?.type) || "tools";
  const node = handleOf(context.handle, "The node");
  const expired = status === "expired";
  switch (type) {
    case "computer": {
      const action = computerAction(data);
      if (status === "allowed") return ok(`Allowed ${node} to ${action}${text(data?.answer) ? ` · ${text(data?.answer)}` : ""}`);
      if (status === "denied") return no(`Didn't allow ${node} to ${action}`);
      if (expired) return late(`No answer in time: ${node} asked to ${action}`);
      break;
    }
    case "sudo": {
      const command = text(data?.command) || "the command";
      const code = typeof data?.exitCode === "number" ? data.exitCode : null;
      // A command that ran and exited with another code than 0 did not work, whether Ensemble calls it done or failed.
      if ((status === "done" || status === "failed") && code !== null && code !== 0) return failed(`Ran as administrator: ${command} · failed, exit ${code}`);
      if (status === "done") return ok(`Ran as administrator: ${command}${code === 0 ? " · exit 0" : ""}`);
      if (status === "failed") return failed(`Couldn't run as administrator: ${command}`);
      if (status === "denied") return no(`Didn't run as administrator: ${command}`);
      if (expired) return late(`No answer in time: ${command} was not run`);
      break;
    }
    case "crew_add": {
      const who = handleOf(data?.handle ?? data?.nodeSlug, text(data?.nodeName) || "the node");
      // Asked outside the crew (its own chat), the crew is named.
      const crew = text(data?.crewTitle) && text(data?.crewTitle) !== context.roomTitle ? `“${text(data?.crewTitle)}”` : "the crew";
      if (status === "approved" || status === "applied") return ok(`Added ${who} to ${crew}`);
      if (status === "discarded" || status === "declined") return no(`Didn't add ${who} to ${crew}`);
      if (expired) return late(`No answer in time: ${node} asked to add ${who}`);
      break;
    }
    case "session": {
      if (data?.action === "hand_over") {
        const to = handleOf(data?.input?.to, "another node");
        if (status === "applied") return ok(`Handed the session to ${to}`);
        if (status === "discarded") return no(`Didn't hand the session to ${to}`);
        break;
      }
      const title = text(data?.input?.title) || text(data?.input?.prompt).split("\n")[0] || "the work";
      if (status === "applied") return ok(`Started work on your computer: ${title}`);
      if (status === "discarded") return no(`Didn't start: ${title}`);
      break;
    }
    case "post": {
      if (data?.request) {
        const who = handleOf(data.request?.to?.handle, text(data.request?.to?.name) || "them");
        if (status === "posted") return ok(`Sent the request to ${who}`);
        if (status === "discarded") return no(`Didn't send the request to ${who}`);
        break;
      }
      const what = data?.result ? "the result" : data?.disclosure || data?.peerRequest ? "the answer" : null;
      if (status === "posted") return ok(`Posted ${what ? `${what} ` : ""}in “${context.roomTitle}”`);
      if (status === "discarded") return no(`Didn't post ${what ?? "the draft"}`);
      break;
    }
    case "secret": {
      const name = text(data?.name) || "a secret";
      if (status === "saved") return ok(`Saved secret ${name}`);
      if (status === "discarded") return no(`Declined secret ${name}`);
      break;
    }
    case "login": {
      const site = siteName(data?.origin);
      const check = loginPurpose(data ?? {}) === "human_check";
      const command = loginCommand(data);
      if (command) {
        const provider = loginProvider(data?.origin);
        if (status === "signed_in") return ok(`Signed in to ${provider} for ${command}`);
        if (status === "declined") return no(`Didn't sign in to ${provider} for ${command}`);
        if (expired) return late(`No answer in time: ${command} wanted a sign-in to ${provider}`);
        if (status === "ended") return late(`${command} ended before signing in to ${provider}`);
      }
      if (status === "signed_in") return ok(`Signed in to ${site}`);
      if (status === "passed") return ok(`Passed the human check on ${site}`);
      if (status === "declined") return no(check ? `Skipped the human check on ${site}` : `Didn't sign in to ${site}`);
      if (expired) return late(check ? `No answer in time: human check on ${site}` : `No answer in time: sign-in to ${site}`);
      if (status === "ended") return late(check ? `Human check on ${site} ended` : `Sign-in to ${site} ended`);
      break;
    }
    case "device_code": {
      const command = deviceCodeCommand(data);
      const on = text(data?.computer) ? ` on ${text(data?.computer)}` : "";
      if (status === "done") return ok(`Signed in with a code: ${command}${on}`);
      if (expired) return late(`Sign-in code expired: ${command}${on}`);
      break;
    }
    case "live":
      return late(liveEndedText(data ?? {}));
    case "run_decision": {
      const agent = runAgent(data) ?? "the agent";
      const question = text(data?.event) === "question";
      const what = question ? text(data?.title) || "its question" : runAsk(data);
      // The node may answer its own run's question; then the chip says so.
      const by = data?.answeredBy === "node" ? node : null;
      if (status === "answered" || status === "decided") {
        const answer = text(data?.answer);
        if (data?.decision === "deny") return no(question ? `Skipped, the agent chose: ${what}` : `${by ? `${by} didn't allow` : "Didn't allow"} ${agent} to ${what}`);
        if (question) return ok(answer ? `${by ? `${by} answered` : "Answered"}: “${answer}”` : `${by ? `${by} answered` : "Answered"}: ${what}`);
        const scope = text(data?.scope);
        const how = scope === "session" ? "For this run" : scope === "always" ? "Always" : answer && !/^(allow|yes)$/i.test(answer) ? answer : "Once";
        return ok(`${by ? `${by} allowed` : "Allowed"} ${agent} to ${what} · ${how}`);
      }
      if (expired) return late(`No answer in time: ${question ? what : `${agent} asked to ${what}`}`);
      if (status === "closed") return late(`The run ended before an answer: ${question ? what : `${agent} asked to ${what}`}`);
      break;
    }
    case "media_preview": {
      const count = Array.isArray(data?.evidence) ? data.evidence.length : 0;
      const what = count > 1 ? plural(count, "capture", "captures") : "a capture";
      if (status === "released") return ok(`Sent ${what}`);
      if (status === "discarded") return no(`Discarded ${what}`);
      break;
    }
    case "node_proposal": {
      const crew = data?.action === "crew";
      const name = crew ? `the crew “${text(data?.input?.title) || "crew"}”` : handleOf(data?.result?.handle, text(data?.input?.name) || "the node");
      if (status === "applied") return ok(`Made ${name}`);
      if (status === "discarded") return no(`Didn't make ${name}`);
      break;
    }
    case "peer_request": {
      const from = text(data?.from?.name) || "Someone";
      const what = data?.kind === "review" ? "a review" : "work";
      if (status === "accepted" || status === "approved") return ok(`Accepted ${from}'s request for ${what}`);
      if (status === "answered") return ok(`Answered ${from}'s request`);
      if (status === "declined") return no(`Declined ${from}'s request for ${what}`);
      if (status === "cancelled") return no(`${from} cancelled the request`);
      if (expired) return late(`No answer in time: ${from}'s request`);
      break;
    }
    case "disclosure": {
      const asker = text(data?.asker?.name) || "them";
      const share = data?.mode !== "answer";
      if (status === "approved") return ok(share ? `Allowed ${node} to share with ${asker}` : `Let ${node} answer ${asker}`);
      if (status === "declined") return no(share ? `Didn't share with ${asker}` : `Didn't answer ${asker}`);
      if (expired) return late(`No answer in time: ${asker}'s question`);
      break;
    }
    case "tools": {
      const names = callNames(data);
      if (status === "applied") return Array.isArray(data?.result?.failed) && data.result.failed.length ? { text: `Partly applied: ${names}`, tone: "warn", icon: "alert" } : ok(`Approved: ${names}`);
      if (status === "partial") return { text: `Partly applied: ${names}`, tone: "warn", icon: "alert" };
      if (status === "discarded") return no(`Discarded: ${names}`);
      break;
    }
  }
  if (expired) return late("No answer in time");
  if (status === "discarded" || status === "declined" || status === "denied") return no(status === "denied" ? "Not allowed" : "Discarded");
  if (status === "failed") return failed(text(data?.error) || "It did not work");
  return ok(status ? `${status.charAt(0).toUpperCase()}${status.slice(1).replace(/_/g, " ")}` : "Answered");
}

type AnsweredDecision = Pick<AgentDecision, "event" | "title" | "detail" | "status"> & { decision?: string | null; scope?: string | null; reason?: string | null };

/** A run's question once answered (or no longer waiting), as a checkpoint: "Allowed once: npm test", "Answered “SQLite”". */
export function decisionCheckpoint(row: AnsweredDecision): Checkpoint {
  const command = text(row.detail?.command);
  const what = command || text(row.title) || "the request";
  const question = row.event === "question" || (Array.isArray(row.detail?.options) && row.detail.options.length > 0);
  if (row.status === "expired") return late(`No answer in time: ${text(row.title) || what}`);
  if (row.decision === "allow") {
    if (question) return ok(text(row.reason) ? `Answered “${text(row.reason)}”` : `Answered: ${text(row.title) || what}`);
    return ok(`${row.scope === "session" ? "Allowed for this run" : row.scope === "always" ? "Always allowed" : "Allowed once"}: ${what}`);
  }
  if (row.decision === "deny") return question ? no(`Skipped, the agent chose: ${text(row.title) || what}`) : no(`Denied: ${what}`);
  return ok(`Answered: ${text(row.title) || what}`);
}

/** A run approval answered here: "Approved: Push to main". */
export function approvalCheckpoint(row: { title: string; decision: "approved" | "rejected" }): Checkpoint {
  return row.decision === "approved" ? ok(`Approved: ${row.title}`) : no(`Rejected: ${row.title}`);
}
