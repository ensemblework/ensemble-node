import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, uploadResult } from "./api";
import {
  addAttachments,
  attachNotice,
  failUpload,
  fileAttachment,
  fileChipView,
  finishUpload,
  localAttachment,
  MAX_ATTACHMENTS,
  messageFiles,
  pastedFiles,
  pastedName,
  readyFiles,
  removeAttachment,
  retryUpload,
  sendBlocker,
  setProgress,
  sizeLabel,
  type Attachment,
} from "./attachments";
import { ENSEMBLE_APP } from "./config";

const local = (name: string, size = 10, lastModified = 1) => localAttachment(`k-${name}-${lastModified}`, { name, size, type: "", lastModified });
const fromFiles = (id: string) => fileAttachment(`k-${id}`, { id, name: `${id}.pdf`, kind: "pdf", size: 2048 });

test("the shelf holds up to eight files and leaves out ones already on it", () => {
  const first = addAttachments([], [local("a.pdf"), local("a.pdf"), fromFiles("f1")]);
  assert.deepEqual(first.items.map((row) => row.name), ["a.pdf", "f1.pdf"]);
  assert.equal(first.duplicates, 1);
  // The same file from Files again, or the same local file picked again, is a duplicate.
  const again = addAttachments(first.items, [fromFiles("f1"), local("a.pdf")]);
  assert.equal(again.added.length, 0);
  assert.equal(again.duplicates, 2);
  // Same name, another file (another size or time): both stay.
  assert.equal(addAttachments(first.items, [local("a.pdf", 11)]).added.length, 1);

  const many = Array.from({ length: 10 }, (_, at) => local(`f${at}.txt`));
  const full = addAttachments([], many);
  assert.equal(full.items.length, MAX_ATTACHMENTS);
  assert.equal(full.overLimit, 2);
  assert.equal(attachNotice(full), "A message holds up to 8 files; 2 were left out.");
  assert.equal(attachNotice({ duplicates: 1, overLimit: 0 }), "That file is already attached.");
  assert.equal(attachNotice({ duplicates: 0, overLimit: 0 }), null);
});

test("an upload goes from progress to ready; cancel and remove take the chip off", () => {
  let items: Attachment[] = addAttachments([], [local("shot.png"), fromFiles("f1")]).items;
  const key = items[0]!.key;
  items = setProgress(items, key, 40);
  assert.equal(items[0]!.progress, 40);
  assert.equal(setProgress(items, key, 40), items, "no change, same list");
  assert.deepEqual(readyFiles(items).map((file) => file.id), ["f1"], "only uploaded files go with the message");
  assert.equal(sendBlocker(items), "Sending waits until the file has uploaded.");

  const done = finishUpload(items, key, { id: "f2", name: "shot.png", kind: "image", size: 10 });
  assert.equal(done[0]!.status, "ready");
  assert.deepEqual(readyFiles(done).map((file) => file.id), ["f2", "f1"]);
  assert.equal(sendBlocker(done), null);

  // Cancelling while it uploads, or removing it after: the chip goes, a late answer changes nothing.
  const cancelled = removeAttachment(items, key);
  assert.deepEqual(cancelled.map((row) => row.name), ["f1.pdf"]);
  assert.equal(finishUpload(cancelled, key, { id: "f2", name: "shot.png", kind: "image", size: 10 }), cancelled);
  assert.equal(failUpload(cancelled, key, "late"), cancelled);

  // Ensemble kept an identical copy that is already attached: one chip for it.
  assert.deepEqual(finishUpload(items, key, { id: "f1", name: "f1.pdf", kind: "pdf", size: 2048 }).map((row) => row.key), ["k-f1"]);
});

