/**
 * Text files a node or a run shares (a Markdown report, notes, a log, CSV or JSON) show in the chat as
 * a preview: Markdown rendered like a message, everything else as plain text. Only kinds that cannot
 * run are previewed; HTML, SVG, XML and scripts stay downloads whatever their name says (lib/evidence.ts).
 * At most the first 200 KB is read, and the first 40 lines show until "Show all".
 */
import { mimeOf } from "./evidence";
import type { EvidenceItem } from "./types";

export type TextPreviewKind = "markdown" | "json" | "text";

/** The most a preview reads of a file. */
export const PREVIEW_MAX_BYTES = 200 * 1024;
/** Lines shown before "Show all". */
export const PREVIEW_LINES = 40;

const MARKDOWN_NAME = /\.(md|markdown|mdown|mkd)$/i;
const JSON_NAME = /\.(json|jsonl|ndjson)$/i;
const TEXT_NAME = /\.(txt|text|log|csv|tsv)$/i;
/** Text types that a browser can run or that carry markup: never previewed. */
const ACTIVE = /^(text\/(html|xml|javascript|ecmascript|x-javascript|css|x-sh|x-shellscript|vbscript)|application\/(xhtml\+xml|xml|javascript|ecmascript|x-sh)|image\/svg\+xml)$/;
/** What a server says when it does not know: the name decides then. */
const UNKNOWN = new Set(["", "application/octet-stream", "binary/octet-stream", "application/unknown"]);

function byName(name: string): TextPreviewKind | null {
  if (MARKDOWN_NAME.test(name)) return "markdown";
  if (JSON_NAME.test(name)) return "json";
  if (TEXT_NAME.test(name)) return "text";
  return null;
}

/**
 * Whether a file shows as a text preview, and how. The type decides when it is a known text type (a
 * plain-text file named `.md` is Markdown); without a useful type, the name does. A file held for its
 * owner or kept on the computer is never read.
 */
export function textPreviewKind(item: Pick<EvidenceItem, "mime" | "name" | "held" | "local">): TextPreviewKind | null {
  if (item.held || item.local) return null;
  const mime = mimeOf(item.mime);
  const name = item.name ?? "";
  if (ACTIVE.test(mime)) return null;
  if (mime === "text/markdown" || mime === "text/x-markdown") return "markdown";
  if (mime === "application/json" || mime.endsWith("+json") || mime === "application/x-ndjson") return "json";
  if (mime === "text/plain") return MARKDOWN_NAME.test(name) ? "markdown" : JSON_NAME.test(name) ? "json" : "text";
  if (mime.startsWith("text/")) return MARKDOWN_NAME.test(name) ? "markdown" : "text";
  if (UNKNOWN.has(mime)) return byName(name);
  return null;
}

/** The first `max` lines, how many there are, and whether some are left out. */
export function previewLines(text: string, max = PREVIEW_LINES): { shown: string; total: number; more: boolean } {
  const lines = text.split("\n");
  // A file's own last newline is not a line of its own.
  const total = lines.length > 1 && lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
  return { shown: lines.slice(0, Math.min(max, total)).join("\n"), total, more: total > max };
}

/** The text to show: JSON indented when it parses (whole files only), everything else as it is, without a byte-order mark or Windows line ends. */
export function previewContent(kind: TextPreviewKind, raw: string, truncated = false): string {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (kind !== "json" || truncated) return text;
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** True when the bytes look like a binary file rather than text (NUL bytes): it is offered as a download instead. */
export const looksBinary = (text: string): boolean => text.slice(0, 4096).includes("\u0000");

/** The first bytes of a file as UTF-8 text. A cut in the middle of a character shows as one replacement mark at the end, never an error. */
export function decodePreview(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}
