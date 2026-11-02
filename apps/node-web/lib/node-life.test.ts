import assert from "node:assert/strict";
import test from "node:test";
import { nodeIsResting, normaliseVisits } from "./node-life";

const now = Date.parse("2026-11-02T10:00:00Z");
const day = 24 * 60 * 60 * 1000;

test("four quiet days makes a node sleepy, but a recent visit or real work wakes it", () => {
  assert.equal(nodeIsResting(new Date(now - 4 * day).toISOString(), undefined, now), true);
  assert.equal(nodeIsResting(new Date(now - 3 * day).toISOString(), undefined, now), false);
  assert.equal(nodeIsResting(new Date(now - 9 * day).toISOString(), now - day, now), false);
  assert.equal(nodeIsResting(new Date(now - day).toISOString(), now - 9 * day, now), false);
  assert.equal(nodeIsResting(null, now - 5 * day, now), true);
  assert.equal(nodeIsResting("invalid", undefined, now), false);
  assert.equal(nodeIsResting(new Date(now + day).toISOString(), undefined, now), false);
});

test("visit memory contains only bounded, valid timestamps and retains the most recent nodes", () => {
  const visits = Object.fromEntries(Array.from({ length: 140 }, (_, index) => [`node-${index}`, now - index]));
  const stored = normaliseVisits({ ...visits, future: now + day, invalid: "yesterday", infinity: Infinity, negative: -1 }, now);
  assert.equal(Object.keys(stored).length, 128);
  assert.equal(stored["node-0"], now);
  assert.equal(stored["node-139"], undefined);
  assert.equal(stored.future, undefined);
  assert.deepEqual(normaliseVisits(null, now), {});
});
