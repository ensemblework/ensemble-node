/**
 * Files on messages: the composer's attachment shelf, what a paste brings, labels, and who may open a
 * file on a message. A file rides on a message by reference to the sender's Ensemble Files.
 */
import { ENSEMBLE_LINKS } from "./config";
import type { FileRecord, Message, MessageFile } from "./types";

/** The most files one message carries (the server's limit too). */
export const MAX_ATTACHMENTS = 8;

export type AttachmentStatus = "uploading" | "ready" | "failed";

/** One chip on the composer's shelf. */
export type Attachment = {
  key: string;
  name: string;
  size: number;
  kind: string;
  status: AttachmentStatus;
  /** 0–100 while uploading. */
  progress: number;
  /** The Document in the person's Files, once uploaded or when chosen from Files. */
  fileId: string | null;
  error: string | null;
  /** A local object URL for a picture's thumbnail; revoked when the chip goes. */
  preview: string | null;
  /** Two attachments with the same signature are the same file. */
  signature: string;
  /** A file from this computer, which can be uploaded again after a failure. */
  local: boolean;
};

type LocalFile = { name: string; size: number; type: string; lastModified: number };

export function localAttachment(key: string, file: LocalFile): Attachment {
  return {
    key,
    name: file.name,
    size: file.size,
    kind: kindOf(file.name, file.type),
    status: "uploading",
    progress: 0,
    fileId: null,
    error: null,
    preview: null,
    signature: `local:${file.name}:${file.size}:${file.lastModified}`,
    local: true,
  };
}

/** A file already in Files: nothing to upload. */
export function fileAttachment(key: string, file: MessageFile): Attachment {
  return { key, name: file.name, size: file.size, kind: file.kind, status: "ready", progress: 100, fileId: file.id, error: null, preview: null, signature: `file:${file.id}`, local: false };
}

export const recordFile = (record: Pick<FileRecord, "id" | "filename" | "kind" | "byteSize">): MessageFile => ({ id: record.id, name: record.filename, kind: record.kind, size: record.byteSize });

const identities = (row: Pick<Attachment, "signature" | "fileId">) => [row.signature, ...(row.fileId ? [`file:${row.fileId}`] : [])];

/** Adds files to the shelf, leaving out ones already on it and any past the limit. */
export function addAttachments(current: readonly Attachment[], incoming: readonly Attachment[]): { items: Attachment[]; added: Attachment[]; duplicates: number; overLimit: number } {
  const seen = new Set(current.flatMap(identities));
  const added: Attachment[] = [];
  let duplicates = 0;
  let overLimit = 0;
  for (const row of incoming) {
    const ids = identities(row);
    if (ids.some((id) => seen.has(id))) duplicates += 1;
    else if (current.length + added.length >= MAX_ATTACHMENTS) overLimit += 1;
    else {
      ids.forEach((id) => seen.add(id));
      added.push(row);
    }
  }
  return { items: [...current, ...added], added, duplicates, overLimit };
}

/** What to tell the person about files that were not added, or null. */
export function attachNotice(result: { duplicates: number; overLimit: number }): string | null {
  if (result.overLimit) return `A message holds up to ${MAX_ATTACHMENTS} files; ${result.overLimit === 1 ? "1 was" : `${result.overLimit} were`} left out.`;
  if (result.duplicates) return result.duplicates === 1 ? "That file is already attached." : "Those files are already attached.";
  return null;
}

/** Changes one chip; the same list comes back when there is nothing to change, so nothing re-renders. */
function change(current: Attachment[], key: string, apply: (row: Attachment) => Attachment): Attachment[] {
  const row = current.find((item) => item.key === key);
  if (!row) return current;
  const next = apply(row);
  return next === row ? current : current.map((item) => (item.key === key ? next : item));
}

export const setProgress = (current: Attachment[], key: string, progress: number): Attachment[] =>
  change(current, key, (row) => (row.status !== "uploading" || row.progress === progress ? row : { ...row, progress }));

