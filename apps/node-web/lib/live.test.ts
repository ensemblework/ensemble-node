import assert from "node:assert/strict";
import test from "node:test";
import { busySnapshot, live, roomSnapshot, subscribeBusy, subscribeRoom } from "./live";

test("reply text is applied once per frame, and only its own room hears about it", () => {
  live.reset();
  let roomA = 0;
  let roomB = 0;
  let busy = 0;
  const stops = [subscribeRoom("a", () => (roomA += 1)), subscribeRoom("b", () => (roomB += 1)), subscribeBusy(() => (busy += 1))];
  try {
    live.status("a", "n1", true);
    live.flush();
    assert.deepEqual([roomA, roomB, busy], [1, 0, 1]);
    assert.deepEqual([...busySnapshot()], ["n1"]);

    for (const piece of ["Hel", "lo", ", ", "world"]) live.delta("a", "n1", piece);
    const before = roomSnapshot("a");
    live.flush();
    assert.equal(roomA, 2, "four deltas, one update");
    assert.equal(busy, 1, "text never touches the busy list");
    assert.notEqual(roomSnapshot("a"), before);
    assert.equal(roomSnapshot("a")[0]!.text, "Hello, world");
    assert.equal(roomSnapshot("a"), roomSnapshot("a"), "the same array until the room changes");

    live.delta("a", "n1", "!");
    live.tool("a", "n1", { name: "search", state: "running" });
    live.flush();
    assert.equal(roomSnapshot("a")[0]!.text, "Hello, world!", "text buffered before a tool call is kept in order");
    assert.equal(roomSnapshot("a")[0]!.tools.length, 1);

    live.status("a", "n1", false);
    live.flush();
    assert.deepEqual(roomSnapshot("a"), []);
    assert.equal(busySnapshot().size, 0);
    assert.equal(busy, 2);
    assert.equal(roomB, 0);
  } finally {
    for (const stop of stops) stop();
  }
});

test("a node's first delta marks it busy", () => {
  live.reset();
  live.delta("r", "n2", "Hi");
  live.flush();
  assert.ok(busySnapshot().has("n2"));
});

test("a reply being written keeps the records of every call and of the turn", () => {
  live.reset();
  live.refs("r", "n3", [{ kind: "project", id: "p", label: "Launch" }], true);
  for (let index = 0; index < 8; index += 1) live.tool("r", "n3", { name: `t${index}`, refs: [{ kind: "task", id: `t${index}`, label: `Task ${index}` }] });
  live.flush();
  const row = roomSnapshot("r")[0]!;
  assert.equal(row.tools.length, 6, "only the last calls show");
  assert.equal(row.refs?.length, 9, "every record stays known");
  assert.equal(row.showIds, true);
  live.posted("r", "n3");
  live.flush();
  assert.deepEqual(roomSnapshot("r")[0]!.refs, []);
});
