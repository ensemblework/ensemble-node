"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, FileCode2, Files, PanelRightClose, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { FileBuffers } from "@/lib/file-buffers";
import { CHAT_MIN, EDITOR_MIN, FILES_MAX, FILES_MIN, SPLIT_DIVIDER, fileName, originalKey, splitAt, type FileQuote, type FileTarget, type OriginalEntry, type OriginalPage } from "@/lib/original-files";
import { toastError } from "@/lib/toast";
import { ago } from "@/lib/text";
import { Button, Drawer, IconButton, Spinner } from "../ui";

const Editor = dynamic(() => import("./editor").then(module => module.OriginalEditor), { ssr: false, loading: () => <div className="flex flex-1 items-center justify-center text-muted"><Spinner /></div> });
type Mode = "chat" | "split" | "editor";
type Workspace = {
  accountId: string;
  store: FileBuffers;
  roomId: string | null;
  active: string | null;
  tabs: string[];
  mode: Mode;
  filesOpen: boolean;
  open: (entry: OriginalEntry) => void;
  select: (key: string) => void;
  close: (key: string) => void;
  hide: () => void;
  restore: () => void;
  focus: () => void;
  toggleFiles: () => void;
  setQuoteTarget: (key: string | null) => void;
  quote: (quote: FileQuote) => Promise<void>;
};
const Context = createContext<Workspace | null>(null);
const focusFileOrChat = () => requestAnimationFrame(() => (document.querySelector<HTMLButtonElement>('[role="tablist"][aria-label="Open files"] [role="tab"][aria-selected="true"]') ?? document.querySelector<HTMLButtonElement>(".chat-header h1 button"))?.focus());
export function useFileWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("The file workspace must be inside its provider.");
  return value;
}
export function useFileBuffer(key: string) {
  const { store } = useFileWorkspace();
  const subscribe = useCallback((listener: () => void) => store.subscribe(key, listener), [store, key]);
  return useSyncExternalStore(subscribe, () => store.get(key), () => store.get(key));
}

