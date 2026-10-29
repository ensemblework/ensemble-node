/**
 * Helper threads (build block B18; the extension's E§10.1). A helper's task room is not a conversation
 * of its own in the list: it shows as a read-only thread under the message in its parent's chat that
 * brought the helper in ("@scout, helper of @lead · working · 4 messages") and opens in place. Ensemble
 * will mark task rooms with where they came from (`originRoomId`, `originMessageId`); until then a
 * thread is found from the room's members (the helper has a parent node) and the `node_helper` call
 * on the parent's message that names the helper or its room.
 */
import type { Message, NodePublic, Room, ToolChip } from "./types";

export type HelperThread = {
  roomId: string;
  title: string;
  helper: NodePublic | null;
  parent: NodePublic | null;
  originRoomId: string | null;
  originMessageId: string | null;
  /** Messages in it so far (its room's last seq). */
  count: number;
  lastMessageAt: string | null;
};

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

/** A helper's task room: it stays out of the conversation list and shows inline in its parent's chat. */
export const isHelperRoom = (room: Pick<Room, "kind">): boolean => room.kind === "task";

export function helperThread(room: Room): HelperThread | null {
  if (!isHelperRoom(room)) return null;
  const marks: Record<string, unknown> = { ...(room.settings ?? {}), ...(room.helper ?? {}) };
  const nodes = room.members.flatMap((member) => (member.kind === "node" ? [member.node] : []));
  const helperId = text(marks.helperNodeId);
  const helper = nodes.find((node) => node.id === helperId) ?? nodes.find((node) => Boolean(node.parentNodeId)) ?? null;
  const parentId = text(marks.parentNodeId) ?? helper?.parentNodeId ?? null;
  const parent = nodes.find((node) => node.id === parentId) ?? nodes.find((node) => node !== helper) ?? null;
  return {
    roomId: room.id,
    title: room.title,
    helper,
    parent,
    originRoomId: text(room.originRoomId) ?? text(marks.originRoomId),
    originMessageId: text(room.originMessageId) ?? text(marks.originMessageId),
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

/** The helper threads a message brought in: by Ensemble's mark, else by its `node_helper` calls. */
export function threadsOfMessage(message: Pick<Message, "id" | "roomId" | "authorNodeId" | "data">, threads: readonly HelperThread[]): HelperThread[] {
  if (!message.authorNodeId) return [];
  const marked = threads.filter((thread) => thread.originMessageId === message.id);
  const calls = (Array.isArray(message.data?.tools) ? (message.data.tools as ToolChip[]) : []).filter((tool) => tool?.name === "node_helper" && tool.state !== "failed" && typeof tool.summary === "string");
  const found = calls.length
    ? threads.filter(
        (thread) =>
          !thread.originMessageId &&
          thread.parent?.id === message.authorNodeId &&
          (!thread.originRoomId || thread.originRoomId === message.roomId) &&
          calls.some((call) => names(call.summary!, thread)),
      )
    : [];
  return [...marked, ...found.filter((thread) => !marked.includes(thread))];
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
