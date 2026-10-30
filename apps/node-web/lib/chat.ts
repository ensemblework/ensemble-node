/** Pure helpers for the conversation view: filters, reactions, days, unread, search highlights, emails, sending. */
import { messageFiles } from "./attachments";
import { readableBody } from "./entity-text";
import { evidenceCount, mediaItems } from "./evidence";
import type { Message, MessageFile, ReplyTo } from "./types";

/** All: everything. people: what people wrote, and system lines. nodes: what nodes wrote. mentions: messages that mention me. */
export type ViewFilter = "all" | "people" | "nodes" | "mentions";

/** The `author` the server filters on for a view (mentions are filtered here, from all messages). */
export const serverAuthor = (filter: ViewFilter): "all" | "people" | "nodes" => (filter === "people" || filter === "nodes" ? filter : "all");

/** Whether a live message belongs in a list fetched with this `author`. */
export function matchesAuthor(message: Pick<Message, "authorKind">, author: "all" | "people" | "nodes"): boolean {
  if (author === "people") return message.authorKind === "human" || message.authorKind === "system";
  if (author === "nodes") return message.authorKind === "node";
  return true;
}

/**
 * Whether a message shows in the conversation's timeline. A plan step's run card shows inside its plan's
 * card instead; a question to its owner (an approval card) always shows in the chat, plan step or not,
 * so it can be answered where the node is talking.
 */
export const inTimeline = (message: Pick<Message, "planId" | "kind">): boolean => !message.planId || message.kind === "approval";

export function mentionsMe(message: Pick<Message, "mentions">, meId: string): boolean {
  return (message.mentions ?? []).some((row) => row.kind === "human" && row.id === meId);
}

export const isDeleted = (message: Pick<Message, "data">): boolean => message.data?.deleted === true;

export type Reactions = Record<string, string[]>;

export function reactionsOf(message: Pick<Message, "data">): Reactions {
  const raw = message.data?.reactions;
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].length > 0));
}

/** Adds my reaction, or takes it back when it is already there (what the server does). */
export function toggleReaction(reactions: Reactions, emoji: string, meId: string): Reactions {
  const who = new Set(reactions[emoji] ?? []);
  if (who.has(meId)) who.delete(meId);
  else who.add(meId);
  const next = { ...reactions };
  if (who.size) next[emoji] = [...who];
  else delete next[emoji];
  return next;
}

/** Reactions in the room's emoji order: count, whether one is mine, and who reacted ("You, Ben"). */
export function reactionRows(reactions: Reactions, order: readonly string[], meId: string, nameOf: (accountId: string) => string): Array<{ emoji: string; count: number; mine: boolean; names: string }> {
  const known = order.filter((emoji) => reactions[emoji]?.length);
  const extra = Object.keys(reactions).filter((emoji) => !order.includes(emoji) && reactions[emoji]?.length);
  return [...known, ...extra].map((emoji) => {
    const who = reactions[emoji]!;
    const mine = who.includes(meId);
    const others = who.filter((id) => id !== meId).map(nameOf);
    return { emoji, count: who.length, mine, names: [...(mine ? ["You"] : []), ...others].join(", ") };
  });
}

/** The local calendar day of a time, for date separators. */
export function dayKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/** "Today", "Yesterday", "Monday 20 October", or with the year when it is not this year. */
export function dayLabel(iso: string, now = Date.now()): string {
  const date = new Date(iso);
  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return "Today";
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return "Yesterday";
  return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", ...(date.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }) });
}

/** The first message someone else wrote after what I had read, for the "New" divider. */
export function firstUnread(list: ReadonlyArray<Pick<Message, "id" | "seq" | "authorKind" | "authorAccountId" | "kind">>, readSeq: number, meId: string): string | null {
  const hit = list.find((row) => row.seq > readSeq && row.kind !== "status" && !(row.authorKind === "human" && row.authorAccountId === meId));
  return hit?.id ?? null;
}

/** Only text and run cards that everyone in the room can read may be pinned. */
export function canPin(message: Pick<Message, "kind" | "private" | "data" | "id">): boolean {
  return !message.private && !isDeleted(message) && (message.kind === "text" || message.kind === "run") && !message.id.startsWith("local-");
}

export function canDelete(message: Pick<Message, "kind" | "authorKind" | "authorAccountId" | "data" | "id">, meId: string): boolean {
  return message.kind === "text" && message.authorKind === "human" && message.authorAccountId === meId && !isDeleted(message) && !message.id.startsWith("local-");
}

export function canReact(message: Pick<Message, "kind" | "data" | "id">): boolean {
  return (message.kind === "text" || message.kind === "run") && !isDeleted(message) && !message.id.startsWith("local-");
}

/** The words of a search query, as the server matches them (every word must be in the message). */
export function searchWords(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean).slice(0, 6);
}

