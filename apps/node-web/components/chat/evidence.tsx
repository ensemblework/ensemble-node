"use client";

/**
 * Evidence a run attached (screenshots, videos, traces, reports, logs) and media a node sends with a
 * message: thumbnails, a lightbox with keyboard and swipe navigation, a player for videos, a preview
 * for text files (Markdown rendered, other text as it is; lib/file-preview.ts) and a download for
 * everything else. Pictures are read with the session cookie and shown only when the bytes that came
 * back are a safe picture type (lib/evidence.ts); HTML, SVG, scripts and other active formats are only
 * ever downloaded, never shown in the page. Media in a message is read through that message (`via`), so
 * people in a room who do not own the file can open it too. A video shows its poster and length, and
 * media keeps its measured shape while it loads; a tall picture (a full page) shows its top and scrolls
 * when opened. A file held for its owner's preview, or kept on the computer, is listed and never read
 * from here.
 */
import { ChevronLeft, ChevronRight, Download, EyeOff, FileText, HardDrive, ImageOff, Maximize2, ScrollText, X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { download, evidenceBlob, evidenceHead, evidenceUrl } from "@/lib/api";
import { sizeLabel } from "@/lib/attachments";
import { heldReasonWords } from "@/lib/captures";
import { durationLabel, evidenceKind, evidencePath, evidenceShow, isSafeImage, isTall, keptAs, mediaFrame } from "@/lib/evidence";
import { decodePreview, looksBinary, PREVIEW_MAX_BYTES, previewContent, previewLines, textPreviewKind, type TextPreviewKind } from "@/lib/file-preview";
import { toastError } from "@/lib/toast";
import type { EvidenceItem } from "@/lib/types";
import { Spinner } from "../ui";
import { RichText } from "./rich-text";

/** The requirement a piece of evidence is for, with where it is listed when that is on the page. */
export type RequirementLink = { text: string; href?: string };

type Picture = { url: string } | { error: string };
const pictures = new Map<string, Promise<Picture>>();
/** Pictures kept for this page; past this the oldest object URLs are released. */
const KEEP = 120;

/** Forgets pictures the page read (a held capture that was discarded). */
export function forgetPictures(ids: readonly string[]) {
  for (const id of ids) {
    const old = pictures.get(id);
    pictures.delete(id);
    void old?.then((row) => ("url" in row ? URL.revokeObjectURL(row.url) : undefined));
  }
}

/** A picture's bytes as an object URL, read once for the page and shared by its thumbnail and the lightbox. */
function picture(id: string, via: string | null): Promise<Picture> {
  const cached = pictures.get(id);
  if (cached) return cached;
  const made = evidenceBlob(id, undefined, via).then(
    (blob): Picture => (isSafeImage(blob.type) ? { url: URL.createObjectURL(blob) } : { error: "This file cannot be shown here. Download it instead." }),
    (error: unknown): Picture => {
      pictures.delete(id);
      return { error: error instanceof Error ? error.message : "The picture could not be read." };
    },
  );
  pictures.set(id, made);
  if (pictures.size > KEEP) {
    const oldest = pictures.keys().next().value as string;
    const old = pictures.get(oldest);
    pictures.delete(oldest);
    void old?.then((row) => ("url" in row ? URL.revokeObjectURL(row.url) : undefined));
  }
  return made;
}

/** True once the element has come near the screen; it stays true. */
function useNear(ref: RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near) return;
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setNear(true);
        observer.disconnect();
      }
    }, { rootMargin: "300px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [near, ref]);
  return near;
}

export function usePicture(id: string, enabled: boolean, via: string | null): Picture | null {
  const [shown, setShown] = useState<Picture | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setShown(null);
    void picture(id, via).then((row) => {
      if (live) setShown(row);
    });
    return () => {
      live = false;
    };
  }, [id, enabled, via]);
  return shown;
}

async function save(item: EvidenceItem, via: string | null) {
  try {
    await download(evidencePath(item.id, via), item.name);
  } catch (error) {
    toastError(error);
  }
}

const describe = (item: EvidenceItem) => `${evidenceKind(item.kind)} “${item.name}”${item.caption ? `: ${item.caption}` : ""}`;

