"use client";

import { Hash, Lock, MessageSquare, Search, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { highlightParts, snippet } from "@/lib/chat";
import { nodesById, useBootstrap, useSearch, type Author } from "@/lib/hooks";
import { ago } from "@/lib/text";
import type { RoomKind, SearchResult } from "@/lib/types";
import { NodeAvatar, PersonAvatar } from "../node-avatar";
import { Segmented, Spinner } from "../ui";

const KIND_ICON: Record<RoomKind, typeof Hash> = { dm: MessageSquare, crew: Users, room: Hash };

function useDebounced(value: string, ms = 250): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightParts(text, query).map((part, index) =>
        part.hit ? (
          <mark key={index} className="rounded bg-accent/25 px-0.5 text-ink">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

/**
 * Search messages I can read: in one room (`roomId`) or across all of them. Every word must match;
 * People and Nodes narrow it to what people or nodes wrote.
 */
export function SearchPanel({ roomId, onPick, onClose, autoFocus = true }: { roomId?: string; onPick: (result: SearchResult) => void; onClose?: () => void; autoFocus?: boolean }) {
  const boot = useBootstrap();
  const [q, setQ] = useState("");
  const [author, setAuthor] = useState<Author>("all");
  const debounced = useDebounced(q);
  const search = useSearch(debounced, roomId ?? null, author);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const nodes = useMemo(() => nodesById(boot.data), [boot.data]);
  const people = useMemo(() => {
    const map = new Map<string, string>();
    for (const room of boot.data?.rooms ?? []) for (const member of room.members) if (member.kind === "person") map.set(member.accountId, member.me ? "You" : member.name);
    return map;
  }, [boot.data]);
  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  const results = debounced.trim().length >= 2 ? (search.data ?? []) : [];
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && onClose) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = [...(list.current?.querySelectorAll<HTMLElement>("[data-result]") ?? [])];
    if (!items.length) return;
    event.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (at < 0 && event.key === "ArrowUp") return;
    if (at === 0 && event.key === "ArrowUp") return input.current?.focus();
    items[Math.min(items.length - 1, at + (event.key === "ArrowDown" ? 1 : -1))]?.focus();
  };

  return (
    <div className="space-y-3" onKeyDown={onKey}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-bg px-3 py-2 focus-within:border-accent">
          <Search size={16} className="shrink-0 text-muted" />
          <input
            ref={input}
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder={roomId ? "Search this conversation" : "Search every conversation"}
            aria-label={roomId ? "Search this conversation" : "Search every conversation"}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          />
          {search.isFetching ? <Spinner className="h-3.5 w-3.5 text-muted" /> : null}
          {q ? (
            <button type="button" aria-label="Clear" className="text-muted hover:text-ink" onClick={() => (setQ(""), input.current?.focus())}>
              <X size={14} />
            </button>
          ) : null}
        </label>
        <Segmented
          label="Who wrote it"
          size="sm"
          value={author}
          onChange={setAuthor}
          options={[
            { id: "all", label: "All" },
            { id: "people", label: "People" },
            { id: "nodes", label: "Nodes" },
          ]}
        />
        {onClose ? (
          <button type="button" aria-label="Close search" className="rounded-lg p-1.5 text-muted hover:bg-raised hover:text-ink" onClick={onClose}>
            <X size={16} />
          </button>
        ) : null}
      </div>

      {q.trim().length > 0 && q.trim().length < 2 ? <p className="px-1 text-sm text-muted">Type at least two characters.</p> : null}
      {search.error && debounced.trim().length >= 2 ? <p className="px-1 text-sm text-danger">{search.error.message}</p> : null}
      {debounced.trim().length >= 2 && search.data && !results.length && !search.isFetching ? <p className="px-1 text-sm text-muted">No messages have every word of “{debounced.trim()}”.</p> : null}

      {results.length ? (
        <ul ref={list} className="space-y-1" aria-label="Results">
          {results.map(({ message, room }) => {
            const node = message.authorNodeId ? nodes.get(message.authorNodeId) : undefined;
            const name = message.authorKind === "system" ? "Ensemble" : node ? node.name : (people.get(message.authorAccountId) ?? "Someone");
            const Icon = KIND_ICON[room.kind] ?? Hash;
            return (
              <li key={message.id}>
                <button
                  type="button"
                  data-result
                  onClick={() => onPick({ message, room })}
                  className="flex w-full gap-2.5 rounded-xl px-2.5 py-2 text-left outline-none hover:bg-raised focus:bg-raised"
                >
                  <span className="mt-0.5">{node ? <NodeAvatar avatar={node.avatar} size={26} /> : <PersonAvatar name={name} size={26} />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-medium text-ink">{name}</span>
                        {!roomId ? (
                          <span className="inline-flex min-w-0 items-center gap-1 text-muted">
                            <Icon size={11} className="shrink-0" /> <span className="truncate">{room.title}</span>
                          </span>
                        ) : null}
                        {message.private ? <Lock size={10} className="shrink-0 text-private" aria-label="private" /> : null}
                      </span>
                      <span className="shrink-0 text-muted">{ago(message.createdAt)}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-sm text-muted">
                      <Highlighted text={snippet(message.body, debounced)} query={debounced} />
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
