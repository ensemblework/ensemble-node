"use client";

/**
 * What nodes are doing right now, from the event stream: who is thinking in which room, the reply
 * being written (owner only) and the tools it is using. Not stored; a reload starts empty.
 *
 * Reply text arrives a few characters at a time. Deltas are buffered and applied once per frame,
 * and only the room they belong to re-renders; the busy list (sidebar, start page) re-renders only
 * when a node starts or stops thinking, never for text.
 */
import { useSyncExternalStore } from "react";

export type LiveNode = { thinking: boolean; text: string; tools: Array<{ name: string; state?: string; summary?: string }> };
export type LiveRow = { nodeId: string } & LiveNode;

const state = new Map<string, LiveNode>();
const roomListeners = new Map<string, Set<() => void>>();
const busyListeners = new Set<() => void>();
/** Each room's rows as last read, kept until the room changes so React sees the same array. */
const roomRows = new Map<string, LiveRow[]>();
let busy: Set<string> = new Set();

const key = (roomId: string, nodeId: string) => `${roomId}:${nodeId}`;
const EMPTY: LiveRow[] = [];

const pendingText = new Map<string, string>();
const dirtyRooms = new Set<string>();
let busyDirty = false;
let scheduled: ReturnType<typeof setTimeout> | number | null = null;

function frame(run: () => void) {
  if (typeof requestAnimationFrame === "function") return requestAnimationFrame(run);
  return setTimeout(run, 16);
}

function busyNow(): Set<string> {
  const next = new Set<string>();
  for (const [id, value] of state) if (value.thinking) next.add(id.slice(id.indexOf(":") + 1));
  return next;
}

/** Applies buffered text and tells the rooms (and the busy list) that changed. */
function flush() {
  scheduled = null;
  for (const [id, text] of pendingText) {
    const before = state.get(id);
    if (!before?.thinking) busyDirty = true;
    state.set(id, { ...(before ?? { tools: [] }), thinking: true, text: (before?.text ?? "") + text });
    dirtyRooms.add(id.slice(0, id.indexOf(":")));
  }
  pendingText.clear();
  const rooms = [...dirtyRooms];
  dirtyRooms.clear();
  for (const room of rooms) {
    roomRows.delete(room);
    for (const listener of roomListeners.get(room) ?? []) listener();
  }
  if (busyDirty) {
    busyDirty = false;
    const next = busyNow();
    if (next.size !== busy.size || [...next].some((id) => !busy.has(id))) {
      busy = next;
      for (const listener of busyListeners) listener();
    }
  }
}

function schedule() {
  scheduled ??= frame(flush);
}

/** A change other than text: buffered text for that node goes first, so nothing is reordered. */
function change(roomId: string, nodeId: string, next: (current: LiveNode | undefined) => LiveNode | null) {
  const id = key(roomId, nodeId);
  const wasThinking = Boolean(state.get(id)?.thinking);
  const text = pendingText.get(id);
  if (text !== undefined) {
    pendingText.delete(id);
    const current = state.get(id);
    state.set(id, { ...(current ?? { tools: [] }), thinking: true, text: (current?.text ?? "") + text });
  }
  const after = next(state.get(id));
  if (!after) {
    if (text !== undefined) {
      if (!wasThinking) busyDirty = true;
      dirtyRooms.add(roomId);
      schedule();
    }
    return;
  }
  state.set(id, after);
  if (wasThinking !== after.thinking) busyDirty = true;
  dirtyRooms.add(roomId);
  schedule();
}

export const live = {
  status(roomId: string, nodeId: string, thinking: boolean) {
    change(roomId, nodeId, (current) => (thinking ? { ...(current ?? { text: "", tools: [] }), thinking: true } : { thinking: false, text: "", tools: [] }));
  },
  delta(roomId: string, nodeId: string, text: string) {
    const id = key(roomId, nodeId);
    pendingText.set(id, (pendingText.get(id) ?? "") + text);
    schedule();
  },
  tool(roomId: string, nodeId: string, call: { name: string; state?: string; summary?: string }) {
    change(roomId, nodeId, (current) => ({ ...(current ?? { text: "", tools: [] }), thinking: true, tools: [...(current?.tools ?? []), call].slice(-6) }));
  },
  posted(roomId: string, nodeId: string) {
    change(roomId, nodeId, (current) => (current ? { ...current, text: "", tools: [] } : null));
  },
  /** Applies everything buffered now (tests, and before a reader that cannot wait a frame). */
  flush() {
    if (scheduled !== null) {
      if (typeof cancelAnimationFrame === "function" && typeof scheduled === "number") cancelAnimationFrame(scheduled);
      else clearTimeout(scheduled as ReturnType<typeof setTimeout>);
    }
    flush();
  },
  /** Forgets everything (tests). */
  reset() {
    state.clear();
    pendingText.clear();
    dirtyRooms.clear();
    roomRows.clear();
    busy = new Set();
    busyDirty = false;
  },
};

/** The rows for one room, the same array until that room changes. */
export function roomSnapshot(roomId: string): LiveRow[] {
  const cached = roomRows.get(roomId);
  if (cached) return cached;
  const out: LiveRow[] = [];
  const prefix = `${roomId}:`;
  for (const [id, value] of state) {
    if (id.startsWith(prefix) && (value.thinking || value.text)) out.push({ nodeId: id.slice(prefix.length), ...value });
  }
  const rows = out.length ? out : EMPTY;
  roomRows.set(roomId, rows);
  return rows;
}

/** Node ids thinking anywhere, the same set until one starts or stops. */
export function busySnapshot(): Set<string> {
  return busy;
}

export function subscribeRoom(roomId: string, listener: () => void): () => void {
  let set = roomListeners.get(roomId);
  if (!set) roomListeners.set(roomId, (set = new Set()));
  set.add(listener);
  return () => {
    set.delete(listener);
    if (!set.size) roomListeners.delete(roomId);
  };
}

export function subscribeBusy(listener: () => void): () => void {
  busyListeners.add(listener);
  return () => busyListeners.delete(listener);
}

const NO_BUSY: Set<string> = new Set();

/** Nodes busy in a room, with what they are writing. */
export function useLiveRoom(roomId: string): LiveRow[] {
  return useSyncExternalStore(
    (listener) => subscribeRoom(roomId, listener),
    () => roomSnapshot(roomId),
    () => EMPTY,
  );
}

/** Node ids thinking anywhere. */
export function useBusyNodes(): Set<string> {
  return useSyncExternalStore(subscribeBusy, busySnapshot, () => NO_BUSY);
}
