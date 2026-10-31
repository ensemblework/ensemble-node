/**
 * What a file is, for its card in the chat: a family (which icon, and whether it may preview) and a
 * label people read ("Python", "Word document", "ZIP archive"). The name's extension decides first,
 * because Ensemble types a file by its bytes and many share one type (a .docx is a ZIP, a .py is plain
 * text); the type decides when the name says nothing. How a file shows (inline, a preview, a download)
 * is decided apart, with the safety rules in lib/evidence.ts and lib/file-preview.ts.
 */
import { mimeOf } from "./evidence";

export type FileFamily = "image" | "video" | "audio" | "markdown" | "code" | "data" | "text" | "markup" | "pdf" | "archive" | "document" | "spreadsheet" | "presentation" | "font" | "other";

export type FileType = { family: FileFamily; label: string };

const by = (family: FileFamily, label: string, ...extensions: string[]): Array<[string, FileType]> => extensions.map((ext) => [ext, { family, label }]);

const EXTENSIONS = new Map<string, FileType>([
  ...by("markdown", "Markdown", "md", "markdown", "mdown", "mkd", "mdx"),
  ...by("code", "Python", "py", "pyw", "pyi"),
  ...by("code", "JavaScript", "js", "mjs", "cjs", "jsx"),
  ...by("code", "TypeScript", "ts", "mts", "cts", "tsx"),
  ...by("code", "Go", "go"),
  ...by("code", "Rust", "rs"),
  ...by("code", "Java", "java"),
  ...by("code", "Kotlin", "kt", "kts"),
  ...by("code", "Swift", "swift"),
  ...by("code", "C", "c", "h"),
  ...by("code", "C++", "cpp", "cc", "cxx", "hpp", "hh", "hxx"),
  ...by("code", "C#", "cs"),
  ...by("code", "Ruby", "rb"),
  ...by("code", "PHP", "php"),
  ...by("code", "Shell script", "sh", "bash", "zsh", "fish"),
  ...by("code", "PowerShell", "ps1", "psm1"),
  ...by("code", "SQL", "sql"),
  ...by("code", "R", "r"),
  ...by("code", "Scala", "scala"),
  ...by("code", "Lua", "lua"),
  ...by("code", "Perl", "pl", "pm"),
  ...by("code", "Dart", "dart"),
  ...by("code", "Elixir", "ex", "exs"),
  ...by("code", "Haskell", "hs"),
  ...by("code", "Julia", "jl"),
  ...by("code", "CSS", "css", "scss", "sass", "less"),
  ...by("code", "Vue", "vue"),
  ...by("code", "Svelte", "svelte"),
  ...by("code", "Terraform", "tf", "tfvars", "hcl"),
  ...by("code", "GraphQL", "graphql", "gql"),
  ...by("code", "Protocol Buffers", "proto"),
  ...by("code", "Patch", "diff", "patch"),
  ...by("code", "YAML", "yaml", "yml"),
  ...by("code", "TOML", "toml"),
  ...by("code", "Settings", "ini", "cfg", "conf", "properties"),
  ...by("code", "Dockerfile", "dockerfile"),
  ...by("code", "Makefile", "mk"),
  ...by("data", "JSON", "json"),
  ...by("data", "JSON Lines", "jsonl", "ndjson"),
  ...by("data", "Jupyter notebook", "ipynb"),
  ...by("data", "CSV", "csv"),
  ...by("data", "TSV", "tsv"),
  ...by("text", "Text", "txt", "text"),
  ...by("text", "Log", "log", "out"),
  ...by("text", "reStructuredText", "rst"),
  ...by("text", "LaTeX", "tex"),
  ...by("text", "Subtitles", "srt", "vtt"),
  ...by("markup", "HTML", "html", "htm", "xhtml"),
  ...by("markup", "XML", "xml"),
  ...by("markup", "SVG image", "svg"),
  ...by("pdf", "PDF", "pdf"),
  ...by("archive", "ZIP archive", "zip"),
  ...by("archive", "Tar archive", "tar"),
  ...by("archive", "Gzip archive", "gz", "tgz"),
  ...by("archive", "Bzip2 archive", "bz2"),
  ...by("archive", "XZ archive", "xz"),
  ...by("archive", "Zstandard archive", "zst"),
  ...by("archive", "7-Zip archive", "7z"),
  ...by("archive", "RAR archive", "rar"),
  ...by("archive", "Java archive", "jar"),
  ...by("document", "Word document", "doc", "docx"),
  ...by("document", "OpenDocument text", "odt"),
  ...by("document", "Rich text", "rtf"),
  ...by("document", "Pages document", "pages"),
  ...by("document", "EPUB book", "epub"),
  ...by("spreadsheet", "Excel spreadsheet", "xls", "xlsx", "xlsm"),
  ...by("spreadsheet", "OpenDocument spreadsheet", "ods"),
  ...by("spreadsheet", "Numbers spreadsheet", "numbers"),
  ...by("presentation", "PowerPoint", "ppt", "pptx"),
  ...by("presentation", "OpenDocument slides", "odp"),
  ...by("presentation", "Keynote", "key"),
  ...by("image", "PNG image", "png"),
  ...by("image", "JPEG image", "jpg", "jpeg"),
  ...by("image", "GIF image", "gif"),
  ...by("image", "WebP image", "webp"),
  ...by("image", "AVIF image", "avif"),
  ...by("image", "BMP image", "bmp"),
  ...by("image", "HEIC image", "heic", "heif"),
  ...by("image", "TIFF image", "tif", "tiff"),
  ...by("image", "Icon", "ico"),
  ...by("image", "Photoshop file", "psd"),
  ...by("video", "MP4 video", "mp4", "m4v"),
  ...by("video", "WebM video", "webm"),
  ...by("video", "QuickTime video", "mov"),
  ...by("video", "Matroska video", "mkv"),
  ...by("video", "AVI video", "avi"),
  ...by("audio", "MP3 audio", "mp3"),
  ...by("audio", "WAV audio", "wav"),
  ...by("audio", "Ogg audio", "ogg", "oga", "opus"),
  ...by("audio", "M4A audio", "m4a"),
  ...by("audio", "AAC audio", "aac"),
  ...by("audio", "FLAC audio", "flac"),
  ...by("audio", "WebM audio", "weba"),
  ...by("font", "Font", "ttf", "otf", "woff", "woff2"),
]);

