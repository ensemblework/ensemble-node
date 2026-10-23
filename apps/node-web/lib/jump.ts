"use client";

/** A request to open a message in a room (from search, a pin or a quoted reply), for the room view to scroll to. */
import { useSyncExternalStore } from "react";

type Jump = { roomId: string; messageId: string; nonce: number };

let pending: Jump | null = null;
const listeners = new Set<() => void>();

export function requestJump(roomId: string, messageId: string) {
  pending = { roomId, messageId, nonce: Date.now() };
  for (const listener of listeners) listener();
}

export function clearJump(nonce: number) {
  if (pending?.nonce === nonce) pending = null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The jump waiting for this room, if any. */
export function useJump(roomId: string): Jump | null {
  const current = useSyncExternalStore(subscribe, () => pending, () => null);
  return current?.roomId === roomId ? current : null;
}