/** A video's poster image (read like any picture), else its first frame where a browser would show black (iOS Safari). */
function usePoster(item: EvidenceItem, enabled: boolean, via: string | null): { poster?: string; src: string } {
  const shown = usePicture(item.poster ?? "", enabled && Boolean(item.poster), via);
  const url = evidenceUrl(item.id, via);
  if (shown && "url" in shown) return { poster: shown.url, src: url };
  return { src: item.poster && !(shown && "error" in shown) ? url : `${url}#t=0.1` };
}

/** Its measured shape, as a style: the space stays the same while it loads. */
const frameStyle = (item: EvidenceItem, maxWidth: number, maxHeight: number): CSSProperties | undefined => {
  const frame = mediaFrame(item, { maxWidth, maxHeight });
  return frame ? { aspectRatio: frame.aspectRatio, maxWidth: frame.maxWidth } : undefined;
};

function Caption({ item, requirement }: { item: EvidenceItem; requirement: RequirementLink | null }) {
  if (!item.caption && !requirement) return null;
  return (
    <figcaption className="mt-1 space-y-0.5 text-[11px] leading-snug text-muted">
      {item.caption ? <span className="line-clamp-2 block break-words">{item.caption}</span> : null}
      {requirement ? (
        requirement.href ? (
          <a href={requirement.href} className="line-clamp-1 block text-accent hover:underline">
            For: {requirement.text}
          </a>
        ) : (
          <span className="line-clamp-1 block">For: {requirement.text}</span>
        )
      ) : null}
    </figcaption>
  );
}

type Tile = { item: EvidenceItem; via: string | null; requirement: RequirementLink | null };

