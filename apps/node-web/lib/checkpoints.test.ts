import assert from "node:assert/strict";
import test from "node:test";
import { approvalCheckpoint, cardCheckpoint, cardOpen, choiceHint, computerAnswered, computerAskInfo, computerChoices, computerDecision, computerOptions, decisionCheckpoint, planDecisionChoices, planDecisionStep, runDecisionAnswered, siteName, withLocalAnswer } from "./checkpoints";
import type { AgentDecision } from "./types";

const where = { handle: "assistant-3", roomTitle: "Launch" };
const words = (data: Record<string, unknown>) => cardCheckpoint(data, where).text;

test("confirmed session deletion checkpoints never claim that new work started", () => {
  assert.equal(words({ type: "session", action: "delete", status: "applied" }), "Deleted agent session · project files kept");
  assert.equal(words({ type: "session", action: "delete", status: "discarded" }), "Kept the agent session");
});

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

test("the agent's own calls and an app on the owner's screen offer exactly Ensemble's answers, one press each", () => {
  const write = { type: "computer", capability: "run", scope: "folder", label: "~/projects/site", deviceName: "Laptop", options: ["Allow changes and commands", "Allow changes and commands for this run"] };
  const program = { type: "computer", capability: "run", scope: "folder", label: "crontab", options: ["Allow once", "Allow for this run"], call: "crontab -e" };
  const unnamed = { type: "computer", capability: "files", scope: "folder", label: "files it does not name", options: ["Allow once"] };
  const address = { type: "computer", capability: "http", scope: "origin", label: "http://192.168.1.20:8080", options: ["Allow this address", "Allow this address for this run"] };
  const app = { type: "computer", capability: "desktop", scope: "app", label: "Bitwarden", options: ["This mission"] };
  const labels = (data: Record<string, unknown>) => computerChoices(data).map((row) => row.label);
  assert.deepEqual(labels(write), ["Allow", "Allow for this run"], "in Ensemble's order; the title says what for");
  assert.deepEqual(labels(program), ["Allow once", "Allow for this run"]);
  assert.deepEqual(labels(unnamed), ["Allow once"], "a call that names no path: once only");
  assert.deepEqual(labels(address), ["Allow", "Allow for this run"]);
  assert.deepEqual(computerChoices(app), [{ option: "This mission", label: "This mission" }], "an app on the owner's screen: this mission only");
  for (const data of [write, program, unnamed, address, app]) assert.deepEqual(computerChoices(data).map((row) => row.option), data.options, "each button sends Ensemble's own words, in its order");
  assert.deepEqual(computerDecision("Allow changes and commands for this run"), { decision: "allow", scope: "once", reason: "Allow changes and commands for this run" }, "Ensemble reads the answer from its own words");
  assert.equal(choiceHint("Allow changes and commands", write), "Changes and commands in ~/projects/site, from now on");
  assert.equal(choiceHint("Allow changes and commands for this run", write), "Changes and commands in ~/projects/site, in this chat for up to 30 days");
  assert.equal(choiceHint("Allow this address for this run", address), "Calls to http://192.168.1.20:8080, in this chat for up to 30 days");
  assert.equal(choiceHint("Allow once", program), "Only this call");
  assert.equal(choiceHint("Allow for this run", program), "Covers this chat, for up to 30 days");
  const step = { plan: { id: "plan-1", step: "s2" } };
  assert.equal(choiceHint("Allow changes and commands for this run", { ...write, ...step }), "Changes and commands in ~/projects/site, for this plan's work", "a card from a plan's step: that plan");
  assert.equal(choiceHint("Allow for this run", { ...program, ...step }), "Covers this plan's work");
  assert.equal(choiceHint("This mission", app), "Until this piece of work ends");
  assert.equal(choiceHint("Always for this folder", { scope: "folder", label: "live-test", deviceName: "Studio", options: ["Once", "Always for this folder"] }), "From now on, for this node in live-test on Studio");
  assert.equal(choiceHint("Once", { scope: "origin", options: ["Once"] }), "Only this call");
});