export function FileWorkspaceProvider({ accountId, roomId, onAutoCollapse, children }: { accountId: string; roomId: string | null; onAutoCollapse: (value: boolean) => void; children: ReactNode }) {
  const router = useRouter();
  const [store] = useState(() => new FileBuffers());
  const [active, setActive] = useState<string | null>(null);
  const [tabs, setTabs] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("chat");
  const [filesOpen, setFilesOpen] = useState(false);
  const [pendingClose, setPendingClose] = useState<string | null>(null);
  const quoteTarget = useRef<string | null>(null);
  const pendingQuote = useRef<{ draftKey: string; quote: FileQuote } | null>(null);
  const deliverQuote = useCallback((key: string | null) => {
    quoteTarget.current = key;
    if (!key || pendingQuote.current?.draftKey !== key) return;
    requestAnimationFrame(() => {
      const pending = pendingQuote.current;
      if (!pending || quoteTarget.current !== pending.draftKey) return;
      window.dispatchEvent(new CustomEvent("node:file-quote", { detail: pending }));
      pendingQuote.current = null;
    });
  }, []);
  useEffect(() => {
    store.resume();
    const leave = (event: BeforeUnloadEvent) => { if (store.hasDrafts()) event.preventDefault(); };
    window.addEventListener("beforeunload", leave);
    return () => { window.removeEventListener("beforeunload", leave); store.pause(); };
  }, [store]);
  useEffect(() => store.subscribeSaveErrors((key, message) => {
    if (mode === "chat" || !roomId || active !== key) toastError(new Error(`${fileName(store.get(key)?.entry.source.path ?? "File")}: ${message}`));
  }), [store, mode, roomId, active]);
  useEffect(() => {
    const refresh = (event: Event) => {
      if (!active || mode === "chat" || !roomId) return;
      const data = (event as CustomEvent<{ deviceId?: string; files?: Array<{ fileId: string }> }>).detail;
      const file = store.get(active);
      if (data?.deviceId && file?.entry.deviceId && data.deviceId !== file.entry.deviceId) return;
      if (Array.isArray(data?.files) && file?.data?.fileId && !data.files.some(source => source.fileId === file.data!.fileId)) return;
      void store.refresh(active);
    };
    window.addEventListener("node:originals-changed", refresh);
    return () => window.removeEventListener("node:originals-changed", refresh);
  }, [store, active, mode, roomId]);
  const open = useCallback((entry: OriginalEntry) => {
    let key = originalKey(entry);
    const same = tabs.find(id => {
      const source = store.get(id)?.entry.source;
      return source?.id === entry.source.id && source.path === entry.source.path;
    });
    if (same) key = same;
    else void store.open(entry);
    setTabs(current => current.includes(key) ? current : [...current, key]);
    setActive(key);
    setMode(current => current === "editor" ? current : "split");
  }, [store, tabs]);
  const remove = useCallback((key: string) => {
    const next = tabs.filter(id => id !== key);
    setTabs(next);
    if (active === key) { setActive(next.at(-1) ?? null); if (!next.length) setMode("chat"); }
    store.forget(key);
    setPendingClose(null);
    focusFileOrChat();
  }, [active, tabs, store]);
  const close = useCallback((key: string) => {
    if (store.dirty(key) || store.get(key)?.status === "saving") setPendingClose(key);
    else remove(key);
  }, [store, remove]);
  const value = useMemo<Workspace>(() => ({
    accountId, store, roomId, active, tabs, mode, filesOpen, open, close,
    select: key => { setActive(key); setMode(current => current === "editor" ? current : "split"); void store.refresh(key); },
    hide: () => {
      setMode("chat");
      requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".chat-header h1 button")?.focus());
    },
    restore: () => { setMode("split"); if (active) void store.refresh(active); }, focus: () => setMode("editor"),
    toggleFiles: () => {
      const next = !filesOpen; setFilesOpen(next);
      requestAnimationFrame(() => (next
        ? document.querySelector<HTMLButtonElement>('.file-list [aria-label="Close file list"]')
        : document.querySelector<HTMLButtonElement>('.file-workspace [aria-label="Show file list"]') ?? document.querySelector<HTMLButtonElement>('.chat-header [aria-label="Show changed files"]'))?.focus());
    },
    setQuoteTarget: deliverQuote,
    quote: async quote => {
      const { target } = await api<{ target: FileTarget }>("/api/node/files/target", { body: { source: quote.source } });
      pendingQuote.current = { draftKey: `${accountId}:${target.roomId}`, quote: { ...quote, target } };
      if (target.roomId === roomId) deliverQuote(quoteTarget.current);
      else router.push(`/r/${target.roomId}`);
      const available = (document.querySelector(".file-workspace")?.clientWidth ?? window.innerWidth) - (document.querySelector<HTMLElement>(".file-list")?.offsetWidth ?? 0);
      setMode(available < CHAT_MIN + EDITOR_MIN + SPLIT_DIVIDER ? "chat" : "split");
    },
  }), [accountId, store, roomId, active, tabs, mode, filesOpen, open, close, deliverQuote, router]);
  return <Context value={value}>
    <LayoutControls onAutoCollapse={onAutoCollapse} accountId={accountId}>{children}</LayoutControls>
    <UnsavedFileDialog fileKey={pendingClose} onKeep={() => { if (pendingClose) setActive(pendingClose); setPendingClose(null); focusFileOrChat(); }} onRemove={remove} />
  </Context>;
}

function UnsavedFileDialog({ fileKey, onKeep, onRemove }: { fileKey: string | null; onKeep: () => void; onRemove: (key: string) => void }) {
  const { store } = useFileWorkspace();
  const file = useFileBuffer(fileKey ?? "");
  const [busy, setBusy] = useState(false);
  return <Drawer open={Boolean(fileKey)} onClose={onKeep} title="Unsaved file" side="right">
    <p className="text-sm text-muted">Your draft of <span className="font-medium text-ink">{file ? fileName(file.entry.source.path) : ""}</span> has not reached the computer. Closing the panel keeps it; discarding this tab removes it.</p>
    {file?.error ? <p className="mt-3 text-xs leading-5 text-danger" role="alert">{file.error}</p> : file?.status === "conflict" ? <p className="mt-3 text-xs text-warn">Compare the computer version in the editor before closing.</p> : null}
    <div className="mt-5 flex flex-wrap gap-2">
      <Button disabled={busy} onClick={onKeep}>Keep editing</Button>
      <Button tone="ghost" busy={busy} onClick={() => { if (fileKey) { setBusy(true); void store.save(fileKey).then(() => { if (!store.dirty(fileKey)) onRemove(fileKey); }).finally(() => setBusy(false)); } }}>Save and close</Button>
      <Button tone="danger" disabled={busy} onClick={() => { if (fileKey) { setBusy(true); void store.discard(fileKey).then(() => onRemove(fileKey)).finally(() => setBusy(false)); } }}>Discard draft</Button>
    </div>
  </Drawer>;
}