function PictureTile({ item, via, onOpen, requirement, alone }: Tile & { onOpen: () => void; alone: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const near = useNear(ref);
  const shown = usePicture(item.id, near, via);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  // A full-page capture shows from its top, cropped, and says it scrolls when opened.
  const tall = isTall(item) || (natural ? isTall(natural) : false);
  // One picture keeps its own shape; several share one so the grid stays even.
  const style = alone ? (tall ? { maxWidth: 384 } : frameStyle(item, 384, 420)) : undefined;
  return (
    <figure className="min-w-0">
      <button
        ref={ref}
        type="button"
        onClick={onOpen}
        aria-label={`Open ${describe(item)}${tall ? ", a tall picture you can scroll" : ""}`}
        title={item.name}
        style={style}
        data-tall={tall || undefined}
        className={`group relative block w-full overflow-hidden rounded-lg border border-line bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 ${tall && alone ? "h-[min(360px,60vh)]" : style && !tall ? "" : "aspect-[16/10]"}`}
      >
        {shown && "url" in shown ? (
          <img
            src={shown.url}
            alt=""
            onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            className={`h-full w-full object-cover transition group-hover:scale-[1.02] motion-reduce:transition-none ${tall ? "object-top" : ""}`}
          />
        ) : shown ? (
          <span className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center text-[11px] text-muted">
            <ImageOff size={18} aria-hidden />
            <span className="line-clamp-2">{item.name}</span>
          </span>
        ) : (
          <span className="flex h-full items-center justify-center text-muted">
            <Spinner className="h-3.5 w-3.5" />
          </span>
        )}
        {tall && shown && "url" in shown ? (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center gap-1 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 pb-1.5 pt-8 text-[11px] font-medium text-white" aria-hidden>
            <ScrollText size={12} /> {alone ? "Tall image · open to scroll" : "Tall · open to scroll"}
          </span>
        ) : null}
      </button>
      <Caption item={item} requirement={requirement} />
    </figure>
  );
}

function VideoTile({ item, via, onOpen, requirement, alone }: Tile & { onOpen: () => void; alone: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const near = useNear(ref);
  const [failed, setFailed] = useState(false);
  const [played, setPlayed] = useState(false);
  const { poster, src } = usePoster(item, near, via);
  const style = frameStyle(item, alone ? 384 : 640, alone ? 420 : 360);
  const length = durationLabel(item.durationMs);
  return (
    <figure className="min-w-0">
      <div ref={ref} style={style} className={`relative w-full overflow-hidden rounded-lg border border-line bg-black ${style ? "" : "aspect-video"}`}>
        {failed ? (
          <button type="button" onClick={() => void save(item, via)} className="flex h-full min-h-28 w-full flex-col items-center justify-center gap-1 px-2 text-center text-xs text-white/80 hover:text-white">
            <Download size={18} aria-hidden /> This video does not play here. Download it.
          </button>
        ) : near ? (
          <video src={src} poster={poster} controls preload="metadata" playsInline onPlay={() => setPlayed(true)} onError={() => setFailed(true)} aria-label={describe(item)} className="h-full w-full bg-black object-contain" />
        ) : null}
        {length && !played && !failed ? (
          <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white/90" aria-label={`${length} long`}>
            {length}
          </span>
        ) : null}
        {failed ? null : (
          <button type="button" onClick={onOpen} aria-label={`Open ${describe(item)} larger`} title="Open larger" className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white/90 hover:bg-black/80">
            <Maximize2 size={13} aria-hidden />
          </button>
        )}
      </div>
      <Caption item={item} requirement={requirement} />
    </figure>
  );
}

/** A file held for its owner's preview, or kept on the computer: named, never read from here. */
function KeptRow({ item }: { item: EvidenceItem }) {
  const held = keptAs(item) === "held";
  const why = held ? "Held for you to check first" : "On the computer, not uploaded";
  return (
    <li className="flex max-w-full" data-kept={held ? "held" : "local"}>
      <span title={`${evidenceKind(item.kind)}: ${held ? (item.holdReason ? heldReasonWords(item.holdReason) : why) : "evidence upload is off on that computer."}`} className="flex w-64 max-w-full items-center gap-2.5 rounded-xl border border-dashed border-line bg-bg/40 p-1.5 pr-2.5 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-raised text-muted">{held ? <EyeOff size={16} aria-hidden /> : <HardDrive size={16} aria-hidden />}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{item.name}</span>
          <span className="block truncate text-[11px] text-muted">{why}</span>
        </span>
      </span>
    </li>
  );
}

/** A video in the lightbox, with its poster. */
function LargeVideo({ item, via }: { item: EvidenceItem; via: string | null }) {
  const { poster, src } = usePoster(item, true, via);
  return <video src={src} poster={poster} controls playsInline preload="metadata" aria-label={describe(item)} className="max-h-full max-w-full rounded-md bg-black" />;
}

function FileRow({ item, via, requirement }: Tile) {
  const [busy, setBusy] = useState(false);
  const size = typeof item.size === "number" ? sizeLabel(item.size) : "";
  return (
    <li className="flex max-w-full">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void save(item, via).finally(() => setBusy(false));
        }}
        aria-label={`Download ${describe(item)}`}
        className="flex w-64 max-w-full items-center gap-2.5 rounded-xl border border-line bg-bg/70 p-1.5 pr-2.5 text-left transition hover:border-accent disabled:opacity-70"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-raised text-muted">{busy ? <Spinner className="h-3.5 w-3.5" /> : <FileText size={17} aria-hidden />}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{item.name}</span>
          <span className="block truncate text-[11px] text-muted">
            {[evidenceKind(item.kind), size, item.caption, requirement ? `for ${requirement.text}` : null].filter(Boolean).join(" · ")}
          </span>
        </span>
        <Download size={13} className="shrink-0 text-muted" aria-hidden />
      </button>
    </li>
  );
}

function LargePicture({ item, via }: { item: EvidenceItem; via: string | null }) {
  const shown = usePicture(item.id, true, via);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  if (!shown) return <Spinner className="h-5 w-5 text-white/80" />;
  if ("error" in shown) {
    return (
      <div className="max-w-sm space-y-3 text-center text-sm text-white/85">
        <ImageOff size={28} className="mx-auto" aria-hidden />
        <p>{shown.error}</p>
        <button type="button" onClick={() => void save(item, via)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 px-3 py-1.5 text-xs hover:bg-white/10">
          <Download size={13} aria-hidden /> Download
        </button>
      </div>
    );
  }
  const onLoad = (event: SyntheticEvent<HTMLImageElement>) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight });
  // A tall picture (a full page) fills the width, never larger than it is, and scrolls from its top.
  if (isTall(item) || (natural && isTall(natural))) {
    return (
      <div className="scroll-thin h-full w-full overflow-auto overscroll-contain rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70" tabIndex={0} role="region" aria-label={`${item.name}: scroll to see all of it`} data-tall-view>
        <img src={shown.url} alt={item.caption || item.name} onLoad={onLoad} style={{ maxWidth: natural?.width ?? item.width ?? undefined }} className="mx-auto block h-auto w-full" />
      </div>
    );
  }
  return <img src={shown.url} alt={item.caption || item.name} onLoad={onLoad} className="max-h-full max-w-full rounded-md object-contain" />;
}

