import assert from "node:assert/strict";
import test from "node:test";
import { extensionOf, fileType, fileTypeByMime, fileTypeByName } from "./file-types";

test("a file's type comes from its name first: Ensemble types an office file as a ZIP", () => {
  assert.deepEqual(fileType({ mime: "application/zip", name: "Q3 plan.docx" }), { family: "document", label: "Word document" });
  assert.deepEqual(fileType({ mime: "application/zip", name: "budget.xlsx" }), { family: "spreadsheet", label: "Excel spreadsheet" });
  assert.deepEqual(fileType({ mime: "application/zip", name: "deck.pptx" }), { family: "presentation", label: "PowerPoint" });
  assert.deepEqual(fileType({ mime: "application/zip", name: "reports.zip" }), { family: "archive", label: "ZIP archive" });
  assert.deepEqual(fileType({ mime: "application/gzip", name: "logs.tar.gz" }), { family: "archive", label: "Gzip archive" });
  assert.deepEqual(fileType({ mime: "application/pdf", name: "invoice.PDF" }), { family: "pdf", label: "PDF" });
  assert.deepEqual(fileType({ mime: "text/plain", name: "analyse.py" }), { family: "code", label: "Python" });
  assert.deepEqual(fileType({ mime: "text/javascript", name: "app.tsx" }), { family: "code", label: "TypeScript" });
  assert.deepEqual(fileType({ mime: "text/markdown", name: "notes.md" }), { family: "markdown", label: "Markdown" });
  assert.deepEqual(fileType({ mime: "text/csv", name: "prices.csv" }), { family: "data", label: "CSV" });
  assert.deepEqual(fileType({ mime: "application/octet-stream", name: "song.mp3" }), { family: "audio", label: "MP3 audio" });
  assert.deepEqual(fileType({ mime: "image/heic", name: "IMG_0001.HEIC" }), { family: "image", label: "HEIC image" });
  assert.deepEqual(fileType({ mime: "text/plain", name: "Makefile" }), { family: "code", label: "Makefile" });
});

test("without a known name, the type decides; with neither, it is a file", () => {
  assert.deepEqual(fileType({ mime: "application/pdf", name: "download" }), { family: "pdf", label: "PDF" });
  assert.deepEqual(fileType({ mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", name: "x" }), { family: "document", label: "Word document" });
  assert.deepEqual(fileType({ mime: "application/vnd.api+json", name: "x" }), { family: "data", label: "JSON" });
  assert.deepEqual(fileType({ mime: "application/x-xz", name: "dump" }), { family: "archive", label: "XZ archive" });
  assert.deepEqual(fileType({ mime: "application/java-archive", name: "tool.jar" }), { family: "archive", label: "Java archive" });
  assert.deepEqual(fileType({ mime: "audio/flac; rate=44100", name: "take" }), { family: "audio", label: "Audio" });
  assert.deepEqual(fileType({ mime: "text/plain", name: "notes.weird" }), { family: "text", label: "Text" });
  assert.deepEqual(fileType({ mime: "application/octet-stream", name: "blob.dat" }), { family: "other", label: "File" });
  assert.deepEqual(fileType({ mime: "", name: "" }), { family: "other", label: "File" });
  assert.equal(fileTypeByMime("application/octet-stream"), null);
  assert.equal(fileTypeByName("README"), fileTypeByName("readme"));
  assert.equal(fileTypeByName(".env"), null, "a dotfile's name is not an extension");
});

test("an extension is the name's last part, lower case", () => {
  assert.equal(extensionOf("Report.Final.MD"), "md");
  assert.equal(extensionOf("folder/sub/archive.tar.gz"), "gz");
  assert.equal(extensionOf("Makefile"), "");
  assert.equal(extensionOf(".gitignore"), "");
  assert.equal(extensionOf(null), "");
});
