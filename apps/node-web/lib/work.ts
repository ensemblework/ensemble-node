/**
 * What is going on in a conversation, from the messages already loaded (the extension's work board,
 * E§3.3; build blocks B15, B16): my live plans, my pieces of work and my live agent sessions. It decides
 * whether Stop asks first and fills the room's "Working on" strip. It makes no requests of its own.
 */
import { isWorkCard, missionView, planProgress } from "./plan";
import { sessionStatus } from "./session";
import { runEnded } from "./work-log";
import type { Message, PlanData } from "./types";

/**
 * `routineId`: a routine's run, whose card is not in the timeline (its `planId` is the routine's id):
 * its chip opens the card instead of going to it.
 */
export type BoardItem = { kind: "plan" | "work" | "session"; id: string; messageId: string; title: string; detail: string; routineId?: string };

const firstLine = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
const sentence = (text: string | null | undefined) => firstLine(text).split(/(?<=[.!?])\s/)[0] ?? "";
const LIVE_RUN: ReadonlySet<string> = new Set(["running", "claimed", "waiting_approval", "stopping"]);

/**
 * My live work among these messages, newest first: plans and pieces of work still running, and agent
 * sessions with a live run, one per session (runs inside a plan are its plan's). `ownerOf` names the
 * account a node belongs to.
 */
export function workBoard(messages: readonly Message[], meId: string, ownerOf: (nodeId: string | null) => string | null | undefined): BoardItem[] {
  const items: Array<BoardItem & { seq: number }> = [];
  const sessions = new Map<string, Message[]>();
  for (const message of messages) {
    if (message.kind === "plan" && message.authorAccountId === meId) {
      const plan = message.data as PlanData;
      const mission = missionView(plan?.status);
      if (!mission.live || !Array.isArray(plan.steps)) continue;
      const work = isWorkCard(plan);
      const step = plan.steps[0];
      const progress = planProgress(plan);
      const opening = message.body && message.body !== "Plan" ? sentence(message.body) : "";
      const routineId = typeof plan.routine?.id === "string" ? plan.routine.id : message.planId;
      items.push({
        kind: work ? "work" : "plan",
        id: message.id,
        messageId: message.id,
        seq: message.seq,
        title: firstLine(plan.goal) || (work ? sentence(step?.brief) : opening) || `Plan by @${plan.leadHandle}`,
        detail: work ? (step?.status === "working" && step.progress ? firstLine(step.progress) : mission.label) : mission.status === "running" ? `${progress.done} of ${progress.total} done` : mission.label,
        ...(routineId ? { routineId } : {}),
      });
    } else if (message.kind === "run" && !message.planId && ownerOf(message.authorNodeId) === meId) {
      const status = typeof message.data?.status === "string" ? message.data.status : "queued";
      if (runEnded(status) || typeof message.data?.quiet === "string") continue;
      const key = typeof message.data?.session?.id === "string" ? message.data.session.id : typeof message.data?.jobId === "string" ? message.data.jobId : message.id;
      sessions.set(key, [...(sessions.get(key) ?? []), message]);
    }
  }
  for (const [key, cards] of sessions) {
    const newest = [...cards].sort((a, b) => b.seq - a.seq);
    const current = newest.find((card) => LIVE_RUN.has(String(card.data?.status))) ?? newest[0]!;
    const queued = Array.isArray(current.data?.session?.queue) ? current.data.session.queue.length : cards.filter((card) => card.data?.status === "queued").length;
    const status = sessionStatus(String(current.data?.status ?? "queued")).label;
    items.push({ kind: "session", id: key, messageId: current.id, seq: newest[0]!.seq, title: firstLine(current.body) || "Agent run", detail: queued && current.data?.status !== "queued" ? `${status} · ${queued} queued` : status });
  }
  return items.sort((a, b) => b.seq - a.seq).map(({ seq: _seq, ...item }) => item);
}

/**
 * The Ensemble task a node's message is about (`data.task`: a task assigned to it, Ensemble docs/35),
 * with its due day in words ("3 Nov"), or null. The message keeps the task as it was then, so it says
 * nothing of its status, which may have changed since.
 */
export function messageTask(data: Record<string, unknown> | null | undefined, timeZone?: string): { id: string; title: string; due: string | null } | null {
  const task = data?.task as { id?: unknown; title?: unknown; due?: unknown; dueAt?: unknown } | null | undefined;
  if (!task || typeof task.id !== "string" || !task.id || typeof task.title !== "string" || !task.title.trim()) return null;
  const raw = typeof task.due === "string" ? task.due : typeof task.dueAt === "string" ? task.dueAt : null;
  const at = raw ? Date.parse(raw) : NaN;
  return { id: task.id, title: task.title.trim(), due: Number.isFinite(at) ? new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short" }).format(at) : null };
}
