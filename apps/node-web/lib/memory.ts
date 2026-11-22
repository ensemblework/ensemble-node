/**
 * A node's memories as its owner reads them (Ensemble docs/35 §5.6): the live ones and the archived ones
 * apart, and each one's markers: pinned, where it applies (all the owner's nodes, one conversation, one
 * project), its key, archived. A server without memory scopes sends the words only: those read as plain
 * memories, which can be deleted but not edited, pinned or archived here.
 */
import type { NodeMemory } from "./types";

export type MemoryMarker = { label: string; tone: "accent" | "muted"; title: string };

export function memoryMarkers(memory: NodeMemory): MemoryMarker[] {
  const markers: MemoryMarker[] = [];
  const title = memory.scopeTitle?.trim();
  if (memory.pinned) markers.push({ label: "Pinned", tone: "accent", title: "Always given to the node, and the node never changes it." });
  if (memory.ownerWide || memory.scope === "owner") markers.push({ label: "All your nodes", tone: "muted", title: "About you: every node of yours reads it, and it stays when this node goes." });
  else if (memory.scope === "room") markers.push({ label: title ? `In “${title}”` : "One conversation", tone: "muted", title: "Read only in that conversation." });
  else if (memory.scope === "project") markers.push({ label: title ? `Project “${title}”` : "One project", tone: "muted", title: "Read only in work on that project." });
  if (memory.key?.trim()) markers.push({ label: `Key: ${memory.key.trim()}`, tone: "muted", title: "What it is about: saving another with this key replaces it." });
  if (memory.archived) markers.push({ label: "Archived", tone: "muted", title: "Kept, but not given to the node." });
  return markers;
}

/** The memories shown now (a newer revision replaced none of them), live ones first as Ensemble orders them, archived ones apart. */
export function memoryGroups(memories: readonly NodeMemory[]): { live: NodeMemory[]; archived: NodeMemory[] } {
  const current = memories.filter((row) => !row.supersededById);
  return { live: current.filter((row) => !row.archived), archived: current.filter((row) => row.archived) };
}

/** Whether this server keeps memory scopes, so the memory can be edited, pinned and archived here. */
export const memoryEditable = (memory: NodeMemory): boolean => typeof memory.pinned === "boolean" && typeof memory.archived === "boolean";