/** One piece of evidence at a time, over the page: arrows, Home and End move, Escape closes, swipes on a phone. */
function Lightbox({ items, via, start, onClose, requirementOf }: { items: EvidenceItem[]; via: string | null; start: number; onClose: () => void; requirementOf?: (id: string) => RequirementLink | null }) {
  const [chosen, setIndex] = useState(Math.min(start, items.length - 1));
  const box = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const count = items.length;
  const counted = useRef(count);
  counted.current = count;
  // Evidence can arrive or go while it is open.
  const index = Math.max(0, Math.min(chosen, count - 1));
  const item = items[index]!;
  const requirement = item.requirementId && requirementOf ? requirementOf(item.requirementId) : null;
  const go = (step: number) => setIndex((current) => (Math.min(current, count - 1) + step + count) % count);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inPlayer = target?.tagName === "VIDEO";
      const total = counted.current;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      } else if ((event.key === "ArrowRight" || event.key === "ArrowLeft") && !inPlayer && total > 1) {
        event.preventDefault();
        setIndex((current) => (Math.min(current, total - 1) + (event.key === "ArrowRight" ? 1 : -1) + total) % total);
      } else if ((event.key === "Home" || event.key === "End") && !inPlayer) {
        event.preventDefault();
        setIndex(event.key === "Home" ? 0 : total - 1);
      } else if (event.key === "Tab" && box.current) {
        const controls = [...box.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], video[controls]")];
        const first = controls[0];
        const last = controls.at(-1);
        // Focus can fall out with a control that went (a caption's link, a failed picture's Download).
        if (!box.current.contains(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      opener?.focus({ preventScroll: true });
    };
  }, []);

  // Moving to another piece can take away the control that had focus: focus goes to Close.
  useEffect(() => {
    if (box.current && !box.current.contains(document.activeElement)) closeButton.current?.focus({ preventScroll: true });
  }, [item.id]);

  const nav = "absolute top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";
  return createPortal(
    <div
      ref={box}
      role="dialog"
      aria-modal="true"
      aria-label={`${evidenceKind(item.kind)}${count > 1 ? ` ${index + 1} of ${count}` : ""}: ${item.name}`}
      className="fixed inset-0 z-[70] flex flex-col bg-black/90 text-white"
      onTouchStart={(event) => {
        const point = event.touches[0];
        touch.current = point ? { x: point.clientX, y: point.clientY } : null;
      }}
      onTouchEnd={(event) => {
        const from = touch.current;
        const point = event.changedTouches[0];
        touch.current = null;
        if (!from || !point || count < 2) return;
        const dx = point.clientX - from.x;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(point.clientY - from.y) * 1.5) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span>
        {count > 1 ? (
          <span className="shrink-0 text-xs tabular-nums text-white/70" aria-live="polite">
            {index + 1} of {count}
          </span>
        ) : null}
        <button type="button" onClick={() => void save(item, via)} aria-label={`Download ${item.name}`} title="Download" className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-white/85 hover:bg-white/10">
          <Download size={17} aria-hidden />
        </button>
        <button ref={closeButton} type="button" onClick={() => close.current()} aria-label="Close" title="Close" className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-white/85 hover:bg-white/10">
          <X size={18} aria-hidden />
        </button>
      </div>
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16"
        onClick={(event) => {
          if (event.target === event.currentTarget) close.current();
        }}
      >
        {count > 1 ? (
          <button type="button" onClick={() => go(-1)} aria-label="Previous" title="Previous" className={`${nav} left-2`}>
            <ChevronLeft size={22} aria-hidden />
          </button>
        ) : null}
        {evidenceShow(item) === "video" ? (
          <LargeVideo key={item.id} item={item} via={via} />
        ) : (
          <LargePicture key={item.id} item={item} via={via} />
        )}
        {count > 1 ? (
          <button type="button" onClick={() => go(1)} aria-label="Next" title="Next" className={`${nav} right-2`}>
            <ChevronRight size={22} aria-hidden />
          </button>
        ) : null}
      </div>
      {item.caption || requirement ? (
        <div className="shrink-0 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 text-center text-sm text-white/85">
          {item.caption ? <p className="mx-auto max-w-2xl break-words">{item.caption}</p> : null}
          {requirement ? (
            requirement.href ? (
              <a href={requirement.href} onClick={() => close.current()} className="mt-1 inline-block text-xs text-white/70 underline underline-offset-2 hover:text-white">
                For: {requirement.text}
              </a>
            ) : (
              <p className="mt-1 text-xs text-white/70">For: {requirement.text}</p>
            )
          ) : null}
        </div>
      ) : (
        <div className="h-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0" />
      )}
    </div>,
    document.body,
  );
}

