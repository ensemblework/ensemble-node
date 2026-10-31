import assert from "node:assert/strict";
import test from "node:test";
import { canExtend, countdownText, countdownWords, EXTEND_SHOWN_MS, timeLeft } from "./countdown";

test("a countdown reads the time left to its end, never below zero, and nothing without an end", () => {
  const now = Date.parse("2026-10-31T12:00:00.000Z");
  assert.equal(timeLeft("2026-10-31T12:15:00.000Z", now), 15 * 60_000);
  assert.equal(timeLeft("2026-10-31T11:59:00.000Z", now), 0, "past its end");
  assert.equal(timeLeft(null, now), null);
  assert.equal(timeLeft("", now), null);
  assert.equal(timeLeft("not a date", now), null);
  assert.equal(timeLeft(42, now), null);
});

test("the timer reads h:mm:ss, m:ss, and rounds up so 0:00 means the time is up", () => {
  assert.equal(countdownText(2 * 3600_000 - 30_000), "1:59:30");
  assert.equal(countdownText(14 * 60_000 + 32_000), "14:32");
  assert.equal(countdownText(4_200), "0:05");
  assert.equal(countdownText(1), "0:01");
  assert.equal(countdownText(0), "0:00");
  assert.equal(countdownText(-5), "0:00");
  assert.equal(countdownWords(14 * 60_000 + 32_000), "14 minutes 32 seconds left");
  assert.equal(countdownWords(3600_000 + 60_000), "1 hour 1 minute left");
  assert.equal(countdownWords(0), "No time left");
});

test("+15 min shows once five minutes or less are left, and only where the server can add time", () => {
  assert.equal(canExtend(EXTEND_SHOWN_MS + 1000, true), false);
  assert.equal(canExtend(EXTEND_SHOWN_MS, true), true);
  assert.equal(canExtend(30_000, true), true);
  assert.equal(canExtend(30_000, false), false, "an older server");
  assert.equal(canExtend(0, true), false, "too late");
  assert.equal(canExtend(null, true), false);
});
