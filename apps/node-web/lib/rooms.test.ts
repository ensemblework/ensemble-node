import assert from "node:assert/strict";
import test from "node:test";
import { awayLine, awayUntil, canShare, candidateText, disclosureState, isPeopleRoom, joinedRefusal, leadsStatus, liveTabOf, ownerCardState, readTab, requestBody, requestKind, requestProblems, requestRole, requestState, requestUndecided, sharedCopy, sharedLabel, statusCardView, tabMarker, tabOf, tabUnreadOf, withTab, type RequestDraft } from "./rooms";
import type { Message, StatusCard } from "./types";

const message = (seq: number, extra: Partial<Message> = {}): Message => ({
  id: `m${seq}`,
  roomId: "room",
  seq,
  authorKind: "human",
  authorAccountId: "ben",
  authorNodeId: null,
  kind: "text",
  body: `Message ${seq}`,
  data: {},
  private: false,
  mentions: [],
  rootMessageId: null,
  clientId: null,
  createdAt: "2026-10-30T10:00:00Z",
  ...extra,
});

test("a room with other people has a Room and a My crew; private messages are My crew", () => {
  assert.equal(isPeopleRoom({ kind: "room" }), true);
  assert.equal(isPeopleRoom({ kind: "crew" }), false);
  assert.equal(tabOf(message(1)), "room");
  assert.equal(tabOf(message(2, { private: true, authorKind: "node", authorAccountId: "me", authorNodeId: "lead" })), "crew");
});

test("each tab has its own unread and read marker, as Ensemble keeps them", () => {
  const room = { lastSeq: 9, readSeq: 4, readSeqCrew: 7, unread: 5, unreadRoom: 3, unreadCrew: 2 };
  assert.deepEqual(tabUnreadOf(room), { room: 3, crew: 2 });
  assert.deepEqual(tabUnreadOf({ unread: 4 }), { room: 4, crew: 0 }, "an older server counted the room as one");
  assert.deepEqual([tabMarker(room, "room"), tabMarker(room, "crew")], [4, 7]);
  assert.equal(tabMarker({ lastSeq: 9, readSeq: 4 }, "crew"), 4, "no crew marker yet: the room's");
  const read = readTab(room, "crew", 9);
  assert.deepEqual([read.readSeqCrew, read.readSeq, read.unreadCrew, read.unreadRoom, read.unread], [9, 4, 0, 3, 3], "reading My crew leaves the Room's news");
  assert.equal(readTab(room, "room", 2, 3).readSeq, 4, "a marker never moves back");
  assert.deepEqual(withTab(room, "room", 1, 6), { ...room, readSeq: 1, unreadRoom: 6, unreadCrew: 2, unread: 8 }, "put back as it was when the server refused");
});

test("only my own private messages and my nodes' private replies can be shared to the room", () => {
  const mine = message(1, { private: true, authorAccountId: "me" });
  const reply = message(2, { private: true, authorKind: "node", authorAccountId: "me", authorNodeId: "lead" });
  assert.equal(canShare(mine, "me"), true);
  assert.equal(canShare(reply, "me"), true);
  assert.equal(canShare({ ...reply, private: false }, "me"), false, "already in the room");
  assert.equal(canShare({ ...reply, kind: "plan" }, "me"), false, "cards stay in My crew");
  assert.equal(canShare({ ...mine, data: { deleted: true } }, "me"), false);
  assert.equal(canShare({ ...mine, sending: true }, "me"), false);
  assert.equal(canShare(message(3, { private: true }), "me"), false, "someone else's");
  const copy = message(9, { authorAccountId: "me", data: { sharedFrom: { id: "m2", seq: 2, authorKind: "node", authorNodeId: "lead" } } });
  assert.equal(sharedCopy([mine, reply, copy], "m2"), copy);
  assert.equal(sharedCopy([mine, reply, copy], "m1"), undefined);
});

test("@leads status is recognised with its punctuation and nothing else", () => {
  for (const text of ["@leads status", "@Leads: status!", " @leads, status? ", "@leads — status"]) assert.equal(leadsStatus(text), true, text);
  for (const text of ["@leads status please", "status", "@lead status", "hey @leads status"]) assert.equal(leadsStatus(text), false, text);
});