/** A text file's preview as read for the page: its first 200 KB, why it could not be read, or that it is not text after all. */
type TextRead = { text: string; truncated: boolean } | { error: string } | { binary: true };
const texts = new Map<string, Promise<TextRead>>();

/** A text file's first 200 KB, read once for the page (through the message that shows it, when there is one); the rest is never downloaded. */
function textOf(id: string, via: string | null): Promise<TextRead> {
  const key = `${via ?? ""}:${id}`;
  const cached = texts.get(key);
  if (cached) return cached;
  const made = evidenceHead(id, PREVIEW_MAX_BYTES, via).then(
    ({ bytes, truncated }): TextRead => {
      const text = decodePreview(bytes);
      return looksBinary(text) ? { binary: true } : { text, truncated };
    },
    (error: unknown): TextRead => {
      texts.delete(key);
      return { error: error instanceof Error ? error.message : "The file could not be read." };
    },
  );
  texts.set(key, made);
  if (texts.size > 40) texts.delete(texts.keys().next().value as string);
  return made;
}

const NO_HANDLES: ReadonlySet<string> = new Set();

/**
 * A text file in the chat: its name, its first lines (Markdown rendered as in a message, other text as
 * it is, in monospace), Show all or Collapse, and Download. Read when it comes near the screen.
 */
function TextPreview({ item, via, kind, requirement }: Tile & { kind: TextPreviewKind }) {
  const ref = useRef<HTMLElement>(null);
  const near = useNear(ref);
  const [read, setRead] = useState<TextRead | null>(null);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const id = useId();
  useEffect(() => {
    if (!near) return;
    let live = true;
    void textOf(item.id, via).then((row) => {
      if (live) setRead(row);
    });
    return () => {
      live = false;
    };
  }, [near, item.id, via]);
  const body = read && "text" in read ? previewContent(kind, read.text, read.truncated) : "";
  const lines = previewLines(body);
  const shown = all ? body : lines.shown;
  const truncated = Boolean(read && "text" in read && read.truncated);
  const size = typeof item.size === "number" ? sizeLabel(item.size) : null;
  // Folded, the preview is also kept short on screen: what does not fit fades out, and Show all opens it.
  const box = useRef<HTMLDivElement>(null);
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    const element = box.current;
    setClipped(Boolean(element && !all && element.scrollHeight > element.clientHeight + 1));
  }, [shown, all, read]);
  const more = lines.more || clipped;
  return (
    <figure ref={ref} className="min-w-0 overflow-hidden rounded-xl border border-line bg-bg/70" data-text-preview={kind}>
      <figcaption className="flex items-center gap-2 border-b border-line/70 py-1 pl-2.5 pr-1">
        <FileText size={15} className="shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium" title={item.name}>
            {item.name}
          </span>
          <span className="block truncate text-[11px] text-muted">{[kind === "markdown" ? "Markdown" : kind === "json" ? "JSON" : evidenceKind(item.kind), size, read && "text" in read ? `${lines.total} ${lines.total === 1 ? "line" : "lines"}` : null].filter(Boolean).join(" · ")}</span>
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void save(item, via).finally(() => setBusy(false));
          }}
          aria-label={`Download ${item.name}`}
          title="Download"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-ink disabled:opacity-60"
        >
          {busy ? <Spinner className="h-3.5 w-3.5" /> : <Download size={15} aria-hidden />}
        </button>
      </figcaption>
      <div
        id={id}
        ref={box}
        {...(all ? { role: "region", tabIndex: 0, "aria-label": `${item.name}, all of it` } : {})}
        className={all ? "scroll-thin max-h-[70vh] overflow-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60" : `relative max-h-[min(22rem,55vh)] overflow-hidden ${more ? "[mask-image:linear-gradient(to_bottom,black_75%,transparent)]" : ""}`}
      >
        {!read ? (
          <p className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted" role="status">
            <Spinner className="h-3 w-3" /> Reading {item.name}…
          </p>
        ) : "error" in read ? (
          <p className="px-3 py-2.5 text-xs text-danger">{read.error}</p>
        ) : "binary" in read ? (
          <p className="px-3 py-2.5 text-xs text-muted">This file is not text. Download it to open it.</p>
        ) : kind === "markdown" ? (
          <div className="px-3 py-2.5">
            <RichText text={shown} handles={NO_HANDLES} small />
          </div>
        ) : (
          <pre className="scroll-thin overflow-x-auto px-3 py-2.5 font-mono text-xs leading-relaxed">{shown}</pre>
        )}
      </div>
      {read && "text" in read && (more || all || truncated) ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line/70 px-3 py-1.5 text-xs">
          {more || all ? (
            <button type="button" aria-expanded={all} aria-controls={id} onClick={() => setAll(!all)} className="font-medium text-accent hover:underline">
              {all ? "Collapse" : `Show all ${lines.total} ${lines.total === 1 ? "line" : "lines"}`}
            </button>
          ) : null}
          {truncated && (all || !more) ? <span className="text-muted">The first 200 KB. Download it for the rest.</span> : null}
        </div>
      ) : null}
      {item.caption || requirement ? (
        <div className="px-3 pb-2">
          <Caption item={item} requirement={requirement} />
        </div>
      ) : null}
    </figure>
  );
}

