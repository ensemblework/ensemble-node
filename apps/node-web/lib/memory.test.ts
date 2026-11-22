import assert from "node:assert/strict";
import test from "node:test";
import { memoryEditable, memoryGroups, memoryMarkers } from "./memory";
import type { NodeMemory } from "./types";

const base: NodeMemory = { id: "m1", content: "Run coding work with Copilot.", createdAt: "2026-11-20T09:00:00.000Z", key: null, scope: "node", scopeId: null, scopeTitle: null, ownerWide: false, pinned: false, archived: false, supersededById: null, source: "owner" };
const labels = (memory: Partial<NodeMemory>) => memoryMarkers({ ...base, ...memory }).map((row) => row.label);

test("each memory says whether it is pinned, where it applies, its key and whether it is archived", () => {
  assert.deepEqual(labels({}), [], "the node's own memory: nothing to mark");
  assert.deepEqual(labels({ pinned: true, scope: "owner", ownerWide: true, key: " coding agent " }), ["Pinned", "All your nodes", "Key: coding agent"]);
  assert.deepEqual(labels({ scope: "room", scopeId: "r1", scopeTitle: "Launch" }), ["In “Launch”"]);
  assert.deepEqual(labels({ scope: "room", scopeId: "r1", scopeTitle: null }), ["One conversation"], "a conversation it can no longer name");
  assert.deepEqual(labels({ scope: "project", scopeTitle: "Website" }), ["Project “Website”"]);
  assert.deepEqual(labels({ archived: true }), ["Archived"]);
  assert.equal(memoryMarkers({ ...base, pinned: true })[0]?.tone, "accent");
  assert.deepEqual(memoryMarkers({ id: "old", content: "British spelling", createdAt: "2026-10-01T00:00:00.000Z" }), [], "an older server's memory");
});

test("the list shows live memories, archived ones apart, and leaves out replaced revisions", () => {
  const rows: NodeMemory[] = [
    { ...base, id: "a", pinned: true },
    { ...base, id: "b" },
    { ...base, id: "c", supersededById: "b" },
    { ...base, id: "d", archived: true },
  ];
  const groups = memoryGroups(rows);
  assert.deepEqual(groups.live.map((row) => row.id), ["a", "b"]);
  assert.deepEqual(groups.archived.map((row) => row.id), ["d"]);
  assert.equal(memoryEditable(base), true);
  assert.equal(memoryEditable({ id: "old", content: "x", createdAt: "" }), false, "an older server: delete only");
});
