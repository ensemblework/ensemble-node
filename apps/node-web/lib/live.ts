"use client";

/**
 * What nodes are doing right now, from the event stream: who is thinking in which room, the reply
 * being written (owner only) and the tools it is using. Not stored; a reload starts empty.
 */
import { useSyncExternalStore } from "react";

export type LiveNode = { thinking: boolean; text: string; tools: Array<{ name: string; state?: string; summary?: string }> };

const state = new Map<string, LiveNode>();
const listeners = new Set<() => void>();
let version = 0;

const key = (roomId: string, nodeId: string) => `${roomId}:${nodeId}`;

function emit() {
  version += 1;
  for (const listener of listeners) listener();
}

export const live = {
  status(roomId: string, nodeId: string, thinking: boolean) {
    const current = state.get(key(roomId, nodeId)) ?? { thinking: false, text: "", tools: [] };
    state.set(key(roomId, nodeId), thinking ? { ...current, thinking: true } : { thinking: false, text: "", tools: [] });
    emit();
  },
  delta(roomId: string, nodeId: string, text: string) {
    const current = state.get(key(roomId, nodeId)) ?? { thinking: true, text: "", tools: [] };
    state.set(key(roomId, nodeId), { ...current, thinking: true, text: current.text + text });
    emit();
  },
  tool(roomId: string, nodeId: string, call: { name: string; state?: string; summary?: string }) {
    const current = state.get(key(roomId, nodeId)) ?? { thinking: true, text: "", tools: [] };
    state.set(key(roomId, nodeId), { ...current, thinking: true, tools: [...current.tools, call].slice(-6) });
    emit();
  },
  posted(roomId: string, nodeId: string) {
    const current = state.get(key(roomId, nodeId));
    if (!current) return;
    state.set(key(roomId, nodeId), { ...current, text: "", tools: [] });
    emit();
  },
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Nodes busy in a room, with what they are writing. */
export function useLiveRoom(roomId: string): Array<{ nodeId: string } & LiveNode> {
  useSyncExternalStore(subscribe, () => version, () => 0);
  const out: Array<{ nodeId: string } & LiveNode> = [];
  for (const [id, value] of state) {
    const [room, nodeId] = id.split(":");
    if (room === roomId && nodeId && (value.thinking || value.text)) out.push({ nodeId, ...value });
  }
  return out;
}

/** Node ids thinking anywhere. */
export function useBusyNodes(): Set<string> {
  useSyncExternalStore(subscribe, () => version, () => 0);
  const busy = new Set<string>();
  for (const [id, value] of state) if (value.thinking) busy.add(id.split(":")[1]!);
  return busy;
}
