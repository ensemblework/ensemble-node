import assert from "node:assert/strict";
import test from "node:test";
import { faceFromStatus, normalizeFace } from "./node-face.js";

test("older shapes and eyes map onto the set the lab ships", () => {
  assert.deepEqual(normalizeFace({ shape: "puff", eyes: "wide", color: "#D7B56F" }), {
    shape: "bloom", eyes: "dot", state: "idle", color: "#D7B56F", think: "t1", work: "w1",
  });
  assert.equal(normalizeFace({ shape: "capsule", eyes: "line" }).shape, "pebble");
  assert.equal(normalizeFace({ shape: "capsule", eyes: "line" }).eyes, "sleepy");
  assert.equal(normalizeFace({ eyes: "star" }).eyes, "dot");
  assert.equal(normalizeFace({ eyes: "soft" }).eyes, "dot");
  assert.equal(normalizeFace({ shape: "gumdrop", eyes: "happy" }).shape, "gumdrop");
  assert.equal(normalizeFace({ state: "listening" }).state, "idle");
  assert.equal(normalizeFace({ state: "success" }).state, "idle");
  assert.equal(normalizeFace({ shape: "nope", color: "gold" }).shape, "orb");
  assert.equal(normalizeFace({ shape: "nope", color: "gold" }).color, "#D7B56F");
});

test("live status uses the lab's default thinking orbit and laptop, and never listening or success", () => {
  assert.equal(faceFromStatus({}).state, "idle");
  assert.deepEqual(faceFromStatus({ thinking: true }), { state: "thinking", think: "t1", work: "w1" });
  assert.equal(faceFromStatus({ thinking: true, workZone: "chat" }).state, "working");
  assert.equal(faceFromStatus({ resting: true }).state, "sleeping");
  assert.equal(faceFromStatus({ attention: true }).state, "error");
  assert.equal(faceFromStatus({ thinking: true, attention: true }).state, "error");
  assert.equal(faceFromStatus({ thinking: true, resting: true, workZone: "sidebar" }).state, "thinking");
});