export function finishUpload(current: Attachment[], key: string, file: MessageFile): Attachment[] {
  if (!current.some((row) => row.key === key)) return current;
  // Another chip already holds that very file.
  if (current.some((row) => row.key !== key && row.fileId === file.id)) return removeAttachment(current, key);
  return change(current, key, (row) => ({ ...row, status: "ready", progress: 100, fileId: file.id, name: file.name, kind: file.kind || row.kind, size: file.size, error: null }));
}

/** A failed upload; `again: false` when uploading it again cannot help (a program, an empty file, too large). */
export const failUpload = (current: Attachment[], key: string, error: string, again = true): Attachment[] => change(current, key, (row) => ({ ...row, status: "failed", error, local: row.local && again }));

/** Programs and raw binary data, which Ensemble's Files never keeps (Ensemble's shared-types `fileTypeProblem`, the same list). */
const REFUSED_EXTENSIONS: ReadonlySet<string> = new Set([
  "exe", "msi", "msix", "msp", "scr", "pif", "cpl", "dll", "sys", "drv", "ocx", "bat", "cmd", "vbs", "vbe", "wsf", "wsh", "hta", "lnk", "reg",
  "bin", "so", "dylib", "elf", "run", "appimage", "dmg", "pkg", "mpkg", "deb", "rpm", "apk", "aab", "ipa", "xapk", "jar", "iso",
]);

/**
 * Why Ensemble would refuse a file before it is uploaded, in its own words, or null: an empty file, a
 * program, or one larger than `limit` (the server's `maxFileBytes`). Any other type is taken: text,
 * code, pictures, PDFs, office files, archives, sound and video.
 */
export function attachProblem(file: { name: string; size: number }, limit?: number | null): string | null {
  if (file.size === 0) return "This file is empty, so there is nothing to keep.";
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? "";
  if (REFUSED_EXTENSIONS.has(ext)) return `.${ext} files are programs or raw binary data, which Files does not keep.`;
  if (limit && file.size > limit) return `Files can be up to ${sizeLabel(limit)} here. For a larger file on your computer, tell your node where it is.`;
  return null;
}

/** Uploads a failed file again under the same chip. */
export const retryUpload = (current: Attachment[], key: string): Attachment[] =>
  change(current, key, (row) => (row.status === "failed" && row.local ? { ...row, status: "uploading", progress: 0, error: null, fileId: null } : row));

/** Takes a chip off the shelf. The file stays in Files. */
export const removeAttachment = (current: Attachment[], key: string): Attachment[] => (current.some((row) => row.key === key) ? current.filter((row) => row.key !== key) : current);

/** The files a message would carry now, in shelf order. */
export function readyFiles(items: readonly Attachment[]): MessageFile[] {
  return items.flatMap((row) => (row.status === "ready" && row.fileId ? [{ id: row.fileId, name: row.name, kind: row.kind, size: row.size }] : []));
}

/** Why the message cannot be sent yet, or null. */
export function sendBlocker(items: readonly Attachment[]): string | null {
  const uploading = items.filter((row) => row.status === "uploading").length;
  if (uploading) return uploading === 1 ? "Sending waits until the file has uploaded." : `Sending waits until ${uploading} files have uploaded.`;
  const failed = items.filter((row) => row.status === "failed");
  // Only what can be uploaded again offers Retry.
  const retry = failed.some((row) => row.local);
  if (failed.length === 1) return `“${failed[0]!.name}” did not upload. ${retry ? "Retry or remove" : "Remove"} it to send.`;
  if (failed.length) return `${failed.length} files did not upload. ${retry ? "Retry or remove" : "Remove"} them to send.`;
  return null;
}

type Clipboard<T> = { files: ArrayLike<T>; types: ArrayLike<string>; getData: (type: string) => string };

const htmlText = (html: string) =>
  html
    .replace(/<(style|script|head)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;/g, " ")
    .trim();

/**
 * Files on the clipboard, unless they come with copied rich text: Word, Excel and browsers add a
 * picture of the selection to copied words, and that picture is not meant as an attachment.
 */