/** Files known by their whole name, without an extension. */
const NAMES = new Map<string, FileType>([
  ["dockerfile", { family: "code", label: "Dockerfile" }],
  ["makefile", { family: "code", label: "Makefile" }],
  ["gemfile", { family: "code", label: "Ruby" }],
  ["procfile", { family: "code", label: "Settings" }],
  ["readme", { family: "text", label: "Text" }],
  ["license", { family: "text", label: "Text" }],
]);

const MIMES = new Map<string, FileType>([
  ["text/markdown", { family: "markdown", label: "Markdown" }],
  ["text/x-markdown", { family: "markdown", label: "Markdown" }],
  ["application/json", { family: "data", label: "JSON" }],
  ["application/x-ndjson", { family: "data", label: "JSON Lines" }],
  ["text/csv", { family: "data", label: "CSV" }],
  ["text/tab-separated-values", { family: "data", label: "TSV" }],
  ["text/x-python", { family: "code", label: "Python" }],
  ["application/x-python", { family: "code", label: "Python" }],
  ["text/javascript", { family: "code", label: "JavaScript" }],
  ["application/javascript", { family: "code", label: "JavaScript" }],
  ["text/css", { family: "code", label: "CSS" }],
  ["text/x-sh", { family: "code", label: "Shell script" }],
  ["application/x-sh", { family: "code", label: "Shell script" }],
  ["text/x-shellscript", { family: "code", label: "Shell script" }],
  ["application/sql", { family: "code", label: "SQL" }],
  ["application/yaml", { family: "code", label: "YAML" }],
  ["application/x-yaml", { family: "code", label: "YAML" }],
  ["text/yaml", { family: "code", label: "YAML" }],
  ["application/toml", { family: "code", label: "TOML" }],
  ["text/html", { family: "markup", label: "HTML" }],
  ["application/xhtml+xml", { family: "markup", label: "HTML" }],
  ["text/xml", { family: "markup", label: "XML" }],
  ["application/xml", { family: "markup", label: "XML" }],
  ["image/svg+xml", { family: "markup", label: "SVG image" }],
  ["application/pdf", { family: "pdf", label: "PDF" }],
  ["application/zip", { family: "archive", label: "ZIP archive" }],
  ["application/x-zip-compressed", { family: "archive", label: "ZIP archive" }],
  ["application/gzip", { family: "archive", label: "Gzip archive" }],
  ["application/x-gzip", { family: "archive", label: "Gzip archive" }],
  ["application/x-tar", { family: "archive", label: "Tar archive" }],
  ["application/x-7z-compressed", { family: "archive", label: "7-Zip archive" }],
  ["application/vnd.rar", { family: "archive", label: "RAR archive" }],
  ["application/x-xz", { family: "archive", label: "XZ archive" }],
  ["application/x-bzip2", { family: "archive", label: "Bzip2 archive" }],
  ["application/zstd", { family: "archive", label: "Zstandard archive" }],
  ["application/java-archive", { family: "archive", label: "Java archive" }],
  ["application/msword", { family: "document", label: "Word document" }],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", { family: "document", label: "Word document" }],
  ["application/vnd.oasis.opendocument.text", { family: "document", label: "OpenDocument text" }],
  ["application/rtf", { family: "document", label: "Rich text" }],
  ["application/epub+zip", { family: "document", label: "EPUB book" }],
  ["application/vnd.ms-excel", { family: "spreadsheet", label: "Excel spreadsheet" }],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", { family: "spreadsheet", label: "Excel spreadsheet" }],
  ["application/vnd.oasis.opendocument.spreadsheet", { family: "spreadsheet", label: "OpenDocument spreadsheet" }],
  ["application/vnd.ms-powerpoint", { family: "presentation", label: "PowerPoint" }],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", { family: "presentation", label: "PowerPoint" }],
  ["application/vnd.oasis.opendocument.presentation", { family: "presentation", label: "OpenDocument slides" }],
]);

