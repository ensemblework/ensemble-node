import assert from "node:assert/strict";
import test from "node:test";
import { durationLabel, evidenceCount, evidenceErrorWords, evidenceItems, evidenceKind, evidenceOfCards, evidencePath, evidenceShow, isSafeImage, isTall, keptAs, mediaFrame, mediaItems, mimeOf } from "./evidence";

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
  assert.deepEqual(mediaItems([{ evidenceId: "e2", kind: "video", name: "demo.mp4", mime: "video/mp4", caption: "It works", size: 2048 }, { name: "lost" }]), [
    { id: "e2", kind: "video", name: "demo.mp4", mime: "video/mp4", caption: "It works", size: 2048 },
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
  assert.equal(evidencePath("e1", "m 2"), "/api/node/evidence/e1?message=m%202", "anyone but its owner opens it through the message that shows it");
});

test("held and kept files are listed, never opened; videos bring their poster and size", () => {
  const items = evidenceItems([
    { id: "v1", kind: "video", name: "flow.mp4", mime: "video/mp4", size: 900, poster: "p1", preview: "pv1", width: 1280, height: 720, durationMs: 12_400 },
    { id: "h1", kind: "screenshot", name: "keys.png", mime: "image/png", size: 80, held: true, holdReason: "It shows one of your saved secret values." },
    { id: "l1", kind: "trace", name: "trace.zip", mime: "application/zip", size: 70, local: true },
    { id: "s1", kind: "screenshot", name: "home.png", mime: "image/png", size: 60, width: 0, height: -1 },
  ]);
  assert.deepEqual(items[0], { id: "v1", kind: "video", name: "flow.mp4", mime: "video/mp4", size: 900, caption: null, requirementId: null, createdAt: null, poster: "p1", width: 1280, height: 720, durationMs: 12_400 });
  assert.deepEqual([items[1]!.held, items[1]!.holdReason, items[1]!.local], [true, "It shows one of your saved secret values.", undefined]);
  assert.equal(items[2]!.local, true);
  assert.equal("width" in items[3]!, false, "nothing measured, nothing reserved");
  assert.deepEqual(items.map(keptAs), [null, "held", "local", null]);
  assert.equal(evidenceCount(items), "1 picture, 1 video, 1 held, 1 not uploaded");
  assert.deepEqual(mediaItems([{ evidenceId: "v2", kind: "video", name: "demo.webm", mime: "video/webm", size: 10, posterId: "p2", width: 640, height: 360, durationMs: 3000 }])[0], { id: "v2", kind: "video", name: "demo.webm", mime: "video/webm", caption: null, size: 10, poster: "p2", width: 640, height: 360, durationMs: 3000 });
});

test("a video's length, the space media takes before it loads, and why a file could not be read", () => {
  assert.equal(durationLabel(400), "0:01");
  assert.equal(durationLabel(12_400), "0:12");
  assert.equal(durationLabel(754_000), "12:34");
  assert.equal(durationLabel(3_723_000), "1:02:03");
  assert.equal(durationLabel(0), null);
  assert.equal(durationLabel(undefined), null);
  assert.deepEqual(mediaFrame({ width: 1280, height: 720 }, { maxWidth: 384, maxHeight: 420 }), { aspectRatio: "1280 / 720", maxWidth: 384 });
  assert.deepEqual(mediaFrame({ width: 390, height: 844 }, { maxWidth: 384, maxHeight: 420 }), { aspectRatio: "390 / 844", maxWidth: 194 }, "a tall phone screenshot stays short");
  assert.deepEqual(mediaFrame({ width: 200, height: 100 }, { maxWidth: 384, maxHeight: 420 }), { aspectRatio: "200 / 100", maxWidth: 200 }, "never larger than it is");
  assert.equal(mediaFrame({}, { maxWidth: 384, maxHeight: 420 }), null);
  assert.match(evidenceErrorWords(504, "<html>Gateway Timeout</html>"), /did not answer in time/);
  assert.equal(evidenceErrorWords(413, null), "Too large to preview from the computer. Send it to see it here.");
  assert.equal(evidenceErrorWords(413, "“flow.mp4” is too large to preview from the computer (40 MB); preview its poster, or release it."), "“flow.mp4” is too large to preview from the computer (40 MB); preview its poster, or release it.", "the server's own words win");
  assert.equal(evidenceErrorWords(409, ""), "This file is kept on the computer that made it, not uploaded.");
  assert.equal(evidenceErrorWords(409, "“shot.png” is kept on Laptop, which is offline. Try again when Ensemble runs there."), "“shot.png” is kept on Laptop, which is offline. Try again when Ensemble runs there.");
  assert.equal(evidenceErrorWords(404), "This file is not available any more.");
  assert.equal(evidenceErrorWords(0), "Ensemble cannot be reached. Check your connection and try again.");
  assert.equal(evidenceErrorWords(500), "The file could not be read (500).");
});

test("a full-page capture is a tall picture: shown from its top, and scrolled when opened", () => {
  assert.equal(isTall({ width: 1280, height: 9464 }), true);
  assert.equal(isTall({ width: 390, height: 844 }), false, "a phone screenshot is not tall enough to crop");
  assert.equal(isTall({ width: 1280, height: 720 }), false);
  assert.equal(isTall({ width: 1000, height: 2200 }), true);
  assert.equal(isTall({}), false, "unmeasured pictures are measured once they load");
});