export function pastedFiles<T>(data: Clipboard<T> | null | undefined): T[] {
  const files = Array.from(data?.files ?? []);
  if (!data || !files.length) return [];
  const types = Array.from(data.types ?? []);
  if (types.includes("text/rtf")) return [];
  return types.includes("text/html") && htmlText(data.getData("text/html")) ? [] : files;
}

/** A pasted screenshot is called "image.png"; name it by the time so it can be told apart in Files. */
export function pastedName(name: string, type: string, now: Date): string {
  if (name && !/^image\.[a-z0-9]+$/i.test(name)) return name;
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1] ?? (type.split("/")[1] || "png");
  const two = (value: number) => String(value).padStart(2, "0");
  return `Pasted image ${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())} ${two(now.getHours())}.${two(now.getMinutes())}.${two(now.getSeconds())}.${ext}`;
}

const EXT_KIND: Record<string, string> = {
  pdf: "pdf",
  doc: "document", docx: "document", odt: "document", rtf: "document", pages: "document",
  ppt: "slides", pptx: "slides", odp: "slides", key: "slides",
  xls: "sheet", xlsx: "sheet", ods: "sheet", csv: "sheet", tsv: "sheet", numbers: "sheet",
  txt: "text", md: "text", markdown: "text", log: "text",
  js: "code", jsx: "code", ts: "code", tsx: "code", py: "code", go: "code", rs: "code", java: "code", rb: "code", c: "code", cpp: "code", h: "code", cs: "code",
  swift: "code", kt: "code", sh: "code", json: "code", yaml: "code", yml: "code", toml: "code", html: "code", css: "code", sql: "code", xml: "code",
};

/** The kind Files will give a file, guessed from its type and name while it uploads. */
export function kindOf(name: string, mediaType = ""): string {
  const family = mediaType.split("/")[0];
  if (family === "image" || family === "audio" || family === "video") return family;
  if (mediaType === "application/pdf") return "pdf";
  return EXT_KIND[/\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? ""] ?? "other";
}

export const KIND_LABEL: Readonly<Record<string, string>> = {
  pdf: "PDF",
  document: "Document",
  slides: "Slides",
  sheet: "Spreadsheet",
  image: "Image",
  text: "Text",
  code: "Code",
  audio: "Audio",
  video: "Video",
  other: "File",
};

export const kindLabel = (kind: string): string => KIND_LABEL[kind] ?? "File";

export function sizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1).replace(/\.0$/, "") : Math.round(value)} ${units[unit]}`;
}

/** When a file was added to Files, so files with the same name can be told apart. */
export function fileDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Pictures a browser can show; HEIC and TIFF it cannot. */
export const canShowPicture = (name: string, kind: string): boolean => kind === "image" && !/\.(heic|heif|tiff?)$/i.test(name);

/** What a person asks their node when they want a file they attached put on their computer (the node's `node_save_attachment`). */
export const saveOnComputerAsk = (name: string): string => `Save “${name}” on my computer.`;

/** The files on a message (`data.files`). */
export function messageFiles(message: Pick<Message, "data">): MessageFile[] {
  const raw = message.data?.files;
  return Array.isArray(raw) ? raw.filter((row): row is MessageFile => Boolean(row) && typeof row.id === "string" && typeof row.name === "string") : [];
}

/**
 * How a file on a message shows. Only the sender can open it: a link to it in Ensemble's Files, and a
 * picture's thumbnail. Everyone else sees its name, kind and size.
 */
export function fileChipView(message: Pick<Message, "authorKind" | "authorAccountId">, file: MessageFile, meId: string): { mine: boolean; href: string | null; thumbnail: boolean } {
  const mine = Boolean(meId) && message.authorKind === "human" && message.authorAccountId === meId;
  return { mine, href: mine ? ENSEMBLE_LINKS.file(file.id) : null, thumbnail: mine && canShowPicture(file.name, file.kind) };
}