const FAMILY_OF_TYPE: Array<[string, FileType]> = [
  ["image/", { family: "image", label: "Image" }],
  ["video/", { family: "video", label: "Video" }],
  ["audio/", { family: "audio", label: "Audio" }],
  ["font/", { family: "font", label: "Font" }],
  ["text/", { family: "text", label: "Text" }],
];

/** "report.final.MD" → "md"; "" for a name without one (or a dotfile's name). */
export function extensionOf(name: string | null | undefined): string {
  const base = (name ?? "").trim().split(/[\\/]/).at(-1) ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/** What a file is by its name alone, or null when the name says nothing. */
export function fileTypeByName(name: string | null | undefined): FileType | null {
  const ext = extensionOf(name);
  if (ext) return EXTENSIONS.get(ext) ?? null;
  const base = (name ?? "").trim().split(/[\\/]/).at(-1)?.toLowerCase() ?? "";
  return NAMES.get(base) ?? null;
}

/** What a file is by its type alone, or null when the type says nothing. */
export function fileTypeByMime(mime: string | null | undefined): FileType | null {
  const type = mimeOf(mime);
  if (!type) return null;
  const known = MIMES.get(type);
  if (known) return known;
  if (type.endsWith("+json")) return { family: "data", label: "JSON" };
  return FAMILY_OF_TYPE.find(([prefix]) => type.startsWith(prefix))?.[1] ?? null;
}

/** What a file is: by its name, else by its type, else a file. */
export function fileType(item: { mime?: string | null; name?: string | null }): FileType {
  return fileTypeByName(item.name) ?? fileTypeByMime(item.mime) ?? { family: "other", label: "File" };
}
