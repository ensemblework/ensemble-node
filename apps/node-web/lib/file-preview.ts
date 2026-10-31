/**
 * Text files a node or a run shares (a Markdown report, notes, code, a log, CSV or JSON) show in the
 * chat as a preview: Markdown rendered like a message (raw HTML stays text), code, data and other text
 * as it is, in monospace. A preview is always text, never a page: nothing in a file runs. Markup meant
 * for a browser (HTML, SVG, XML) and every binary format stay downloads (lib/evidence.ts). At most the
 * first 200 KB is read, and the first 40 lines show until "Show all".
 */
import { mimeOf } from "./evidence";
import { fileTypeByMime, fileTypeByName } from "./file-types";
import type { EvidenceItem } from "./types";

/** markdown: rendered; code: monospace with line numbers; json: indented when whole; text: as it is. */
export type TextPreviewKind = "markdown" | "code" | "json" | "text";

/** The most a preview reads of a file. */
export const PREVIEW_MAX_BYTES = 200 * 1024;
/** Lines shown before "Show all". */
export const PREVIEW_LINES = 40;
/** More text files than this on one message start folded: each opens on its own. */
export const OPEN_PREVIEWS = 2;

/** What a server says when it does not know: the name decides then. */
const UNKNOWN = new Set(["", "application/octet-stream", "binary/octet-stream", "application/unknown"]);
/** Types whose bytes are text, whatever they hold. */
const TEXTUAL = /^(text\/|application\/(json|x-ndjson|javascript|ecmascript|x-javascript|xml|xhtml\+xml|x-sh|x-python|sql|yaml|x-yaml|toml)$|image\/svg\+xml$)|\+json$/;

function previewOf(family: string | undefined, label: string | undefined): TextPreviewKind | null {
  if (family === "markdown") return "markdown";
  if (family === "code") return "code";
  if (family === "data") return label === "CSV" || label === "TSV" ? "text" : "json";
  if (family === "text") return "text";
  return null;
}

/**
 * Whether a file shows as a text preview, and how. Only text is previewed: a type that is text (or
 * none at all), and a name that is not a browser's markup. The name decides how (a plain-text file
 * named `.py` is Python, `.md` Markdown, even when Ensemble typed it as HTML because it mentions a
 * script tag); without a known name, the type does. A file held for its owner or kept on the computer
 * is never read.
 */
export function textPreviewKind(item: Pick<EvidenceItem, "mime" | "name" | "held" | "local">): TextPreviewKind | null {
  if (item.held || item.local) return null;
  const mime = mimeOf(item.mime);
  if (!UNKNOWN.has(mime) && !TEXTUAL.test(mime)) return null;
  const named = fileTypeByName(item.name);
  if (named) return previewOf(named.family, named.label);
  if (UNKNOWN.has(mime)) return null;
  const typed = fileTypeByMime(mime);
  return previewOf(typed?.family, typed?.label);
}

/** Which previews start open: all of them when there are a few, else none (each opens on its own). */
export const previewsOpen = (count: number): boolean => count <= OPEN_PREVIEWS;

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
