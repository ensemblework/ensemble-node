/**
 * Local, stateful browser fixture for the Needs me page: the newer kinds of a node's card in "From your
 * nodes" — a proposed node and a proposed crew, a request to hand a session to another node, a question
 * about sharing something private, a peer request, a request the lead drafted for me to send — beside
 * a card to start work on the computer, each in its own words and answered in place (a draft in its
 * conversation), with a link into its conversation (My crew for a room's cards). Never points at a
 * hosted account or calls a model. Usage is in docs/05 (Browser regression).
 */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");
const WEB = process.env.NODE_WEB ?? "http://localhost:3392";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(WEB).hostname), "Use an isolated local Node server.");
const shots = process.env.NODE_CHAT_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ["--no-sandbox"] });
const NOW = Date.now();
const at = (minutes) => new Date(NOW + minutes * 60_000).toISOString();

function fixture() {
  const avatar = (color) => ({ shape: "orb", color, eyes: "dot" });
  const base = { ownerId: "me", status: "active", charter: "", autonomy: {}, runProfileId: null, templateId: null, createdAt: at(-9000), provider: "ensemble", model: "gpt-5-mini", parentNodeId: null };
  const lead = { ...base, id: "lead", slug: "lead", name: "Lead", role: "manager", avatar: avatar("#D7B56F") };
  const builder = { ...base, id: "builder", slug: "builder", name: "Builder", role: "engineer", avatar: avatar("#7FB3D5") };
  const designer = { ...base, id: "designer", slug: "designer", name: "Designer", role: "designer", avatar: avatar("#F1948A") };
  const me = { id: "p-me", kind: "person", handle: "mira", accountId: "me", role: "owner", name: "Mira", responsibility: null, me: true };
  const ben = { id: "p-ben", kind: "person", handle: "ben", accountId: "ben", role: "member", name: "Ben", responsibility: null, me: false };
  const member = (node, lead = false) => ({ id: `m-${node.id}`, kind: "node", handle: node.slug, accountId: "me", lead, representative: lead, node });
  const room = (id, title, kind, members) => ({ id, title, kind, members, createdBy: "me", lastSeq: 1, readSeq: 1, unread: 0, lastMessageAt: at(-30), pinned: [], invites: [], leadNodeIds: ["lead"], last: null });
  const rooms = [
    room("dm-lead", "Lead", "dm", [me, member(lead, true)]),
    room("crew", "Release crew", "crew", [me, member(lead, true), member(builder), member(designer)]),
    room("launch", "Launch room", "room", [me, ben, member(lead, true)]),
  ];
  const card = (id, roomId, authorNodeId, body, data, minutes) => ({ id, roomId, seq: 1, kind: "approval", body, authorKind: "node", authorAccountId: "me", authorNodeId, data: { status: "pending", ...data }, private: true, mentions: [], rootMessageId: null, clientId: null, planId: null, createdAt: at(minutes) });
  const approvals = [
    card("c-node", "dm-lead", "lead", "Make a node: Docs (writer)\n\nYou write and keep the docs: the README, the guides and the release notes, in plain British English.", { type: "node_proposal", action: "node", input: { name: "Docs", role: "writer", charter: "You write and keep the docs." } }, -2),
    card("c-crew", "dm-lead", "lead", "Make a crew: Launch crew, with @lead, @builder, @designer; @lead leads.", { type: "node_proposal", action: "crew", input: { title: "Launch crew", members: ["lead", "builder", "designer"], lead: "lead" } }, -3),
    card("c-hand", "crew", "builder", "Hand the Claude Code session in ensemble to @designer\n\nIt knows the reports page; it should finish the restyle.", { type: "session", action: "hand_over", input: { session: "5f0d3c1e-1d2b-4c6a-9e8f-0a1b2c3d4e5f", to: "designer", note: "It knows the reports page; it should finish the restyle." } }, -4),
    card("c-share", "launch", "lead", "Ben asked: “When does the API change land?”. May I share: the date from your private roadmap page?", { type: "disclosure", mode: "share", key: "share|launch|ben|api", asker: { accountId: "ben", name: "Ben" }, question: "When does the API change land?", need: "the date from your private roadmap page", triggerMessageId: null, requestId: null }, -5),
    card("c-request", "launch", "lead", "Ben asks for a review: “Please review the sign-up fix before we ship.” (candidate: acme/web at 9f8e7d6c5b4a). Accept, edit or decline.", { type: "peer_request", requestId: "req-1", kind: "review", text: "Please review the sign-up fix before we ship.", refs: null, candidate: { repo: "acme/web", commit: "9f8e7d6c5b4a" }, from: { accountId: "ben", name: "Ben" }, nodes: [{ handle: "lead", name: "Lead", role: "manager", lead: true }], cost: "If you accept, your lead plans it with your nodes, on your computer and your subscriptions and credits." }, -6),
    card("c-start", "crew", "builder", "Start Claude Code in “ensemble”: Fix the login redirect\n\nMake the redirect return to the page you came from, query string and all.", { type: "session", action: "start", input: { title: "Fix the login redirect", prompt: "Make the redirect return to the page you came from, query string and all.", folder: "ensemble" } }, -7),
    // A request my lead drafted in My crew: sent from its card, in its conversation.
    card("c-draft", "launch", "lead", "When does the API change land? I need the date for the launch note.", { type: "post", request: { kind: "question", to: { accountId: "ben", name: "Ben", handle: "ben" }, candidate: null } }, -8),
  ];
  const boot = { me: { id: "me", name: "Mira", email: "mira@fieldnote.example", verified: true }, nodes: [lead, builder, designer], rooms, computers: [], credits: null, invites: [], templates: { nodes: [], crews: [] }, limits: { roomPeople: 10, nodesPerPerson: 3, crewNodes: 24, pins: 25, reactions: ["👍"], declineBlockDays: 30 }, models: { default: "gpt-5-mini", options: [] } };
  return { boot, approvals, calls: [] };
}