/**
 * Evidence as a gallery: pictures and videos in a grid that opens into the lightbox, text files as
 * previews, other files as downloads. `requirementOf` names the requirement a piece is for (a plan's
 * ledger); `messageId` is the message that shows these files, which is how anyone but their owner may
 * read them.
 */
export function EvidenceGallery({ items, requirementOf, messageId = null, label = "Evidence", className = "" }: { items: readonly EvidenceItem[]; requirementOf?: (id: string) => RequirementLink | null; messageId?: string | null; label?: string; className?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const via = messageId;
  if (!items.length) return null;
  const readable = items.filter((item) => !keptAs(item));
  const visual = readable.filter((item) => evidenceShow(item) !== "download");
  const previews = readable.flatMap((item) => {
    const kind = evidenceShow(item) === "download" ? textPreviewKind(item) : null;
    return kind ? [{ item, kind }] : [];
  });
  const files = items.filter((item) => keptAs(item) || (evidenceShow(item) === "download" && !textPreviewKind(item)));
  const requirement = (item: EvidenceItem) => (item.requirementId && requirementOf ? requirementOf(item.requirementId) : null);
  const alone = visual.length === 1;
  return (
    <section aria-label={label} className={className}>
      {visual.length ? (
        <ul className={`grid gap-1.5 ${alone ? "max-w-sm grid-cols-1" : visual.length === 2 || visual.length === 4 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
          {visual.map((item, at) => (
            <li key={item.id} className={evidenceShow(item) === "video" && !alone ? "col-span-2" : ""}>
              {evidenceShow(item) === "video" ? (
                <VideoTile item={item} via={via} onOpen={() => setOpen(at)} requirement={requirement(item)} alone={alone} />
              ) : (
                <PictureTile item={item} via={via} onOpen={() => setOpen(at)} requirement={requirement(item)} alone={alone} />
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {previews.length ? (
        <div className={`space-y-1.5 ${visual.length ? "mt-1.5" : ""}`}>
          {previews.map(({ item, kind }) => (
            <TextPreview key={item.id} item={item} via={via} kind={kind} requirement={requirement(item)} />
          ))}
        </div>
      ) : null}
      {files.length ? (
        <ul className={`flex flex-wrap gap-1.5 ${visual.length || previews.length ? "mt-1.5" : ""}`}>
          {files.map((item) => (keptAs(item) ? <KeptRow key={item.id} item={item} /> : <FileRow key={item.id} item={item} via={via} requirement={requirement(item)} />))}
        </ul>
      ) : null}
      {open !== null && visual.length ? <Lightbox items={visual} via={via} start={open} onClose={() => setOpen(null)} requirementOf={requirementOf} /> : null}
    </section>
  );
}
