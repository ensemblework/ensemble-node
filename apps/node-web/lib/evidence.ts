/**
 * Files a run attached as evidence (screenshots, videos, traces, reports, logs: `data.evidence` on a
 * run card) and media a node sends with a message (`data.media`), and how each shows. Only still
 * pictures in formats a browser cannot run show inline, and videos play in a player; everything
 * else, and every active format (HTML, SVG, XML, scripts, PDF), is a download, whatever its kind says.
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
      },
    ];
  });
}

/** A node message's media (`data.media`), as the same gallery's items. */
export function mediaItems(value: unknown): EvidenceItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row: Partial<MediaItem> | null): EvidenceItem[] => {
    const id = text(row?.evidenceId);
    return id ? [{ id, kind: text(row!.kind) ?? "file", name: text(row!.name) ?? "Media", mime: text(row!.mime) ?? "", caption: text(row!.caption), size: typeof row!.size === "number" ? row!.size : null }] : [];
  });
}

/** The evidence of several run cards (a plan step's runs), each file once, oldest run first. */
export function evidenceOfCards(cards: readonly Pick<Message, "seq" | "data">[]): EvidenceItem[] {
  const seen = new Set<string>();
  return [...cards]
    .sort((a, b) => a.seq - b.seq)
    .flatMap((card) => evidenceItems(card.data?.evidence))
    .filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
}

/** "3 screenshots", "1 video, 2 files": what a folded step or card holds. */
export function evidenceCount(items: readonly Pick<EvidenceItem, "kind" | "mime" | "name">[]): string | null {
  if (!items.length) return null;
  const pictures = items.filter((item) => evidenceShow(item) === "image").length;
  const videos = items.filter((item) => evidenceShow(item) === "video").length;
  const files = items.length - pictures - videos;
  const part = (count: number, one: string, many: string) => (count ? `${count} ${count === 1 ? one : many}` : null);
  return [part(pictures, "picture", "pictures"), part(videos, "video", "videos"), part(files, "file", "files")].filter(Boolean).join(", ");
}
