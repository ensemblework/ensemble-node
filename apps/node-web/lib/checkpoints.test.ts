import assert from "node:assert/strict";
import test from "node:test";
import { approvalCheckpoint, cardCheckpoint, cardOpen, computerAnswered, computerChoices, computerDecision, computerOptions, decisionCheckpoint, runDecisionAnswered, siteName, withLocalAnswer } from "./checkpoints";
import type { AgentDecision } from "./types";

const where = { handle: "assistant-3", roomTitle: "Launch" };
const words = (data: Record<string, unknown>) => cardCheckpoint(data, where).text;

test("a card stays open while it waits or its answer is carried out, and folds once it is settled", () => {
  for (const status of ["pending", "needs_code", "applying", "saving", "working", "running", undefined]) assert.equal(cardOpen({ status }), true, String(status));
  for (const status of ["allowed", "denied", "expired", "done", "failed", "applied", "discarded", "saved", "signed_in", "passed", "released", "posted", "approved", "answered", "closed"]) assert.equal(cardOpen({ status }), false, status);
});

test("a computer's question folds into who was allowed to do what, with the option picked", () => {
  const browse = { type: "computer", capability: "browse", scope: "origin", label: "walmart.com", deviceName: "Akash's-HomeServer" };
  const folder = { type: "computer", capability: "run", scope: "folder", label: "live-test", deviceName: "Akash's-HomeServer" };
  assert.deepEqual(cardCheckpoint({ ...browse, status: "allowed", answer: "Once" }, where), { text: "Allowed @assistant-3 to browse walmart.com · Once", tone: "ok", icon: "check" });
  assert.equal(words({ ...folder, status: "allowed", answer: "Always for this folder" }), "Allowed @assistant-3 to run commands in live-test · Always for this folder");
  assert.deepEqual(cardCheckpoint({ ...folder, status: "denied", answer: "No" }, where), { text: "Didn't allow @assistant-3 to run commands in live-test", tone: "muted", icon: "x" });
  assert.equal(cardCheckpoint({ ...folder, status: "expired" }, where).icon, "clock");
  assert.equal(words({ type: "computer", capability: "http", scope: "origin", label: "api.example.com", status: "allowed", answer: "This mission" }), "Allowed @assistant-3 to call api.example.com · This mission");
  assert.equal(words({ type: "computer", capability: "read", scope: "folder", label: "reports", status: "allowed" }), "Allowed @assistant-3 to share files in reports");
});

test("answering a computer's question sends the option as the reason, and the card reads answered at once", () => {
  assert.deepEqual(computerOptions({ options: ["Once", "This mission", "Always for this folder", "Once", 3, " "] }), ["Once", "This mission", "Always for this folder"]);
  assert.deepEqual(computerOptions({}), ["Once"], "a card without options still allows once");
  assert.deepEqual(computerChoices({ scope: "folder", options: ["Once", "This mission", "Always for this folder"] }), [
    { option: "Always for this folder", label: "Allow in this folder from now on" },
    { option: "This mission", label: "Only this mission" },
    { option: "Once", label: "Just once" },
  ], "asked at most once per folder: the lasting answer comes first");
  assert.deepEqual(computerChoices({ scope: "origin", options: ["Once", "Always for this address", "Ask the team"] }).map((row) => row.label), ["Allow this address from now on", "Just once", "Ask the team"]);
  assert.deepEqual(computerChoices({}), [{ option: "Once", label: "Just once" }]);
  assert.deepEqual(computerDecision("Always for this folder"), { decision: "allow", scope: "once", reason: "Always for this folder" });
  assert.deepEqual(computerDecision(null), { decision: "deny", scope: "once" });
  const now = new Date("2026-10-31T01:00:00Z");
  const local = computerAnswered("This mission", now);
  assert.deepEqual(local, { status: "allowed", answer: "This mission", answeredAt: "2026-10-31T01:00:00.000Z" });
  assert.deepEqual(computerAnswered(null, now).status, "denied");
  const card = { type: "computer", status: "pending", answer: null };
  assert.deepEqual(withLocalAnswer(card, local), { type: "computer", status: "allowed", answer: "This mission", answeredAt: "2026-10-31T01:00:00.000Z" });
  assert.equal(withLocalAnswer({ ...card, status: "denied", answer: "No" }, local).status, "denied", "once Ensemble settled the card, its answer wins");
  assert.equal(withLocalAnswer(card, undefined), card);
});

