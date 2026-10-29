/**
 * Helper threads (build block B18; the extension's E§10.1). A helper's task room is not a conversation
 * of its own in the list: it shows as a read-only thread under the message that asked for the work
 * ("@scout, helper of @lead · working · 4 messages") and opens in place. A helper's task is a step of
 * its parent's plan; its thread holds the brief its parent wrote and the report it gave.
 * Ensemble's room view says whose helper it is and where (`helper`: the parent, the helper, the origin
 * room, whether it was asked privately, the message that asked and the plan card its step is in).
 * A thread goes under that message, else under that plan card; rooms from before these marks go under
 * the parent's message whose `node_helper` call names the helper or its room, else in the strip. A
 * helper asked for privately goes only under a private message.
 */
import type { HelperGrant, Message, NodeFull, NodePublic, Room, ToolChip } from "./types";

export type HelperThread = {
  roomId: string;
  title: string;
  helper: NodePublic | null;
  parent: NodePublic | null;
  originRoomId: string | null;
  /** The message that asked for the work (a person's), when Ensemble marked it. */
  originMessageId: string | null;
  /** The plan card the helper's step is in. */
  planId: string | null;
  /** Asked for in the owner's private thread: it shows only beside their private messages, marked as theirs alone. */
  originPrivate: boolean;
  /** What the helper may do: read unless its parent granted more. */
  grant: HelperGrant;
  /** The helper was kept as a lasting node: its room stays as history. */
  kept: boolean;
  /** Messages in it so far (its room's last seq). */
  count: number;
  lastMessageAt: string | null;
};

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

/** A helper's task room: it stays out of the conversation list and shows inline in its parent's chat. */
export const isHelperRoom = (room: Pick<Room, "kind">): boolean => room.kind === "task";

const GRANTS: ReadonlySet<string> = new Set(["read", "sessions", "computer"]);

export function helperThread(room: Room): HelperThread | null {
  if (!isHelperRoom(room)) return null;
  const marks: Record<string, unknown> = { ...(room.settings ?? {}), ...(room.helper ?? {}) };
  const nodes = room.members.flatMap((member) => (member.kind === "node" ? [member.node] : []));
  const helperId = text(marks.helperNodeId);
  const helper = (helperId ? nodes.find((node) => node.id === helperId) : undefined) ?? nodes.find((node) => Boolean(node.parentNodeId)) ?? null;
  const parentId = text(marks.parentNodeId) ?? helper?.parentNodeId ?? null;
  const parent = nodes.find((node) => node.id === parentId) ?? nodes.find((node) => node !== helper) ?? null;
  const granted = helper && "autonomy" in helper ? (helper as NodeFull).autonomy?.grant : undefined;
  const privateTo = marks.originPrivateTo;
  return {
    roomId: room.id,
    title: room.title,
    helper,
    parent,
    originRoomId: text(room.originRoomId) ?? text(marks.originRoomId),
    originMessageId: text(room.originMessageId) ?? text(marks.originMessageId),
    planId: text(marks.planId),
    originPrivate: marks.originPrivate === true || (Array.isArray(privateTo) && privateTo.length > 0),
    grant: granted && GRANTS.has(granted) ? granted : "read",
    kept: Boolean(helper && helperId === helper.id && !helper.parentNodeId),
    count: Math.max(0, room.lastSeq ?? 0),
    lastMessageAt: room.lastMessageAt,
  };
}

export const helperThreads = (rooms: readonly Room[]): HelperThread[] => rooms.flatMap((room) => helperThread(room) ?? []);

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether a `node_helper` call's receipt names this helper (`@scout`) or its room (“Lead · Scout”). */
function names(summary: string, thread: HelperThread): boolean {
  if (thread.helper && new RegExp(`(^|[^\\w-])@${escape(thread.helper.slug)}(?![\\w-])`, "i").test(summary)) return true;
  return summary.includes(`“${thread.title}”`) || summary.includes(`"${thread.title}"`);
}