try {
  for (const width of [390, 1280]) {
    const state = fixture();
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 768, isMobile: width < 768, colorScheme: "dark", reducedMotion: "reduce", locale: "en-GB" });
    await context.addInitScript(() => {
      window.__nodeEvents = [];
      window.EventSource = class extends EventTarget {
        constructor() { super(); window.__nodeEvents.push(this); setTimeout(() => this.onopen?.(new Event("open")), 0); }
        close() { window.__nodeEvents = window.__nodeEvents.filter((item) => item !== this); }
      };
    });
    const page = await context.newPage();
    const errors = [];
    const unexpected = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const cors = { "access-control-allow-origin": WEB, "access-control-allow-credentials": "true" };
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      const json = (data, status = 200) => route.fulfill({ status, json: data, headers: cors });
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-methods": "GET, POST, PATCH, DELETE", "access-control-allow-headers": "content-type, accept" } });
      if (path === "/api/auth/me") return json({ user: state.boot.me });
      if (path === "/api/node/bootstrap") return json(state.boot);
      if (path === "/api/node/activity") {
        const rooms = new Map(state.boot.rooms.map((row) => [row.id, row]));
        const nodes = new Map(state.boot.nodes.map((row) => [row.id, row]));
        return json({ approvals: state.approvals.map((row) => ({ ...row, node: nodes.get(row.authorNodeId) ?? null, room: rooms.get(row.roomId) ? { id: row.roomId, title: rooms.get(row.roomId).title, kind: rooms.get(row.roomId).kind } : null })), runs: [], turns: [], computers: [], credits: null, waitingTasks: [] });
      }
      if (path === "/api/decisions") return json({ decisions: [] });
      if (path === "/api/approvals") return json({ approvals: [] });
      if (path === "/api/devices") return json({ devices: [] });
      if (path === "/api/documents") return json({ files: [], usage: { maxFileBytes: 25000000 } });
      const settle = /^\/api\/node\/approvals\/([^/]+)$/.exec(path);
      if (settle && method === "POST") {
        const body = request.postDataJSON();
        state.calls.push({ settle: settle[1], body });
        const card = state.approvals.find((row) => row.id === settle[1]);
        state.approvals = state.approvals.filter((row) => row.id !== settle[1]);
        return json({ message: { ...card, data: { ...card.data, status: body.decision === "approve" ? "applied" : "discarded" } } });
      }
      unexpected.push(`${method} ${path}`);
      return route.fulfill({ status: 404, json: { error: `Unmocked API: ${path}` }, headers: cors });
    });
    const fits = async () => assert.equal(await page.locator("main").evaluate((el) => el.scrollWidth <= el.clientWidth + 2), true, `${width}px fits`);

    await page.goto(`${WEB}/needs-me`);
    const fromNodes = page.getByRole("region", { name: /From your nodes/ });
    await fromNodes.getByRole("heading", { name: "From your nodes (7)" }).waitFor();
    const item = (text) => fromNodes.getByRole("listitem").filter({ hasText: text });

    // Each card in its own words, with its own answers.
    const proposal = item("Make a node: Docs");
    assert.ok(await proposal.getByText("@lead proposes a new node").isVisible());
    assert.ok(await proposal.getByRole("button", { name: "Make it" }).isVisible());
    assert.ok(await proposal.getByRole("button", { name: "Discard" }).isVisible());
    assert.equal(await proposal.getByRole("link", { name: "Open in Lead's chat" }).getAttribute("href"), "/r/dm-lead#m-c-node");
    const crew = item("Make a crew: Launch crew");
    assert.ok(await crew.getByText("@lead proposes a crew").isVisible());
    assert.ok(await crew.getByRole("button", { name: "Make it" }).isVisible());
    const hand = item("Hand the Claude Code session");
    assert.ok(await hand.getByText("@builder wants to hand a session to @designer").isVisible());
    assert.ok(await hand.getByText(/It knows the reports page/).isVisible(), "its note");
    assert.ok(await hand.getByRole("button", { name: "Hand it over" }).isVisible());
    const share = item("May I share");
    assert.ok(await share.getByText("@lead asks before sharing with Ben").isVisible());
    assert.ok(await share.getByRole("button", { name: "Allow" }).isVisible());
    assert.ok(await share.getByRole("button", { name: "Don't share" }).isVisible());
    assert.equal(await share.getByRole("link", { name: "Open in “Launch room” (My crew)" }).getAttribute("href"), "/r/launch#m-c-share", "a room's card opens in My crew");
    const request = item("Ben asks for a review");
    assert.ok(await request.getByText("@lead brings you Ben's request for a review").isVisible());
    assert.ok(await request.getByRole("button", { name: "Accept" }).isVisible());
    assert.ok(await request.getByRole("button", { name: "Decline" }).isVisible());
    const start = item("Start Claude Code");
    assert.ok(await start.getByText("@builder wants to start work on your computer").isVisible());
    assert.ok(await start.getByRole("button", { name: "Start it" }).isVisible());
    assert.equal(await start.getByRole("link", { name: "Open in “Release crew”" }).getAttribute("href"), "/r/crew#m-c-start");
    const drafted = item("When does the API change land? I need");
    assert.ok(await drafted.getByText("@lead drafted a request to @ben for you to send").isVisible(), "a drafted request, not a post");
    assert.equal(await drafted.getByRole("button", { name: /Send|Post|Approve/ }).count(), 0, "sent from its card, after reading it there");
    assert.equal(await drafted.getByRole("link", { name: "Review the request in “Launch room” (My crew)" }).getAttribute("href"), "/r/launch#m-c-draft");
    await fits();
    if (shots) await page.screenshot({ path: `${shots}/needs-me-${width}.png`, fullPage: true });

    // Answered in place: the card goes, and the count follows.
    await hand.getByRole("button", { name: "Hand it over" }).click();
    await fromNodes.getByRole("heading", { name: "From your nodes (6)" }).waitFor();
    assert.deepEqual(state.calls.at(-1), { settle: "c-hand", body: { decision: "approve" } });
    await share.getByRole("button", { name: "Don't share" }).click();
    await fromNodes.getByRole("heading", { name: "From your nodes (5)" }).waitFor();
    assert.deepEqual(state.calls.at(-1), { settle: "c-share", body: { decision: "discard" } });
    await crew.getByRole("button", { name: "Make it" }).click();
    await fromNodes.getByRole("heading", { name: "From your nodes (4)" }).waitFor();
    assert.deepEqual(state.calls.at(-1), { settle: "c-crew", body: { decision: "approve" } });
    await fits();

    assert.deepEqual(errors, [], "no page errors");
    assert.deepEqual([...new Set(unexpected)], [], "no unmocked API calls");
    await context.close();
    console.log(`needs me ok at ${width}px`);
  }
} finally {
  await browser.close();
}
