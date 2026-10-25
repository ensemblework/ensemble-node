"use client";

import { Check, File as FileIcon, FileAudio, FileCode, FileImage, FileSpreadsheet, FileText, FileVideo, FolderOpen, Paperclip, Presentation, RotateCw, Search, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isCancelled, uploadFile } from "@/lib/api";
import {
  addAttachments,
  attachNotice,
  canShowPicture,
  failUpload,
  fileAttachment,
  fileDate,
  finishUpload,
  kindLabel,
  localAttachment,
  MAX_ATTACHMENTS,
  pastedFiles,
  pastedName,
  readyFiles,
  recordFile,
  removeAttachment,
  retryUpload,
  sendBlocker,
  setProgress,
  sizeLabel,
  type Attachment,
} from "@/lib/attachments";
import { ENSEMBLE_LINKS } from "@/lib/config";
import { fileLimit, useFiles } from "@/lib/hooks";
import { toast } from "@/lib/toast";
import type { FileRecord, MessageFile } from "@/lib/types";
import { Button, Drawer, External, MenuItem, Spinner, useDismiss } from "../ui";
import { useDebounced } from "./search";

const KIND_ICON: Record<string, typeof FileText> = {
  pdf: FileText,
  document: FileText,
  text: FileText,
  slides: Presentation,
  sheet: FileSpreadsheet,
  image: FileImage,
  code: FileCode,
  audio: FileAudio,
  video: FileVideo,
};

export function FileKindIcon({ kind, size = 16, className = "" }: { kind: string; size?: number; className?: string }) {
  const Icon = KIND_ICON[kind] ?? FileIcon;
  return <Icon size={size} className={className} aria-hidden />;
}

let keySeq = 0;
const nextKey = () => `attachment-${++keySeq}`;

export type Attachments = ReturnType<typeof useAttachments>;

/**
 * The composer's attachments: files from this computer upload to the person's Files at once (with
 * progress, cancel and retry); files chosen from Files are attached as they are. Removing a chip never
 * deletes the file.
 */
export function useAttachments() {
  const client = useQueryClient();
  const [items, setItems] = useState<Attachment[]>([]);
  const current = useRef<Attachment[]>([]);
  const sources = useRef(new Map<string, File>());
  const uploads = useRef(new Map<string, { abort: () => void }>());

  /** Every change goes through here: a chip that leaves stops its upload and frees its thumbnail. */
  const commit = useCallback((apply: (list: Attachment[]) => Attachment[]) => {
    const before = current.current;
    const next = apply(before);
    if (next === before) return;
    const kept = new Set(next.map((row) => row.key));
    for (const row of before) {
      if (kept.has(row.key)) continue;
      if (row.preview) URL.revokeObjectURL(row.preview);
      uploads.current.get(row.key)?.abort();
      uploads.current.delete(row.key);
      sources.current.delete(row.key);
    }
    current.current = next;
    setItems(next);
  }, []);

  useEffect(() => {
    const running = uploads.current;
    return () => {
      for (const upload of running.values()) upload.abort();
      for (const row of current.current) if (row.preview) URL.revokeObjectURL(row.preview);
    };
  }, []);

  const start = useCallback(
    async (key: string) => {
      const file = sources.current.get(key);
      if (!file) return;
      const limit = await fileLimit(client);
      if (!current.current.some((row) => row.key === key && row.status === "uploading")) return;
      if (limit && file.size > limit) return commit((list) => failUpload(list, key, `Files can be up to ${sizeLabel(limit)} here.`));
      const upload = uploadFile(file, (percent) => commit((list) => setProgress(list, key, percent)));
      uploads.current.set(key, upload);
      try {
        const record = await upload.promise;
        commit((list) => finishUpload(list, key, recordFile(record)));
        void client.invalidateQueries({ queryKey: ["files"] });
      } catch (error) {
        if (!isCancelled(error)) commit((list) => failUpload(list, key, error instanceof Error ? error.message : String(error)));
      } finally {
        if (uploads.current.get(key) === upload) uploads.current.delete(key);
      }
    },
    [client, commit],
  );

  const addFiles = useCallback(
    (files: readonly File[]) => {
      if (!files.length) return;
      const byKey = new Map<string, File>();
      const incoming = files.map((file) => {
        const row = localAttachment(nextKey(), file);
        byKey.set(row.key, file);
        return row;
      });
      const result = addAttachments(current.current, incoming);
      const notice = attachNotice(result);
      if (notice) toast(notice);
      const added = result.added.map((row) => {
        const file = byKey.get(row.key)!;
        sources.current.set(row.key, file);
        return canShowPicture(file.name, row.kind) ? { ...row, preview: URL.createObjectURL(file) } : row;
      });
      if (!added.length) return;
      commit((list) => [...list, ...added]);
      for (const row of added) void start(row.key);
    },
    [commit, start],
  );

  const addExisting = useCallback(
    (files: readonly MessageFile[]) => {
      const result = addAttachments(current.current, files.map((file) => fileAttachment(nextKey(), file)));
      const notice = attachNotice(result);
      if (notice) toast(notice);
      if (result.added.length) commit((list) => [...list, ...result.added]);
    },
    [commit],
  );

  const toggleExisting = useCallback(
    (record: FileRecord) => {
      const on = current.current.find((row) => row.fileId === record.id);
      if (on) commit((list) => removeAttachment(list, on.key));
      else addExisting([recordFile(record)]);
    },
    [addExisting, commit],
  );

  const remove = useCallback((key: string) => commit((list) => removeAttachment(list, key)), [commit]);
  const retry = useCallback(
    (key: string) => {
      const before = current.current;
      commit((list) => retryUpload(list, key));
      if (current.current !== before) void start(key);
    },
    [commit, start],
  );
  const clear = useCallback(() => commit((list) => (list.length ? [] : list)), [commit]);

  return { items, files: readyFiles(items), blocker: sendBlocker(items), full: items.length >= MAX_ATTACHMENTS, addFiles, addExisting, toggleExisting, remove, retry, clear };
}

