import assert from "node:assert/strict";
import test from "node:test";
import { decodePreview, looksBinary, PREVIEW_LINES, PREVIEW_MAX_BYTES, previewContent, previewLines, textPreviewKind } from "./file-preview";

test("Markdown, text, logs, CSV and JSON preview; active formats and held files never do", () => {
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
  for (const mime of ["text/html", "application/xhtml+xml", "text/xml", "application/xml", "image/svg+xml", "text/javascript", "application/javascript", "application/pdf", "image/png", "video/mp4"]) {
    assert.equal(textPreviewKind({ mime, name: "report.md" }), null, `${mime} named .md`);
  }
  assert.equal(textPreviewKind({ mime: "", name: "page.html" }), null);
  assert.equal(textPreviewKind({ mime: "", name: "archive.zip" }), null);
  assert.equal(textPreviewKind({ mime: "text/markdown", name: "report.md", held: true }), null);
  assert.equal(textPreviewKind({ mime: "text/markdown", name: "report.md", local: true }), null);
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
