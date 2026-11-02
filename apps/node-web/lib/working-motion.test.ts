import assert from "node:assert/strict";
import test from "node:test";
import { WorkingMotion } from "./working-motion";

test("one cue alternates between available chat and sidebar portraits", context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const motion = new WorkingMotion(() => .5);
  const removeSidebar = motion.register("sidebar-node", "sidebar");
  const removeChat = motion.register("chat-node", "chat");
  assert.equal(motion.getSnapshot(), "sidebar-node");
  context.mock.timers.tick(5999);
  assert.equal(motion.getSnapshot(), "sidebar-node");
  context.mock.timers.tick(1);
  assert.equal(motion.getSnapshot(), "chat-node");
  context.mock.timers.tick(6000);
  assert.equal(motion.getSnapshot(), "sidebar-node");
  removeSidebar();
  assert.equal(motion.getSnapshot(), "chat-node");
  removeChat();
  assert.equal(motion.getSnapshot(), null);
});

test("off-screen or stopped portraits leave the rotation and idle timers stop", context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const motion = new WorkingMotion(() => 0);
  const changes: Array<string | null> = [];
  const unsubscribe = motion.subscribe(() => changes.push(motion.getSnapshot()));
  const first = motion.register("first", "sidebar");
  const second = motion.register("second", "sidebar");
  context.mock.timers.tick(4500);
  assert.equal(motion.getSnapshot(), "second");
  second();
  assert.equal(motion.getSnapshot(), "first");
  const before = changes.length;
  context.mock.timers.tick(50_000);
  assert.equal(changes.length, before, "a lone visible portrait needs no switching timer");
  first();
  context.mock.timers.tick(50_000);
  assert.equal(motion.getSnapshot(), null);
  assert.deepEqual(changes, ["first", "second", "first", null]);
  unsubscribe();
});