/** Pasted files and pictures, unless they came with copied text; a screenshot gets a name by the time. */
export function pasteFiles(event: ClipboardEvent, add: (files: File[]) => void) {
  const files = pastedFiles(event.clipboardData);
  if (!files.length) return;
  event.preventDefault();
  const now = new Date();
  add(
    files.map((file) => {
      const name = pastedName(file.name, file.type, now);
      return name === file.name ? file : new File([file], name, { type: file.type, lastModified: file.lastModified });
    }),
  );
}

const carriesFiles = (event: { dataTransfer: DataTransfer | null }) => Array.from(event.dataTransfer?.types ?? []).includes("Files");

/** Dropping files onto the composer attaches them; `over` while files are held above it. */
export function useFileDrop(onFiles: (files: File[]) => void, enabled: boolean) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  useEffect(() => {
    if (!enabled) {
      depth.current = 0;
      setOver(false);
      return;
    }
    // A file dropped beside the composer would open in the tab, and the draft would be lost.
    const guard = (event: globalThis.DragEvent) => {
      if (event.defaultPrevented || !carriesFiles(event)) return;
      event.preventDefault();
      if (event.type === "dragover" && event.dataTransfer) event.dataTransfer.dropEffect = "none";
    };
    window.addEventListener("dragover", guard);
    window.addEventListener("drop", guard);
    return () => {
      window.removeEventListener("dragover", guard);
      window.removeEventListener("drop", guard);
    };
  }, [enabled]);
  const bind = enabled
    ? {
        onDragEnter: (event: DragEvent) => {
          if (!carriesFiles(event)) return;
          event.preventDefault();
          depth.current += 1;
          setOver(true);
        },
        onDragOver: (event: DragEvent) => {
          if (!carriesFiles(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        },
        onDragLeave: (event: DragEvent) => {
          if (!carriesFiles(event)) return;
          depth.current = Math.max(0, depth.current - 1);
          if (!depth.current) setOver(false);
        },
        onDrop: (event: DragEvent) => {
          if (!carriesFiles(event)) return;
          event.preventDefault();
          depth.current = 0;
          setOver(false);
          onFiles(Array.from(event.dataTransfer.files));
        },
      }
    : {};
  return { over, bind };
}

/** The drop target's label, over the composer while files are held above it. */
export function DropHint() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-3xl border-2 border-dashed border-accent bg-panel/90 text-sm font-medium text-accent" aria-hidden>
      <Upload size={16} className="mr-2" /> Drop to attach
    </div>
  );
}