test("a command run as administrator folds into what ran and how it ended", () => {
  const sudo = { type: "sudo", command: "apt-get install -y xvfb" };
  assert.deepEqual(cardCheckpoint({ ...sudo, status: "done", exitCode: 0 }, where), { text: "Ran as administrator: apt-get install -y xvfb · exit 0", tone: "ok", icon: "check" });
  assert.deepEqual(cardCheckpoint({ ...sudo, status: "done", exitCode: 100 }, where), { text: "Ran as administrator: apt-get install -y xvfb · failed, exit 100", tone: "danger", icon: "alert" });
  assert.equal(cardCheckpoint({ ...sudo, status: "failed", error: "sudo: a password is required" }, where).text, "Couldn't run as administrator: apt-get install -y xvfb");
  assert.equal(words({ ...sudo, status: "denied" }), "Didn't run as administrator: apt-get install -y xvfb");
  assert.equal(words({ ...sudo, status: "expired" }), "No answer in time: apt-get install -y xvfb was not run");
  assert.deepEqual(cardCheckpoint({ ...sudo, status: "failed", exitCode: 100, error: "It ended with exit code 100." }, where), { text: "Ran as administrator: apt-get install -y xvfb · failed, exit 100", tone: "danger", icon: "alert" }, "Ensemble calls a bad exit failed");
});

test("every other card folds into its own words", () => {
  assert.equal(words({ type: "crew_add", status: "approved", nodeSlug: "tester", nodeName: "Tester" }), "Added @tester to the crew");
  assert.equal(words({ type: "crew_add", status: "discarded", nodeSlug: "tester" }), "Didn't add @tester to the crew");
  assert.equal(words({ type: "crew_add", status: "approved", nodeSlug: "tester", handle: "tester-2", crewTitle: "Software team" }), "Added @tester-2 to “Software team”", "asked from another chat, the crew is named, with the handle it got");
  assert.equal(words({ type: "crew_add", status: "approved", nodeSlug: "tester", crewTitle: "Launch" }), "Added @tester to the crew", "asked in the crew itself");
  assert.equal(words({ type: "secret", status: "saved", name: "STRIPE_KEY" }), "Saved secret STRIPE_KEY");
  assert.equal(words({ type: "secret", status: "discarded", name: "STRIPE_KEY" }), "Declined secret STRIPE_KEY");
  assert.equal(words({ type: "login", status: "signed_in", origin: "https://github.com" }), "Signed in to github.com");
  assert.equal(words({ type: "login", status: "declined", origin: "https://github.com" }), "Didn't sign in to github.com");
  assert.equal(words({ type: "media_preview", status: "released", evidence: [{ id: "a" }, { id: "b" }, { id: "c" }] }), "Sent 3 captures");
  assert.equal(words({ type: "media_preview", status: "discarded", evidence: [{ id: "a" }] }), "Discarded a capture");
  assert.equal(words({ type: "tools", status: "applied", calls: [{ name: "hub_create_tasks" }, { name: "hub_update_page" }] }), "Approved: Create tasks, Update page");
  assert.deepEqual(cardCheckpoint({ status: "applied", calls: [{ name: "hub_create_tasks" }], result: { failed: [{ name: "hub_create_tasks", error: "x" }] } }, where).tone, "warn");
  assert.equal(words({ status: "discarded", calls: [{ name: "a" }, { name: "b" }, { name: "c" }, { name: "d" }, { name: "e" }] }), "Discarded: A, B, C +2");
  assert.equal(words({ type: "session", action: "start", status: "applied", input: { title: "Fix the login redirect" } }), "Started work on your computer: Fix the login redirect");
  assert.equal(words({ type: "session", action: "hand_over", status: "applied", input: { to: "designer" } }), "Handed the session to @designer");
  assert.equal(words({ type: "post", status: "posted" }), "Posted in “Launch”");
  assert.equal(words({ type: "post", status: "discarded" }), "Didn't post the draft");
  assert.equal(words({ type: "post", status: "posted", result: { outcome: "succeeded" } }), "Posted the result in “Launch”");
  assert.equal(words({ type: "post", status: "posted", request: { to: { handle: "ben", name: "Ben" } } }), "Sent the request to @ben");
  assert.equal(words({ type: "node_proposal", action: "node", status: "applied", input: { name: "Docs" }, result: { handle: "docs" } }), "Made @docs");
  assert.equal(words({ type: "node_proposal", action: "crew", status: "discarded", input: { title: "Launch crew" } }), "Didn't make the crew “Launch crew”");
  assert.equal(words({ type: "peer_request", status: "accepted", kind: "review", from: { name: "Ben" } }), "Accepted Ben's request for a review");
  assert.equal(words({ type: "disclosure", status: "declined", mode: "share", asker: { name: "Ben" } }), "Didn't share with Ben");
  assert.equal(words({ type: "disclosure", status: "approved", mode: "answer", asker: { name: "Ben" } }), "Let @assistant-3 answer Ben");
  assert.equal(words({ type: "something_new", status: "expired" }), "No answer in time");
  assert.equal(siteName("https://accounts.google.com/signin"), "accounts.google.com");
  assert.equal(siteName("ledger.example.com/x"), "ledger.example.com");
});

