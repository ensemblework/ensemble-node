import assert from "node:assert/strict";
import test from "node:test";
import { cardWords, runAgent, runAsk, runCardAgent } from "./cards";

test("each kind of card says what it asks and what its answers are called", () => {
  assert.deepEqual(cardWords({ type: "post" }, "lead", "Launch"), { title: "Post this in “Launch” for you?", wants: "wants to post for you", approve: "Post", discard: "Discard" });
  assert.equal(cardWords({ type: "post", disclosure: "card-1" }, "lead", "Launch").title, "Post this answer in “Launch” for you?");
  assert.deepEqual(cardWords({ type: "post", result: { outcome: "succeeded" } }, "lead", "Launch"), { title: "Post this result in “Launch” for you?", wants: "drafted a result for you to post", approve: "Post", discard: "Discard" });
  assert.deepEqual(cardWords({ type: "post", request: { kind: "work", to: { accountId: "ben", name: "Ben", handle: "ben" } } }, "lead", "Launch"), { title: "Send this request to @ben?", wants: "drafted a request to @ben for you to send", approve: "Send request", discard: "Discard" }, "a request the lead drafted is not a post");
  assert.equal(cardWords({ type: "post", request: { to: { name: "Ben", handle: null } } }, "lead", "Launch").title, "Send this request to Ben?");
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
  assert.deepEqual(cardWords({ type: "media_preview", evidence: [{ id: "e1" }] }, "builder", "Lead"), { title: "@builder has a capture for you to check first", wants: "has a capture for you to check first", approve: "Send", discard: "Discard" });
  assert.equal(cardWords({ type: "media_preview", evidence: [{ id: "e1" }, { id: "e2" }, { id: "e3" }] }, "builder", "Lead").wants, "has 3 captures for you to check first");
  assert.deepEqual(cardWords({ type: "login", origin: "https://ledger.example.com", computer: "Mira's laptop" }, "lead", "Lead"), { title: "@lead needs you to sign in to ledger.example.com", wants: "needs you to sign in to ledger.example.com on Mira's laptop", approve: "Sign in here", discard: "Not now" });
  assert.deepEqual(cardWords({ type: "login", purpose: "human_check", origin: "https://www.walmart.com" }, "lead", "Lead"), { title: "@lead needs you to pass a human check on www.walmart.com", wants: "needs you to pass a human check on www.walmart.com", approve: "Open it here", discard: "Not now" });
  assert.equal(cardWords({ type: "tools" }, "lead", "Launch").title, "@lead wants to do this for you");
  assert.equal(cardWords(null, "lead", "Launch").approve, "Approve");
});

test("a question from the owner's computer, a command as administrator and a node for the crew say what they ask", () => {
  assert.deepEqual(cardWords({ type: "computer", capability: "run", scope: "folder", label: "live-test", deviceName: "Akash's-HomeServer" }, "assistant-3", "Assistant"), {
    title: "@assistant-3 wants to run commands in live-test on Akash's-HomeServer",
    wants: "wants to run commands in live-test on Akash's-HomeServer",
    approve: "Allow",
    discard: "Don't allow",
  });
  assert.equal(cardWords({ type: "computer", capability: "browse", scope: "origin", label: "walmart.com" }, "assistant-3", "Assistant").title, "@assistant-3 wants to browse walmart.com");
  assert.equal(cardWords({ type: "computer", capability: "http", scope: "origin", label: "api.example.com" }, "x", "X").wants, "wants to call api.example.com");
  assert.deepEqual(cardWords({ type: "sudo", command: "apt-get install -y xvfb", deviceName: "Studio" }, "builder", "Builder"), { title: "@builder wants to run a command as administrator on Studio", wants: "wants to run a command as administrator on Studio", approve: "Run as administrator", discard: "Don't run" });
  assert.deepEqual(cardWords({ type: "crew_add", nodeSlug: "tester", nodeName: "Tester" }, "lead", "Software team"), { title: "@lead wants to add @tester to this crew", wants: "wants to add @tester to “Software team”", approve: "Approve", discard: "Not now" });
  assert.equal(cardWords({ type: "crew_add", nodeName: "Tester" }, "lead", "Crew").title, "@lead wants to add Tester to this crew");
  assert.deepEqual(cardWords({ type: "crew_add", nodeSlug: "tester", crewTitle: "Software team" }, "lead", "Lead"), { title: "@lead wants to add @tester to “Software team”", wants: "wants to add @tester to “Software team”", approve: "Approve", discard: "Not now" }, "asked from the lead's own chat, the crew is named");
});

test("a run's own question or permission says which agent asks what", () => {
  const permission = { type: "run_decision", event: "permission", title: "Run python3 search.py?", command: "python3 search.py --q ps5", agent: "copilot" };
  assert.deepEqual(cardWords(permission, "assistant-3", "Assistant 3"), { title: "GitHub Copilot wants to run a command", wants: "has GitHub Copilot asking to run python3 search.py --q ps5", approve: "Allow once", discard: "Don't allow" });
  assert.equal(cardWords({ ...permission, agent: undefined }, "assistant-3", "Assistant 3").title, "@assistant-3's run wants to run a command", "without the agent's name, the node's run asks");
  assert.equal(cardWords({ type: "run_decision", event: "permission", title: "Edit src/app.ts?", engine: "claude-code" }, "a3", "A").title, "Claude Code asks for permission");
  assert.deepEqual(cardWords({ type: "run_decision", event: "question", title: "Which branch should I use?", source: "codex" }, "a3", "A"), { title: "Codex asks you", wants: "has a question from Codex: Which branch should I use?", approve: "Answer", discard: "Skip" });
  assert.equal(runAgent({ source: "other" }), null);
  assert.equal(runAgent({ agentName: "Gemini CLI", engine: "gemini-cli" }), "Gemini CLI");
  assert.equal(runAsk({ title: "Edit src/app.ts?" }), "edit src/app.ts");
  assert.equal(runAsk({ command: "npm test\nnpm run lint" }), "run npm test", "the first line of a long command");
  assert.equal(runCardAgent({ engine: "copilot-cli", model: "gpt-6.1-sol" }), "GitHub Copilot", "from the run's own card");
  assert.equal(runCardAgent({ session: { id: "s1", agent: "Claude Code", agentId: "claude-code" } }), "Claude Code");
  assert.equal(runCardAgent({}), null);
});
