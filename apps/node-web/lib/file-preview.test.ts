import assert from "node:assert/strict";
import test from "node:test";
import { decodePreview, looksBinary, PREVIEW_LINES, PREVIEW_MAX_BYTES, previewContent, previewLines, previewsOpen, textPreviewKind } from "./file-preview";

test("Markdown, code, text, logs, CSV and JSON preview; markup, binary formats and held files never do", () => {
  assert.equal(textPreviewKind({ mime: "text/markdown", name: "report.md" }), "markdown");
  assert.equal(textPreviewKind({ mime: "text/plain", name: "report.md" }), "markdown", "a plain-text file named .md is Markdown");
  assert.equal(textPreviewKind({ mime: "", name: "REPORT.MARKDOWN" }), "markdown");
  assert.equal(textPreviewKind({ mime: "application/octet-stream", name: "notes.md" }), "markdown", "without a useful type, the name decides");
  assert.equal(textPreviewKind({ mime: "text/plain", name: "run.log" }), "text");
  assert.equal(textPreviewKind({ mime: "text/csv", name: "prices.csv" }), "text");
  assert.equal(textPreviewKind({ mime: "", name: "prices.csv" }), "text");
  assert.equal(textPreviewKind({ mime: "application/json", name: "result.json" }), "json");
  assert.equal(textPreviewKind({ mime: "application/vnd.api+json", name: "x" }), "json");
  assert.equal(textPreviewKind({ mime: "", name: "result.json" }), "json");
  for (const mime of ["application/pdf", "image/png", "video/mp4", "application/zip"]) {
    assert.equal(textPreviewKind({ mime, name: "report.md" }), null, `${mime} named .md is not text`);
  }
  // Ensemble types any text that mentions a script tag as HTML: a preview is text, never a page.
  assert.equal(textPreviewKind({ mime: "text/html", name: "README.md" }), "markdown");
  assert.equal(textPreviewKind({ mime: "text/html", name: "App.vue" }), "code");
  for (const [mime, name] of [["text/html", "page.html"], ["text/html", "report"], ["", "page.html"], ["application/xhtml+xml", "x"], ["text/xml", "feed"], ["application/xml", "pom.xml"], ["image/svg+xml", "logo.svg"], ["text/plain", "logo.svg"]]) {
    assert.equal(textPreviewKind({ mime, name }), null, `markup for a browser stays a download: ${mime} ${name}`);
  }
  assert.equal(textPreviewKind({ mime: "", name: "archive.zip" }), null);
  assert.equal(textPreviewKind({ mime: "text/markdown", name: "report.md", held: true }), null);
  assert.equal(textPreviewKind({ mime: "text/markdown", name: "report.md", local: true }), null);
});

test("code previews by its name, whatever type Ensemble gave its bytes", () => {
  assert.equal(textPreviewKind({ mime: "text/plain", name: "analyse.py" }), "code", "Ensemble types Python as plain text");
  assert.equal(textPreviewKind({ mime: "application/octet-stream", name: "main.go" }), "code");
  assert.equal(textPreviewKind({ mime: "", name: "deploy.sh" }), "code");
  assert.equal(textPreviewKind({ mime: "text/javascript", name: "app.ts" }), "code", "Ensemble types TypeScript as JavaScript");
  assert.equal(textPreviewKind({ mime: "text/javascript", name: "bundle.js" }), "code", "a script shows as text, never runs");
  assert.equal(textPreviewKind({ mime: "text/css", name: "site.css" }), "code");
  assert.equal(textPreviewKind({ mime: "text/plain", name: "config.yaml" }), "code");
  assert.equal(textPreviewKind({ mime: "text/plain", name: "Dockerfile" }), "code");
  assert.equal(textPreviewKind({ mime: "text/x-python", name: "script" }), "code", "without a known name, the type decides");
  assert.equal(textPreviewKind({ mime: "text/plain", name: "fix.patch" }), "code");
  assert.equal(textPreviewKind({ mime: "application/json", name: "notebook.ipynb" }), "json");
  assert.equal(textPreviewKind({ mime: "text/plain", name: "events.jsonl" }), "json");
  assert.equal(textPreviewKind({ mime: "text/plain", name: "sales.tsv" }), "text");
  assert.equal(textPreviewKind({ mime: "text/plain", name: "notes.unknownext" }), "text", "text with a name nobody knows is text");
  assert.equal(textPreviewKind({ mime: "", name: "notes.unknownext" }), null, "nothing says it is text");
  assert.equal(textPreviewKind({ mime: "application/octet-stream", name: "model.bin" }), null);
  assert.equal(textPreviewKind({ mime: "text/plain", name: "photo.png" }), null, "a picture's name is not text to show");
});

test("a few text files on a message start open; more start folded", () => {
  assert.equal(previewsOpen(1), true);
  assert.equal(previewsOpen(2), true);
  assert.equal(previewsOpen(3), false);
});

test("the first 40 lines show, and how many there are", () => {
  const long = Array.from({ length: 95 }, (_, at) => `line ${at + 1}`).join("\n");
  const cut = previewLines(long);
  assert.equal(PREVIEW_LINES, 40);
  assert.equal(cut.total, 95);
  assert.equal(cut.more, true);
  assert.equal(cut.shown.split("\n").length, 40);
  assert.equal(cut.shown.split("\n").at(-1), "line 40");
  assert.deepEqual(previewLines("one\ntwo\n"), { shown: "one\ntwo", total: 2, more: false }, "a last newline is not a line");
  assert.deepEqual(previewLines(""), { shown: "", total: 1, more: false });
});

test("JSON is indented when whole, other text as written", () => {
  assert.equal(previewContent("json", '{"a":1,"b":[true]}'), '{\n  "a": 1,\n  "b": [\n    true\n  ]\n}');
  assert.equal(previewContent("json", '{"a":1', false), '{"a":1', "invalid JSON stays as it is");
  assert.equal(previewContent("json", '{"a":1,"b":', true), '{"a":1,"b":', "a cut file is not parsed");
  assert.equal(previewContent("markdown", "\uFEFF# Title\r\nBody\r\n"), "# Title\nBody\n");
  assert.equal(looksBinary("PK\u0003\u0004\u0000\u0000"), true);
  assert.equal(looksBinary("# Report"), false);
});

test("the first bytes read as text, a character cut in half as one mark", () => {
  const bytes = new TextEncoder().encode("ab€");
  assert.equal(decodePreview(bytes), "ab€");
  assert.equal(decodePreview(bytes.subarray(0, 3)), "ab\uFFFD", "never an error");
  assert.equal(PREVIEW_MAX_BYTES, 200 * 1024);
});
