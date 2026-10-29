import assert from "node:assert/strict";
import test from "node:test";
import { helperThread, helperThreads, isHelperRoom, looseThreads, threadLabel, threadsOfMessage } from "./threads";
import type { Member, NodePublic, Room } from "./types";

const avatar = { shape: "orb" as const, color: "#fff", eyes: "dot" as const };
const node = (id: string, parentNodeId: string | null = null): NodePublic => ({ id, ownerId: "me", slug: id, name: id[0]!.toUpperCase() + id.slice(1), role: "r", avatar, status: "active", parentNodeId });
const member = (value: NodePublic): Member => ({ id: `m-${value.id}`, kind: "node", handle: value.slug, accountId: "me", representative: false, lead: false, node: value });
const me: Member = { id: "m-me", kind: "person", handle: "mira", accountId: "me", role: "owner", name: "Mira", responsibility: null, me: true };
const room = (id: string, kind: Room["kind"], members: Member[], extra: Partial<Room> = {}): Room => ({ id, kind, title: id, createdBy: "me", lastSeq: 4, lastMessageAt: "2026-10-29T10:00:00Z", leadNodeIds: [], pinned: [], invites: [], members: [me, ...members], ...extra });

const lead = node("lead");
const scout = node("lead-scout", "lead");
const task = room("task", "task", [member(lead), member(scout)], { title: "Lead · Scout" });
const dm = room("dm", "dm", [member(lead)]);
const crew = room("crew", "crew", [member(lead), member(node("builder"))]);

test("a helper's task room is a thread: its helper, its parent, and Ensemble's marks when they come", () => {
  assert.equal(isHelperRoom(task), true);
  assert.equal(isHelperRoom(dm), false);
  assert.deepEqual(helperThread(task), { roomId: "task", title: "Lead · Scout", helper: scout, parent: lead, originRoomId: null, originMessageId: null, count: 4, lastMessageAt: "2026-10-29T10:00:00Z" });
  const marked = helperThread({ ...task, settings: { originRoomId: "crew", helperNodeId: "lead-scout", parentNodeId: "lead" }, originMessageId: "m9" });
  assert.equal(marked?.originRoomId, "crew");
  assert.equal(marked?.originMessageId, "m9");
  assert.deepEqual(helperThreads([dm, task, crew]).map((row) => row.roomId), ["task"]);
  assert.equal(threadLabel(helperThread(task)!, true), "@lead-scout, helper of @lead · working · 4 messages");
  assert.equal(threadLabel({ ...helperThread(task)!, count: 1 }, false), "@lead-scout, helper of @lead · quiet · 1 message");
});

test("the message that brought a helper in shows its thread; others do not", () => {
  const threads = helperThreads([task]);
  const reply = { id: "m1", roomId: "dm", authorNodeId: "lead", data: { tools: [{ id: "c1", name: "node_helper", summary: "@lead-scout is on it in “Lead · Scout”; it reports back to you there.", href: null }] } };
  assert.deepEqual(threadsOfMessage(reply, threads).map((row) => row.roomId), ["task"]);
  assert.deepEqual(threadsOfMessage({ ...reply, data: { tools: [{ ...reply.data.tools[0]!, summary: "Asked “Lead · Scout” to look." }] } }, threads).length, 1, "by the room's title");
  assert.deepEqual(threadsOfMessage({ ...reply, authorNodeId: "builder" }, threads), [], "another node's message");
  assert.deepEqual(threadsOfMessage({ ...reply, data: { tools: [{ ...reply.data.tools[0]!, state: "failed" }] } }, threads), [], "a call that failed made no helper");
  assert.deepEqual(threadsOfMessage({ ...reply, data: { tools: [{ ...reply.data.tools[0]!, summary: "@lead-scoutx is on it" }] } }, threads), []);
  assert.deepEqual(threadsOfMessage({ ...reply, data: {} }, helperThreads([{ ...task, originMessageId: "m1" }])).map((row) => row.roomId), ["task"], "Ensemble's mark");
  assert.deepEqual(threadsOfMessage(reply, helperThreads([{ ...task, originRoomId: "crew" }])), [], "made in another conversation");
});

test("threads no loaded message shows stay reachable in their conversation", () => {
  const threads = helperThreads([task]);
  assert.deepEqual(looseThreads(threads, new Set(), dm).map((row) => row.roomId), ["task"], "the parent's direct chat, without marks");
  assert.deepEqual(looseThreads(threads, new Set(["task"]), dm), [], "already under its message");
  assert.deepEqual(looseThreads(threads, new Set(), crew), []);
  const marked = helperThreads([{ ...task, originRoomId: "crew" }]);
  assert.deepEqual(looseThreads(marked, new Set(), crew).map((row) => row.roomId), ["task"]);
  assert.deepEqual(looseThreads(marked, new Set(), dm), []);
});