const card = (extra: Partial<StatusCard> = {}): StatusCard => ({ accountId: "ben", name: "Ben", handle: "ben", lead: { nodeId: "scout", handle: "scout", name: "Scout" }, presence: "online", away: null, detail: "titles", asks: false, missions: [], tasks: [], ...extra });

test("a status card reads at the detail its person chose", () => {
  const now = Date.parse("2026-10-30T10:00:00Z");
  const view = statusCardView(card({ missions: [{ title: "Ship the API", status: "running" }, { title: "Tidy docs", status: "starting" }], tasks: [{ title: "Review PR", status: "in_progress" }] }), now, "UTC");
  assert.deepEqual(view.presence, { label: "Online", tone: "ok" });
  assert.equal(view.note, null);
  assert.deepEqual(view.missions.map((row) => [row.title, row.status.label, row.steps]), [["Ship the API", "Running", null], ["Tidy docs", "Starting", null]]);
  assert.deepEqual(view.tasks, [{ title: "Review PR", status: "in progress", due: null }]);
  const details = statusCardView(card({ detail: "details", missions: [{ title: "Ship", status: "partially_completed", steps: { done: 2, total: 3 }, requirements: [{ text: "Login", status: "accepted" }, { text: "Docs", status: "failed" }] }] }), now, "UTC");
  assert.equal(details.missions[0]!.status.label, "Partly done");
  assert.equal(details.missions[0]!.steps, "2 of 3 steps done");
  assert.deepEqual(details.missions[0]!.requirements.map((row) => row.status.label), ["Accepted", "Failed"]);
  assert.equal(statusCardView(card({ asks: true, detail: "nothing" }), now).note, "Asks to be asked before sharing their status.");
  assert.equal(statusCardView(card({ detail: "nothing" }), now).note, "Shares no status here.");
  assert.equal(statusCardView(card(), now).note, "Nothing in progress for this room.");
  const away = statusCardView(card({ presence: "away", away: { until: "2026-10-30T18:00:00Z", note: "In a workshop" } }), now, "UTC");
  assert.deepEqual(away.presence, { label: "Away", tone: "warn" });
  assert.equal(away.away, "Away until 18:00 · In a workshop");
  assert.equal(awayLine({ until: "2026-11-02T09:30:00Z", note: null }, now, "UTC"), "Away until Mon 09:30");
  assert.equal(awayLine({ until: "2026-12-24T09:30:00Z", note: null }, now, "UTC"), "Away until 24 Dec 09:30");
  assert.equal(awayLine({ until: null, note: "" }, now, "UTC"), "Away");
  assert.equal(awayLine(null, now), null);
});

test("a request's kind and state read in words; its owner's card and disclosure cards too", () => {
  assert.equal(requestKind("review"), "Review");
  assert.deepEqual(requestState("awaiting_owner", "Ben"), { label: "Waiting for Ben", tone: "warn" });
  assert.deepEqual(requestState("approved", "Ben"), { label: "Accepted by Ben", tone: "accent" });
  assert.deepEqual(requestState("done", "Ben"), { label: "Done", tone: "ok" });
  assert.equal(requestState("cancelled", "Ben").label, "Cancelled");
  assert.equal(requestUndecided("open"), true);
  assert.equal(requestUndecided("awaiting_owner"), true);
  assert.equal(requestUndecided("approved"), false);
  assert.deepEqual(ownerCardState("pending"), { label: "Waiting for you", tone: "warn" });
  assert.equal(ownerCardState("accepted").label, "Accepted");
  assert.equal(disclosureState("approved", "share").label, "Allowed");
  assert.equal(disclosureState("approved", "answer").label, "Answering");
  assert.equal(disclosureState("declined", "share").label, "Not shared");
});

