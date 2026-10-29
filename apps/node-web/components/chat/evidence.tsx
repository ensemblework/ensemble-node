"use client";

/**
 * Evidence a run attached (screenshots, videos, traces, reports, logs) and media a node sends with a
 * message: thumbnails, a lightbox with keyboard and swipe navigation, a player for videos and a
 * download for everything else. Pictures are read with the session cookie and shown only when the
 * bytes that came back are a safe picture type (lib/evidence.ts); HTML, SVG, scripts and other active
 * formats are only ever downloaded, never shown in the page. Media in a message is read through that
 * message (`via`), so people in a room who do not own the file can open it too.
 */
import { ChevronLeft, ChevronRight, Download, FileText, ImageOff, Maximize2, X } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { download, evidenceBlob, evidenceUrl } from "@/lib/api";
import { sizeLabel } from "@/lib/attachments";
import { evidenceKind, evidencePath, evidenceShow, isSafeImage } from "@/lib/evidence";
import { toastError } from "@/lib/toast";
import type { EvidenceItem } from "@/lib/types";
import { Spinner } from "../ui";

/** The requirement a piece of evidence is for, with where it is listed when that is on the page. */
export type RequirementLink = { text: string; href?: string };

type Picture = { url: string } | { error: string };
const pictures = new Map<string, Promise<Picture>>();
/** Pictures kept for this page; past this the oldest object URLs are released. */
const KEEP = 120;

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

function usePicture(id: string, enabled: boolean, via: string | null): Picture | null {
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

function PictureTile({ item, via, onOpen, requirement }: Tile & { onOpen: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const near = useNear(ref);
  const shown = usePicture(item.id, near, via);
  return (
    <figure className="min-w-0">
      <button
        ref={ref}
        type="button"
        onClick={onOpen}
        aria-label={`Open ${describe(item)}`}
        title={item.name}
        className="group relative block aspect-[16/10] w-full overflow-hidden rounded-lg border border-line bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
      >
        {shown && "url" in shown ? (
          <img src={shown.url} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.02] motion-reduce:transition-none" />
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
      </button>
      <Caption item={item} requirement={requirement} />
    </figure>
  );
}

function VideoTile({ item, via, onOpen, requirement }: Tile & { onOpen: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const near = useNear(ref);
  const [failed, setFailed] = useState(false);
  return (
    <figure className="min-w-0">
      <div ref={ref} className="relative overflow-hidden rounded-lg border border-line bg-black">
        {failed ? (
          <button type="button" onClick={() => void save(item, via)} className="flex aspect-video w-full flex-col items-center justify-center gap-1 text-xs text-white/80 hover:text-white">
            <Download size={18} aria-hidden /> This video does not play here. Download it.
          </button>
        ) : near ? (
          // `#t=0.1` shows a first frame as the poster where a browser would otherwise show black (iOS Safari).
          <video src={`${evidenceUrl(item.id, via)}#t=0.1`} controls preload="metadata" playsInline onError={() => setFailed(true)} aria-label={describe(item)} className="aspect-video w-full bg-black" />
        ) : (
          <span className="block aspect-video w-full" />
        )}
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
  return <img src={shown.url} alt={item.caption || item.name} className="max-h-full max-w-full rounded-md object-contain" />;
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
          <video key={item.id} src={evidenceUrl(item.id, via)} controls playsInline preload="metadata" aria-label={describe(item)} className="max-h-full max-w-full rounded-md bg-black" />
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

/**
 * Evidence as a gallery: pictures and videos in a grid that opens into the lightbox, other files as
 * downloads. `requirementOf` names the requirement a piece is for (a plan's ledger); `messageId` is the
 * message that shows these files, which is how anyone but their owner may read them.
 */
export function EvidenceGallery({ items, requirementOf, messageId = null, label = "Evidence", className = "" }: { items: readonly EvidenceItem[]; requirementOf?: (id: string) => RequirementLink | null; messageId?: string | null; label?: string; className?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const via = messageId;
  if (!items.length) return null;
  const visual = items.filter((item) => evidenceShow(item) !== "download");
  const files = items.filter((item) => evidenceShow(item) === "download");
  const requirement = (item: EvidenceItem) => (item.requirementId && requirementOf ? requirementOf(item.requirementId) : null);
  return (
    <section aria-label={label} className={className}>
      {visual.length ? (
        <ul className={`grid gap-1.5 ${visual.length === 1 ? "max-w-sm grid-cols-1" : "grid-cols-2 sm:grid-cols-3"}`}>
          {visual.map((item, at) => (
            <li key={item.id} className={evidenceShow(item) === "video" && visual.length > 1 ? "col-span-2" : ""}>
              {evidenceShow(item) === "video" ? (
                <VideoTile item={item} via={via} onOpen={() => setOpen(at)} requirement={requirement(item)} />
              ) : (
                <PictureTile item={item} via={via} onOpen={() => setOpen(at)} requirement={requirement(item)} />
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {files.length ? (
        <ul className={`flex flex-wrap gap-1.5 ${visual.length ? "mt-1.5" : ""}`}>
          {files.map((item) => (
            <FileRow key={item.id} item={item} via={via} requirement={requirement(item)} />
          ))}
        </ul>
      ) : null}
      {open !== null && visual.length ? <Lightbox items={visual} via={via} start={open} onClose={() => setOpen(null)} requirementOf={requirementOf} /> : null}
    </section>
  );
}