type Controls = { ratio: number; resize: (ratio: number) => void; filesWidth: number; setFilesWidth: (value: number) => void; collapse: () => void };
const ControlsContext = createContext<Controls | null>(null);
function LayoutControls({ accountId, onAutoCollapse, children }: { accountId: string; onAutoCollapse: (value: boolean) => void; children: ReactNode }) {
  const { filesOpen, mode, roomId } = useFileWorkspace();
  const [compressed, setCompressed] = useState(false);
  const [ratio, setRatio] = useState(0.5);
  const [filesWidth, setFilesWidth] = useState(280);
  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem("node.file-layout") ?? "null");
      if (stored && typeof stored === "object" && "filesWidth" in stored && typeof stored.filesWidth === "number") setFilesWidth(Math.max(FILES_MIN, Math.min(FILES_MAX, stored.filesWidth)));
    } catch { toastError(new Error("The editor layout could not be restored.")); }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      try { localStorage.setItem("node.file-layout", JSON.stringify({ filesWidth })); }
      catch { toastError(new Error("This browser could not save the file-list width.")); }
    }, 250);
    return () => clearTimeout(timer);
  }, [filesWidth]);
  useEffect(() => {
    onAutoCollapse(Boolean(roomId && (filesOpen || mode === "editor" || compressed)));
  }, [roomId, filesOpen, mode, compressed, onAutoCollapse]);
  useEffect(() => { if (mode === "chat" && !filesOpen) setCompressed(false); }, [mode, filesOpen]);
  const value = useMemo<Controls>(() => ({
    ratio, resize: setRatio, filesWidth, collapse: () => setCompressed(true),
    setFilesWidth: width => setFilesWidth(Math.max(FILES_MIN, Math.min(FILES_MAX, width))),
  }), [ratio, filesWidth]);
  return <ControlsContext value={value}><div className="contents" data-file-account={accountId}>{children}</div></ControlsContext>;
}