test("a run's own questions fold into what was answered", () => {
  const row = (more: Partial<AgentDecision>): AgentDecision => ({ id: "d", source: "ensemble", event: "permission", toolName: "Bash", title: "Run npm test?", detail: { command: "npm test" }, cwd: null, status: "decided", requestedAt: "2026-10-31T00:00:00Z", expiresAt: "2026-10-31T01:00:00Z", ...more });
  assert.deepEqual(decisionCheckpoint(row({ decision: "allow", scope: "once" })), { text: "Allowed once: npm test", tone: "ok", icon: "check" });
  assert.equal(decisionCheckpoint(row({ decision: "allow", scope: "session" })).text, "Allowed for this run: npm test");
  assert.equal(decisionCheckpoint(row({ decision: "allow", scope: "always" })).text, "Always allowed: npm test", "a standing rule is not once");
  assert.deepEqual(decisionCheckpoint(row({ decision: "deny" })), { text: "Denied: npm test", tone: "muted", icon: "x" });
  assert.equal(decisionCheckpoint(row({ event: "question", title: "Which database?", detail: { options: ["Postgres", "SQLite"] }, decision: "allow", reason: "SQLite" })).text, "Answered “SQLite”");
  assert.equal(decisionCheckpoint(row({ event: "question", title: "Which database?", detail: { options: ["Postgres", "SQLite"] }, decision: "deny" })).text, "Skipped, the agent chose: Which database?");
  assert.equal(decisionCheckpoint(row({ status: "expired" })).icon, "clock");
  assert.deepEqual(approvalCheckpoint({ title: "Push to main", decision: "approved" }), { text: "Approved: Push to main", tone: "ok", icon: "check" });
  assert.equal(approvalCheckpoint({ title: "Push to main", decision: "rejected" }).text, "Rejected: Push to main");
});

test("a sign-in or a human check folds into how it ended", () => {
  assert.equal(words({ type: "login", status: "passed", purpose: "human_check", origin: "https://www.walmart.com" }), "Passed the human check on www.walmart.com");
  assert.equal(words({ type: "login", status: "declined", purpose: "human_check", origin: "https://www.walmart.com" }), "Skipped the human check on www.walmart.com");
  assert.equal(words({ type: "login", status: "expired", purpose: "human_check", origin: "https://www.walmart.com" }), "No answer in time: human check on www.walmart.com");
  assert.equal(words({ type: "login", status: "ended", origin: "https://portal.azure.com" }), "Sign-in to portal.azure.com ended");
  assert.equal(words({ type: "login", status: "signed_in", origin: "https://portal.azure.com", via: "takeover" }), "Signed in to portal.azure.com");
});

test("a run's question folds into what was decided, by whom, and how far it goes", () => {
  const permission = { type: "run_decision", event: "permission", title: "Run python3 search.py?", command: "python3 search.py", agent: "copilot" };
  assert.deepEqual(cardCheckpoint({ ...permission, status: "answered", decision: "allow", answer: null }, where), { text: "Allowed GitHub Copilot to run python3 search.py · Once", tone: "ok", icon: "check" });
  assert.equal(words({ ...permission, status: "answered", decision: "allow", scope: "session" }), "Allowed GitHub Copilot to run python3 search.py · For this run");
  assert.deepEqual(cardCheckpoint({ ...permission, status: "answered", decision: "deny" }, where), { text: "Didn't allow GitHub Copilot to run python3 search.py", tone: "muted", icon: "x" });
  assert.equal(words({ ...permission, status: "answered", decision: "allow", answeredBy: "node" }), "@assistant-3 allowed GitHub Copilot to run python3 search.py · Once", "its node answered");
  assert.equal(words({ ...permission, agent: undefined, status: "answered", decision: "allow" }), "Allowed the agent to run python3 search.py · Once");
  assert.equal(cardCheckpoint({ ...permission, status: "expired" }, where).icon, "clock");
  assert.equal(words({ ...permission, status: "closed" }), "The run ended before an answer: GitHub Copilot asked to run python3 search.py");
  const question = { type: "run_decision", event: "question", title: "Which branch?", options: ["main", "develop"], agent: "codex" };
  assert.equal(words({ ...question, status: "answered", decision: "allow", answer: "Use main" }), "Answered: “Use main”");
  assert.equal(words({ ...question, status: "answered", decision: "deny" }), "Skipped, the agent chose: Which branch?");
  assert.equal(words({ ...question, status: "expired" }), "No answer in time: Which branch?");
  // Answered here: the card reads answered at once, with what was sent.
  const local = runDecisionAnswered({ decision: "allow", scope: "once", reason: "Use main" }, new Date("2026-10-31T01:00:00Z"));
  assert.deepEqual(local, { status: "answered", answer: "Use main", answeredAt: "2026-10-31T01:00:00.000Z", decision: "allow", scope: "once" });
  assert.equal(words(withLocalAnswer({ ...question, status: "pending" }, local)), "Answered: “Use main”");
  assert.equal(words(withLocalAnswer({ ...permission, status: "pending" }, runDecisionAnswered({ decision: "allow", scope: "once" }))), "Allowed GitHub Copilot to run python3 search.py · Once");
});
