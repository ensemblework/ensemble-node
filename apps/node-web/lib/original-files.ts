import { api } from "./api";

export type OriginalSource =
  | { kind: "job"; id: string; path: string }
  | { kind: "node"; id: string; fileId: string; path: string };
export type FileTarget = { kind: "node" | "session"; roomId: string; nodeId: string; nodeName: string; sessionId?: string; agentName?: string };
export type FileQuote = { source: OriginalSource; from: number; to: number; text: string; hash: string | null; draft: boolean; location?: string; computer?: string; target?: FileTarget };
export const wireQuotes = (quotes: FileQuote[]) => quotes.map(({ target: _target, ...quote }) => quote);
export type OriginalEntry = {
  source: OriginalSource;
  deviceId?: string | null;
  deviceName?: string | null;
  nodeId?: string | null;
  nodeName?: string | null;
  roomId?: string | null;
  roomTitle?: string | null;
  folder?: string | null;
  sessionId?: string | null;
  deleted?: boolean;
  updatedAt?: string;
};
export type OriginalData = { path: string; name: string; location: string; fileId?: string; modifiedAt?: string; content: string | null; hash: string | null; size: number; binary: boolean; truncated: boolean; readOnly: string | null };
export type OriginalPage = { files: OriginalEntry[]; nextCursor: string | null };
export const originalKey = (entry: OriginalEntry) => entry.source.kind === "node"
  ? `${entry.deviceId ?? entry.source.id}:${entry.source.fileId}`
  : `job:${entry.source.id}:${entry.source.path}`;
export const fileName = (path: string) => path.split(/[\\/]/).at(-1) || path;
export const readOriginal = (source: OriginalSource, signal?: AbortSignal) => api<OriginalData>("/api/node/files/open", { body: { source, action: "read" }, signal });
export const saveOriginal = (source: OriginalSource, content: string, expectedHash: string) => api<{ hash: string }>("/api/node/files/open", { body: { source, action: "save", content, expectedHash } });

export function selectionQuote(source: OriginalSource, text: string, from: number, to: number, hash: string | null, draft: boolean): FileQuote | null {
  if (from === to) return null;
  const start = Math.min(from, to), end = Math.max(from, to);
  return { source, text: text.slice(start, end), from: text.slice(0, start).split("\n").length, to: text.slice(0, Math.max(start, end - 1)).split("\n").length, hash, draft };
}

export const CHAT_MIN = 320, EDITOR_MIN = 400, FILES_MIN = 224, FILES_MAX = 360, SPLIT_DIVIDER = 4;
export function splitAt(editorRatio: number, width: number): { mode: "chat" | "editor" | "split"; ratio: number } {
  if (editorRatio > 0.7) return { mode: "editor", ratio: 0.5 };
  if (editorRatio < 0.3) return { mode: "chat", ratio: 0.5 };
  return { mode: "split", ratio: Math.max(EDITOR_MIN / width, Math.min(1 - CHAT_MIN / width, editorRatio)) };
}