test("a failed upload says why, blocks sending and retries under the same chip", () => {
  let items: Attachment[] = addAttachments([], [local("tool.exe")]).items;
  const key = items[0]!.key;
  items = failUpload(items, key, ".exe files are programs or raw binary data, which Files does not keep.");
  assert.equal(items[0]!.status, "failed");
  assert.equal(sendBlocker(items), "“tool.exe” did not upload. Retry or remove it to send.");
  const again = retryUpload(items, key);
  assert.equal(again[0]!.key, key);
  assert.equal(again[0]!.signature, items[0]!.signature);
  assert.equal(again[0]!.status, "uploading");
  assert.equal(again[0]!.error, null);
  // A file from Files never uploads, so there is nothing to retry.
  const chosen = failUpload([fromFiles("f1")], "k-f1", "x");
  assert.equal(retryUpload(chosen, "k-f1"), chosen);
});

test("an upload error is the server's own words", () => {
  assert.equal(uploadResult(201, JSON.stringify({ file: { id: "f1", filename: "a.pdf", kind: "pdf", byteSize: 3, textStatus: "queued", createdAt: "" } })).id, "f1");
  assert.throws(() => uploadResult(413, JSON.stringify({ error: "Files can be up to 25 MB on the hosted plan." })), (error: ApiError) => error.status === 413 && error.message === "Files can be up to 25 MB on the hosted plan.");
  assert.throws(() => uploadResult(413, "<html>"), /too large/);
  assert.throws(() => uploadResult(0, ""), /cannot be reached/);
});

test("pasted files count unless they came with copied rich text", () => {
  const picture = { name: "image.png" };
  const clip = (types: string[], html = "") => ({ files: [picture], types, getData: (type: string) => (type === "text/html" ? html : "") });
  assert.deepEqual(pastedFiles(clip(["Files"])), [picture], "a screenshot");
  assert.deepEqual(pastedFiles(clip(["text/html", "Files"], "<meta charset='utf-8'><img src='https://x.dev/a.png'>")), [picture], "a copied picture");
  assert.deepEqual(pastedFiles(clip(["text/plain", "text/html", "Files"], "<p>Copied words</p>")), [], "words from a page or Word");
  assert.deepEqual(pastedFiles(clip(["text/plain", "text/rtf", "Files"])), [], "cells from Excel");
  assert.deepEqual(pastedFiles({ files: [], types: ["text/plain"], getData: () => "" }), []);
  assert.deepEqual(pastedFiles(null), []);
  assert.equal(pastedName("image.png", "image/png", new Date(2026, 9, 26, 3, 7, 9)), "Pasted image 2026-10-26 03.07.09.png");
  assert.equal(pastedName("report.pdf", "application/pdf", new Date()), "report.pdf");
});

test("only the sender can open a file on a message", () => {
  const file = { id: "f1", name: "plan.png", kind: "image", size: 1200 };
  const mine = { authorKind: "human" as const, authorAccountId: "me" };
  assert.deepEqual(fileChipView(mine, file, "me"), { mine: true, href: `${ENSEMBLE_APP}/files/f1`, thumbnail: true });
  assert.deepEqual(fileChipView({ ...mine, authorAccountId: "ben" }, file, "me"), { mine: false, href: null, thumbnail: false }, "someone else's: name only");
  assert.deepEqual(fileChipView(mine, file, ""), { mine: false, href: null, thumbnail: false }, "not signed in yet");
  assert.equal(fileChipView(mine, { ...file, name: "scan.heic" }, "me").thumbnail, false, "a browser cannot show HEIC");
  assert.equal(fileChipView(mine, { ...file, kind: "pdf", name: "plan.pdf" }, "me").thumbnail, false);
  assert.deepEqual(messageFiles({ data: { files: [file, { bad: true } as unknown as typeof file] } }), [file]);
  assert.deepEqual(messageFiles({ data: {} }), []);
});

test("sizes read like Files", () => {
  assert.equal(sizeLabel(512), "512 B");
  assert.equal(sizeLabel(2048), "2 KB");
  assert.equal(sizeLabel(1536), "1.5 KB");
  assert.equal(sizeLabel(25 * 1024 * 1024), "25 MB");
});
