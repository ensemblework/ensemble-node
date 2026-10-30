/**
 * An agent session as its card shows it (build blocks B3, B16): the settings asked for, sent to the
 * engine and reported back, the session's state, what it may be told now, and edits to its queue.
 */
import type { NodePublic, QueuedRun, RunSession, RunSettingValues, RunSettings, SessionAction, SessionDetail, StepRun } from "./types";

/** What an engine that does not say its settings reports for each (Ensemble's run settings). */
export const NOT_REPORTED = "not_reported";

const AGENTS: Record<string, string> = {
  "claude-code": "Claude Code",
  claude: "Claude Code",
  codex: "Codex",
  "cursor-agent": "Cursor",
  cursor: "Cursor",
  "copilot-cli": "GitHub Copilot",
  copilot: "GitHub Copilot",
  "grok-cli": "Grok Build",
  opencode: "OpenCode",
  "gemini-cli": "Gemini CLI",
  antigravity: "Antigravity",
  ensemble: "Ensemble's agent",
};

/** An agent's name: "claude-code" → "Claude Code"; names it does not know stay as given. */
export const agentName = (value: string): string => AGENTS[value.trim().toLowerCase()] ?? value.trim();

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

/**
 * A session's agent: its id for logic (marks, settings) and its name for people. The two places that
 * carry it disagree on which field is which: a run card's `data.session` has the name in `agent` and
 * the id in `agentId`, while `GET /api/node/sessions/:id` has the id in `agent` and the name in
 * `agentName`. Cards from before `agentId` carry the id in `agent`. What the session read says wins.
 */
export function sessionAgent(card?: Pick<RunSession, "agent" | "agentId"> | null, detail?: Pick<SessionDetail, "agent" | "agentName"> | null): { id: string | null; name: string | null } {
  const shown = text(card?.agent);
  const id = text(detail?.agent) ?? text(card?.agentId) ?? (shown && Object.hasOwn(AGENTS, shown.toLowerCase()) ? shown.toLowerCase() : null);
  const name = text(detail?.agentName) ?? (shown ? agentName(shown) : null) ?? (id ? agentName(id) : null);
  return { id, name };
}

export type SettingKey = "agent" | "model" | "effort" | "context" | "fast";
const KEYS: readonly SettingKey[] = ["agent", "model", "effort", "context", "fast"];
const LABEL: Record<SettingKey, string> = { agent: "Agent", model: "Model", effort: "Thinking", context: "Context", fast: "Fast mode" };

/** One setting as people read it; "not reported" when the engine did not say; null when not set. */
export function settingValue(key: SettingKey, value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (value === NOT_REPORTED) return "not reported";
  const text = String(value).trim();
  if (key === "agent") return agentName(text);
  if (key === "context") return text === "long_context" ? "long context" : text === "default" ? "default" : text.replace(/_/g, " ");
  if (key === "fast") return value === true || text === "true" ? "on" : value === false || text === "false" ? "off" : text;
  return text;
}

const plain = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
/** Two values name different things: neither contains the other ("opus" and "claude-opus-4-6" agree). */
const differs = (a: string, b: string) => !plain(a).includes(plain(b)) && !plain(b).includes(plain(a));

export type SettingRow = { key: SettingKey; label: string; requested: string | null; resolved: string | null; observed: string | null; mismatch: boolean };

/**
 * The settings table: one row per setting anyone named. `mismatch` when what was sent differs from
 * what was asked, or what the engine reported differs from what was sent.
 */
export function settingsRows(settings: RunSettings | null | undefined): SettingRow[] {
  return KEYS.flatMap((key) => {
    const requested = settingValue(key, settings?.requested?.[key]);
    const resolved = settingValue(key, settings?.resolved?.[key]);
    const observed = settingValue(key, settings?.observed?.[key]);
    if (!requested && !resolved && !observed) return [];
    const reported = observed && observed !== "not reported" ? observed : null;
    const mismatch = Boolean((requested && resolved && differs(requested, resolved)) || (reported && resolved && differs(reported, resolved)) || (reported && !resolved && requested && differs(reported, requested)));
    return [{ key, label: LABEL[key], requested, resolved, observed, mismatch }];
  });
}

