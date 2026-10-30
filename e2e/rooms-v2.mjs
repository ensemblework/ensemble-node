/**
 * Local, stateful browser fixture for rooms with other people (rooms v2, Ensemble docs/35 §12): the
 * Room and My crew tabs with their own unread, Send to everyone and Ask my nodes (a reply from the Room
 * answered in My crew), Share to room through the lead, `@leads status` and its status cards, a peer
 * request's public card with the owner's own card (accepted in the owner's own words for their lead,
 * which never reach the room, and always), a request the lead drafted sent from My crew, a new request,
 * a disclosure card, a node's proposal, the trust sheet with shareable items, away and presence, no
 * reaction or pin on a message from before I joined, media in a message read through that message, and
 * a helper's thread under the message that asked with its plan step. Never points at a hosted account
 * or calls a model. Usage is in docs/05 (Browser regression).
 */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");
const WEB = process.env.NODE_WEB ?? "http://localhost:3392";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(WEB).hostname), "Use an isolated local Node server.");
const shots = process.env.NODE_CHAT_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ["--no-sandbox"] });
const NOW = Date.now();
const at = (minutes) => new Date(NOW + minutes * 60_000).toISOString();

/** A small PNG of one colour, so a message's picture is a real picture. */
function png(width, height, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buffer) => {
    let c = 0xffffffff;
    for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) rows.set([r, (g + y) % 256, (b + x) % 256], y * (width * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}
const PICTURE = png(160, 100, [60, 110, 90]);

function fixture() {
  const avatar = (color) => ({ shape: "orb", color, eyes: "dot" });
  const base = { status: "active", charter: "", runProfileId: null, templateId: null, createdAt: at(-9000), provider: "ensemble", model: "gpt-5-mini", parentNodeId: null };
  const lead = { ...base, id: "lead", ownerId: "me", slug: "lead", name: "Lead", role: "manager", avatar: avatar("#D7B56F"), autonomy: { sharedRooms: "ask", createNodes: "ask", helpers: 4 } };
  const builder = { ...base, id: "builder", ownerId: "me", slug: "builder", name: "Builder", role: "engineer", avatar: avatar("#7FB3D5"), autonomy: {} };
  const atlas = { ...base, id: "ben-lead", ownerId: "ben", slug: "atlas", name: "Atlas", role: "manager", avatar: avatar("#C39BD3") };
  const scout = { ...base, id: "ben-scout", ownerId: "ben", slug: "scout", name: "Scout", role: "researcher", avatar: avatar("#A9DFBF") };
  const alpha = { ...base, id: "lead-alpha", ownerId: "me", slug: "lead-alpha", name: "Alpha", role: "auditor", avatar: avatar("#9AA5B1"), parentNodeId: "lead", autonomy: { grant: "read" } };
  const me = { id: "p-me", kind: "person", handle: "mira", accountId: "me", role: "owner", name: "Mira", responsibility: "frontend", me: true };
  const ben = { id: "p-ben", kind: "person", handle: "ben", accountId: "ben", role: "member", name: "Ben", responsibility: "backend", me: false };
  const node = (row, lead = false) => ({ id: `m-${row.id}`, kind: "node", handle: row.slug, accountId: row.ownerId, lead, representative: lead, node: row });
  const room = (id, title, kind, members, extra = {}) => ({ id, title, kind, members, createdBy: "me", lastSeq: 0, readSeq: 0, unread: 0, lastMessageAt: at(-5), pinned: [], invites: [], leadNodeIds: [], last: null, ...extra });
  const rooms = [
    room("launch", "Launch room", "room", [me, ben, node(lead, true), node(builder), node(atlas, true), node(scout)]),
    room("dm-lead", "Lead", "dm", [me, node(lead, true)]),
    room("task-alpha", "Lead · Alpha", "task", [me, node(lead), node(alpha)], { helper: { parentNodeId: "lead", helperNodeId: "lead-alpha", originRoomId: "launch", originPrivate: true, originMessageId: "c-ask", planId: "c-plan" } }),
  ];
  const seqs = {};
  const message = (roomId, id, kind, body, extra = {}) => {
    const seq = (seqs[roomId] = (seqs[roomId] ?? 0) + 1);
    return { id, roomId, seq, kind, body, authorKind: "node", authorAccountId: "me", authorNodeId: "lead", data: {}, private: false, mentions: [], rootMessageId: null, clientId: null, planId: null, createdAt: at(-60 + seq), ...extra };
  };
  const person = (who) => ({ authorKind: "human", authorAccountId: who, authorNodeId: null });
  const myCard = { accountId: "me", name: "Mira", handle: "mira", lead: { nodeId: "lead", handle: "lead", name: "Lead" }, presence: "online", away: null, detail: "details", asks: false, missions: [{ title: "Sign-up fix", status: "running", steps: { done: 1, total: 3 }, requirements: [{ text: "Works on a phone", status: "in_progress" }] }], tasks: [{ title: "Write the launch note", status: "in_progress", due: "2026-11-02" }] };
  const benCard = { accountId: "ben", name: "Ben", handle: "ben", lead: { nodeId: "ben-lead", handle: "atlas", name: "Atlas" }, presence: "away", away: { until: at(150), note: "At the dentist" }, detail: "titles", asks: false, missions: [{ title: "Pricing page", status: "succeeded" }], tasks: [] };
  const candidate = { repo: "acme/web", commit: "9f8e7d6c5b4a" };
  const request = {
    id: "req-1", roomId: "launch", kind: "review", status: "awaiting_owner", text: "Please review the sign-up fix before we ship.", refs: null, candidate,
    from: { accountId: "ben", name: "Ben", handle: "ben", nodeId: null, nodeHandle: null }, to: { accountId: "me", name: "Mira", handle: "mira", leadNodeId: "lead", leadHandle: "lead" },
    answerMessageId: null, answer: null, brief: null, cardId: "c-request", ownerCardId: "c-owner", missionId: null, createdAt: at(-50), updatedAt: at(-50), decidedAt: null,
  };
  // The public card carries only what the requester wrote, who asked whom, how it stands, and links.
  const publicCard = (row) => ({ type: "peer_request", requestId: row.id, kind: row.kind, status: row.status, text: row.text, refs: row.refs, candidate: row.candidate, from: row.from, to: row.to, answerMessageId: row.answerMessageId ?? null, taskId: row.taskId ?? null, mode: row.mode ?? null, updatedAt: row.updatedAt });
  const launch = [
    message("launch", "c-moved", "status", "This room now has a Room and a My crew. Only leads answer here, when you name them; your own nodes answer you in My crew.", { authorKind: "system", authorNodeId: null }),
    message("launch", "c-ben", "text", "Morning! @lead can you share the launch checklist?", person("ben")),
    message("launch", "c-media", "text", "Here is the checklist as it stands, with the page at 390 px and a walkthrough.", { data: { media: [{ evidenceId: "e-shot", kind: "screenshot", name: "checklist-phone.png", mime: "image/png", caption: "The checklist at 390 px", size: 48210 }, { evidenceId: "e-video", kind: "video", name: "walkthrough.mp4", mime: "video/mp4", caption: "Walkthrough", size: 2_400_000 }, { evidenceId: "e-log", kind: "log", name: "build.log", mime: "text/plain", size: 1200 }] } }),
    message("launch", "c-request", "request", "Ben asked Mira (review): Please review the sign-up fix before we ship.", { authorKind: "system", authorNodeId: null, authorAccountId: "ben", data: publicCard(request) }),
    message("launch", "c-owner", "approval", "Ben asks for a review.", { private: true, data: { type: "peer_request", status: "pending", requestId: "req-1", kind: "review", text: request.text, refs: null, candidate, from: { accountId: "ben", name: "Ben" }, nodes: [{ handle: "lead", name: "Lead", role: "manager", lead: true }, { handle: "builder", name: "Builder", role: "engineer", lead: false }], cost: "If you accept, your lead plans it with your nodes, on your computer and your subscriptions and credits." } }),
    message("launch", "c-disclosure", "approval", "Ben asked: “When does the API change land?”. May I share: the date from your private roadmap page?", { private: true, data: { type: "disclosure", mode: "share", status: "pending", key: "share|launch|ben|when does the api change land", asker: { accountId: "ben", name: "Ben" }, question: "When does the API change land?", need: "the date from your private roadmap page", triggerMessageId: "c-ben", requestId: null } }),
    message("launch", "c-status", "status", "Status", { authorKind: "system", authorNodeId: null, data: { type: "status_cards", cards: [myCard, benCard], replyTo: { id: "c-ben", seq: 2 } } }),
    message("launch", "c-ask", "text", "@lead get an independent audit of the README before Ben's review.", { ...person("me"), private: true }),
    message("launch", "c-plan", "plan", "Plan", { private: true, data: { type: "plan", contract: 3, missionId: "c-plan", kind: "plan", leadNodeId: "lead", leadHandle: "lead", status: "running", goal: "An independent audit of the README", requirements: [], deferred: [], steps: [{ id: "s1", nodeId: "lead-alpha", handle: "lead-alpha", name: "Alpha", kind: "research", executor: "helper", brief: "Audit the README for stale commands.", after: [], status: "done", outcome: "done", result: "Found 3 stale commands.", progress: null, startedAt: at(-30), endedAt: at(-20), requirementIds: [], held: false, heldBy: null, attempt: 1, attempts: [], sessionId: null }] } }),
    message("launch", "c-reply", "text", "Alpha found 3 stale commands in the README; the sign-up fix itself looks right. I would tell Ben the review can start.", { private: true }),
    message("launch", "c-proposal", "approval", "Make a node: Docs (writer)", { private: true, data: { type: "node_proposal", status: "pending", action: "node", input: { name: "Docs", role: "writer", charter: "You write and keep the docs: the README, the guides and the release notes, in plain British English." }, private: true } }),
    // My lead drafted a request to Ben in My crew: it reaches the room only when I send it.
    message("launch", "c-req-draft", "approval", "When does the API change land? I need the date for the launch note.", { private: true, data: { type: "post", status: "pending", request: { kind: "question", to: { accountId: "ben", name: "Ben", handle: "ben" }, candidate: null } } }),
  ];
  const task = [
    message("task-alpha", "t-brief", "text", "@lead-alpha Audit the README for stale commands.", { data: { brief: { helperNodeId: "lead-alpha" } } }),
    message("task-alpha", "t-report", "text", "Found 3 stale commands: `ensemble login --old`, `ensemble sync`, `ensemble up`.", { authorNodeId: "lead-alpha", data: { report: { outcome: "done", planId: "c-plan", step: "s1" } } }),
  ];
  const messages = { launch, "dm-lead": [], "task-alpha": task };
  for (const row of rooms) {
    row.lastSeq = messages[row.id].at(-1)?.seq ?? 0;
    row.readSeq = row.id === "launch" ? 3 : row.lastSeq;
    // Ensemble counts each tab of a room with other people: the Room's public news and My crew's private news.
    if (row.id === "launch") Object.assign(row, { readSeqCrew: 3, unreadRoom: 2, unreadCrew: 5, unread: 7 });
    row.last = messages[row.id].at(-1) ?? null;
  }
  const defaults = { status: "answer", statusDetail: "titles", shareSpaceArtefacts: "answer", shareOther: "ask", workRequests: "ask", acceptKinds: [], freeFormAnswers: "allow" };
  const trust = { defaults, everyone: { ...defaults }, people: [{ accountId: "ben", name: "Ben", handle: "ben", overrides: null, effective: { ...defaults } }], budget: { credits: null, usedThisMonth: 12 } };
  const boot = { me: { id: "me", name: "Mira", email: "mira@fieldnote.example", verified: true }, nodes: [lead, builder], rooms, computers: [], credits: null, invites: [], templates: { nodes: [], crews: [] }, limits: { roomPeople: 10, nodesPerPerson: 3, crewNodes: 24, pins: 25, reactions: ["👍", "❤️", "✅"], declineBlockDays: 30 }, models: { default: "gpt-5-mini", options: [] } };
  return { boot, messages, message, cards: [myCard, benCard], requests: [request], publicCard, trust, shareable: [], calls: [], evidence: [], made: 0 };
}

try {
  for (const width of [390, 1280]) {
    const state = fixture();
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 768, isMobile: width < 768, colorScheme: "dark", reducedMotion: "reduce", locale: "en-GB", timezoneId: "Europe/London" });
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
    const dialogs = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      void dialog.accept();
    });
    const emit = (type, data) => page.evaluate(({ type, data }) => { for (const source of window.__nodeEvents) source.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) })); }, { type, data });
    const cors = { "access-control-allow-origin": WEB, "access-control-allow-credentials": "true" };
    const find = (id) => Object.values(state.messages).flat().find((row) => row.id === id);
    const post = (row) => {
      state.messages[row.roomId].push(row);
      const room = state.boot.rooms.find((item) => item.id === row.roomId);
      room.lastSeq = row.seq;
      room.last = row;
      return row;
    };
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      const json = (data, status = 200) => route.fulfill({ status, json: data, headers: cors });
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE", "access-control-allow-headers": "content-type, accept" } });
      if (path === "/api/auth/me") return json({ user: state.boot.me });
      if (path === "/api/node/bootstrap") return json(state.boot);
      if (path === "/api/node/activity") return json({ approvals: [], runs: [], turns: [], computers: [], credits: null });
      if (path === "/api/decisions") return json({ decisions: [] });
      if (path === "/api/approvals") return json({ approvals: [] });
      if (path === "/api/devices") return json({ devices: [] });
      if (path === "/api/documents") {
        const files = [{ id: "file-1", filename: "launch-notes.pdf", kind: "pdf", byteSize: 1000, textStatus: "ready", createdAt: at(-900) }];
        const q = (url.searchParams.get("q") ?? "").toLowerCase();
        return json({ files: files.filter((row) => row.filename.includes(q)), usage: { maxFileBytes: 25000000 } });
      }
      const evidence = /^\/api\/node\/evidence\/([^/]+)$/.exec(path);
      if (evidence) {
        state.evidence.push({ id: evidence[1], message: url.searchParams.get("message") });
        if (evidence[1] === "e-shot" && url.searchParams.get("message") === "c-media") return route.fulfill({ status: 200, body: PICTURE, headers: { ...cors, "content-type": "image/png" } });
        return route.fulfill({ status: 404, json: { error: "Not here" }, headers: cors });
      }
      if (/^\/api\/node\/rooms\/[^/]+\/read$/.test(path)) return json({});
      if (path === "/api/node/rooms/launch/space") return json({ space: null, offer: null });
      if (path === "/api/node/rooms/launch/steward") return json({ steward: null });
      if (path === "/api/spaces") return json({ spaces: [{ id: "me", name: "Mira's space", primary: true }], shared: [] });
      if (path === "/api/node/rooms/launch/shareable/candidates") {
        const items = [
          { kind: "page", id: "7c1d2a3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d", title: "Roadmap", spaceId: "me", spaceName: "Mira's space", updatedAt: at(-60), shared: false },
          { kind: "task", id: "8d2e3f4a-5b6c-4d7e-8f9a-0b1c2d3e4f5a", title: "Ship the sign-up fix", spaceId: "me", spaceName: "Mira's space", updatedAt: at(-30), shared: false },
          { kind: "file", id: "file-1", title: "launch-notes.pdf", spaceId: "me", spaceName: "Mira's space", updatedAt: at(-900), shared: false },
        ];
        const q = (url.searchParams.get("q") ?? "").toLowerCase();
        return json({ spaces: [{ id: "me", name: "Mira's space", role: "owner", linked: false }], items: items.filter((row) => row.title.toLowerCase().includes(q)) });
      }
      const plan = /^\/api\/node\/plans\/([^/]+)$/.exec(path);
      if (plan && method === "GET") {
        const card = find(plan[1]);
        return card ? json({ message: card, runs: Object.values(state.messages).flat().filter((row) => row.planId === card.id && row.kind === "run") }) : json({ error: "That plan is not available." }, 404);
      }
      const one = /^\/api\/node\/messages\/([^/]+)$/.exec(path);
      if (one && method === "GET") return find(one[1]) ? json({ message: find(one[1]) }) : json({ error: "That message is not available." }, 404);
      const share = /^\/api\/node\/messages\/([^/]+)\/share$/.exec(path);
      if (share && method === "POST") {
        const body = request.postDataJSON();
        state.calls.push({ share: share[1], body });
        const original = find(share[1]);
        const copy = post(state.message("launch", `shared-${++state.made}`, "text", original.body, {
          private: false,
          authorKind: body.as === "lead" ? "node" : "human",
          authorNodeId: body.as === "lead" ? "lead" : null,
          data: { sharedFrom: { id: original.id, seq: original.seq, authorKind: original.authorKind, authorNodeId: original.authorNodeId }, ...(body.as === "lead" ? { sharedBy: "me" } : {}) },
          createdAt: new Date().toISOString(),
        }));
        return json({ message: copy }, 201);
      }
      const messages = /^\/api\/node\/rooms\/([^/]+)\/messages$/.exec(path);
      if (messages && method === "GET") return json({ messages: state.messages[messages[1]] ?? [] });
      if (messages && method === "POST") {
        const body = request.postDataJSON();
        state.calls.push({ send: body });
        const quoted = body.replyToId ? find(body.replyToId) : null;
        const sent = post(state.message(messages[1], `sent-${++state.made}`, "text", body.body, {
          authorKind: "human",
          authorAccountId: "me",
          authorNodeId: null,
          private: body.private === true,
          clientId: body.clientId,
          data: quoted ? { replyTo: { id: quoted.id, seq: quoted.seq, authorKind: quoted.authorKind, handle: quoted.authorAccountId === "ben" ? "ben" : "lead", excerpt: quoted.body.slice(0, 160) } } : {},
          createdAt: new Date().toISOString(),
        }));
        // What Ensemble would do next: a code-built status card, or the lead's private answer in My crew.
        if (/^@leads status$/i.test(body.body)) setTimeout(() => void emit("node.message", post(state.message("launch", `status-${state.made}`, "status", "Status", { authorKind: "system", authorNodeId: null, data: { type: "status_cards", cards: state.cards, replyTo: { id: sent.id, seq: sent.seq } }, createdAt: new Date().toISOString() }))), 250);
        else if (body.private) setTimeout(() => void emit("node.message", post(state.message("launch", `answer-${state.made}`, "text", "Ben wants the launch checklist. I can share the public half; the dates are on your private roadmap.", { private: true, createdAt: new Date().toISOString() }))), 250);
        return json({ message: sent });
      }
      if (path === "/api/node/rooms/launch/status" && method === "GET") return json({ cards: state.cards });
      if (path === "/api/node/rooms/launch/status" && method === "PUT") {
        const body = request.postDataJSON();
        state.calls.push({ status: body });
        const card = state.cards.find((row) => row.accountId === "me");
        Object.assign(card, body.away ? { presence: "away", away: { until: body.until ?? null, note: body.note ?? null } } : { presence: "online", away: null });
        return json({ card });
      }
      if (path === "/api/node/rooms/launch/trust" && method === "GET") return json({ trust: state.trust });
      if (path === "/api/node/rooms/launch/trust" && method === "PUT") {
        const body = request.postDataJSON();
        state.calls.push({ trust: body });
        Object.assign(state.trust.everyone, body.everyone ?? {});
        for (const [accountId, patch] of Object.entries(body.people ?? {})) {
          const row = state.trust.people.find((item) => item.accountId === accountId);
          row.overrides = patch === null ? null : { ...(row.overrides ?? {}), ...patch };
          row.effective = { ...state.trust.everyone, ...(row.overrides ?? {}) };
        }
        if ("budget" in body) state.trust.budget.credits = body.budget;
        return json({ trust: state.trust });
      }
      if (path === "/api/node/rooms/launch/shareable" && method === "GET") return json({ items: state.shareable });
      if (path === "/api/node/rooms/launch/shareable" && method === "PUT") {
        const body = request.postDataJSON();
        state.calls.push({ shareable: body });
        state.shareable = state.shareable.filter((row) => row.id !== body.id);
        if (body.shared) state.shareable.push({ kind: body.kind, id: body.id, spaceId: "me", title: body.kind === "file" ? "launch-notes.pdf" : body.kind === "page" ? "Roadmap" : "Ship the sign-up fix", addedAt: new Date().toISOString() });
        return json({ items: state.shareable });
      }
      if (path === "/api/node/rooms/launch/requests" && method === "GET") return json({ requests: state.requests });
      if (path === "/api/node/rooms/launch/requests" && method === "POST") {
        const body = request.postDataJSON();
        state.calls.push({ request: body });
        const made = { ...state.requests[0], id: "req-2", kind: body.kind, status: "awaiting_owner", text: body.text, candidate: body.candidate ?? null, from: { accountId: "me", name: "Mira", handle: "mira", nodeId: null, nodeHandle: null }, to: { accountId: "ben", name: "Ben", handle: "ben", leadNodeId: "ben-lead", leadHandle: "atlas" }, cardId: "c-request-2", ownerCardId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        state.requests.unshift(made);
        post(state.message("launch", "c-request-2", "request", `Mira asked Ben (${body.kind}): ${body.text}`, { authorKind: "system", authorNodeId: null, data: state.publicCard(made), createdAt: new Date().toISOString() }));
        return json({ request: made }, 201);
      }
      const decide = /^\/api\/node\/requests\/([^/]+)\/(accept|decline|cancel)$/.exec(path);
      if (decide && method === "POST") {
        const body = request.postDataJSON();
        state.calls.push({ [decide[2]]: decide[1], body });
        const row = state.requests.find((item) => item.id === decide[1]);
        // Accepting in my own words keeps what was asked: the words are my brief for my lead.
        Object.assign(row, decide[2] === "accept" ? { status: "approved", missionId: "c-plan", ...(body.text ? { brief: body.text } : {}) } : decide[2] === "decline" ? { status: "declined", answer: body.note ?? null } : { status: "cancelled" });
        const card = find(row.cardId);
        card.data = state.publicCard(row);
        const owner = row.ownerCardId ? find(row.ownerCardId) : null;
        if (owner) owner.data = { ...owner.data, status: decide[2] === "accept" ? "accepted" : decide[2] === "decline" ? "declined" : "cancelled", text: row.text, ...(row.brief ? { brief: row.brief } : {}) };
        return json({ request: row });
      }
      const approval = /^\/api\/node\/approvals\/([^/]+)$/.exec(path);
      if (approval && method === "POST") {
        const body = request.postDataJSON();
        state.calls.push({ approval: approval[1], body });
        const card = find(approval[1]);
        if (card.data.type === "disclosure") card.data = { ...card.data, status: body.decision === "approve" ? "approved" : "declined" };
        if (card.data.type === "node_proposal") card.data = { ...card.data, status: body.decision === "approve" ? "applied" : "discarded", ...(body.decision === "approve" ? { result: { summary: "made @docs (Docs)", nodeId: "docs", handle: "docs" } } : {}) };
        if (card.data.type === "post" && card.data.request && body.decision === "approve") {
          // Sent: the request is made in the words I approved, and its public card is posted.
          const made = { ...state.requests[0], id: "req-3", kind: card.data.request.kind, status: "open", text: body.body, candidate: null, from: { accountId: "me", name: "Mira", handle: "mira", nodeId: "lead", nodeHandle: "lead" }, to: { accountId: "ben", name: "Ben", handle: "ben", leadNodeId: "ben-lead", leadHandle: "atlas" }, answer: null, brief: null, cardId: "c-request-3", ownerCardId: null, missionId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
          state.requests.unshift(made);
          const publicRow = post(state.message("launch", "c-request-3", "request", `Mira asked Ben (question): ${body.body}`, { authorKind: "system", authorNodeId: null, data: state.publicCard(made), createdAt: new Date().toISOString() }));
          setTimeout(() => void emit("node.message", publicRow).then(() => emit("node.request", { roomId: "launch", requestId: "req-3" })), 50);
          card.body = body.body;
          card.data = { ...card.data, status: "posted", requestId: "req-3", error: null };
        }
        return json({ message: card });
      }
      // Messages from before I joined: no reaction, no pin (Ensemble's joined filter).
      if (path === "/api/node/messages/c-ben/reactions" && method === "POST") return json({ error: "That message is not available." }, 404);
      if (path === "/api/node/rooms/launch/pins" && method === "POST") return json({ error: "Only messages everyone here can read can be pinned." }, 400);
      unexpected.push(`${method} ${path}`);
      return route.fulfill({ status: 404, json: { error: `Unmocked API: ${path}` }, headers: cors });
    });
    /** Nothing sticks out past the screen's right edge, unless a container that fits clips or scrolls it. */
    const overflowing = (selector) =>
      page.locator(selector).first().evaluate((root) =>
        [...root.querySelectorAll("*")]
          .filter((el) => {
            const box = el.getBoundingClientRect();
            if (!box.width || box.right <= window.innerWidth + 1 || getComputedStyle(el).position === "fixed") return false;
            for (let up = el.parentElement; up && up !== root.parentElement; up = up.parentElement) {
              const style = getComputedStyle(up);
              if (style.overflowX !== "visible" && up.getBoundingClientRect().right <= window.innerWidth + 1) return false;
            }
            return true;
          })
          .slice(0, 6)
          .map((el) => `${el.tagName.toLowerCase()}.${String(el.getAttribute("class")).slice(0, 80)} → ${Math.round(el.getBoundingClientRect().right)}`),
      );
    const fits = async () => assert.deepEqual(await overflowing("main"), [], `${width}px fits`);
    const drawerFits = async () => assert.deepEqual(await overflowing('[role="dialog"]'), [], `${width}px: the drawer fits`);
    /** A message's action: the bar shows on hover, focus or a long press; focus works at every size. */
    const action = async (message, name) => {
      const button = message.getByRole("toolbar", { name: "Message actions" }).getByRole("button", { name, exact: true });
      await button.focus();
      await button.click();
    };

    // The Room: what everyone reads, with its own unread; My crew counts what waits there.
    await page.goto(`${WEB}/r/launch`);
    const roomTab = page.getByRole("tab", { name: /^Room/ });
    const crewTab = page.getByRole("tab", { name: /^My crew/ });
    await roomTab.waitFor();
    assert.equal(await roomTab.getAttribute("aria-selected"), "true");
    const timeline = page.locator(".chat-timeline");
    await timeline.getByText("This room now has a Room and a My crew.", { exact: false }).waitFor();
    await page.waitForFunction(() => /My crew5/.test(document.querySelectorAll('[role="tab"]')[1]?.textContent ?? ""));
    assert.match((await crewTab.textContent()) ?? "", /My crew5/, "My crew's own unread: two cards, a plan, a reply and a proposal");
    assert.equal(await timeline.locator("#m-c-owner").count(), 0, "My crew's cards are not in the Room");
    assert.ok(await page.locator("#unread-divider").isVisible(), "the Room's own divider");

    // Media in a node's message: read through that message, as anyone in the room may.
    const media = timeline.locator("#m-c-media").getByRole("region", { name: "Media" });
    await media.scrollIntoViewIfNeeded();
    await media.locator("img").first().waitFor();
    assert.ok(state.evidence.some((row) => row.id === "e-shot" && row.message === "c-media"), "a picture is read through its message");
    await media.getByRole("button", { name: /This video does not play here/ }).or(media.locator("video")).first().waitFor();
    assert.ok(await media.getByRole("button", { name: /Download Log “build.log”/ }).isVisible(), "other files are downloads");

    // A peer request's public card and the status cards `@leads status` brought.
    const requestCard = timeline.locator("#m-c-request");
    assert.ok(await requestCard.getByText("Waiting for you").isVisible());
    assert.ok(await requestCard.getByText("Ben asked you").isVisible());
    assert.ok(await requestCard.getByText("acme/web at 9f8e7d6").isVisible(), "its exact candidate");
    const statusCards = timeline.locator("#m-c-status").getByRole("region", { name: "Status of everyone here" });
    assert.ok(await statusCards.getByText("Mira (you)").isVisible());
    assert.ok(await statusCards.getByText(/^Away until .* · At the dentist$/).isVisible(), "an away note with when it ends");
    assert.ok(await statusCards.getByText("1 of 3 steps done").isVisible(), "missions at the detail chosen");
    assert.ok(await statusCards.getByText("Works on a phone · in progress").isVisible());
    const choice = page.getByRole("radiogroup", { name: "Who reads it" });
    assert.equal(await choice.getByRole("radio", { name: "Send to everyone" }).getAttribute("aria-checked"), "true", "the Room sends to everyone by default");
    await fits();
    if (shots) await page.screenshot({ path: `${shots}/room-${width}.png` });

    // `@leads status`: said as it is typed, posted to everyone, answered by a card built by code.
    const roomText = page.getByRole("textbox", { name: "Message Launch room", exact: true });
    await roomText.fill("@leads status");
    await page.getByText("Ensemble answers with everyone's status card. No node is woken.").waitFor();
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await timeline.locator('[id^="m-status-"]').getByRole("region", { name: "Status of everyone here" }).waitFor();
    assert.deepEqual(state.calls.at(-1).send.private, false);

    // Ask my nodes, replying to Ben: private, quoting his message; the answer is in My crew.
    await action(timeline.locator("#m-c-ben"), "Reply");
    await choice.getByRole("radio", { name: "Ask my nodes" }).click();
    const askText = page.getByRole("textbox", { name: "Ask your nodes privately", exact: true });
    await askText.fill("What does Ben need from us?");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const sent = state.calls.at(-1).send;
    assert.equal(sent.private, true);
    assert.equal(sent.replyToId, "c-ben", "it quotes the Room's message");
    await page.waitForFunction(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.startsWith("My crew"));
    await timeline.getByText("Ben wants the launch checklist.", { exact: false }).waitFor();
    assert.ok(await timeline.getByText("What does Ben need from us?").isVisible());
    assert.equal(await page.getByRole("radiogroup", { name: "Who reads it" }).count(), 0, "My crew is private: no choice");
    assert.ok(await page.getByText("Only you and your nodes", { exact: true }).isVisible());

    // The owner's own card: accept in my own words for my lead (the room keeps Ben's), and always for this person.
    const owner = timeline.locator("#m-c-owner");
    assert.ok(await owner.getByText("Ben asks you for a review").isVisible());
    assert.ok(await owner.getByText("@lead (lead), @builder").isVisible(), "which of my nodes would do it");
    await owner.getByRole("button", { name: "In my words" }).click();
    await owner.getByRole("textbox", { name: "Your words for your lead" }).fill("Review the sign-up fix on a phone and a computer.");
    assert.ok(await owner.getByText("Only @lead reads these; the room keeps what Ben asked.").isVisible());
    await owner.getByLabel("Always accept reviews from Ben in this room").check();
    await owner.getByRole("button", { name: "Accept with your words" }).click();
    await owner.getByText("Accepted", { exact: true }).waitFor();
    assert.deepEqual(state.calls.find((call) => call.accept), { accept: "req-1", body: { text: "Review the sign-up fix on a phone and a computer.", always: true } });
    assert.ok(await owner.getByText("Please review the sign-up fix before we ship.").isVisible(), "what Ben asked stays in view");
    assert.ok(await owner.getByText("Review the sign-up fix on a phone and a computer.").isVisible(), "beside my own words for my lead");
    assert.ok(await owner.getByText("Your words for @lead:").isVisible());

    // A disclosure card: Allow, and the draft comes after.
    const disclosure = timeline.locator("#m-c-disclosure");
    assert.ok(await disclosure.getByText("May @lead share this with the room?").isVisible());
    assert.ok(await disclosure.getByText("the date from your private roadmap page?", { exact: false }).isVisible());
    await disclosure.getByRole("button", { name: "Allow" }).click();
    await disclosure.getByText("Allowed", { exact: true }).waitFor();
    assert.ok(await disclosure.getByText(/is writing the answer. It comes to you as a draft to post./).isVisible());
    assert.deepEqual(state.calls.find((call) => call.approval === "c-disclosure").body, { decision: "approve" });

    // A node's proposal: make it.
    const proposal = timeline.locator("#m-c-proposal");
    assert.ok(await proposal.getByText("@lead proposes a new node").isVisible());
    assert.ok(await proposal.getByText("Docs", { exact: true }).isVisible());
    await proposal.getByRole("button", { name: "Make it" }).click();
    await proposal.getByText("Made @docs.").waitFor();

    // A helper's thread under the message that asked (privately), and its plan step by name.
    const asked = timeline.locator("#m-c-ask");
    const chip = asked.getByRole("button", { name: /@lead-alpha, helper of @lead/ });
    await chip.click();
    const thread = asked.getByRole("list", { name: "Lead · Alpha, read only" });
    await thread.getByText("Brief", { exact: true }).waitFor();
    assert.ok(await thread.getByText("Report · Done").isVisible(), "the helper's report, with its outcome");
    assert.ok(await asked.getByText("Asked for privately: only you see it.").isVisible());
    const planCard = timeline.locator("#m-c-plan");
    await planCard.getByRole("button", { name: /Helper · Alpha/ }).click();
    await planCard.getByRole("button", { name: /@lead-alpha, helper of @lead/ }).waitFor();
    await fits();
    if (shots) await page.screenshot({ path: `${shots}/crew-${width}.png` });

    // A request my lead drafted: sent in the words I approve, then its card is in the Room.
    const draft = timeline.locator("#m-c-req-draft");
    await draft.scrollIntoViewIfNeeded();
    assert.ok(await draft.getByText("Send this request to @ben?").isVisible(), "a drafted request, not a post");
    assert.ok(await draft.getByText("for Ben (@ben), through their lead").isVisible());
    await draft.getByRole("textbox", { name: "The request, as the room will read it" }).fill("When does the API change land? I need the date for Friday's launch note.");
    await fits();
    if (shots) await page.screenshot({ path: `${shots}/request-draft-${width}.png` });
    await draft.getByRole("button", { name: "Send request" }).click();
    await draft.getByText("Sent", { exact: true }).waitFor();
    assert.deepEqual(state.calls.find((call) => call.approval === "c-req-draft").body, { decision: "approve", body: "When does the API change land? I need the date for Friday's launch note." });
    await draft.getByRole("button", { name: "See it in the room" }).click();
    await page.waitForFunction(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.startsWith("Room"));
    await timeline.locator("#m-c-request-3").getByText("When does the API change land? I need the date for Friday's launch note.").waitFor();
    await crewTab.click();

    // Share to room: my lead's private reply, through my lead; the copy is in the Room.
    const reply = timeline.locator("#m-c-reply");
    await action(reply, "Share to room");
    await reply.getByRole("toolbar", { name: "Message actions" }).getByRole("button", { name: "Through @lead" }).click();
    await reply.getByRole("button", { name: "Shared to room" }).waitFor();
    assert.deepEqual(state.calls.find((call) => call.share), { share: "c-reply", body: { as: "lead" } });
    await reply.getByRole("button", { name: "Shared to room" }).click();
    await page.waitForFunction(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.startsWith("Room"));
    const copy = timeline.locator('[id^="m-shared-"]');
    await copy.getByText("Alpha found 3 stale commands", { exact: false }).waitFor();
    assert.ok(await copy.getByRole("button", { name: "Shared by you" }).isVisible(), "the copy says it was shared, and goes back to where it came from");

    // "Decide in My crew" from the public card goes to my own card.
    assert.ok(await requestCard.getByText("Accepted by you").isVisible(), "the public card follows the decision");
    assert.equal(await requestCard.getByText("Review the sign-up fix on a phone and a computer.").count(), 0, "my words for my lead never reach the room's card");

    // A message from before I joined: no reaction and no pin, said plainly.
    const before = timeline.locator("#m-c-ben");
    await action(before, "Add a reaction");
    await before.getByRole("button", { name: "React with 👍" }).click();
    await page.getByText("You can react only to messages from since you joined.").waitFor();
    await action(before, "Pin for everyone here");
    await page.getByText("You can pin only messages everyone here can read, from since you joined.").waitFor();

    // Ask someone here: a review needs its exact candidate.
    await page.getByRole("button", { name: "Ask someone here…", exact: true }).click();
    const form = page.getByRole("dialog", { name: "Ask someone here" });
    assert.equal(await form.getByLabel("To", { exact: true }).inputValue(), "ben", "the only other person is picked");
    await form.getByRole("radio", { name: "Review" }).click();
    await form.getByLabel("What you need", { exact: true }).fill("Check the pricing page copy on a phone.");
    await form.getByRole("button", { name: /^Send request/ }).click();
    await form.getByText(/A review needs its exact candidate/).waitFor();
    assert.equal(state.calls.filter((call) => call.request).length, 0, "nothing is sent without a candidate");
    await form.getByLabel("Or a web address").fill("https://preview.acme.example/pricing");
    await drawerFits();
    if (shots) await page.screenshot({ path: `${shots}/request-${width}.png` });
    await form.getByRole("button", { name: /^Send request/ }).click();
    await page.getByText("Asked. Its card is in the room.").waitFor();
    assert.deepEqual(state.calls.find((call) => call.request).request, { to: "ben", kind: "review", text: "Check the pricing page copy on a phone.", candidate: { url: "https://preview.acme.example/pricing" } });
    const mine = timeline.locator("#m-c-request-2");
    await mine.getByText("Waiting for Ben").waitFor();
    await mine.getByRole("button", { name: "Cancel request" }).click();
    await mine.getByText("Cancelled", { exact: true }).waitFor();
    assert.equal(dialogs.at(-1), "Cancel this request? Its card says it was cancelled.");

    // The trust sheet: for everyone, for one person, the budget, and items my lead may share.
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: "What your lead may share" }).click();
    const sheet = page.getByRole("dialog", { name: "What your lead may share" });
    await sheet.getByRole("group", { name: "Status questions" }).first().getByRole("radio", { name: "Ask me first" }).click();
    await sheet.getByRole("button", { name: "Change Ben's rules" }).click();
    const benRules = sheet.locator("li").filter({ hasText: "Ben" }).first();
    await benRules.getByRole("group", { name: "Requests for work and reviews" }).getByRole("radio", { name: "Accept on its own" }).click();
    await benRules.getByRole("checkbox", { name: "Reviews" }).check();
    await sheet.getByLabel("Monthly credits for answering others").fill("50");
    await sheet.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("Saved. Your lead follows it from now on.").waitFor();
    assert.deepEqual(state.calls.find((call) => call.trust).trust, { everyone: { status: "ask" }, people: { ben: { workRequests: "accept", acceptKinds: ["review"] } }, budget: 50 });
    await sheet.getByText("Accepts reviews on its own", { exact: false }).waitFor();
    await sheet.getByRole("button", { name: "Add an item" }).click();
    await sheet.getByRole("textbox", { name: "Find a page, task or file" }).fill("road");
    await sheet.getByRole("list", { name: "Results" }).getByRole("button", { name: /Roadmap/ }).click();
    await sheet.getByRole("button", { name: "Stop sharing Roadmap" }).waitFor();
    assert.deepEqual(state.calls.find((call) => call.shareable).shareable, { kind: "page", id: "7c1d2a3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d", spaceId: "me", shared: true });
    await drawerFits();
    if (shots) await page.screenshot({ path: `${shots}/trust-${width}.png` });
    await page.keyboard.press("Escape");
    await sheet.waitFor({ state: "detached" });

    // Room settings: presence beside each person, and away with a note.
    await page.getByRole("button", { name: "Launch room", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Room settings" });
    await settings.getByText(/^Away until .* · At the dentist$/).waitFor();
    assert.ok(await settings.getByText("Away", { exact: true }).count(), "Ben shows as away");
    await settings.getByRole("button", { name: "Set away" }).click();
    await settings.getByLabel("How long", { exact: true }).selectOption("hour");
    await settings.getByRole("textbox", { name: "A note (optional)" }).fill("At a workshop");
    await settings.getByRole("button", { name: "Set away" }).click();
    await page.getByText("You are away here. Your status card says so.").waitFor();
    const away = state.calls.find((call) => call.status).status;
    assert.equal(away.away, true);
    assert.equal(away.note, "At a workshop");
    assert.ok(Math.abs(Date.parse(away.until) - (Date.now() + 3_600_000)) < 120_000, "an hour from now");
    await settings.getByRole("button", { name: "I am back" }).waitFor();
    await drawerFits();
    if (shots) await page.screenshot({ path: `${shots}/settings-${width}.png` });
    await page.keyboard.press("Escape");

    // The public card's "Decide in My crew" takes the target to their own card.
    const first = state.requests.find((row) => row.id === "req-1");
    first.status = "awaiting_owner";
    find("c-request").data = state.publicCard(first);
    await emit("node.message.updated", find("c-request"));
    await requestCard.getByRole("button", { name: "Decide in My crew" }).click();
    await page.waitForFunction(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.startsWith("My crew"));
    await timeline.locator("#m-c-owner").waitFor();
    await fits();

    assert.deepEqual(errors, [], "no page errors");
    assert.deepEqual([...new Set(unexpected)], [], "no unmocked API calls");
    await context.close();
    console.log(`rooms v2 ok at ${width}px`);
  }
} finally {
  await browser.close();
}