export function FileWorkspaceSurface({ children }: { children: ReactNode }) {
  const workspace = useFileWorkspace();
  const controls = useContext(ControlsContext)!;
  const surface = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  const showEditor = Boolean(workspace.roomId && workspace.active && workspace.mode !== "chat");
  const dockedFiles = workspace.filesOpen && width - controls.filesWidth >= EDITOR_MIN ? controls.filesWidth : 0;
  const single = width - dockedFiles < CHAT_MIN + EDITOR_MIN + SPLIT_DIVIDER;
  const hideChat = showEditor && (workspace.mode === "editor" || single);
  const required = showEditor ? hideChat ? EDITOR_MIN : CHAT_MIN + EDITOR_MIN + SPLIT_DIVIDER : CHAT_MIN;
  const overlay = width - controls.filesWidth < required;
  const listOverlay = Boolean(workspace.roomId && workspace.filesOpen && overlay);
  const listSpace = workspace.filesOpen && !overlay ? controls.filesWidth : 0;
  const contentWidth = Math.max(CHAT_MIN + EDITOR_MIN, width - listSpace - SPLIT_DIVIDER);
  const ratio = Math.max(EDITOR_MIN / contentWidth, Math.min(1 - CHAT_MIN / contentWidth, controls.ratio));
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 1000));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (showEditor && width < CHAT_MIN + EDITOR_MIN + SPLIT_DIVIDER + listSpace) controls.collapse(); }, [showEditor, width, listSpace, controls]);
  const splitter = (ratio: number) => {
    const next = splitAt(ratio, contentWidth);
    controls.collapse();
    if (next.mode === "editor") workspace.focus();
    else if (next.mode === "chat") workspace.hide();
    else controls.resize(next.ratio);
  };
  return <div ref={surface} className="file-workspace relative flex h-full min-h-0 min-w-0 overflow-hidden" data-mode={showEditor ? hideChat ? "editor" : "split" : "chat"}>
    <section aria-label="Conversation" hidden={hideChat} inert={listOverlay || undefined} className={`min-h-0 min-w-0 ${showEditor ? "shrink-0" : "flex-1"}`} style={showEditor && !hideChat ? { width: `calc((100% - ${listSpace + SPLIT_DIVIDER}px) * ${1 - ratio})` } : undefined}>{children}</section>
    {showEditor && !hideChat ? <div role="separator" aria-label="Resize chat and editor" aria-orientation="vertical" aria-valuemin={30} aria-valuemax={70} aria-valuenow={Math.round(ratio * 100)} tabIndex={0} className="file-divider relative z-10 w-1 shrink-0 cursor-col-resize touch-none bg-line hover:bg-accent/50 focus-visible:bg-accent"
      onPointerDown={event => {
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); controls.collapse();
      }} onPointerMove={event => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const bounds = surface.current!.getBoundingClientRect();
        const usable = bounds.width - listSpace - SPLIT_DIVIDER;
        splitter((bounds.left + usable - event.clientX) / usable);
      }} onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onKeyDown={event => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); splitter(ratio + (event.key === "ArrowLeft" ? 0.05 : -0.05)); }
        else if (event.key === "Home" || event.key === "End") { event.preventDefault(); event.key === "Home" ? workspace.hide() : workspace.focus(); }
      }} /> : null}
    {showEditor ? <section aria-label="File editor" inert={listOverlay || undefined} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg">
      {single ? <div className="border-b border-line px-2"><button type="button" className="inline-flex min-h-10 items-center gap-2 text-sm text-muted hover:text-ink" onClick={workspace.hide}><ArrowLeft size={16} />Back to chat</button></div> : null}
      <Editor key={workspace.active!} fileKey={workspace.active!} />
    </section> : null}
    {listOverlay ? <button type="button" aria-label="Dismiss file list" onClick={workspace.toggleFiles} className="absolute inset-0 z-20 cursor-default bg-black/15" /> : null}
    {workspace.roomId && workspace.filesOpen ? <aside aria-label="Changed files" className={`file-list flex min-h-0 shrink-0 flex-col border-l border-line bg-panel ${overlay ? "absolute inset-y-0 right-0 z-30 shadow-2xl" : ""}`} style={{ width: Math.min(controls.filesWidth, width - 24) }}>
      <div role="separator" aria-label="Resize file list" aria-orientation="vertical" aria-valuemin={FILES_MIN} aria-valuemax={FILES_MAX} aria-valuenow={controls.filesWidth} tabIndex={0} className="file-divider absolute inset-y-0 -ml-0.5 w-1 cursor-col-resize touch-none hover:bg-accent/50 focus-visible:bg-accent"
        onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) controls.setFilesWidth(surface.current!.getBoundingClientRect().right - event.clientX); }}
        onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); controls.setFilesWidth(controls.filesWidth + (event.key === "ArrowLeft" ? 16 : -16)); } }} />
      <OriginalList />
    </aside> : null}
  </div>;
}

