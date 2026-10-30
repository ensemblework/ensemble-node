import { inTimeline } from "./chat";
import type { Message, Room, RoomKind, Run } from "./types";

export type ConversationFilter = "all" | "unread" | "groups";

/**
 * What waits for me in each conversation: my nodes' open cards there (a question from my computer, a
 * command to run as administrator, a draft, a secret…), and runs there that wait on my answer. `first`
 * is the oldest of them, to open the conversation at. The sidebar marks those conversations.
 */
export function waitingRooms(cards: readonly Pick<Message, "id" | "roomId" | "createdAt">[] | undefined, runs: readonly Pick<Run, "roomId" | "status" | "messageId">[] | undefined): Map<string, { count: number; first: string | null }> {
  const waiting = new Map<string, { count: number; first: string | null; at: number }>();
  const add = (roomId: string | null | undefined, messageId: string | null, at: number) => {
    if (!roomId) return;
    const known = waiting.get(roomId);
    const older = !known || (messageId !== null && (known.first === null || at < known.at));
    waiting.set(roomId, { count: (known?.count ?? 0) + 1, first: older ? messageId : known.first, at: older ? at : known.at });
  };
  for (const card of cards ?? []) add(card.roomId, card.id, Date.parse(card.createdAt) || 0);
  for (const run of runs ?? []) if (run.status === "waiting_approval") add(run.roomId, run.messageId, Number.MAX_SAFE_INTEGER);
  return new Map([...waiting].map(([roomId, row]) => [roomId, { count: row.count, first: row.first }]));
}

/**
 * One recent list across direct chats, crews and rooms; untouched chats follow active ones. Helpers'
 * task rooms are not in it: they show as threads in their parent's chat (lib/threads.ts).
 */
export function recentConversations(rooms: readonly Room[], filter: ConversationFilter = "all", query = ""): Room[] {
  const search = query.trim().toLowerCase();
  return rooms.filter(room => room.kind !== "task"
    && (filter !== "unread" || (room.unread ?? 0) > 0)
    && (filter !== "groups" || room.kind !== "dm")
    && (!search || room.title.toLowerCase().includes(search)))
    .sort((a, b) => {
      const stamp = (room: Room) => Date.parse(room.lastMessageAt ?? room.last?.createdAt ?? "") || 0;
      return stamp(b) - stamp(a);
    });
}

/** Reactions and old message edits change their preview, never the conversation's position or count. */
export function roomWithMessage(room: Room, message: Message, meId: string): Room {
  // A plan step's run card is shown inside its plan card: no preview, no unread.
  if (!inTimeline(message)) return room;
  const same = room.last?.id === message.id || Boolean(message.clientId && room.last?.clientId === message.clientId);
  const pending = Boolean(message.sending || message.failed);
  const newer = !pending && message.seq > room.lastSeq;
  if (!same && !pending && !newer) return room;
  const last = newer && !same && room.last?.sending && Date.parse(room.last.createdAt) > Date.parse(message.createdAt) ? room.last : message;
  const counts = newer && !same && !(message.authorKind === "human" && message.authorAccountId === meId) ? 1 : 0;
  // A room with other people counts each tab on its own: My crew's private messages, the Room's public ones.
  const tabs = room.kind === "room" && (typeof room.unreadRoom === "number" || typeof room.unreadCrew === "number") ? (message.private ? { unreadCrew: (room.unreadCrew ?? 0) + counts } : { unreadRoom: (room.unreadRoom ?? 0) + counts }) : {};
  return {
    ...room, last,
    lastSeq: newer ? message.seq : room.lastSeq,
    lastMessageAt: last.createdAt,
    unread: (room.unread ?? 0) + counts,
    ...tabs,
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
    const newer = previous.lastSeq > room.lastSeq;
    const unread = Math.min(newer ? previous.unread ?? 0 : room.unread ?? 0, Math.max(0, lastSeq - readSeq));
    // Each tab of a room with other people keeps its own marker and count the same way.
    const tabs = room.kind === "room" && (typeof room.unreadRoom === "number" || typeof previous.unreadRoom === "number")
      ? (() => {
          const readSeqCrew = Math.max(previous.readSeqCrew ?? 0, room.readSeqCrew ?? 0);
          const unreadRoom = Math.min(newer ? previous.unreadRoom ?? 0 : room.unreadRoom ?? 0, Math.max(0, lastSeq - readSeq));
          const unreadCrew = Math.min(newer ? previous.unreadCrew ?? 0 : room.unreadCrew ?? 0, Math.max(0, lastSeq - readSeqCrew));
          return { readSeqCrew, unreadRoom, unreadCrew, unread: unreadRoom + unreadCrew };
        })()
      : {};
    return {
      ...room, lastSeq, readSeq, unread,
      ...tabs,
      ...(localLast ? { last: previous.last, lastMessageAt: previous.lastMessageAt } : {}),
    };
  });
}

export const roomKindName = (kind: RoomKind) => kind === "dm" ? "Direct chat" : kind === "crew" ? "Crew" : kind === "task" ? "Helper" : "Room";
