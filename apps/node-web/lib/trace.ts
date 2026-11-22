/**
 * A node turn's trace in words, for its owner (Ensemble docs/35 §5.7, `GET /api/node/turns/:turnId/trace`):
 * how it ended, its model, tokens and time on one line; each part of its instructions and its size; each
 * tool call with its time and sizes, the agent's own calls on the owner's AI plan marked with how they were
 * answered; what it was given; the decisions about it; the answer check; its report; and how its loop ran.
 * A trace keeps sizes, names and timings, never what anyone wrote or what a tool returned, so this reads
 * only those. Older or partial records read as far as they go.
 */
import type { Badge, Tone } from "./plan";
import { agentName } from "./session";
import { TOOL_LABEL } from "./text";
import type { Message, ReplyOutcome, TraceCall, TraceDecision, TraceDropped, TraceOwnCall, TraceSelected, TraceStepReport, TraceReplyReport, TraceVerification, TurnPlacement, TurnRecord, TurnTraceRecord, TurnTraceView } from "./types";
import { elapsedSeconds, formatDuration } from "./work-log";

const num = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
const one = (value: number) => value.toFixed(1).replace(/\.0$/, "");
const plural = (count: number, word: string, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;
/** "waiting_approval" → "Waiting approval": a value this site has no words for yet. */
const words = (value: string) => value.replace(/[_-]+/g, " ").replace(/^./, (first) => first.toUpperCase());

/** A count people read at a glance: 812, 1.2k, 12.4k, 123k, 1.5M. */
export function compactCount(value: number): string {
  const n = num(value) ? Math.max(0, Math.round(value)) : 0;
  if (n < 1000) return String(n);
  if (n < 100_000) return `${one(n / 1000)}k`;
  const thousands = Math.round(n / 1000);
  return thousands < 1000 ? `${thousands}k` : `${one(n / 1_000_000)}M`;
}

const REPLY: Record<ReplyOutcome, Badge> = {
  done: { label: "Done", tone: "ok" },
  partial: { label: "Partly done", tone: "warn" },
  blocked: { label: "Blocked", tone: "warn" },
  failed: { label: "Failed", tone: "danger" },
  stopped: { label: "Stopped", tone: "muted" },
  uncertain: { label: "Uncertain", tone: "warn" },
};

const STEP: Record<string, Badge> = {
  done: { label: "Done", tone: "ok" },
  pass: { label: "Passed", tone: "ok" },
  fail: { label: "Failed", tone: "danger" },
  blocked: { label: "Blocked", tone: "warn" },
  partial: REPLY.partial,
  uncertain: REPLY.uncertain,
  stopped: REPLY.stopped,
};

/** A turn's own outcome, while it waits or runs and how it ended (`node_turns.outcome`). */
const TURN: Record<string, Badge> = {
  queued: { label: "Queued", tone: "accent" },
  running: { label: "Running", tone: "accent" },
  waiting_approval: { label: "Waiting for you", tone: "warn" },
  done: { label: "Done", tone: "ok" },
  failed: { label: "Failed", tone: "danger" },
  parked: { label: "Waiting for your answer", tone: "warn" },
  coalesced: { label: "Taken over", tone: "muted" },
  skipped: { label: "Skipped", tone: "muted" },
  retry: { label: "Rate limited", tone: "muted" },
  cancelled: { label: "Stopped", tone: "muted" },
};

/** How the turn ended: its report's outcome when it has one, else the turn's own. */
export function traceOutcome(view: Pick<TurnTraceView, "turn" | "trace">): Badge {
  const report = view.trace?.report;
  if (report?.kind === "reply" && report.outcome && REPLY[report.outcome]) return REPLY[report.outcome];
  if (report?.kind === "step") {
    if (report.reported === false) return { label: "No report", tone: "warn" };
    const step = STEP[report.outcome ?? ""];
    if (step) return step;
  }
  const outcome = str(view.turn.outcome) ?? str(view.turn.status) ?? "running";
  return TURN[outcome] ?? { label: words(outcome), tone: "muted" };
}

/** Whether the turn is still to end, so its trace is still to come. */
export const turnLive = (turn: Pick<TurnRecord, "status" | "outcome" | "finishedAt">): boolean =>
  !turn.finishedAt && ["queued", "running", "waiting_approval"].includes(str(turn.outcome) ?? str(turn.status) ?? "");

/**
 * The model the turn used (as the provider reported it, else as it was sent or asked for), and how it got
 * there when those differ: the node's settings asked for one, a rate limit sent another, the provider named a version.
 */
export function modelLine(trace: Pick<TurnTraceRecord, "modelRequested" | "modelSent" | "modelReported"> | null, fallback?: string | null): { model: string | null; detail: string | null } {
  const steps = [
    ["Asked for", str(trace?.modelRequested)],
    ["sent", str(trace?.modelSent)],
    ["reported", str(trace?.modelReported)],
  ].filter((row): row is [string, string] => Boolean(row[1]));
  const model = steps.at(-1)?.[1] ?? str(fallback);
  const same = steps.every(([, value]) => value === steps[0]![1]);
  if (same) return { model, detail: null };
  return { model, detail: steps.map(([label, value], at) => `${at === 0 ? label.charAt(0).toUpperCase() + label.slice(1) : label} ${value}`).join(" · ") };
}

/** "12.4k tokens in, 812 out". */
export function tokensLine(tokensIn: number | null | undefined, tokensOut: number | null | undefined): string | null {
  if (num(tokensIn) && num(tokensOut)) return `${compactCount(tokensIn)} tokens in, ${compactCount(tokensOut)} out`;
  if (num(tokensIn)) return `${compactCount(tokensIn)} tokens in`;
  if (num(tokensOut)) return `${compactCount(tokensOut)} tokens out`;
  return null;
}

/** What the turn cost: included credits, or the estimate for the owner's own API key. Nothing for the owner's AI plan. */
export function costLine(trace: Pick<TurnTraceRecord, "credits" | "costUsd"> | null): string | null {
  const credits = trace?.credits;
  if (num(credits) && credits > 0) return `${credits >= 10 ? Math.round(credits) : credits >= 0.1 ? one(credits) : "under 0.1"} credits`;
  const usd = trace?.costUsd;
  if (num(usd) && usd > 0) return `about $${usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2)}`;
  return null;
}

/** How long the turn took, from when it was queued to when it ended; nothing while it runs. */
export function turnTime(turn: Pick<TurnRecord, "createdAt" | "finishedAt">): string | null {
  if (!turn.finishedAt) return null;
  const seconds = elapsedSeconds(turn.createdAt, turn.finishedAt);
  return seconds === null ? null : formatDuration(seconds * 1000);
}

/** The trace's one line: "Done · gpt-5-mini · 12.4k tokens in, 812 out · 14s". */
export function traceSummary(view: TurnTraceView): string {
  return [traceOutcome(view).label, ...summaryParts(view)].join(" · ");
}

/** The line after the outcome: the model, the tokens and the time, as far as they are known. */
export function summaryParts(view: TurnTraceView): string[] {
  return [modelLine(view.trace, view.turn.model).model, tokensLine(view.trace?.tokensIn, view.trace?.tokensOut), turnTime(view.turn)].filter((part): part is string => Boolean(part));
}

/** The turn whose trace a message opens: its `data.turnId`, only on a message one of my own nodes posted. */
export function messageTurn(message: Pick<Message, "id" | "authorNodeId" | "data">, meId: string, ownerOf: (nodeId: string) => string | null | undefined): string | null {
  const turnId = str(message.data?.turnId);
  if (!turnId || !message.authorNodeId || message.id.startsWith("local-")) return null;
  return ownerOf(message.authorNodeId) === meId ? turnId : null;
}

const PLACE: Record<string, string> = { included: "Included AI", "owner-key": "Your API key", local: "A local model", "owner-subscription": "Your AI plan" };

/** Who paid for the model: "Included AI", "Your API key", "Your AI plan". */
export const placementWords = (placement: TurnPlacement | null | undefined): string | null => (placement?.inference ? (PLACE[placement.inference] ?? words(placement.inference)) : null);

export type SectionRow = { name: string; tier: string; chars: number; tokens: number };
export type DroppedRow = { name: string; tier: string; tokens: number; items: number | null };

const TIERS = ["stable", "context", "volatile"];

/** Each part of the turn's instructions in order, the tokens of each tier, all of them, and what was left out to fit. */
export function sectionRows(sections: TurnTraceRecord["sections"] | null | undefined): { rows: SectionRow[]; tiers: Array<{ tier: string; tokens: number }>; total: number; dropped: DroppedRow[] } {
  const rows = (Array.isArray(sections?.list) ? sections!.list : [])
    .filter((row) => str(row?.name) && num(row?.tokens))
    .map((row) => ({ name: row.name.trim(), tier: str(row.tier) ?? "other", chars: num(row.chars) ? row.chars : 0, tokens: row.tokens }));
  const order = [...TIERS, ...rows.map((row) => row.tier).filter((tier) => !TIERS.includes(tier))];
  const tiers = [...new Set(order)].flatMap((tier) => {
    const mine = rows.filter((row) => row.tier === tier);
    return mine.length ? [{ tier, tokens: mine.reduce((sum, row) => sum + row.tokens, 0) }] : [];
  });
  const dropped = (Array.isArray(sections?.dropped) ? sections!.dropped : [])
    .filter((row): row is TraceDropped => Boolean(str(row?.name)))
    .map((row) => ({ name: row.name.trim(), tier: str(row.tier) ?? "other", tokens: num(row.tokens) ? row.tokens : 0, items: num(row.items) ? row.items : null }));
  return { rows, tiers, total: rows.reduce((sum, row) => sum + row.tokens, 0), dropped };
}

/** A part left out: "node/58-workspace · 3 items · 120 tokens". */
export const droppedWords = (row: DroppedRow): string => [row.name, row.items ? plural(row.items, "item") : null, `${compactCount(row.tokens)} tokens`].filter(Boolean).join(" · ");

export type CallState = "ok" | "failed" | "held" | "other";
/** `own`: one of the agent's own calls on the owner's AI plan, with how Ensemble answered it (`verdict`: allowed, asked you, refused). */
export type CallRow = { name: string; label: string; state: CallState; stateText: string; time: string; sizes: string; offloaded: boolean; readOnly: boolean; own: boolean; verdict: string | null };

const VERDICT: Record<string, string> = { allowed: "allowed", asked: "asked you", refused: "refused" };

/** One of the agent's own calls: its time, the characters of its input and output, and how it was answered. */
function ownCallRow(call: TraceOwnCall): CallRow {
  const state: CallState = call.state === "failed" || call.verdict === "refused" ? "failed" : call.state === "ok" ? "ok" : "other";
  const sizes = [num(call.inChars) ? `${compactCount(call.inChars)} in` : null, num(call.outChars) ? `${compactCount(call.outChars)} out` : null].filter(Boolean).join(" · ");
  return {
    name: call.name,
    label: TOOL_LABEL(call.name),
    state,
    stateText: state === "ok" ? "Done" : state === "failed" ? (call.verdict === "refused" ? "Refused" : "Failed") : words(str(call.state) ?? "unknown"),
    time: num(call.ms) ? formatDuration(call.ms) : "",
    sizes,
    offloaded: false,
    readOnly: false,
    own: true,
    verdict: VERDICT[call.verdict] ?? null,
  };
}

/** One tool call: its name, how it went, how long it took, and the size of its result next to what the model was told. */
export function callRow(call: TraceCall | TraceOwnCall): CallRow {
  if (call.kind === "own") return ownCallRow(call);
  const state: CallState = call.state === "ok" ? "ok" : call.state === "failed" ? "failed" : call.state === "awaiting_approval" ? "held" : "other";
  const stateText = state === "ok" ? "Done" : state === "failed" ? "Failed" : state === "held" ? "Held for you" : words(str(call.state) ?? "unknown");
  const result = num(call.resultChars) ? call.resultChars : 0;
  const shown = num(call.shownChars) ? call.shownChars : 0;
  return {
    name: call.name,
    label: TOOL_LABEL(call.name),
    state,
    stateText,
    time: num(call.ms) ? formatDuration(call.ms) : "",
    sizes: result === shown ? `${compactCount(result)} chars` : `${compactCount(result)} → ${compactCount(shown)} chars`,
    offloaded: call.offloaded === true,
    readOnly: call.readOnly === true,
    own: false,
    verdict: null,
  };
}

/** The turn's tool calls, Ensemble's and the agent's own, in order. */
export const callRows = (calls: unknown): CallRow[] => (Array.isArray(calls) ? calls.filter((call): call is TraceCall | TraceOwnCall => Boolean(str((call as TraceCall | null)?.name))).map(callRow) : []);

/** "12 calls · 4 own · 1 failed · 2 held · 34 tools offered". */
export function callSummary(rows: readonly CallRow[], offered: number | null | undefined): string {
  const own = rows.filter((row) => row.own).length;
  const failed = rows.filter((row) => row.state === "failed").length;
  const held = rows.filter((row) => row.state === "held").length;
  return [rows.length ? plural(rows.length, "call") : "No tool calls", own ? `${own} own` : null, failed ? `${failed} failed` : null, held ? `${held} held` : null, num(offered) ? `${plural(offered, "tool")} offered` : null].filter(Boolean).join(" · ");
}

const WHY: Record<string, string> = { pinned: "pinned", owner: "about you", relevant: "relevant", recent: "recent" };
const ITEM: Record<string, string> = { task: "A task", project: "A project", page: "A page", meeting: "A meeting", person: "A person", file: "A file", app: "An app item", event: "An event" };

type SkillRow = { name?: string; skill?: string; source?: string } | null | undefined;
/** A skill as the trace names it: by its name, else Ensemble's by its reference and the owner's own as theirs (its reference is an id). */
const skillName = (row: SkillRow): string | null => str(row?.name) ?? (row?.source === "owner" ? "Your skill" : str(row?.skill));
const skillRef = (row: SkillRow): string | null => str(row?.name) ?? str(row?.skill);

/**
 * What the instructions gave the turn: skills with their scores, memories and why, workspace items, and what
 * was left out. A newer server keeps no titles, keys or words searched: an item reads by its kind and why.
 */
export function givenLines(selected: TraceSelected | null | undefined): { skills: string[]; memories: string[]; context: string[]; left: string | null; terms: string | null } {
  const inline = skillRef(selected?.inline);
  const full = `in full${selected?.inline?.cut ? ", cut" : ""}`;
  const listed = (Array.isArray(selected?.skills) ? selected!.skills : []).filter((row) => skillName(row));
  const skills = listed.map((row) => [skillName(row), num(row.score) ? one(row.score) : null, inline && skillRef(row) === inline ? full : null].filter(Boolean).join(" · "));
  if (inline && !listed.some((row) => skillRef(row) === inline)) skills.push(`${skillName(selected?.inline)} · ${full}`);
  const memories = (Array.isArray(selected?.memories) ? selected!.memories : []).map((row) => [str(row?.key) ? `“${row.key!.trim()}”` : "A memory", WHY[row?.why ?? ""] ?? str(row?.why)].filter(Boolean).join(" · "));
  const context = (Array.isArray(selected?.context) ? selected!.context : []).map((row) => {
    const title = str(row?.title);
    const reasons = !title && Array.isArray(row?.why) ? row.why.filter((why) => typeof why === "string" && why.trim()).join(", ") : null;
    return [title ?? ITEM[row?.kind ?? ""] ?? "An item", title ? str(row?.kind) : null, reasons || null, num(row?.score) ? row.score!.toFixed(2) : null].filter(Boolean).join(" · ");
  });
  const leftMemories = num(selected?.left?.memories) ? selected!.left!.memories! : 0;
  const leftContext = num(selected?.left?.context) ? selected!.left!.context! : 0;
  const left = leftMemories || leftContext ? `Left out: ${[leftMemories ? plural(leftMemories, "memory", "memories") : null, leftContext ? plural(leftContext, "workspace item") : null].filter(Boolean).join(", ")}` : null;
  const terms = Array.isArray(selected?.terms) && selected!.terms.length ? selected!.terms.filter((term) => typeof term === "string").join(", ") : null;
  return { skills, memories, context, left, terms: terms || null };
}

const KINDS: Record<string, string> = { route: "Routing", skill: "Skills", memory: "Memory", context: "Workspace", session: "Session", model: "Model", escalation: "Escalation" };
const ROUTES: Record<string, string> = { dm: "A direct chat: its node answers", mentioned: "Named in the message", lead: "The lead answers", status: "Status cards: no node woken", none: "Nobody woken" };

/** One decision in words: "Routing · Named in the message · woke 1 node", with the rules' version it used. */
export function decisionLine(decision: Pick<TraceDecision, "kind" | "choice" | "configVersion" | "ambiguous">): { kind: string; text: string; rules: string | null } {
  const kind = KINDS[decision.kind] ?? words(decision.kind);
  const choice = decision.choice && typeof decision.choice === "object" ? decision.choice : {};
  const reason = str(choice.reason);
  const parts: Array<string | null> = [];
  if (decision.kind === "route") {
    parts.push(reason ? (ROUTES[reason] ?? words(reason)) : "Routed");
    const brake = str(choice.brake);
    if (brake) parts.push(`the ${brake.replace(/_/g, " ")} brake`);
    if (choice.capped) parts.push("fan-out capped");
    if (Array.isArray(choice.woken) && choice.woken.length) parts.push(`woke ${plural(choice.woken.length, "node")}`);
  } else {
    parts.push(reason ? words(reason) : str(choice.name) ?? str(choice.choice) ?? "Recorded");
  }
  if (decision.ambiguous) parts.push("a model decided");
  return { kind, text: parts.filter(Boolean).join(" · "), rules: str(decision.configVersion)?.split(":")[0] ?? null };
}

/** The answer check: whether the reply passed, what it checked, and each round that sent it back. Null when nothing was checked. */
export function verificationWords(verification: TraceVerification | null | undefined): { line: string; tone: Tone; rounds: string[] } | null {
  if (!verification || typeof verification !== "object") return null;
  const checks = Array.isArray(verification.checks) ? verification.checks.filter((check) => typeof check === "string") : [];
  const rounds = (Array.isArray(verification.rounds) ? verification.rounds : []).map((row) => `Round ${num(row?.round) ? row.round : "?"}: ${str(row?.problems) ?? "passed"}`);
  const status = verification.passed === true ? { word: "Passed", tone: "ok" as Tone } : verification.passed === false ? { word: "Did not pass", tone: "warn" as Tone } : { word: "Checked", tone: "muted" as Tone };
  return { line: [status.word, checks.length ? `checked ${checks.join(", ").replace(/_/g, " ")}` : null].filter(Boolean).join(" · "), tone: status.tone, rounds };
}

/** The report's facts beyond its outcome, one line each. */
export function reportLines(report: TraceReplyReport | TraceStepReport | null | undefined): string[] {
  if (!report || typeof report !== "object") return [];
  if (report.kind === "step") {
    if (report.reported === false) return ["The step sent no report."];
    return [
      num(report.checks) ? `Checks: ${num(report.passed) ? report.passed : 0} of ${report.checks} passed` : null,
      num(report.evidence) && report.evidence > 0 ? `${plural(report.evidence, "piece")} of evidence` : null,
      str(report.blockedBy) ? `Blocked by: ${report.blockedBy!.replace(/_/g, " ")}` : null,
      str(report.summary),
    ].filter((line): line is string => Boolean(line));
  }
  const artifacts = Array.isArray(report.artifacts) ? report.artifacts : [];
  const chat = artifacts.filter((row) => row?.to === "chat").length;
  const files = artifacts.filter((row) => row?.to === "files").length;
  const stated = report.stated && REPLY[report.stated] && report.stated !== report.outcome ? REPLY[report.stated].label.toLowerCase() : null;
  return [
    stated ? `The reply itself says: ${stated}` : null,
    chat ? `${plural(chat, "file")} reached the chat` : null,
    files ? `${plural(files, "file")} saved in your Files` : null,
    num(report.held) && report.held > 0 ? `${plural(report.held, "change")} held for your approval` : null,
    str(report.remaining) ? `Left to do: ${report.remaining!.trim()}` : null,
    report.emptyReply ? "The model wrote no reply, so the reply says what its tools did." : null,
    num(report.falseClaims) && report.falseClaims > 0 ? `${plural(report.falseClaims, "claim")} of something sent taken out: it never reached the chat.` : null,
  ].filter((line): line is string => Boolean(line));
}

/** How the loop ran: "Ensemble's loop · Included AI · 6 of 40 steps · 1 retry", or "GitHub Copilot on Laptop · Your AI plan · same session · 14 calls". */
export function loopLine(loop: Record<string, unknown> | null | undefined, placement?: TurnPlacement | null): string | null {
  const paid = placementWords(placement);
  if (!loop || typeof loop !== "object") return paid;
  const count = (value: unknown, word: string, many?: string) => (num(value) && value > 0 ? plural(value, word, many) : null);
  if (loop.kind === "subscription") {
    const agent = str(loop.agent);
    const session = loop.session && typeof loop.session === "object" ? (loop.session as { resumed?: unknown; restart?: unknown }) : null;
    const restart = str(session?.restart);
    const follow = Array.isArray(loop.followUps) && loop.followUps.length ? `then ${loop.followUps.filter((row) => typeof row === "string").join(", ")}` : null;
    return [
      `${agent ? agentName(agent) : "Your agent"}${str(loop.computer) ? ` on ${str(loop.computer)}` : ""}`,
      paid,
      session?.resumed === true ? "same session" : session?.resumed === false ? `new session${restart ? ` (${restart.replace(/_/g, " ")})` : ""}` : null,
      count(loop.calls, "call"),
      loop.ownTools === true ? "its own tools too" : loop.ownTools === false ? "Ensemble's tools only" : null,
      count(loop.outside, "exchange") ? `${count(loop.outside, "exchange")} from its own app` : null,
      follow,
    ].filter(Boolean).join(" · ");
  }
  const steps = num(loop.steps) ? `${loop.steps}${num(loop.cap) ? ` of ${loop.cap}` : ""} steps` : null;
  return [
    "Ensemble's loop",
    paid,
    steps,
    count(loop.retries, "retry", "retries"),
    count(loop.nudges, "nudge"),
    count(loop.compactions, "compaction"),
    count(loop.offloaded, "long result kept", "long results kept"),
    loop.runaway ? "a runaway stopped" : null,
    loop.paused === true ? "paused" : null,
  ].filter(Boolean).join(" · ");
}