/** Moves focus between `[data-item]` buttons with the arrow keys. */
function arrowKeys(event: KeyboardEvent<HTMLElement>, box: HTMLElement | null, from?: HTMLElement | null) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const items = [...(box?.querySelectorAll<HTMLElement>("[data-item]:not(:disabled)") ?? [])];
  if (!items.length) return;
  event.preventDefault();
  const at = items.indexOf(document.activeElement as HTMLElement);
  if (at <= 0 && event.key === "ArrowUp") return from ? from.focus() : items[items.length - 1]?.focus();
  items[at < 0 ? 0 : Math.min(items.length - 1, at + (event.key === "ArrowDown" ? 1 : -1))]?.focus();
}

/** The paperclip: upload from this computer or choose from Files. `hint` says who can read what is attached. */
export function AttachButton({ attachments, hint, disabled }: { attachments: Attachments; hint: string; disabled?: boolean }) {
  const [menu, setMenu] = useState(false);
  const [picker, setPicker] = useState(false);
  // Each opening starts with a fresh search.
  const [pickerKey, setPickerKey] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const close = useCallback(() => setMenu(false), []);
  useDismiss(menu, close, box);
  useEffect(() => {
    if (menu) box.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [menu]);
  const full = attachments.full;
  const label = full ? `A message holds up to ${MAX_ATTACHMENTS} files` : "Attach files";
  return (
    <div ref={box} className="relative">
      <input
        ref={input}
        type="file"
        multiple
        hidden
        tabIndex={-1}
        onChange={(event) => {
          attachments.addFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <button
        type="button"
        aria-label={label}
        title={full ? label : `Attach files. ${hint}`}
        aria-haspopup="menu"
        aria-expanded={menu}
        disabled={disabled || full}
        onClick={() => setMenu(!menu)}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 ${menu ? "bg-raised text-ink" : "text-muted"}`}
      >
        <Paperclip size={16} />
      </button>
      {menu ? (
        <div
          role="menu"
          aria-label="Attach files"
          onKeyDown={(event) => {
            const items = [...(box.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            const at = items.indexOf(document.activeElement as HTMLElement);
            items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
          }}
          className="absolute bottom-full left-0 z-40 mb-2 w-72 rounded-2xl border border-line bg-panel p-1.5 shadow-2xl"
        >
          <MenuItem
            onClick={() => {
              setMenu(false);
              input.current?.click();
            }}
          >
            <Upload size={15} /> Upload from this computer
          </MenuItem>
          <MenuItem
            onClick={() => {
              setMenu(false);
              setPickerKey((key) => key + 1);
              setPicker(true);
            }}
          >
            <FolderOpen size={15} /> Choose from Files
          </MenuItem>
          <p className="mt-1 border-t border-line px-2.5 pb-1 pt-2 text-[11px] leading-snug text-muted">{hint}</p>
        </div>
      ) : null}
      <FilesPicker key={pickerKey} open={picker} onClose={() => setPicker(false)} attachments={attachments} />
    </div>
  );
}

/** The person's Ensemble Files, searchable by name; each pick attaches it (or takes it off again). */
function FilesPicker({ open, onClose, attachments }: { open: boolean; onClose: () => void; attachments: Attachments }) {
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim());
  const files = useFiles(query, open);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const attached = new Set(attachments.items.flatMap((row) => (row.fileId ? [row.fileId] : [])));
  const rows = files.data?.files ?? [];
  const shown = rows.slice(0, 60);
  return (
    <Drawer open={open} onClose={onClose} title="Choose from your Files" side="top">
      <div className="space-y-3" onKeyDown={(event) => arrowKeys(event, list.current, input.current)}>
        <label className="flex items-center gap-2 rounded-xl border border-line bg-bg px-3 py-2 focus-within:border-accent">
          <Search size={16} className="shrink-0 text-muted" />
          <input
            ref={input}
            autoFocus
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search your Files by name"
            aria-label="Search your Files by name"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          />
          {files.isFetching ? <Spinner className="h-3.5 w-3.5 text-muted" /> : null}
        </label>
        {files.error ? <p className="px-1 text-sm text-danger">{files.error.message}</p> : null}
        {files.data && !rows.length ? (
          <p className="px-1 text-sm text-muted">{query ? `No file in your Files is named like “${query}”.` : "Your Files is empty. Upload from this computer instead."}</p>
        ) : null}
        {!files.data && files.isLoading ? (
          <div className="flex justify-center py-6 text-muted">
            <Spinner />
          </div>
        ) : null}
        {shown.length ? (
          <ul ref={list} className="space-y-0.5" aria-label="Your Files">
            {shown.map((file) => {
              const on = attached.has(file.id);
              const blocked = !on && attachments.full;
              return (
                <li key={file.id}>
                  <button
                    type="button"
                    data-item
                    aria-pressed={on}
                    disabled={blocked}
                    title={blocked ? `A message holds up to ${MAX_ATTACHMENTS} files` : on ? "Take it off this message" : "Attach it to this message"}
                    onClick={() => attachments.toggleExisting(file)}
                    className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left outline-none hover:bg-raised focus:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-raised text-muted">
                      <FileKindIcon kind={file.kind} size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{file.filename}</span>
                      <span className="block truncate text-xs text-muted">
                        {kindLabel(file.kind)} · {sizeLabel(file.byteSize)} · {fileDate(file.createdAt)}
                      </span>
                    </span>
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${on ? "border-accent bg-accent text-accent-ink" : "border-line"}`} aria-hidden>
                      {on ? <Check size={12} /> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        {rows.length > shown.length ? <p className="px-1 text-xs text-muted">Showing the newest {shown.length} of {rows.length}. Search to find the others.</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs text-muted">
          <span>
            {attachments.items.length} of {MAX_ATTACHMENTS} attached ·{" "}
            <External href={ENSEMBLE_LINKS.files} icon className="text-accent hover:underline">
              Open Files in Ensemble
            </External>
          </span>
          <Button size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

function ShelfChip({ row, onRemove, onRetry }: { row: Attachment; onRemove: () => void; onRetry: () => void }) {
  const uploading = row.status === "uploading";
  const failed = row.status === "failed";
  return (
    <li className={`relative flex w-56 max-w-full items-center gap-2.5 overflow-hidden rounded-xl border bg-bg/70 p-1.5 pr-1 ${failed ? "border-danger/40" : "border-line"}`}>
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-raised text-muted">
        {row.preview ? <img src={row.preview} alt="" className="h-full w-full object-cover" /> : <FileKindIcon kind={row.kind} size={18} />}
        {uploading ? (
          <span className="absolute inset-0 flex items-center justify-center bg-bg/50">
            <Spinner className="h-4 w-4 text-ink" />
          </span>
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium" title={row.name}>
          {row.name}
        </span>
        {failed ? (
          <span className="line-clamp-2 break-words text-[11px] leading-snug text-danger" role="alert" title={row.error ?? undefined}>
            {row.error}
          </span>
        ) : (
          <span className="block truncate text-[11px] text-muted">
            {uploading ? `${sizeLabel(row.size)} · ${row.progress ? `${row.progress}%` : "Preparing…"}` : `${kindLabel(row.kind)} · ${sizeLabel(row.size)}`}
          </span>
        )}
      </span>
      {failed && row.local ? (
        <button type="button" onClick={onRetry} aria-label={`Retry uploading ${row.name}`} title="Retry" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-ink">
          <RotateCw size={14} />
        </button>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        aria-label={uploading ? `Cancel uploading ${row.name}` : `Remove ${row.name}`}
        title={uploading ? "Cancel the upload" : failed ? "Remove" : "Remove from this message (it stays in your Files)"}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-ink"
      >
        <X size={14} />
      </button>
      {uploading ? (
        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-line" role="progressbar" aria-label={`Uploading ${row.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={row.progress}>
          <span className="block h-full bg-accent transition-[width] duration-200" style={{ width: `${row.progress}%` }} />
        </span>
      ) : null}
    </li>
  );
}

/** The files on the message being written, above the text box. */
export function AttachmentShelf({ attachments }: { attachments: Attachments }) {
  if (!attachments.items.length) return null;
  return (
    <ul className="scroll-thin flex max-h-36 flex-wrap gap-2 overflow-y-auto px-1 pb-1 pt-1" aria-label={`Attached files, ${attachments.items.length} of ${MAX_ATTACHMENTS}`}>
      {attachments.items.map((row) => (
        <ShelfChip key={row.key} row={row} onRemove={() => attachments.remove(row.key)} onRetry={() => attachments.retry(row.key)} />
      ))}
    </ul>
  );
}