function OriginalList() {
  const workspace = useFileWorkspace();
  const [scope, setScope] = useState<"all" | "chat">("chat");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => { const timer = setTimeout(() => setSearch(query.trim()), 250); return () => clearTimeout(timer); }, [query]);
  const files = useInfiniteQuery({
    queryKey: ["node-originals", scope === "chat" ? workspace.roomId : null, search],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ q: search });
      if (scope === "chat" && workspace.roomId) params.set("roomId", workspace.roomId);
      if (pageParam) params.set("cursor", pageParam);
      return api<OriginalPage>(`/api/node/files?${params}`, { signal });
    },
    getNextPageParam: page => page.nextCursor,
    staleTime: 15_000,
  });
  const entries = files.data?.pages.flatMap(page => page.files) ?? [];
  return <>
    <header className="flex h-[60px] shrink-0 items-center gap-2 px-4"><Files size={17} className="text-muted" /><h2 className="min-w-0 flex-1 text-sm font-medium">Files</h2><IconButton label="Close file list" onClick={workspace.toggleFiles}><PanelRightClose size={17} /></IconButton></header>
    <div className="space-y-3 px-3 pb-3">
      <label className="search-field flex items-center gap-2 rounded-xl border border-line px-2.5 py-2 text-muted"><Search size={14} aria-hidden /><input name="file-search" autoComplete="off" spellCheck={false} value={query} onChange={event => setQuery(event.target.value)} aria-label="Search changed files" placeholder="Find a file…" className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none md:text-sm" /></label>
      <div className="flex gap-1" role="group" aria-label="File scope">{(["chat", "all"] as const).map(value => <button key={value} type="button" onClick={() => setScope(value)} aria-pressed={scope === value} className={`min-h-9 rounded-lg px-2.5 text-xs ${scope === value ? "bg-raised font-medium" : "text-muted hover:bg-raised"}`}>{value === "chat" ? "This chat" : "All chats"}</button>)}</div>
    </div>
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-4">
      {files.isLoading ? <div className="py-8 text-center text-muted" role="status"><Spinner /><span className="sr-only">Loading original files</span></div> : null}
      {files.error ? <div className="px-3 py-5 text-sm text-danger" role="alert">{files.error.message}<button className="mt-2 block text-ink underline" onClick={() => void files.refetch()}>Retry</button></div> : null}
      {!files.isLoading && !files.error && !entries.length ? <p className="px-3 py-8 text-center text-sm leading-6 text-muted">{search ? "No matching files." : "Files changed by your nodes and agent sessions appear here."}</p> : null}
      {entries.map(entry => <button key={originalKey(entry)} type="button" onClick={() => workspace.open(entry)} aria-current={workspace.active === originalKey(entry) ? "true" : undefined} className={`group flex min-h-16 w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left [content-visibility:auto] [contain-intrinsic-size:auto_64px] ${workspace.active === originalKey(entry) ? "bg-raised" : "hover:bg-raised/60"}`} title={`${entry.folder ?? ""}/${entry.source.path}${entry.deviceName ? ` · ${entry.deviceName}` : ""}`}>
        <FileCode2 size={17} className={`shrink-0 ${entry.deleted ? "text-muted opacity-50" : "text-accent/80"}`} />
        <span className="min-w-0 flex-1"><span className={`block truncate text-sm font-medium ${entry.deleted ? "line-through" : ""}`}>{fileName(entry.source.path)}</span><span className="block truncate text-[11px] text-muted">{entry.source.path.includes("/") ? entry.source.path.slice(0, entry.source.path.lastIndexOf("/")) : entry.folder || entry.deviceName || "Original file"}</span><span className="block truncate text-[10px] text-muted">{entry.nodeName}{entry.updatedAt ? ` · ${ago(entry.updatedAt)}` : ""}{entry.deleted ? " · deleted" : ""}</span></span>
        <ChevronRight size={13} className="shrink-0 text-muted opacity-0 group-hover:opacity-100" />
      </button>)}
      {files.hasNextPage ? <Button tone="quiet" className="mt-2 w-full" busy={files.isFetchingNextPage} onClick={() => void files.fetchNextPage()}>Show more files</Button> : null}
    </div>
    <p className="shrink-0 border-t border-line px-4 py-3 text-[11px] leading-5 text-muted">Originals stay on your computer. Only files you own can be opened here.</p>
  </>;
}

export function OpenFileTab({ fileKey }: { fileKey: string }) {
  const workspace = useFileWorkspace();
  const file = useFileBuffer(fileKey);
  if (!file) return null;
  return <div className={`flex shrink-0 items-center border-r border-line ${workspace.active === fileKey ? "bg-bg" : "text-muted"}`}>
    <button type="button" role="tab" aria-selected={workspace.active === fileKey} aria-controls="node-file-panel" tabIndex={workspace.active === fileKey ? 0 : -1} onClick={() => workspace.select(fileKey)} title={file.entry.source.path}
      onKeyDown={event => {
        const index = workspace.tabs.indexOf(fileKey);
        const next = event.key === "ArrowRight" ? (index + 1) % workspace.tabs.length : event.key === "ArrowLeft" ? (index - 1 + workspace.tabs.length) % workspace.tabs.length : event.key === "Home" ? 0 : event.key === "End" ? workspace.tabs.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault(); workspace.select(workspace.tabs[next]!);
        requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[role="tablist"][aria-label="Open files"] [role="tab"][aria-selected="true"]')?.focus());
      }} className="inline-flex min-h-10 max-w-48 items-center gap-2 py-2 pl-3 pr-1 text-xs"><FileCode2 size={13} className="shrink-0" /><span className="truncate">{fileName(file.entry.source.path)}</span>{workspace.store.dirty(fileKey) ? <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-label="Unsaved" /> : null}</button>
    <IconButton label={`Close ${fileName(file.entry.source.path)}`} onClick={() => workspace.close(fileKey)} className="!size-8 !rounded-md"><X size={12} /></IconButton>
  </div>;
}
