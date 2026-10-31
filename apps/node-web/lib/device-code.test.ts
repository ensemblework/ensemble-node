import assert from "node:assert/strict";
import test from "node:test";
import { cardCheckpoint, cardOpen } from "./checkpoints";
import { cardWords } from "./cards";
import { deviceCodeBadge, deviceCodeLink, deviceCodeOpen, deviceCodeOutcome, deviceCodeTitle, deviceCodeValue } from "./device-code";
import { liveBadge, liveLine, liveOpen, liveTitle } from "./live-session";

const code = { type: "device_code", status: "pending", url: "https://microsoft.com/devicelogin", code: " F7KQ-9PZT ", command: "az login --use-device-code", computer: "Studio", deviceId: "dev-1", operation: "op-1", expiresAt: "2026-10-31T12:15:00.000Z" };

test("a device code: its code, its page as a link only when it is a web address, and its words", () => {
  assert.equal(deviceCodeValue(code), "F7KQ-9PZT");
  assert.deepEqual(deviceCodeLink(code.url), { href: "https://microsoft.com/devicelogin", label: "microsoft.com/devicelogin" });
  assert.deepEqual(deviceCodeLink("https://www.github.com/login/device/"), { href: "https://www.github.com/login/device/", label: "github.com/login/device" });
  assert.equal(deviceCodeLink("javascript:alert(1)"), null);
  assert.equal(deviceCodeLink("not a url"), null);
  assert.equal(deviceCodeTitle(code), "Sign-in code for az login --use-device-code on Studio");
  assert.equal(deviceCodeOpen(code), true);
  assert.deepEqual(deviceCodeBadge(code), { label: "Waiting for you", tone: "warn" });
  assert.deepEqual(deviceCodeBadge({ status: "done" }), { label: "Signed in", tone: "ok" });
  assert.equal(deviceCodeOutcome({ ...code, status: "done" }), "Signed in: az login --use-device-code on Studio finished.");
  assert.match(deviceCodeOutcome({ ...code, status: "expired" }), /^The code for az login --use-device-code on Studio is no longer valid/);
});

test("a device code and a live session fold into their checkpoints once they no longer wait", () => {
  assert.equal(cardOpen(code), true);
  assert.equal(cardOpen({ ...code, status: "done" }), false);
  assert.deepEqual(cardCheckpoint({ ...code, status: "done" }, { handle: "lead", roomTitle: "Lead" }), { text: "Signed in with a code: az login --use-device-code on Studio", tone: "ok", icon: "check" });
  assert.deepEqual(cardCheckpoint({ ...code, status: "expired" }, { handle: "lead", roomTitle: "Lead" }), { text: "Sign-in code expired: az login --use-device-code on Studio", tone: "muted", icon: "clock" });
  const live = { type: "live", kind: "terminal", status: "open", liveId: "l1", deviceId: "dev-1", computer: "Studio", title: "zsh", session: "s1", startedAt: "2026-10-31T12:00:00.000Z" };
  assert.equal(cardOpen(live), true, "a live session's card stays open while it lasts");
  assert.equal(cardOpen({ ...live, status: "ended" }), false);
  assert.deepEqual(cardCheckpoint({ ...live, status: "ended" }, { handle: "lead", roomTitle: "Lead" }).text, "Live terminal on Studio ended");
  assert.equal(cardWords({ ...code }, "lead", "Lead").title, "Sign-in code for az login --use-device-code on Studio");
  assert.equal(cardWords({ type: "login", source: "cli", command: "gh auth login", computer: "Studio", origin: "https://github.com" }, "lead", "Lead").title, "gh auth login on Studio needs you to sign in to GitHub");
});

test("a live session's card names what it shows and where, and whether it still lasts", () => {
  assert.equal(liveTitle({ kind: "terminal", computer: "Studio" }), "Live terminal on Studio");
  assert.equal(liveTitle({ kind: "browser", title: "Pricing — Fieldnote", computer: "Studio" }), "Live browser: Pricing — Fieldnote");
  assert.equal(liveTitle({ kind: "browser", computer: "Studio" }), "Live browser on Studio");
  assert.equal(liveOpen({ status: "open" }), true);
  assert.equal(liveOpen({}), true);
  assert.deepEqual(liveBadge({ status: "ended" }), { label: "Ended", tone: "muted" });
  assert.match(liveLine({ kind: "browser", status: "open" }, "lead"), /Take control to click and type: @lead waits on that tab/);
  assert.match(liveLine({ kind: "terminal", status: "open" }, "lead"), /type in it too: it is your shell/);
});
