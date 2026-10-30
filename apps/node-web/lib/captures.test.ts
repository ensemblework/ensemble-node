import assert from "node:assert/strict";
import test from "node:test";
import { captureLine, heldReasons, heldReasonWords, heldState, liveMeta, livePausedWords, pageAddress, takeoverReady } from "./captures";

test("held captures say why in the owner's words, each reason once", () => {
  assert.equal(heldReasonWords("It shows one of your saved secret values."), "It shows one of your saved secrets.");
  assert.equal(heldReasonWords("The owner asked to see captures of this site before they are sent."), "You asked to see captures of this site before they are sent.");
  assert.equal(heldReasonWords("A desktop app's window cannot be checked for secrets on this computer, so the owner previews it first."), "A desktop app's window can't be checked for secrets, so you see it first.");
  assert.equal(heldReasonWords(" A one-time code or card field was on screen. "), "A one-time code or card field was on screen.", "other reasons show as written");
  assert.deepEqual(
    heldReasons({
      reasons: ["It shows one of your saved secret values."],
      evidence: [{ id: "e1", holdReason: "It shows one of your saved secret values." }, { id: "e2", holdReason: "It shows something that looks like a key or token." }, { id: "e3" }, null],
    }),
    ["It shows one of your saved secrets.", "It shows something that looks like a key or token."],
  );
  assert.deepEqual(heldReasons({ reasons: [], evidence: [{ id: "e1" }] }), ["Your computer could not check it."], "a held file always says why");
  assert.deepEqual(heldReasons(null), ["Your computer could not check it."]);
});

test("a held card's state", () => {
  assert.deepEqual(heldState("pending"), { label: "Waiting for you", tone: "warn" });
  assert.deepEqual(heldState("applying"), { label: "Sending…", tone: "accent" });
  assert.deepEqual(heldState("released"), { label: "Sent", tone: "ok" });
  assert.deepEqual(heldState("discarded"), { label: "Discarded", tone: "muted" });
});

test("a paused live view says why; its picture's details come from the headers", () => {
  assert.equal(livePausedWords("sensitive"), "Paused: signing in");
  assert.equal(livePausedWords("private_site"), "Paused: a private site");
  assert.equal(livePausedWords("secret_on_screen"), "Paused: a secret on screen");
  assert.equal(livePausedWords("something_new"), "Paused");
  assert.equal(livePausedWords(null), "Paused");
  const headers = new Map(
    Object.entries({
      "X-Ensemble-Live-At": "2026-11-02T10:00:00.000Z",
      "X-Ensemble-Live-Tab": "t3",
      "X-Ensemble-Live-Url": encodeURIComponent("https://www.example.com/pricing?plan=team"),
      "X-Ensemble-Live-Title": encodeURIComponent("Pricing — Example"),
      "X-Ensemble-Live-Width": "1280",
      "X-Ensemble-Live-Height": "800",
    }),
  );
  const get = (name: string) => headers.get(name) ?? null;
  assert.deepEqual(liveMeta({ get }), { at: "2026-11-02T10:00:00.000Z", tab: "t3", url: "https://www.example.com/pricing?plan=team", title: "Pricing — Example", width: 1280, height: 800, paused: null });
  assert.deepEqual(liveMeta({ get: (name) => (name === "X-Ensemble-Live-Paused" ? "sensitive" : name === "X-Ensemble-Live-Title" ? "%E0%A4%A" : name === "X-Ensemble-Live-Tab" ? "tab-9" : null) }), { at: null, tab: null, url: null, title: "%E0%A4%A", width: null, height: null, paused: "sensitive" }, "a header that does not decode shows as it came; a tab is only ever tN");
  assert.equal(pageAddress("https://www.example.com/pricing?plan=team"), "example.com/pricing");
  assert.equal(pageAddress("http://localhost:3000/"), "localhost:3000");
  assert.equal(pageAddress("about:blank"), "about:blank");
  assert.equal(pageAddress(null), null);
});

test("only a computer that reports takeover shows its browser here", () => {
  assert.equal(takeoverReady({ takeover: 1 }), true);
  assert.equal(takeoverReady({ takeover: 2, browser: 1 }), true);
  assert.equal(takeoverReady({ browser: 1 }), false, "an older Ensemble");
  assert.equal(takeoverReady({ takeover: "1" as unknown as number }), false, "only a number counts");
  assert.equal(takeoverReady(null), false);
});

test("a computer says what it can capture, or what to run there", () => {
  assert.deepEqual(captureLine({ name: "Laptop", capabilities: { worktrees: 1 } }, "ensemble"), { state: "update", text: "Update Ensemble on Laptop so your nodes can browse and capture there." });
  assert.equal(captureLine({ name: "Laptop", capabilities: null }, "ensemble").state, "update");
  assert.deepEqual(captureLine({ name: "Laptop", capabilities: { browser: 1, capture: null } }, "ensemble-test"), { state: "setup", text: "Run ensemble-test capture setup on Laptop so your nodes can browse and capture there.", command: "ensemble-test capture setup" });
  const capture = {
    browser: true,
    video: "mp4" as const,
    targets: {
      web: { screenshot: true, video: true },
      electron: { screenshot: true, video: false, reason: "No video encoder here." },
      gui: { screenshot: false, video: false, reason: "Needs Xvfb for a private virtual display." },
      terminal: { screenshot: true, video: false },
      desktop: { screenshot: false, video: false },
    },
    setup: true,
  };
  assert.deepEqual(captureLine({ name: "Studio", capabilities: { browser: 1, capture } }, "ensemble"), {
    state: "ready",
    text: "Captures web pages (pictures and video), Electron apps (pictures) and terminals (pictures). Videos are MP4.",
    command: "ensemble capture setup",
  });
  assert.deepEqual(captureLine({ name: "Studio", capabilities: { browser: 1, capture: { ...capture, video: null, setup: false, targets: { web: { screenshot: true, video: false } } } } }, "ensemble"), { state: "ready", text: "Captures web pages (pictures)." });
  assert.equal(captureLine({ name: "Studio", capabilities: { browser: 1, capture: { ...capture, browser: false } } }, "ensemble").state, "setup", "no Chromium for Ensemble yet");
});
