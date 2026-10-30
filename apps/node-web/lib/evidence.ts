/**
 * Files a run attached as evidence (screenshots, videos, traces, reports, logs: `data.evidence` on a
 * run card) and media a node sends with a message (`data.media`), and how each shows. Only still
 * pictures in formats a browser cannot run show inline, and videos play in a player; everything
 * else, and every active format (HTML, SVG, XML, scripts, PDF), is a download, whatever its kind says.
 * A file kept on the computer (upload off there) or held for its owner's preview is listed, never
 * opened inline (Ensemble docs/35 §8.12, §8.16).
 */
import type { EvidenceItem, MediaItem, Message } from "./types";

export type EvidenceShow = "image" | "video" | "download";

/** Pictures shown in an <img>: none of them can run script. SVG is not among them. */
const IMAGES: ReadonlySet<string> = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/bmp"]);
const VIDEOS: ReadonlySet<string> = new Set(["video/mp4", "video/webm", "video/ogg", "video/quicktime"]);
const IMAGE_NAME = /\.(png|jpe?g|gif|webp|avif|bmp)$/i;
const VIDEO_NAME = /\.(mp4|webm|ogv|mov)$/i;

/** A MIME type without its parameters, lower case: "image/png; charset=x" → "image/png". */
export const mimeOf = (value: string | null | undefined): string => (value ?? "").split(";")[0]!.trim().toLowerCase().replace(/^image\/jpg$/, "image/jpeg");

/** Whether bytes of this type may be shown in an <img>: checked again on what the server sent. */
export const isSafeImage = (mime: string | null | undefined): boolean => IMAGES.has(mimeOf(mime));

/** How a piece of evidence shows. The MIME type decides; a name is read only when the type is missing. */
export function evidenceShow(item: Pick<EvidenceItem, "mime" | "name">): EvidenceShow {
  const mime = mimeOf(item.mime);
  if (IMAGES.has(mime)) return "image";
  if (VIDEOS.has(mime)) return "video";
  if (mime) return "download";
  if (IMAGE_NAME.test(item.name ?? "")) return "image";
  if (VIDEO_NAME.test(item.name ?? "")) return "video";
  return "download";
}

const KIND_LABEL: Record<string, string> = { screenshot: "Screenshot", image: "Image", video: "Video", trace: "Trace", report: "Report", log: "Log", file: "File" };

/** "Screenshot", "Video", "Report"…: the kind the run gave it. */
export const evidenceKind = (kind: string | null | undefined): string => KIND_LABEL[kind ?? ""] ?? "File";

/** Where Ensemble serves a piece of evidence: for its owner, or through the message that shows it (`?message=`). */
export const evidencePath = (id: string, messageId?: string | null): string => `/api/node/evidence/${encodeURIComponent(id)}${messageId ? `?message=${encodeURIComponent(messageId)}` : ""}`;

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
const positive = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null);

/** What capture measured, and a video's poster (its own evidence id), when they are there. */
function measured(poster: unknown, row: { width?: unknown; height?: unknown; durationMs?: unknown }): Partial<EvidenceItem> {
  const out: Partial<EvidenceItem> = {};
  const id = text(poster);
  if (id) out.poster = id;
  for (const key of ["width", "height", "durationMs"] as const) {
    const value = positive(row[key]);
    if (value) out[key] = value;
  }
  return out;
}

/** A run card's evidence (`data.evidence`), well-formed rows only. */
export function evidenceItems(value: unknown): EvidenceItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row): EvidenceItem[] => {
    const id = text(row?.id);
    if (!id) return [];
    return [
      {
        id,
        kind: text(row.kind) ?? "file",
        name: text(row.name) ?? "Evidence",
        mime: text(row.mime) ?? "",
        size: typeof row.size === "number" ? row.size : null,
        caption: text(row.caption),
        requirementId: text(row.requirementId),
        createdAt: text(row.createdAt),
        ...(row.held === true ? { held: true, holdReason: text(row.holdReason) } : row.local === true ? { local: true } : {}),
        ...measured(row.poster, row),
      },
    ];
  });
}

