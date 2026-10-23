"use client";

/** Short notes at the bottom of the screen: what failed (with the server's words) or what just happened. */
import { useSyncExternalStore } from "react";

export type Toast = { id: number; text: string; tone: "info" | "ok" | "error" };

let toasts: Toast[] = [];
let next = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function dismissToast(id: number) {
  toasts = toasts.filter((row) => row.id !== id);
  emit();
}

export function toast(text: string, tone: Toast["tone"] = "info") {
  const id = next++;
  toasts = [...toasts.slice(-3), { id, text, tone }];
  emit();
  setTimeout(() => dismissToast(id), tone === "error" ? 7000 : 3500);
}

export const toastError = (error: unknown) => toast(error instanceof Error ? error.message : String(error), "error");

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const empty: Toast[] = [];

export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, () => toasts, () => empty);
}
