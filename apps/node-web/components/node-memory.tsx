"use client";

/**
 * What a node remembers, in its settings (Ensemble docs/35 §5.6): its own memories and the ones about me
 * that all my nodes read, each with its markers (pinned, where it applies, its key, archived). I add one,
 * change its words (a new revision replaces it), pin or unpin it, archive or restore it, or delete it with
 * its earlier revisions. An Ensemble without memory scopes sends the words only: add and delete.
 */
import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, ChevronDown, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { keys, useMemories, useMemoryActions } from "@/lib/hooks";
import { memoryEditable, memoryGroups, memoryMarkers } from "@/lib/memory";
import { toastError } from "@/lib/toast";
import type { NodeMemory } from "@/lib/types";
import { Button, Input, Pill, Spinner, Textarea } from "./ui";

/** The most characters one memory holds (Ensemble's `MEMORY_CHARS`). */
const MEMORY_CHARS = 500;

type Actions = ReturnType<typeof useMemoryActions>;
type Change = { content?: string; pinned?: boolean; archived?: boolean } | "delete";

function RowButton({ label, onClick, disabled, tone, children }: { label: string; onClick: () => void; disabled?: boolean; tone?: "danger"; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted transition hover:bg-raised disabled:opacity-40 ${tone === "danger" ? "hover:text-danger" : "hover:text-ink"}`}>
      {children}
    </button>
  );
}

function MemoryRow({ memory, actions }: { memory: NodeMemory; actions: Actions }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memory.content);
  const editable = memoryEditable(memory);
  const markers = memoryMarkers(memory);
  const busy = actions.isPending && actions.variables?.memoryId === memory.id;
  const change = (next: Change, done?: () => void) => actions.mutate({ memoryId: memory.id, change: next }, { onSuccess: done, onError: toastError });
  const words = draft.trim();
  return (
    <li className="rounded-xl border border-line bg-bg px-3 py-2 text-sm" data-memory={memory.archived ? "archived" : memory.pinned ? "pinned" : "live"}>
      {editing ? (
        <div className="space-y-2">
          <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} maxLength={MEMORY_CHARS} aria-label="What it remembers" autoFocus />
          <div className="flex gap-2">
            <Button size="sm" busy={busy} disabled={!words || words === memory.content} onClick={() => change({ content: words }, () => setEditing(false))}>
              Save
            </Button>
            <Button size="sm" tone="quiet" disabled={busy} onClick={() => (setDraft(memory.content), setEditing(false))}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <span className={`min-w-0 flex-1 whitespace-pre-wrap break-words ${memory.archived ? "text-muted" : ""}`}>{memory.content}</span>
          <span className="-mr-1.5 -mt-1 flex shrink-0 items-center">
            {busy ? <Spinner className="mx-1.5 h-3.5 w-3.5 text-muted" /> : null}
            {editable && !memory.archived ? (
              <>
                <RowButton label="Edit" disabled={busy} onClick={() => (setDraft(memory.content), setEditing(true))}>
                  <Pencil size={14} aria-hidden />
                </RowButton>
                <RowButton label={memory.pinned ? "Unpin" : "Pin"} disabled={busy} onClick={() => change({ pinned: !memory.pinned })}>
                  {memory.pinned ? <PinOff size={14} aria-hidden /> : <Pin size={14} aria-hidden />}
                </RowButton>
              </>
            ) : null}
            {editable ? (
              <RowButton label={memory.archived ? "Restore" : "Archive"} disabled={busy} onClick={() => change({ archived: !memory.archived })}>
                {memory.archived ? <ArchiveRestore size={14} aria-hidden /> : <Archive size={14} aria-hidden />}
              </RowButton>
            ) : null}
            <RowButton label="Delete" tone="danger" disabled={busy} onClick={() => change("delete")}>
              <Trash2 size={14} aria-hidden />
            </RowButton>
          </span>
        </div>
      )}
      {markers.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1" aria-label="About this memory">
          {markers.map((marker) => (
            <span key={marker.label} title={marker.title} className="inline-flex">
              <Pill tone={marker.tone}>{marker.label}</Pill>
            </span>
          ))}
        </div>
      ) : null}
    </li>
  );
}

export function NodeMemories({ nodeId }: { nodeId: string }) {
  const client = useQueryClient();
  const memories = useMemories(nodeId);
  const actions = useMemoryActions(nodeId);
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const { live, archived } = memoryGroups(memories.data ?? []);
  const add = () => {
    const content = text.trim();
    if (!content) return;
    setAdding(true);
    void api(`/api/node/nodes/${nodeId}/memory`, { body: { content } })
      .then(() => {
        setText("");
        return client.invalidateQueries({ queryKey: keys.memory(nodeId) });
      })
      .catch(toastError)
      .finally(() => setAdding(false));
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input value={text} onChange={(event) => setText(event.target.value)} placeholder="Our docs use British spelling" maxLength={MEMORY_CHARS} aria-label="Something to remember" />
        <Button tone="ghost" className="shrink-0" busy={adding} disabled={!text.trim()} onClick={add}>
          Add
        </Button>
      </div>
      {memories.isLoading ? <Spinner className="h-4 w-4 text-muted" /> : null}
      {memories.error ? <p className="text-sm text-danger">{memories.error.message}</p> : null}
      <ul className="space-y-1.5" data-memories>
        {live.map((memory) => (
          <MemoryRow key={memory.id} memory={memory} actions={actions} />
        ))}
        {memories.data && !live.length ? <li className="text-sm text-muted">Nothing yet.</li> : null}
      </ul>
      {archived.length ? (
        <div className="space-y-1.5">
          <button type="button" aria-expanded={archivedOpen} onClick={() => setArchivedOpen(!archivedOpen)} className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
            Archived ({archived.length}) <ChevronDown size={12} className={`transition-transform ${archivedOpen ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {archivedOpen ? (
            <ul className="space-y-1.5">
              {archived.map((memory) => (
                <MemoryRow key={memory.id} memory={memory} actions={actions} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