/** A node message's media (`data.media`), as the same gallery's items. */
export function mediaItems(value: unknown): EvidenceItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row: Partial<MediaItem> | null): EvidenceItem[] => {
    const id = text(row?.evidenceId);
    return id ? [{ id, kind: text(row!.kind) ?? "file", name: text(row!.name) ?? "Media", mime: text(row!.mime) ?? "", caption: text(row!.caption), size: typeof row!.size === "number" ? row!.size : null, ...measured(row!.posterId, row!) }] : [];
  });
}

/** Why a file cannot be opened here: held for its owner's preview, or kept on the computer (upload off there). */
export const keptAs = (item: Pick<EvidenceItem, "held" | "local">): "held" | "local" | null => (item.held ? "held" : item.local ? "local" : null);

/** "0:07", "12:30", "1:02:03": a video's length. */
export function durationLabel(ms: number | null | undefined): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return null;
  const total = Math.max(1, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

/**
 * The space a picture or video takes before it loads, from the size capture measured: its own shape,
 * no wider than `maxWidth`, no taller than `maxHeight`, never larger than it is. Null when not measured.
 */
export function mediaFrame(item: Pick<EvidenceItem, "width" | "height">, box: { maxWidth: number; maxHeight: number }): { aspectRatio: string; maxWidth: number } | null {
  const width = positive(item.width);
  const height = positive(item.height);
  if (!width || !height) return null;
  return { aspectRatio: `${width} / ${height}`, maxWidth: Math.round(Math.min(box.maxWidth, (box.maxHeight * width) / height, width)) };
}

/**
 * Why a file could not be read, in plain words: the server's own when it sent them, else by status.
 * A held file comes from the owner's computer, which may be offline (504) or find it too large (413).
 */
export function evidenceErrorWords(status: number, said?: string | null): string {
  const server = said?.trim() || null;
  if (status === 0) return "Ensemble cannot be reached. Check your connection and try again.";
  if (status === 504) return "Your computer did not answer in time: it may be offline or asleep. Try again when Ensemble runs there.";
  if (status === 404) return server ?? "This file is not available any more.";
  if (status === 409) return server ?? "This file is kept on the computer that made it, not uploaded.";
  if (status === 413) return server ?? "Too large to preview from the computer. Send it to see it here.";
  if (status === 502) return server ?? "Your computer did not send it. Try again.";
  return server ?? `The file could not be read (${status}).`;
}

/** The evidence of several run cards (a plan step's runs), each file once, oldest run first. */
export function evidenceOfCards(cards: readonly Pick<Message, "seq" | "data">[]): EvidenceItem[] {
  const seen = new Set<string>();
  return [...cards]
    .sort((a, b) => a.seq - b.seq)
    .flatMap((card) => evidenceItems(card.data?.evidence))
    .filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
}

/** "3 pictures", "1 video, 2 files", "1 picture, 1 held": what a folded step or card holds. */
export function evidenceCount(items: readonly Pick<EvidenceItem, "kind" | "mime" | "name" | "held" | "local">[]): string | null {
  if (!items.length) return null;
  const open = items.filter((item) => !keptAs(item));
  const pictures = open.filter((item) => evidenceShow(item) === "image").length;
  const videos = open.filter((item) => evidenceShow(item) === "video").length;
  const files = open.length - pictures - videos;
  const held = items.filter((item) => keptAs(item) === "held").length;
  const local = items.length - open.length - held;
  const part = (count: number, one: string, many: string) => (count ? `${count} ${count === 1 ? one : many}` : null);
  return [part(pictures, "picture", "pictures"), part(videos, "video", "videos"), part(files, "file", "files"), part(held, "held", "held"), part(local, "not uploaded", "not uploaded")].filter(Boolean).join(", ");
}
