import type { Message, Room, RoomKind } from "./types";

export type ConversationFilter = "all" | "unread" | "groups";

/** One recent list across direct chats, crews and rooms; untouched chats follow active ones. */
export function recentConversations(rooms: readonly Room[], filter: ConversationFilter = "all", query = ""): Room[] {
  const search = query.trim().toLowerCase();
  return rooms.filter(room => (filter !== "unread" || (room.unread ?? 0) > 0)
    && (filter !== "groups" || room.kind !== "dm")
    && (!search || room.title.toLowerCase().includes(search)))
    .sort((a, b) => {
      const stamp = (room: Room) => Date.parse(room.lastMessageAt ?? room.last?.createdAt ?? "") || 0;
      return stamp(b) - stamp(a);
    });
}

/** Reactions and old message edits change their preview, never the conversation's position or count. */
export function roomWithMessage(room: Room, message: Message, meId: string): Room {
  const same = room.last?.id === message.id || Boolean(message.clientId && room.last?.clientId === message.clientId);
  const pending = Boolean(message.sending || message.failed);
  const newer = !pending && message.seq > room.lastSeq;
  if (!same && !pending && !newer) return room;
  const last = newer && !same && room.last?.sending && Date.parse(room.last.createdAt) > Date.parse(message.createdAt) ? room.last : message;
  return {
    ...room, last,
    lastSeq: newer ? message.seq : room.lastSeq,
    lastMessageAt: last.createdAt,
    unread: (room.unread ?? 0) + (newer && !same && !(message.authorKind === "human" && message.authorAccountId === meId) ? 1 : 0),
  };
}

/** A slower bootstrap response must not undo a live preview or an optimistic read marker. */
export function mergeConversationSnapshot(current: readonly Room[], fresh: readonly Room[]): Room[] {
  const known = new Map(current.map(room => [room.id, room]));
  return fresh.map(room => {
    const previous = known.get(room.id);
    if (!previous) return room;
    const pending = previous.last?.sending || previous.last?.failed;
    const localLast = previous.last && (previous.lastSeq > room.lastSeq
      || (pending && previous.last.clientId !== room.last?.clientId && Date.parse(previous.last.createdAt) > (Date.parse(room.lastMessageAt ?? "") || 0)));
    const lastSeq = Math.max(previous.lastSeq, room.lastSeq);
    const readSeq = Math.max(previous.readSeq ?? 0, room.readSeq ?? 0);
    return {
      ...room, lastSeq, readSeq,
      unread: Math.min(previous.lastSeq > room.lastSeq ? previous.unread ?? 0 : room.unread ?? 0, Math.max(0, lastSeq - readSeq)),
      ...(localLast ? { last: previous.last, lastMessageAt: previous.lastMessageAt } : {}),
    };
  });
}

export const roomKindName = (kind: RoomKind) => kind === "dm" ? "Direct chat" : kind === "crew" ? "Crew" : "Room";
