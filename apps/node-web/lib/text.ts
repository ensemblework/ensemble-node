/** Small pure helpers for the chat: time, mentions in text, the composer's @ menu. */

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 45) return "now";
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h`;
  if (seconds < 7 * 86_400) return `${Math.round(seconds / 86_400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export type Piece = { text: string; mention?: string; link?: string; code?: boolean };

const TOKEN = /(`[^`\n]+`)|\[([^\]\n]+)\]\(((?:https?:\/\/|\/(?!\/))[^\s)]*)\)|(https?:\/\/[^\s)]+)|((?:^|(?<=[\s([{"'>,;]))@[a-z0-9][a-z0-9_-]*)/gi;

/** Splits a message into plain text, `code`, links (bare or `[label](address)`) and @mentions (only handles that exist in the room). */
export function pieces(text: string, handles: ReadonlySet<string>): Piece[] {
  const out: Piece[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const at = match.index ?? 0;
    const [whole, code, label, target, link, mention] = match;
    if (mention && !handles.has(mention.slice(1).toLowerCase()) && !["@everyone", "@nodes"].includes(mention.toLowerCase())) continue;
    if (at > last) out.push({ text: text.slice(last, at) });
    if (code) out.push({ text: code.slice(1, -1), code: true });
    else if (label && target) out.push({ text: label, link: target });
    else if (link) out.push({ text: link, link });
    else out.push({ text: whole, mention: whole.slice(1).toLowerCase() });
    last = at + whole.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.length ? out : [{ text }];
}

/** Where a link opens: this site's rooms and nodes in place, other paths in Ensemble (`app`), the rest in a new tab. */
export function linkTarget(href: string, app: string): { href: string; here: boolean } {
  if (/^\/(?:r|n)\//.test(href)) return { href, here: true };
  if (href.startsWith("/")) return { href: `${app}${href}`, here: false };
  return { href, here: false };
}

/** The `@partial` being typed just before the cursor, if any. */
export function typingMention(value: string, cursor: number): { start: number; query: string } | null {
  const before = value.slice(0, cursor);
  const match = /(^|[\s([{"'>,;])@([a-z0-9_-]*)$/i.exec(before);
  if (!match) return null;
  return { start: cursor - match[2]!.length - 1, query: match[2]!.toLowerCase() };
}

/** Handles that start with the query first, then ones that contain it; at most 6. */
export function matchHandles<T extends { handle: string; label: string }>(options: readonly T[], query: string): T[] {
  const q = query.toLowerCase();
  const starts = options.filter((row) => row.handle.startsWith(q) || row.label.toLowerCase().startsWith(q));
  const contains = options.filter((row) => !starts.includes(row) && (row.handle.includes(q) || row.label.toLowerCase().includes(q)));
  return [...starts, ...contains].slice(0, 6);
}

/** Replaces the typed `@partial` with the chosen handle and a space; returns the new text and cursor. */
export function insertMention(value: string, start: number, cursor: number, handle: string): { value: string; cursor: number } {
  const next = `${value.slice(0, start)}@${handle} ${value.slice(cursor)}`;
  return { value: next, cursor: start + handle.length + 2 };
}

/** Merges a message into a list ordered by seq: replaces the same id or clientId, never duplicates. */
export function mergeMessage<T extends { id: string; seq: number; clientId?: string | null }>(list: readonly T[], message: T): T[] {
  const index = list.findIndex((row) => row.id === message.id || (message.clientId && row.clientId === message.clientId));
  const next = index >= 0 ? list.map((row, i) => (i === index ? message : row)) : [...list, message];
  return next.sort((a, b) => a.seq - b.seq);
}

export const RUN_LABEL: Record<string, string> = {
  queued: "Queued",
  claimed: "Starting",
  running: "Running",
  stopping: "Stopping",
  waiting_approval: "Needs you",
  blocked: "Blocked",
  succeeded: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
  interrupted: "Interrupted",
};

export const TOOL_LABEL = (name: string): string =>
  name
    .replace(/^(hub|node|apps)_/, "")
    .replace(/_/g, " ")
    .replace(/^./, (first) => first.toUpperCase());

/** A model as the chat model menu shows it: "GPT-6.1 Sol (2026-09-29) · 20× credits". */
export function modelLabel(option: { label: string; relativeCost?: number }): string {
  return option.relativeCost ? `${option.label} · ${option.relativeCost}× credits` : option.label;
}