/** Splits text into parts that match a word of the query and parts that do not. */
export function highlightParts(text: string, query: string): Array<{ text: string; hit: boolean }> {
  const words = searchWords(query).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length || !text) return [{ text, hit: false }];
  const out: Array<{ text: string; hit: boolean }> = [];
  let last = 0;
  for (const match of text.matchAll(new RegExp(words.join("|"), "gi"))) {
    const at = match.index ?? 0;
    if (!match[0]) continue;
    if (at > last) out.push({ text: text.slice(last, at), hit: false });
    out.push({ text: match[0], hit: true });
    last = at + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false });
  return out.length ? out : [{ text, hit: false }];
}

/** A short piece of a long message around the first matching word, on one line. */
export function snippet(text: string, query: string, room = 70): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const words = searchWords(query).map((word) => word.toLowerCase());
  const lower = flat.toLowerCase();
  const at = words.map((word) => lower.indexOf(word)).filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, at - room);
  const end = Math.min(flat.length, at + room * 2);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

export const isEmail = (value: string): boolean => EMAIL.test(value.trim());

/**
 * Takes the finished addresses out of what was typed or pasted ("a@x.dev, b@y.dev c"): separators are
 * commas, semicolons, spaces and new lines; the last piece stays in the box unless `all` is set.
 */
export function takeEmails(input: string, all = false): { emails: string[]; rest: string } {
  const parts = input.split(/[\s,;]+/);
  const rest = all ? "" : (parts.pop() ?? "");
  const emails = parts.map((part) => part.trim().replace(/^<|>$/g, "").toLowerCase()).filter(Boolean);
  return { emails: [...new Set(emails)], rest };
}

/**
 * A refetch of a room's newest page, merged with what is already loaded: earlier pages stay (they were
 * loaded on purpose) and messages still on their way stay too.
 */
export function keepOlder<T extends { id: string; seq: number; clientId?: string | null; sending?: boolean; failed?: string }>(current: readonly T[], fresh: readonly T[], page: number): T[] {
  const local = (row: T) => row.id.startsWith("local-") || row.sending || row.failed;
  const oldest = fresh.length ? Math.min(...fresh.map((row) => row.seq)) : Infinity;
  const older = fresh.length >= page ? current.filter((row) => !local(row) && row.seq < oldest && !fresh.some((item) => item.id === row.id)) : [];
  const waiting = current.filter((row) => local(row) && !fresh.some((item) => item.id === row.id || (row.clientId && item.clientId === row.clientId)));
  return [...older, ...fresh, ...waiting].sort((a, b) => a.seq - b.seq);
}

/** A one-line preview of a message for lists and quotes: Markdown marks and line breaks out. */
export function plainPreview(text: string): string {
  return text
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/^\s{0,3}(#{1,4}|>|[-*•]|\d+[.)])\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** A message list's one-line preview: the words, else the files or media it carries. */
export function messagePreview(message: Pick<Message, "authorKind" | "body" | "data">): string {
  if (isDeleted(message)) return "Message deleted";
  const text = plainPreview(readableBody(message));
  if (text) return text;
  const files = messageFiles(message);
  if (files.length) return files.length === 1 ? `📎 ${files[0]!.name}` : `📎 ${files.length} files`;
  const media = message.authorKind === "node" ? mediaItems(message.data?.media) : [];
  return media.length ? `📎 ${evidenceCount(media)}` : "";
}

/** What I send to a room. `files` are already in my Files; only their ids go to the server. */
export type SendInput = { body: string; private: boolean; clientId: string; replyTo?: ReplyTo; files?: MessageFile[] };

/** The body of `POST /api/node/rooms/:id/messages`. */
export function sendBody(input: SendInput): { body: string; private: boolean; clientId: string; replyToId?: string; files?: string[] } {
  return {
    body: input.body,
    private: input.private,
    clientId: input.clientId,
    ...(input.replyTo ? { replyToId: input.replyTo.id } : {}),
    ...(input.files?.length ? { files: input.files.map((file) => file.id) } : {}),
  };
}

/** The message shown at once while it is on its way; the server's copy replaces it by clientId. */
export function optimisticMessage(roomId: string, meId: string, input: SendInput, now = new Date()): Message {
  return {
    id: `local-${input.clientId}`,
    roomId,
    seq: Number.MAX_SAFE_INTEGER,
    authorKind: "human",
    authorAccountId: meId,
    authorNodeId: null,
    kind: "text",
    body: input.body,
    data: { ...(input.replyTo ? { replyTo: input.replyTo } : {}), ...(input.files?.length ? { files: input.files } : {}) },
    private: input.private,
    mentions: [],
    rootMessageId: null,
    clientId: input.clientId,
    createdAt: now.toISOString(),
    sending: true,
  };
}

/** A failed message sent again: the same words, files and clientId, so the server keeps one copy and nothing is uploaded again. */
export function resendInput(message: Message): SendInput {
  const files = messageFiles(message);
  return {
    body: message.body,
    private: message.private,
    clientId: message.clientId ?? message.id.replace(/^local-/, ""),
    ...(message.data?.replyTo ? { replyTo: message.data.replyTo } : {}),
    ...(files.length ? { files } : {}),
  };
}
