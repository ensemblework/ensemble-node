import assert from "node:assert/strict";
import test from "node:test";
import { cardWords } from "./cards";

test("each kind of card says what it asks and what its answers are called", () => {
  assert.deepEqual(cardWords({ type: "post" }, "lead", "Launch"), { title: "Post this in “Launch” for you?", wants: "wants to post for you", approve: "Post", discard: "Discard" });
  assert.equal(cardWords({ type: "post", disclosure: "card-1" }, "lead", "Launch").title, "Post this answer in “Launch” for you?");
  assert.equal(cardWords({ type: "session" }, "lead", "Launch").approve, "Start it");
  assert.deepEqual(cardWords({ type: "session", action: "hand_over", input: { session: "s1", to: "@designer" } }, "lead", "Lead"), { title: "@lead wants to hand a session to @designer", wants: "wants to hand a session to @designer", approve: "Hand it over", discard: "Discard" });
  assert.equal(cardWords({ type: "session", action: "hand_over", input: null }, "lead", "Lead").title, "@lead wants to hand a session to another of your nodes", "a card without its target still reads");
  assert.equal(cardWords({ type: "session", action: "send", input: { prompt: "Add tests" } }, "lead", "Lead").approve, "Start it");
  assert.deepEqual(cardWords({ type: "node_proposal", action: "node" }, "lead", "Lead"), { title: "@lead proposes a new node", wants: "proposes a new node", approve: "Make it", discard: "Discard" });
  assert.equal(cardWords({ type: "node_proposal", action: "crew" }, "lead", "Lead").title, "@lead proposes a crew");
  assert.deepEqual(cardWords({ type: "peer_request", kind: "review", from: { name: "Ben" } }, "lead", "Launch"), { title: "Ben asks you for a review", wants: "brings you Ben's request for a review", approve: "Accept", discard: "Decline" });
  assert.equal(cardWords({ type: "peer_request", kind: "work", from: null }, "lead", "Launch").title, "Someone asks you for work");
  assert.deepEqual(cardWords({ type: "disclosure", mode: "share", asker: { name: "Ben" } }, "lead", "Launch"), { title: "May @lead share this with the room?", wants: "asks before sharing with Ben", approve: "Allow", discard: "Don't share" });
  assert.deepEqual(cardWords({ type: "disclosure", mode: "answer", asker: { name: "Ben" } }, "lead", "Launch"), { title: "Ben asked @lead something", wants: "asks before answering Ben", approve: "Answer", discard: "Don't answer" });
  assert.equal(cardWords({ type: "tools" }, "lead", "Launch").title, "@lead wants to do this for you");
  assert.equal(cardWords(null, "lead", "Launch").approve, "Approve");
});