test("a computer card's ⓘ says how far each answer goes: the plan's work, else the chat for up to 30 days", () => {
  const write = { type: "computer", capability: "run", scope: "folder", label: "~/projects/site", options: ["Allow changes and commands", "Allow changes and commands for this run"] };
  const program = { type: "computer", capability: "run", scope: "folder", label: "crontab", options: ["Allow once", "Allow for this run"], call: "crontab -e" };
  const address = { type: "computer", capability: "http", scope: "origin", label: "http://192.168.1.20:8080", options: ["Allow this address", "Allow this address for this run"] };
  const step = { plan: { id: "plan-1", step: "s2" } };
  assert.equal(computerAskInfo(write), "Your agent's own tools, on your AI plan, want to change files or run commands here. Allow covers them in this folder from now on. Allow for this run covers this chat, for up to 30 days.");
  assert.match(computerAskInfo({ ...address, ...step }) ?? "", /Allow covers it from now on\. Allow for this run covers this plan's work\.$/);
  assert.match(computerAskInfo(program) ?? "", /never allowed for good\. Allow for this run covers this chat, for up to 30 days\.$/);
  assert.equal(computerAskInfo({ type: "computer", scope: "folder", options: ["Allow once"] }), "A call that names no file or folder is asked about each time.");
  assert.equal(computerAskInfo({ type: "computer", scope: "folder", options: ["Once", "This mission", "Always for this folder"] }), null, "the node's own computer tools: no ⓘ");
  for (const data of [write, program, address, { ...write, ...step }, { type: "computer", scope: "app", options: ["This mission"] }]) assert.doesNotMatch(computerAskInfo(data) ?? "", /\u2014|--|until this run ends/);
});

test("an answer about the agent's own calls or an app folds into who was allowed what, and for how long", () => {
  const program = { type: "computer", capability: "run", scope: "folder", label: "crontab", options: ["Allow once", "Allow for this run"], call: "crontab -e" };
  assert.deepEqual(cardCheckpoint({ ...program, status: "allowed", answer: "Allow for this run" }, where), { text: "Allowed @assistant-3 to run crontab · For this run", tone: "ok", icon: "check" });
  assert.equal(words({ ...program, call: "Use: write_file from desktop-commander", label: "write_file from desktop-commander", status: "allowed", answer: "Allow once" }), "Allowed @assistant-3 to use write_file from desktop-commander · Once");
  assert.equal(words({ type: "computer", capability: "run", scope: "folder", label: "~/site", options: ["Allow changes and commands", "Allow changes and commands for this run"], status: "allowed", answer: "Allow changes and commands" }), "Allowed @assistant-3 to run commands in ~/site · From now on");
  assert.equal(words({ type: "computer", capability: "files", scope: "folder", label: "files it does not name", options: ["Allow once"], status: "denied", answer: "No" }), "Didn't allow @assistant-3 to change files it does not name");
  assert.equal(words({ type: "computer", capability: "desktop", scope: "app", label: "Bitwarden", options: ["This mission"], status: "allowed", answer: "This mission" }), "Allowed @assistant-3 to use Bitwarden on your screen · This mission");
  assert.equal(words({ type: "computer", capability: "desktop", scope: "app", label: "the pointer and keyboard", options: ["This mission"], status: "expired" }), "No answer in time: @assistant-3 asked to use the pointer and keyboard on your screen");
  assert.equal(words({ type: "computer", capability: "desktop", scope: "app", screen: "agent", label: "Terminal", options: ["This mission"], status: "allowed", answer: "This mission" }), "Allowed @assistant-3 to use Terminal on its own screen · This mission", "an app on the node's own agent screen");
  assert.equal(words({ type: "computer", capability: "desktop", scope: "app", screen: "owner", label: "Bitwarden", options: ["This mission"], status: "denied", answer: "No" }), "Didn't allow @assistant-3 to use Bitwarden on your screen");
  const local = computerAnswered("Allow for this run", new Date("2026-11-21T10:00:00Z"));
  assert.equal(words(withLocalAnswer({ ...program, status: "pending" }, local)), "Allowed @assistant-3 to run crontab · For this run", "an answer given here reads at once");
});

test("an own call of a kind the card does not make clear keeps Ensemble's words on its buttons and checkpoint", () => {
  const neutral = { type: "computer", capability: "run", scope: "folder", label: "crontab", call: "crontab -e", options: ["Allow changes and commands", "Allow until this run ends"] };
  assert.deepEqual(computerChoices(neutral), [{ option: "Allow changes and commands", label: "Allow changes and commands" }, { option: "Allow until this run ends", label: "Allow until this run ends" }], "whole, in Ensemble's order");
  assert.equal(words({ ...neutral, status: "allowed", answer: "Allow until this run ends" }), "Allowed @assistant-3 to use its own tools for crontab · Allow until this run ends");
  assert.equal(words({ ...neutral, status: "denied", answer: "No" }), "Didn't allow @assistant-3 to use its own tools for crontab");
});

test("a stuck plan step's card folds into the choice made, or that the plan moved on", () => {
  const card = { type: "plan_decision", plan: { id: "p1", step: "s2" }, attempt: 2, why: "same_error", question: "@tester's step in @lead's plan keeps failing the same way. Try it again, or finish the plan without it?", approveLabel: "Try again", discardLabel: "Finish without it" };
  assert.equal(planDecisionStep(card), "@tester's step");
  assert.equal(planDecisionStep({ question: "Something else" }), "the stuck step");
  assert.equal(cardOpen({ ...card, status: "pending" }), true);
  assert.equal(cardOpen({ ...card, status: "applying" }), true, "while its answer is carried out");
  assert.deepEqual(cardCheckpoint({ ...card, status: "approved" }, where), { text: "Chose “Try again” for @tester's step", tone: "ok", icon: "check" });
  assert.deepEqual(cardCheckpoint({ ...card, status: "discarded" }, where), { text: "Chose “Finish without it” for @tester's step", tone: "muted", icon: "x" });
  assert.equal(words({ ...card, approveLabel: "Redo with the new version", status: "approved" }), "Chose “Redo with the new version” for @tester's step");
  assert.deepEqual(cardCheckpoint({ ...card, status: "expired" }, where), { text: "The plan moved on before an answer about @tester's step", tone: "muted", icon: "clock" });
});

test("a stuck plan step's card offers Ensemble's two answers, one press each, with what each does", () => {
  const choices = planDecisionChoices({ type: "plan_decision", why: "stuck", approveLabel: "Try again", discardLabel: "Finish without it" });
  assert.deepEqual(choices, { approve: { label: "Try again", hint: "the step runs once more" }, discard: { label: "Finish without it", hint: "the plan ends without this step" } });
  const conflict = planDecisionChoices({ type: "plan_decision", why: "conflict", approveLabel: "Redo with the new version", discardLabel: "Keep the result" });
  assert.deepEqual([conflict.approve.label, conflict.discard.label], ["Redo with the new version", "Keep the result"]);
  assert.equal(conflict.discard.hint, "its result stands as it is");
  assert.deepEqual([planDecisionChoices({ why: "conflict" }).approve.label, planDecisionChoices({ why: "conflict" }).discard.label], ["Redo with the new version", "Keep the result"], "a card without its labels reads by why it was asked");
  assert.equal(words({ type: "plan_decision", why: "conflict", question: "@writer's step in @lead's plan: x changed", status: "discarded" }), "Chose “Keep the result” for @writer's step");
  for (const row of [choices, conflict]) for (const text of [row.approve.label, row.approve.hint, row.discard.label, row.discard.hint]) assert.doesNotMatch(text, /\u2014|--/);
});