test("a new request needs who it is for and what; a review its exact candidate", () => {
  const draft: RequestDraft = { to: "ben", kind: "question", text: "Which branch has the fix?", repo: "", commit: "", url: "" };
  assert.deepEqual(requestProblems(draft), {});
  assert.deepEqual(requestBody(draft), { to: "ben", kind: "question", text: "Which branch has the fix?" });
  assert.deepEqual(Object.keys(requestProblems({ ...draft, to: "", text: " " })).sort(), ["text", "to"]);
  const review = { ...draft, kind: "review" as const, text: "Check the login fix" };
  assert.equal(requestProblems(review).candidate, "A review needs its exact candidate: a commit with its repository, or an address.");
  assert.equal(requestProblems({ ...review, commit: "xyz" }).candidate, "A commit is its hash: 7 to 64 hexadecimal characters.");
  assert.equal(requestProblems({ ...review, commit: "9f8e7d6c" }).candidate, "Name the repository the commit is in.");
  assert.equal(requestProblems({ ...review, url: "ftp://x" }).candidate, "That is not a web address.");
  assert.deepEqual(requestProblems({ ...review, repo: "acme/web", commit: "9f8e7d6c" }), {});
  assert.deepEqual(requestBody({ ...review, repo: " acme/web ", commit: "9f8e7d6c" }).candidate, { repo: "acme/web", commit: "9f8e7d6c" });
  assert.deepEqual(requestProblems({ ...review, url: "https://staging.example.com" }), {});
  assert.equal(candidateText({ repo: "acme/web", commit: "9f8e7d6c5b4a" }), "acme/web at 9f8e7d6");
  assert.equal(candidateText({ url: "https://staging.example.com" }), "https://staging.example.com");
  assert.equal(candidateText(null), null);
});

test("a node's live reply shows in the tab the stream says it is for", () => {
  assert.equal(liveTabOf({ private: true }), "crew");
  assert.equal(liveTabOf({ private: false }), "room");
  assert.equal(liveTabOf({}), "room");
});

test("a shared message says whose crew it came from, and whose reply it was", () => {
  const names: Record<string, string> = { ben: "Ben", me: "Mira" };
  const nameOf = (id: string) => names[id] ?? "Someone";
  const handleOf = (id: string) => (id === "scout" ? "ben-scout" : null);
  assert.equal(sharedLabel({}, { accountId: "me", nodeId: null }, "me", nameOf, handleOf), null);
  assert.equal(sharedLabel({ sharedFrom: { id: "m1", authorKind: "human" } }, { accountId: "me", nodeId: null }, "me", nameOf, handleOf), "Shared from your crew");
  assert.equal(sharedLabel({ sharedFrom: { id: "m1", authorKind: "node", authorNodeId: "scout" } }, { accountId: "ben", nodeId: null }, "me", nameOf, handleOf), "Shared from Ben's crew · @ben-scout's reply");
  assert.equal(sharedLabel({ sharedFrom: { id: "m1", authorKind: "node", authorNodeId: "lead" }, sharedBy: "ben" }, { accountId: "ben", nodeId: "lead" }, "me", nameOf, handleOf), "Shared by Ben", "the lead's own reply, posted by the lead");
  assert.equal(sharedLabel({ sharedFrom: { id: "m1", authorKind: "human" }, sharedBy: "me" }, { accountId: "me", nodeId: "lead" }, "me", nameOf, handleOf), "Shared by you");
});

test("who I am to a request decides what its card offers", () => {
  const data = { from: { accountId: "ben" }, to: { accountId: "me" } };
  assert.equal(requestRole(data, "me"), "to");
  assert.equal(requestRole(data, "ben"), "from");
  assert.equal(requestRole(data, "ada"), "other");
  assert.equal(requestRole(null, "me"), "other");
});

test("away lasts an hour, until this evening, until tomorrow morning, until a picked time, or until I am back", () => {
  const now = new Date(2026, 9, 29, 10, 30);
  assert.equal(awayUntil("hour", now), new Date(2026, 9, 29, 11, 30).toISOString());
  assert.equal(awayUntil("evening", now), new Date(2026, 9, 29, 18, 0).toISOString());
  assert.equal(awayUntil("evening", new Date(2026, 9, 29, 19, 0)), null, "the evening has passed");
  assert.equal(awayUntil("tomorrow", now), new Date(2026, 9, 30, 9, 0).toISOString());
  assert.equal(awayUntil("custom", now, "2026-10-31T08:15"), new Date(2026, 9, 31, 8, 15).toISOString());
  assert.equal(awayUntil("custom", now, ""), null);
  assert.equal(awayUntil("open", now), null);
});

test("a reaction or pin refused in a room with other people says it is about messages from before I joined", () => {
  assert.equal(joinedRefusal("react", 404, "room"), "You can react only to messages from since you joined.");
  assert.equal(joinedRefusal("pin", 400, "room"), "You can pin only messages everyone here can read, from since you joined.");
  assert.equal(joinedRefusal("react", 404, "dm"), null, "elsewhere the server's words stand");
  assert.equal(joinedRefusal("pin", 409, "room"), null, "too many pins says so itself");
});
