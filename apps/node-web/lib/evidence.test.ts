import assert from "node:assert/strict";
import test from "node:test";
import { evidenceCount, evidenceItems, evidenceKind, evidenceOfCards, evidencePath, evidenceShow, isSafeImage, mediaItems, mimeOf } from "./evidence";

test("only pictures that cannot run script show inline; videos play; active formats always download", () => {
  assert.equal(evidenceShow({ mime: "image/png", name: "home.png" }), "image");
  assert.equal(evidenceShow({ mime: "IMAGE/JPEG; q=1", name: "x" }), "image");
  assert.equal(evidenceShow({ mime: "image/jpg", name: "x" }), "image");
  assert.equal(evidenceShow({ mime: "video/mp4", name: "run.mp4" }), "video");
  assert.equal(evidenceShow({ mime: "video/webm", name: "run.webm" }), "video");
  for (const mime of ["image/svg+xml", "text/html", "application/xhtml+xml", "text/xml", "application/javascript", "application/pdf", "text/plain", "application/octet-stream"]) {
    assert.equal(evidenceShow({ mime, name: "shot.png" }), "download", `${mime} with a picture's name`);
  }
  assert.equal(evidenceShow({ mime: "", name: "shot.png" }), "image", "a name is read only without a type");
  assert.equal(evidenceShow({ mime: "", name: "page.svg" }), "download");
  assert.equal(evidenceShow({ mime: "", name: "clip.mov" }), "video");
  assert.equal(isSafeImage("image/webp"), true);
  assert.equal(isSafeImage("image/svg+xml"), false);
  assert.equal(isSafeImage(""), false);
  assert.equal(mimeOf(" Text/HTML ; charset=utf-8"), "text/html");
});

test("evidence and media rows become one gallery's items", () => {
  assert.deepEqual(evidenceItems([{ id: "e1", kind: "screenshot", name: "home.png", mime: "image/png", size: 120, caption: " Home page ", requirementId: "r1", createdAt: "2026-10-29T10:00:00Z" }, { kind: "log" }, null]), [
    { id: "e1", kind: "screenshot", name: "home.png", mime: "image/png", size: 120, caption: "Home page", requirementId: "r1", createdAt: "2026-10-29T10:00:00Z" },
  ]);
  assert.deepEqual(evidenceItems("nope"), []);
  assert.deepEqual(mediaItems([{ evidenceId: "e2", kind: "video", name: "demo.mp4", mime: "video/mp4", caption: "It works" }, { name: "lost" }]), [
    { id: "e2", kind: "video", name: "demo.mp4", mime: "video/mp4", caption: "It works" },
  ]);
  const cards = [
    { seq: 9, data: { evidence: [{ id: "b", kind: "video", name: "b.mp4", mime: "video/mp4" }, { id: "a", kind: "screenshot", name: "a.png", mime: "image/png" }] } },
    { seq: 3, data: { evidence: [{ id: "a", kind: "screenshot", name: "a.png", mime: "image/png" }, { id: "c", kind: "report", name: "r.html", mime: "text/html" }] } },
  ];
  assert.deepEqual(evidenceOfCards(cards).map((row) => row.id), ["a", "c", "b"]);
  assert.equal(evidenceCount(evidenceOfCards(cards)), "1 picture, 1 video, 1 file");
  assert.equal(evidenceCount([]), null);
  assert.equal(evidenceKind("screenshot"), "Screenshot");
  assert.equal(evidenceKind("weird"), "File");
  assert.equal(evidencePath("a b"), "/api/node/evidence/a%20b");
});