/** The helper threads a message brought in: by Ensemble's mark (any author), else by its node's `node_helper` calls. A helper asked for privately goes only under a private message. */
export function threadsOfMessage(message: Pick<Message, "id" | "roomId" | "authorNodeId" | "data"> & { private?: boolean }, threads: readonly HelperThread[]): HelperThread[] {
  const marked = threads.filter((thread) => thread.originMessageId === message.id && (!thread.originPrivate || message.private === true));
  if (!message.authorNodeId) return marked;
  const calls = (Array.isArray(message.data?.tools) ? (message.data.tools as ToolChip[]) : []).filter((tool) => tool?.name === "node_helper" && tool.state !== "failed" && typeof tool.summary === "string");
  const found = calls.length
    ? threads.filter(
        (thread) =>
          !thread.originMessageId &&
          thread.parent?.id === message.authorNodeId &&
          (!thread.originRoomId || thread.originRoomId === message.roomId) &&
          (!thread.originPrivate || message.private === true) &&
          calls.some((call) => names(call.summary!, thread)),
      )
    : [];
  return [...marked, ...found.filter((thread) => !marked.includes(thread))];
}

type Placeable = Pick<Message, "id" | "roomId" | "kind" | "authorNodeId" | "data" | "planId"> & { private?: boolean };

/**
 * Where each helper thread goes among a conversation's loaded messages: under the message that asked,
 * else under the plan card its step is in, else (rooms from before the marks) under the parent's
 * message that names it. Threads none of them takes are left for the strip (`looseThreads`).
 */
export function placeThreads(messages: readonly Placeable[], threads: readonly HelperThread[]): Map<string, HelperThread[]> {
  const byId = new Map(messages.map((row) => [row.id, row]));
  const placed = new Map<string, HelperThread[]>();
  const put = (messageId: string, thread: HelperThread) => placed.set(messageId, [...(placed.get(messageId) ?? []), thread]);
  const fits = (thread: HelperThread, message: Placeable | undefined): message is Placeable => Boolean(message && (!thread.originPrivate || message.private === true));
  const legacy: HelperThread[] = [];
  for (const thread of threads) {
    const origin = thread.originMessageId ? byId.get(thread.originMessageId) : undefined;
    const plan = thread.planId ? byId.get(thread.planId) : undefined;
    if (fits(thread, origin)) put(origin.id, thread);
    else if (fits(thread, plan) && plan.kind === "plan") put(plan.id, thread);
    else if (!thread.originMessageId && !thread.planId) legacy.push(thread);
  }
  if (legacy.length) {
    for (const message of messages) {
      if (!message.authorNodeId || message.planId) continue;
      for (const thread of threadsOfMessage(message, legacy)) if (!placed.get(message.id)?.includes(thread)) put(message.id, thread);
    }
  }
  return placed;
}

/**
 * This conversation's helper threads that no loaded message shows: their message is further up, or
 * did not say which helper it brought in. Ensemble's mark places a thread; without one it belongs to
 * its parent's direct chat.
 */
export function looseThreads(threads: readonly HelperThread[], shown: ReadonlySet<string>, room: Pick<Room, "id" | "kind" | "members">): HelperThread[] {
  const dmNode = room.kind === "dm" ? room.members.find((member) => member.kind === "node") : undefined;
  return threads.filter((thread) => !shown.has(thread.roomId) && (thread.originRoomId ? thread.originRoomId === room.id : Boolean(dmNode && dmNode.kind === "node" && thread.parent?.id === dmNode.node.id)));
}

/** "@scout, helper of @lead · working · 4 messages". */
export function threadLabel(thread: HelperThread, working: boolean): string {
  const who = thread.helper ? `@${thread.helper.slug}` : "A helper";
  const of = thread.parent ? `, helper of @${thread.parent.slug}` : "";
  return `${who}${of} · ${working ? "working" : "quiet"} · ${thread.count} ${thread.count === 1 ? "message" : "messages"}`;
}

const GRANT_LABEL: Record<HelperGrant, string> = { read: "can read", sessions: "can run sessions", computer: "can use the computer" };

/** What a helper may do, in words: "can read", "can run sessions", "can use the computer". */
export const grantLabel = (grant: HelperGrant): string => GRANT_LABEL[grant] ?? GRANT_LABEL.read;