/** Settings in one line: "Claude Code · claude-opus-4-6 · high thinking · long context". */
export function settingsLine(values: RunSettingValues | StepRun | null | undefined): string {
  if (!values) return "";
  const raw = values as RunSettingValues;
  const effort = settingValue("effort", raw.effort);
  const context = settingValue("context", raw.context);
  const fast = settingValue("fast", raw.fast);
  return [
    settingValue("agent", raw.agent),
    settingValue("model", raw.model),
    effort ? (effort === "not reported" ? "thinking not reported" : `${effort} thinking`) : null,
    context && context !== "default" ? (context === "not reported" ? "context not reported" : context) : null,
    fast === "on" ? "fast mode" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Whether the engine reported none of the settings it ran with. */
export function observedMissing(settings: RunSettings | null | undefined): boolean {
  const observed = settings?.observed;
  if (!observed) return Boolean(settings?.resolved);
  return KEYS.every((key) => observed[key] === undefined || observed[key] === null || observed[key] === NOT_REPORTED);
}

// A session's state is Ensemble's (`working`, `waiting` for an answer, `queued`, `idle`); older cards carry its run's status.
const STATUS: Record<string, { label: string; tone: "muted" | "accent" | "ok" | "warn" | "danger" }> = {
  working: { label: "Working", tone: "accent" },
  waiting: { label: "Needs you", tone: "warn" },
  running: { label: "Running", tone: "accent" },
  claimed: { label: "Starting", tone: "accent" },
  queued: { label: "Queued", tone: "muted" },
  stopping: { label: "Stopping", tone: "accent" },
  waiting_approval: { label: "Needs you", tone: "warn" },
  idle: { label: "Idle", tone: "muted" },
  stopped: { label: "Stopped", tone: "muted" },
  closed: { label: "Closed", tone: "muted" },
  failed: { label: "Failed", tone: "danger" },
};

export function sessionStatus(status: string | null | undefined): { label: string; tone: "muted" | "accent" | "ok" | "warn" | "danger" } {
  const key = (status ?? "").trim();
  return STATUS[key] ?? { label: key ? key.replace(/_/g, " ").replace(/^./, (first) => first.toUpperCase()) : "Idle", tone: "muted" };
}

const RUNNING: ReadonlySet<string> = new Set(["working", "waiting", "running", "claimed", "waiting_approval"]);
const OPEN: ReadonlySet<string> = new Set([...RUNNING, "queued", "idle", "stopping"]);

/** What the owner may tell a session now. A run going on can be steered, replaced or stopped; an open session takes a queued message. */
export function sessionActions(status: string | null | undefined): Array<SessionAction["action"]> {
  const key = status ?? "";
  if (RUNNING.has(key)) return ["steer", "queue", "replace", "stop"];
  if (OPEN.has(key) && key !== "stopping") return ["queue"];
  return [];
}

/** The queue in the order it runs. */
export function queueOrder(queue: readonly QueuedRun[] | null | undefined): QueuedRun[] {
  return [...(queue ?? [])].sort((a, b) => a.position - b.position);
}

const numbered = (rows: QueuedRun[]) => rows.map((row, at) => ({ ...row, position: at + 1 }));

/** The queue with one message moved earlier (-1) or later (+1), numbered from 1; null when it cannot move. */
export function moveQueued(queue: readonly QueuedRun[], jobId: string, delta: -1 | 1): QueuedRun[] | null {
  const rows = queueOrder(queue);
  const at = rows.findIndex((row) => row.jobId === jobId);
  const to = at + delta;
  if (at < 0 || to < 0 || to >= rows.length) return null;
  const next = [...rows];
  [next[at], next[to]] = [next[to]!, next[at]!];
  return numbered(next);
}

/** The queue without a cancelled message, numbered from 1. */
export function withoutQueued(queue: readonly QueuedRun[], jobId: string): QueuedRun[] {
  return numbered(queueOrder(queue).filter((row) => row.jobId !== jobId));
}

/** A queued message's one line: its title, else the first line of what it says. */
export function queuedLine(row: Pick<QueuedRun, "title" | "prompt">): string {
  return row.title?.trim() || row.prompt.trim().split("\n")[0]!.slice(0, 160) || "A message";
}

/** The node that manages a session: what the session read says, else its card's; null when no node does. */
export function sessionManager(card?: Pick<RunSession, "nodeId"> | null, detail?: Pick<SessionDetail, "nodeId"> | null): string | null {
  if (detail && "nodeId" in detail) return detail.nodeId ?? null;
  return text(card?.nodeId);
}

/** Who a session can be handed to: the owner's other lasting nodes (never a helper), by name. */
export function handOverChoices<T extends Pick<NodePublic, "id" | "name" | "parentNodeId">>(nodes: readonly T[], managerId: string | null): T[] {
  return nodes.filter((node) => !node.parentNodeId && node.id !== managerId).sort((a, b) => a.name.localeCompare(b.name));
}

type SessionCard = { id: string; seq: number; createdAt: string; kind: string; data?: { session?: { id?: unknown } | null; [key: string]: unknown } | null };

/** Each session's newest card in a conversation, by session id: the one that offers its controls once its run ended. */
export function newestSessionCards(messages: readonly SessionCard[]): Map<string, string> {
  const newest = new Map<string, SessionCard>();
  for (const message of messages) {
    const id = message.kind === "run" ? message.data?.session?.id : undefined;
    if (typeof id !== "string") continue;
    const seen = newest.get(id);
    if (!seen || message.createdAt > seen.createdAt || (message.createdAt === seen.createdAt && message.seq > seen.seq)) newest.set(id, message);
  }
  return new Map([...newest].map(([id, message]) => [id, message.id]));
}

/** Where a session runs: "ensemble on Laptop", or just its folder when the computer is not known. */
export function sessionPlace(row: { folder?: string | null; computer?: string | null }): string {
  return [row.folder?.trim(), row.computer?.trim()].filter(Boolean).join(" on ");
}

/** A session's newest task, when it is not the one it started with. */
export function sessionLatest(row: { title: string; latestTask?: string | null }): string | null {
  const latest = row.latestTask?.trim();
  return latest && latest !== row.title.trim() ? latest : null;
}

/** "1 run", "4 runs". */
export const runsCount = (runs: number): string => `${runs} ${runs === 1 ? "run" : "runs"}`;

const LIVE_SESSION: ReadonlySet<string> = new Set(["working", "waiting", "queued", "running", "claimed", "waiting_approval", "stopping"]);

/** A session with something going on or waiting: read often while it is open; an idle one waits for the event stream. */
export const sessionLive = (status: string | null | undefined): boolean => LIVE_SESSION.has(status ?? "");

/** Where a run card is, as a link into its conversation at that message; null without both. */
export function cardLink(card: { messageId?: string | null; roomId?: string | null } | null | undefined): { href: string; roomId: string; messageId: string } | null {
  const messageId = text(card?.messageId);
  const roomId = text(card?.roomId);
  return messageId && roomId ? { href: `/r/${encodeURIComponent(roomId)}#m-${encodeURIComponent(messageId)}`, roomId, messageId } : null;
}
