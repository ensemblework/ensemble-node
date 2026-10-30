/**
 * Local, stateful browser fixture for the work of a room with other people (Ensemble docs/35
 * §12.11–12.14): each tab's own unread and read marker as Ensemble keeps them, a live reply in the tab
 * it is written for, the creator linking a space to the room, closing my own tasks, a steward, the
 * Board (a proposed task decided in My crew, a steward's proposal started with the one question, pages
 * the room follows with a contract and a watched page, decisions logged from the room), the owner's
 * card for a proposed task with its mode, the lead's notes of what changed (Start, a contract's diff),
 * the catch-up digest, a result drafted for the owner and posted into the room with its media, the offer
 * to join another room's space, and the mode question in Needs me. Never points at a hosted account or
 * calls a model. Usage is in docs/05 (Browser regression).
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

/** A small PNG of one colour, so a result's picture is a real picture. */
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
const PICTURE = png(160, 100, [70, 120, 90]);

function fixture() {
  const avatar = (color) => ({ shape: "orb", color, eyes: "dot" });
  const base = { status: "active", charter: "", runProfileId: null, templateId: null, createdAt: at(-9000), provider: "ensemble", model: "gpt-5-mini", parentNodeId: null, autonomy: {} };
  const lead = { ...base, id: "lead", ownerId: "me", slug: "lead", name: "Lead", role: "manager", avatar: avatar("#D7B56F") };
  const builder = { ...base, id: "builder", ownerId: "me", slug: "builder", name: "Builder", role: "engineer", avatar: avatar("#7FB3D5") };
  const atlas = { ...base, id: "ben-lead", ownerId: "ben", slug: "atlas", name: "Atlas", role: "manager", avatar: avatar("#C39BD3") };
  const me = { id: "p-me", kind: "person", handle: "mira", accountId: "me", role: "owner", name: "Mira", responsibility: "frontend", me: true };
  const ben = { id: "p-ben", kind: "person", handle: "ben", accountId: "ben", role: "member", name: "Ben", responsibility: "backend", me: false };
  const node = (row, lead = false) => ({ id: `m-${row.id}`, kind: "node", handle: row.slug, accountId: row.ownerId, lead, representative: lead, node: row });
  const room = (id, title, members, extra) => ({ id, title, kind: "room", members, createdBy: "me", lastSeq: 0, readSeq: 0, unread: 0, lastMessageAt: at(-5), pinned: [], invites: [], leadNodeIds: [], last: null, ...extra });
  const rooms = [
    room("launch", "Launch", [me, ben, node(lead, true), node(builder), node(atlas, true)], { spaceId: null, readSeq: 2, readSeqCrew: 4, unreadRoom: 2, unreadCrew: 5, unread: 7 }),
    room("studio", "Studio", [me, ben, node(lead, true), node(atlas, true)], { createdBy: "ben", spaceId: "s-studio", readSeq: 1, readSeqCrew: 1, unreadRoom: 0, unreadCrew: 1, unread: 1 }),
  ];
  const seqs = {};
  const message = (roomId, id, kind, body, extra = {}) => {
    const seq = (seqs[roomId] = (seqs[roomId] ?? 0) + 1);
    return { id, roomId, seq, kind, body, authorKind: "node", authorAccountId: "me", authorNodeId: "lead", data: {}, private: false, mentions: [], rootMessageId: null, clientId: null, planId: null, createdAt: at(-90 + seq * 3), ...extra };
  };
  const person = (who) => ({ authorKind: "human", authorAccountId: who, authorNodeId: null });
  const system = { authorKind: "system", authorNodeId: null };
  const requestWork = {
    id: "req-work", roomId: "launch", kind: "work", status: "awaiting_owner", text: "Add a CSV export to the reports page.", refs: null, candidate: null,
    from: { accountId: "ben", name: "Ben", handle: "ben", nodeId: "ben-lead", nodeHandle: "atlas" }, to: { accountId: "me", name: "Mira", handle: "mira", leadNodeId: "lead", leadHandle: "lead" },
    answer: null, outcome: null, requirements: [], cardId: "c-request", ownerCardId: "c-owner", missionId: null, taskId: "t-req", mode: null, createdAt: at(-60), updatedAt: at(-60), decidedAt: null,
  };
  const requestStudio = { ...requestWork, id: "req-studio", roomId: "studio", text: "Draft the studio's onboarding page.", cardId: null, ownerCardId: "s-owner", taskId: "t-studio" };
  const publicCard = (row) => ({ type: "peer_request", requestId: row.id, kind: row.kind, status: row.status, text: row.text, refs: row.refs, candidate: row.candidate, from: row.from, to: row.to, answer: row.answer, outcome: row.outcome, requirements: row.requirements, taskId: row.taskId, mode: row.mode, updatedAt: row.updatedAt });
  const ownerCard = (row) => ({ type: "peer_request", status: "pending", requestId: row.id, kind: row.kind, text: row.text, refs: null, candidate: null, from: { accountId: "ben", name: "Ben" }, nodes: [{ handle: "lead", name: "Lead", role: "manager", lead: true }, { handle: "builder", name: "Builder", role: "engineer", lead: false }], cost: "If you accept, your lead plans it with your nodes, on your computer and your subscriptions and credits.", taskId: row.taskId, modes: ["private", "shared"], defaultMode: "private" });
  const launch = [
    message("launch", "c-hello", "text", "Morning! Shall we ship on Thursday?", person("ben")),
    message("launch", "c-friday", "text", "Let's ship on Friday instead: the API needs a day more.", person("ben")),
    message("launch", "c-decision", "status", "Mira logged a decision: “Let's ship on Friday instead: the API needs a day more.” It replaces an earlier one.", { ...system, authorAccountId: "me", data: { type: "decision_logged", decisionId: "d2", messageId: "c-friday", pageId: "p-log", spaceId: "s-launch", text: "Ship on Friday", supersedes: { decisionId: "d1", messageId: "c-hello" } } }),
    message("launch", "c-request", "request", "Ben asked Mira (work): Add a CSV export to the reports page.", { ...system, authorAccountId: "ben", data: publicCard(requestWork) }),
    message("launch", "c-owner", "approval", "Ben asks for work: “Add a CSV export to the reports page.”. Accept, edit or decline.", { private: true, data: ownerCard(requestWork) }),
    message("launch", "c-events", "text", "Ben assigned you “Landing copy”. Shall I start it with @builder?", { private: true, data: { type: "room_events", items: [{ kind: "assigned", subjectKind: "task", subjectId: "t-copy", title: "Landing copy", spaceId: "s-launch", actor: { accountId: "ben", name: "Ben", nodeId: null }, at: at(-30) }], start: { taskIds: ["t-copy"] }, suggest: { nodeId: "builder", handle: "builder" } } }),
    message("launch", "c-contract", "text", "Ben changed the contract “API contract”: + GET /v2/export; − GET /export. It touches your “Landing copy”. Shall I steer @builder to adapt your work to it?", { private: true, data: { type: "room_events", items: [{ kind: "contract_changed", subjectKind: "page", subjectId: "p-contract", title: "API contract", spaceId: "s-launch", actor: { accountId: "ben", name: "Ben", nodeId: null }, revision: 7, diff: { added: ["GET /v2/export returns CSV"], removed: ["GET /export"] }, tasks: [{ taskId: "t-copy", title: "Landing copy" }], at: at(-25) }], suggest: { nodeId: "builder", handle: "builder" } } }),
    message("launch", "c-digest", "text", "Ben asked you for the CSV export; it waits for your yes.\nThe API contract changed: exports move to /v2.\nA decision was logged: ship on Friday.", { private: true, data: { type: "digest", reason: "back", since: at(-600), items: { asked: [{ requestId: "req-work", kind: "work", from: { accountId: "ben", name: "Ben" }, text: "Add a CSV export to the reports page.", status: "awaiting_owner", taskId: "t-req" }], proposed: [{ taskId: "t-req", title: "Add the CSV export", requestedBy: "Ben" }], events: [{}], board: [{ taskId: "t-api", title: "API v2 endpoints", status: "in_progress" }], results: [], decisions: [{ messageId: "c-decision", text: "Ship on Friday" }], room: { messages: 2, from: ["Ben"] } } } }),
    message("launch", "c-draft", "approval", "Invoice download is ready.\n- ✓ Downloads a PDF\n- ✓ Works on a phone\nTask: “Invoice download”", { private: true, data: { type: "post", status: "pending", result: { missionId: "mission-9", taskId: "t-invoice", spaceId: "s-launch", outcome: "succeeded", requirements: [{ text: "Downloads a PDF", status: "accepted" }, { text: "Works on a phone", status: "accepted" }], files: 1 }, media: [{ evidenceId: "e-invoice", kind: "screenshot", name: "invoice.png", mime: "image/png", caption: "The invoice on a phone", size: 48210 }], refs: [{ kind: "task", id: "t-invoice", spaceId: "s-launch", title: "Invoice download" }] } }),
  ];
  const studio = [
    message("studio", "s-hello", "text", "Welcome to the studio room.", person("ben")),
    message("studio", "s-offer", "status", "This room's work lives in Ben's space “Studio space”. Join it as an editor to see and work on its board, pages and runs?", { ...system, private: true, data: { type: "space_offer", status: "pending", spaceId: "s-studio", spaceName: "Studio space", ownerName: "Ben", role: "editor" } }),
    message("studio", "s-owner", "approval", "Ben asks for work: “Draft the studio's onboarding page.”. Accept, edit or decline.", { private: true, data: ownerCard(requestStudio) }),
  ];
  const messages = { launch, studio };
  for (const row of rooms) {
    row.lastSeq = messages[row.id].at(-1).seq;
    row.last = messages[row.id].at(-1);
  }
  const person_ = (accountId) => ({ accountId, name: accountId === "me" ? "Mira" : "Ben" });
  const board = {
    launch: [
      { id: "t-req", title: "Add the CSV export", status: "proposed", priority: "p1", due: null, assignee: person_("me"), requestedBy: { ...person_("ben"), node: { id: "ben-lead", name: "Atlas" } }, peerRequestId: "req-work", madeBy: { node: { id: "ben-lead", name: "Atlas" }, for: person_("ben") }, updatedAt: at(-60) },
      { id: "t-steward", title: "Write the release checklist", status: "proposed", priority: "p1", due: at(60 * 30), assignee: person_("me"), requestedBy: { ...person_("ben"), node: { id: "builder", name: "Builder" } }, peerRequestId: null, madeBy: { node: { id: "builder", name: "Builder" }, for: person_("ben") }, updatedAt: at(-40) },
      { id: "t-api", title: "API v2 endpoints", status: "in_progress", priority: "p0", due: at(60 * 20), assignee: person_("ben"), requestedBy: null, peerRequestId: null, madeBy: null, updatedAt: at(-20) },
      { id: "t-copy", title: "Landing copy", status: "todo", priority: "p1", due: null, assignee: person_("me"), requestedBy: null, peerRequestId: null, madeBy: null, updatedAt: at(-30) },
      { id: "t-old", title: "Pricing page", status: "done", priority: "p2", due: null, assignee: person_("ben"), requestedBy: null, peerRequestId: null, madeBy: null, updatedAt: at(-900) },
    ],
    studio: [],
  };
  const pages = [
    { pageId: "p-contract", taskId: null, title: "API contract", role: "contract", watchers: 2, watching: true, updatedAt: at(-25) },
    { pageId: "p-log", taskId: null, title: "Decisions — Launch", role: "decisions", watchers: 0, watching: false, updatedAt: at(-10) },
  ];
  const decisions = [
    { id: "d2", text: "Ship on Friday", messageId: "c-friday", pageId: "p-log", saidBy: person_("ben"), loggedBy: person_("me"), supersedesId: "d1", replaced: false, at: at(-10) },
    { id: "d1", text: "Ship on Thursday", messageId: "c-hello", pageId: "p-log", saidBy: person_("ben"), loggedBy: person_("ben"), supersedesId: null, replaced: true, at: at(-80) },
  ];
  const candidates = {
    spaces: [{ id: "me", name: "Mira's space", role: "owner", linked: false }, { id: "s-launch", name: "Launch space", role: "owner", linked: true }],
    items: [
      { kind: "page", id: "p-notes", title: "Release notes", spaceId: "s-launch", spaceName: "Launch space", updatedAt: at(-50), shared: false },
      { kind: "page", id: "p-roadmap", title: "My roadmap", spaceId: "me", spaceName: "Mira's space", updatedAt: at(-70), shared: false },
      { kind: "task", id: "t-copy", title: "Landing copy", spaceId: "s-launch", spaceName: "Launch space", updatedAt: at(-30), shared: false },
    ],
  };
  const cards = [{ accountId: "me", name: "Mira", handle: "mira", lead: { nodeId: "lead", handle: "lead", name: "Lead" }, presence: "online", away: null, detail: "titles", asks: false, missions: [], tasks: [] }, { accountId: "ben", name: "Ben", handle: "ben", lead: { nodeId: "ben-lead", handle: "atlas", name: "Atlas" }, presence: "online", away: null, detail: "titles", asks: false, missions: [], tasks: [] }];
  const space = { launch: null, studio: { id: "s-studio", name: "Studio space", ownerId: "ben", ownerName: "Ben", role: null } };
  const offers = { launch: null, studio: { messageId: "s-offer", status: "pending" } };
  const boot = { me: { id: "me", name: "Mira", email: "mira@fieldnote.example", verified: true }, nodes: [lead, builder], rooms, computers: [], credits: null, invites: [], templates: { nodes: [], crews: [] }, limits: { roomPeople: 10, nodesPerPerson: 3, crewNodes: 24, pins: 25, reactions: ["👍", "❤️", "✅"], declineBlockDays: 30 }, models: { default: "gpt-5-mini", options: [] } };
  return { boot, messages, message, requests: { launch: [requestWork], studio: [requestStudio] }, publicCard, board, pages, decisions, candidates, cards, space, offers, steward: null, prefs: { closeTasks: "auto" }, calls: [], reads: [], evidence: [] };
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
    const spaceView = (roomId) => ({ space: state.space[roomId], offer: state.offers[roomId] });
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      const json = (data, status = 200) => route.fulfill({ status, json: data, headers: cors });
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE", "access-control-allow-headers": "content-type, accept" } });
      if (path === "/api/auth/me") return json({ user: state.boot.me });
      if (path === "/api/node/bootstrap") return json(state.boot);
      if (path === "/api/node/activity") return json({ approvals: [find("s-owner")].filter((row) => row.data.status === "pending"), runs: [], turns: [], computers: [], credits: null, waitingTasks: [] });
      if (path === "/api/decisions") return json({ decisions: [] });
      if (path === "/api/approvals") return json({ approvals: [] });
      if (path === "/api/devices") return json({ devices: [] });
      if (path === "/api/documents") return json({ files: [], usage: { maxFileBytes: 25000000 } });
      if (path === "/api/spaces") return json({ activeId: "me", account: { sync: false, role: null }, spaces: [{ id: "me", name: "Mira's space", primary: true }, { id: "s-launch", name: "Launch space", primary: false }], shared: [] });
      const evidence = /^\/api\/node\/evidence\/([^/]+)$/.exec(path);
      if (evidence) {
        state.evidence.push({ id: evidence[1], message: url.searchParams.get("message") });
        return route.fulfill({ status: 200, body: PICTURE, headers: { ...cors, "content-type": "image/png" } });
      }
      const one = /^\/api\/node\/messages\/([^/]+)$/.exec(path);
      if (one && method === "GET") return find(one[1]) ? json({ message: find(one[1]) }) : json({ error: "That message is not available." }, 404);
      const read = /^\/api\/node\/rooms\/([^/]+)\/read$/.exec(path);
      if (read) {
        state.reads.push({ room: read[1], ...request.postDataJSON() });
        return route.fulfill({ status: 204, headers: cors });
      }
      const messages = /^\/api\/node\/rooms\/([^/]+)\/messages$/.exec(path);
      if (messages && method === "GET") return json({ messages: state.messages[messages[1]] ?? [] });
      const roomPart = /^\/api\/node\/rooms\/([^/]+)\/(status|requests|space|space\/join|board|pages|decisions|steward|prefs|shareable\/candidates)$/.exec(path);
      if (roomPart) {
        const [, roomId, part] = roomPart;
        const body = method === "GET" || method === "DELETE" ? null : request.postDataJSON();
        if (body || method === "DELETE") state.calls.push({ [part]: roomId, method, body });
        if (part === "status") return json({ cards: state.cards });
        if (part === "requests") return json({ requests: state.requests[roomId] ?? [] });
        if (part === "space" && method === "GET") return json(spaceView(roomId));
        if (part === "space" && method === "PUT") {
          state.space[roomId] = { id: body.spaceId, name: "Launch space", ownerId: "me", ownerName: "Mira", role: "owner" };
          state.boot.rooms.find((row) => row.id === roomId).spaceId = body.spaceId;
          return json(spaceView(roomId));
        }
        if (part === "space" && method === "DELETE") {
          state.space[roomId] = null;
          state.boot.rooms.find((row) => row.id === roomId).spaceId = null;
          return json({ ok: true });
        }
        if (part === "space/join") {
          state.space[roomId] = { ...state.space[roomId], role: "editor" };
          state.offers[roomId] = { ...state.offers[roomId], status: "joined" };
          find("s-offer").data = { ...find("s-offer").data, status: "joined" };
          return json(spaceView(roomId));
        }
        if (part === "board") return json({ space: state.space[roomId] ? { id: state.space[roomId].id, name: state.space[roomId].name, role: state.space[roomId].role } : null, tasks: state.space[roomId]?.role ? state.board[roomId] : [] });
        if (part === "pages") return json({ pages: roomId === "launch" ? state.pages : [] });
        if (part === "decisions") return json({ decisions: roomId === "launch" ? state.decisions : [] });
        if (part === "steward" && method === "GET") return json({ steward: state.steward });
        if (part === "steward" && method === "PUT") {
          state.steward = { nodeId: body.nodeId, sponsorId: "me", since: new Date().toISOString() };
          return json({ steward: state.steward });
        }
        if (part === "prefs" && method === "GET") return json({ prefs: state.prefs });
        if (part === "prefs" && method === "PUT") {
          Object.assign(state.prefs, body);
          return json({ prefs: state.prefs });
        }
        if (part === "shareable/candidates") {
          const q = (url.searchParams.get("q") ?? "").toLowerCase();
          return json({ spaces: state.candidates.spaces, items: state.candidates.items.filter((row) => row.title.toLowerCase().includes(q)) });
        }
      }
      const pagePart = /^\/api\/node\/rooms\/launch\/pages\/([^/]+)(\/watch)?$/.exec(path);
      if (pagePart && method === "PUT") {
        const body = request.postDataJSON();
        state.calls.push({ page: pagePart[1], body });
        let row = state.pages.find((item) => item.pageId === pagePart[1]);
        if (!row) {
          row = { pageId: pagePart[1], taskId: null, title: "Release notes", role: "watched", watchers: 0, watching: false, updatedAt: new Date().toISOString() };
          state.pages.push(row);
        }
        if (pagePart[2]) Object.assign(row, { watching: body.watching, watchers: row.watchers + (body.watching ? 1 : -1) });
        else row.role = body.role;
        return json({ pages: state.pages });
      }
      const start = /^\/api\/node\/rooms\/([^/]+)\/tasks\/([^/]+)\/start$/.exec(path);
      if (start && method === "POST") {
        state.calls.push({ start: start[2], body: request.postDataJSON() });
        return json({ started: true }, 202);
      }
      const decide = /^\/api\/node\/requests\/([^/]+)\/accept$/.exec(path);
      if (decide && method === "POST") {
        const body = request.postDataJSON();
        state.calls.push({ accept: decide[1], body });
        const row = [...state.requests.launch, ...state.requests.studio].find((item) => item.id === decide[1]);
        Object.assign(row, { status: "approved", mode: body.mode ?? "private", missionId: null });
        if (row.cardId) find(row.cardId).data = state.publicCard(row);
        find(row.ownerCardId).data = { ...find(row.ownerCardId).data, status: "accepted" };
        return json({ request: row });
      }
      const approval = /^\/api\/node\/approvals\/([^/]+)$/.exec(path);
      if (approval && method === "POST") {
        const body = request.postDataJSON();
        state.calls.push({ approval: approval[1], body });
        const card = find(approval[1]);
        card.data = { ...card.data, status: body.decision === "approve" ? "posted" : "discarded" };
        return json({ message: card });
      }
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
    const fits = async (label) => assert.deepEqual(await overflowing("main"), [], `${label} fits at ${width}px`);
    const drawerFits = async () => assert.deepEqual(await overflowing('[role="dialog"]'), [], `${width}px: the drawer fits`);
    const shot = async (name) => {
      if (!shots) return;
      // Notes on screen fade by themselves; the picture is of the page.
      for (const button of await page.getByRole("button", { name: "Dismiss" }).all()) await button.click().catch(() => undefined);
      await page.screenshot({ path: `${shots}/${name}-${width}.png` });
    };
    const until = async (check, what) => {
      for (let tries = 0; tries < 60; tries += 1) {
        if (check()) return;
        await page.waitForTimeout(100);
      }
      assert.fail(`waited for ${what}`);
    };
    const selected = () => page.evaluate(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent ?? "");

    // Needs me: a proposed task asks how it runs before it is accepted.
    await page.goto(`${WEB}/needs-me`);
    const needs = page.getByRole("region", { name: /From your nodes/ });
    await needs.getByText("Ben asks you for work", { exact: false }).or(needs.getByText("brings you Ben's request for work", { exact: false })).first().waitFor();
    const needsModes = needs.getByRole("group", { name: "How should it run?" });
    assert.ok(await needsModes.getByRole("radio", { name: /Private work, shared result/ }).isChecked(), "private work with a shared result is the usual");
    await needs.getByRole("button", { name: "Accept", exact: true }).click();
    await until(() => state.calls.some((call) => call.accept === "req-studio"), "the studio request to be accepted");
    assert.deepEqual(state.calls.find((call) => call.accept === "req-studio").body, { mode: "private" });
    await shot("needs-mode");

    // The Room: its own unread and marker; My crew's count is Ensemble's.
    await page.goto(`${WEB}/r/launch`);
    const roomTab = page.getByRole("tab", { name: /^Room/ });
    const crewTab = page.getByRole("tab", { name: /^My crew/ });
    const boardTab = page.getByRole("tab", { name: /^Board/ });
    await roomTab.waitFor();
    const timeline = page.locator(".chat-timeline");
    await timeline.locator("#m-c-decision").waitFor();
    assert.match((await crewTab.textContent()) ?? "", /My crew5/, "My crew's own unread, as Ensemble counts it");
    assert.ok(await page.locator("#unread-divider").isVisible(), "the Room's divider, from its own marker");
    await timeline.evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await until(() => state.reads.some((row) => row.room === "launch" && row.tab === "room" && row.upTo === 4), "the Room's marker");
    assert.ok(!state.reads.some((row) => row.tab === "crew"), "My crew is not read from the Room");
    assert.match((await crewTab.textContent()) ?? "", /My crew5/, "reading the Room leaves My crew's news");

    // A live reply written for My crew is not in the Room; a new private message counts in My crew.
    await emit("node.status", { roomId: "launch", nodeId: "lead", state: "thinking", private: true });
    await page.waitForTimeout(200);
    assert.equal(await timeline.getByText("Thinking…").count(), 0, "a reply for My crew is not shown in the Room");
    const nudge = post(state.message("launch", "c-nudge", "text", "One more thing for you: the export needs a date filter.", { private: true, createdAt: new Date().toISOString() }));
    await emit("node.message", nudge);
    await page.waitForFunction(() => /My crew6/.test(document.querySelectorAll('[role="tab"]')[1]?.textContent ?? ""));

    // A logged decision's line leads to the Board; this room has no space yet.
    const decisionLine = timeline.locator("#m-c-decision");
    assert.ok(await decisionLine.getByText("Mira logged a decision", { exact: false }).isVisible());
    await fits("The Room");
    await shot("room");
    await decisionLine.getByRole("button", { name: "All decisions" }).click();
    assert.equal(await boardTab.getAttribute("aria-selected"), "true");
    const board = page.getByRole("tabpanel", { name: /Board/ });
    await board.getByText("No shared space yet").waitFor();
    assert.equal(await page.getByRole("textbox", { name: /^Message Launch/ }).count(), 0, "the Board has no composer");

    // The creator links a space from the room's settings; closes their own tasks; sponsors a steward.
    await board.getByRole("button", { name: "Link a space" }).click();
    const settings = page.getByRole("dialog", { name: "Room settings" });
    const spaceSection = settings.getByRole("region", { name: "The room's space" });
    await spaceSection.getByLabel("Your space").selectOption("s-launch");
    await spaceSection.getByRole("button", { name: "Link", exact: true }).click();
    await page.getByText("Linked. Everyone here is offered to join it.").waitFor();
    assert.deepEqual(state.calls.find((call) => call.space === "launch" && call.method === "PUT").body, { spaceId: "s-launch" });
    await emit("node.room", { roomId: "launch" });
    await spaceSection.getByText("Its work lives in your space “Launch space”. It is yours.").waitFor();
    assert.ok(await spaceSection.getByRole("button", { name: "Unlink" }).isVisible());
    const prefs = settings.getByRole("region", { name: "When your work here is done" });
    await prefs.getByRole("radio", { name: "I close my tasks" }).click();
    await until(() => state.calls.some((call) => call.prefs === "launch"), "the preference to save");
    assert.deepEqual(state.calls.find((call) => call.prefs === "launch").body, { closeTasks: "me" });
    const stewardSection = settings.getByRole("region", { name: "Steward" });
    assert.equal(await stewardSection.getByText("Lead", { exact: true }).count(), 0, "my lead answers for me: never the steward");
    await stewardSection.getByRole("button", { name: "Make steward" }).click();
    await stewardSection.getByText("@builder is the steward").waitFor();
    assert.ok(await stewardSection.getByText("sponsored by you").isVisible());
    assert.deepEqual(state.calls.find((call) => call.steward === "launch").body, { nodeId: "builder" });
    await drawerFits();
    await shot("settings-space");
    await page.keyboard.press("Escape");
    await settings.waitFor({ state: "detached" });

    // The Board: proposed tasks first, with who asked; mine to decide or start.
    await board.getByRole("region", { name: "The room's space" }).getByText("Launch space", { exact: true }).waitFor();
    assert.ok(await page.getByText(/3 nodes · Launch space/).isVisible(), "the header says which space holds the room's work");
    const proposed = board.getByRole("group", { name: "Proposed" });
    const requested = proposed.locator('[data-task="t-req"]');
    await requested.waitFor();
    assert.ok(await requested.getByText("with you · asked by Ben through @atlas").isVisible());
    const stewards = proposed.locator('[data-task="t-steward"]');
    assert.ok(await stewards.getByText("with you · asked by Ben through @builder").isVisible(), "the steward's proposal, for whom");
    await stewards.getByRole("button", { name: "Start “Write the release checklist”" }).click();
    await stewards.getByRole("button", { name: "Start it" }).click();
    await stewards.getByText("Started: your lead plans it in My crew.").waitFor();
    assert.deepEqual(state.calls.find((call) => call.start === "t-steward").body, { mode: "private" });
    assert.ok(await board.getByRole("group", { name: "In progress" }).getByText("High").isVisible(), "a high priority stands out");
    assert.equal(await board.getByText("Pricing page").count(), 0, "done tasks fold away");
    await board.getByRole("button", { name: /Done \(1\)/ }).click();
    await board.getByText("Pricing page").waitFor();

    // Pages the room follows: watch the log; follow the release notes as a contract.
    const pagesSection = board.getByRole("region", { name: "Pages the room follows" });
    assert.equal(await pagesSection.getByRole("combobox", { name: "What “API contract” is to the room" }).inputValue(), "contract", "an editor sees and changes what each page is to the room");
    await pagesSection.getByRole("button", { name: "Watch Decisions — Launch" }).click();
    await pagesSection.getByRole("button", { name: "Stop watching Decisions — Launch" }).waitFor();
    await pagesSection.getByRole("button", { name: "Follow a page" }).click();
    await pagesSection.getByRole("textbox", { name: "Find a page of the room's space" }).fill("release");
    await pagesSection.getByRole("list", { name: "Pages" }).getByRole("button", { name: /Release notes/ }).click();
    assert.equal(await pagesSection.getByRole("list", { name: "Pages" }).getByText("My roadmap").count(), 0, "only the room's space");
    await pagesSection.getByRole("radiogroup", { name: "What it is to the room" }).getByRole("radio", { name: "Contract" }).click();
    await pagesSection.getByRole("button", { name: "Make it the contract" }).click();
    await pagesSection.locator('[data-page="p-notes"]').waitFor();
    assert.deepEqual(state.calls.filter((call) => call.page).map((call) => [call.page, call.body]), [["p-log", { watching: true }], ["p-notes", { role: "contract" }]]);

    // Decisions: who said and logged each; a replaced one says so.
    const decisionsSection = board.getByRole("region", { name: "Decisions" });
    assert.ok(await decisionsSection.locator('[data-decision="d2"]').getByText("Ben said it, you logged it · replaces an earlier one").isVisible());
    assert.ok(await decisionsSection.locator('[data-decision="d1"]').getByText("Ben said and logged it · replaced since").isVisible());
    await fits("The Board");
    await shot("board");

    // A proposed task of mine is decided in My crew: the one question, then Accept.
    await requested.getByRole("button", { name: "Decide in My crew" }).click();
    await page.waitForFunction(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.startsWith("My crew"));
    const owner = timeline.locator("#m-c-owner");
    await owner.getByText("A proposed task on the room's board").waitFor();
    await owner.getByRole("radio", { name: /Shared run/ }).check();
    await owner.getByRole("button", { name: "Accept", exact: true }).click();
    await owner.getByText("Accepted", { exact: true }).waitFor();
    assert.deepEqual(state.calls.find((call) => call.accept === "req-work").body, { mode: "shared" });
    await timeline.evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await until(() => state.reads.some((row) => row.room === "launch" && row.tab === "crew" && row.upTo === 10), "My crew's marker");

    // My lead's notes: Start for a task now mine; a contract's changed lines.
    const events = timeline.locator("#m-c-events");
    assert.ok(await events.getByRole("link", { name: /Landing copy/ }).isVisible(), "what it is about opens in Ensemble");
    await events.getByRole("button", { name: "Start “Landing copy”" }).click();
    await events.getByRole("radio", { name: /Shared run/ }).check();
    await events.getByRole("button", { name: "Start it" }).click();
    await events.getByText("Started: your lead plans it in My crew.").waitFor();
    assert.deepEqual(state.calls.find((call) => call.start === "t-copy").body, { mode: "shared" });
    const contract = timeline.locator("#m-c-contract").getByRole("group", { name: "What changed in API contract" });
    assert.ok(await contract.getByText("+ GET /v2/export returns CSV").isVisible());
    assert.ok(await contract.getByText("− GET /export").isVisible());
    assert.ok(await contract.getByText("It touches your “Landing copy”. Nothing changes until you say so.").isVisible());
    await fits("My crew");
    await shot("crew-events");

    // The catch-up digest, with everything it gathered.
    const digest = timeline.locator("#m-c-digest");
    assert.ok(await digest.getByText("While you were away").isVisible());
    await digest.getByRole("button", { name: "Everything it gathered" }).click();
    assert.ok(await digest.getByText("Ben asked for work: “Add a CSV export to the reports page.” (waiting for you)").isVisible());
    assert.ok(await digest.getByText("“API v2 endpoints” is in progress").isVisible());
    await shot("digest");

    // A result drafted for me, then posted into the room with its media and task.
    const draft = timeline.locator("#m-c-draft");
    await draft.scrollIntoViewIfNeeded();
    assert.ok(await draft.getByText("Post this result in “Launch” for you?").isVisible());
    assert.ok(await draft.getByRole("link", { name: /Invoice download/ }).isVisible(), "the task it goes onto");
    assert.ok(await draft.getByText("1 file is on the task").isVisible());
    await draft.getByRole("region", { name: "Media" }).locator("img").first().waitFor();
    await shot("result-draft");
    await draft.getByRole("button", { name: "Post", exact: true }).click();
    await draft.getByText("Posted", { exact: true }).waitFor();
    assert.equal(state.calls.find((call) => call.approval === "c-draft").body.decision, "approve");
    const result = post(state.message("launch", "c-result", "text", "Invoice download is ready.\n- ✓ Downloads a PDF\n- ✓ Works on a phone\nTask: “Invoice download”", { data: { type: "room_result", approvedBy: "me", missionId: "mission-9", taskId: "t-invoice", spaceId: "s-launch", outcome: "succeeded", requirements: [{ text: "Downloads a PDF", status: "accepted" }], files: 1, media: [{ evidenceId: "e-invoice", kind: "screenshot", name: "invoice.png", mime: "image/png", size: 48210 }], refs: [{ kind: "task", id: "t-invoice", spaceId: "s-launch", title: "Invoice download" }] }, createdAt: new Date().toISOString() }));
    await emit("node.message", result);

    // The digest's decision takes me to its line in the Room; the result is there, with its media and task.
    await digest.getByRole("button", { name: "Ship on Friday" }).click();
    await page.waitForFunction(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.startsWith("Room"));
    const posted = timeline.locator("#m-c-result").getByRole("group", { name: "Result" });
    await posted.waitFor();
    assert.ok(await posted.getByText("Done", { exact: true }).isVisible());
    await posted.getByRole("region", { name: "Media" }).locator("img").first().waitFor();
    assert.ok(await posted.getByRole("link", { name: /Invoice download/ }).isVisible(), "the task it went onto");
    await fits("The result");
    await shot("result");

    // The live reply shows in My crew, where it is written.
    await crewTab.click();
    await timeline.getByText("Thinking…").waitFor();
    await emit("node.status", { roomId: "launch", nodeId: "lead", state: "idle", private: true });

    // Another room's space: the offer to join it, then its Board.
    await page.goto(`${WEB}/r/studio`);
    await page.getByRole("tab", { name: /^My crew/ }).click();
    const offer = page.locator(".chat-timeline").locator("#m-s-offer").getByRole("group", { name: "The room's space" });
    await offer.getByText("Join “Studio space”?").waitFor();
    assert.ok(await offer.getByText("Waiting for you").isVisible());
    await shot("offer");
    await offer.getByRole("button", { name: "Join as editor" }).click();
    await offer.getByText("Joined", { exact: true }).waitFor();
    assert.deepEqual(state.calls.find((call) => call["space/join"] === "studio").body, { join: true });
    await offer.getByRole("button", { name: "See the room's board" }).click();
    const studioBoard = page.getByRole("tabpanel", { name: /Board/ });
    await studioBoard.getByText("Its work lives in Ben's space “Studio space”. You are an editor there.").waitFor();
    await studioBoard.getByText("No tasks yet.", { exact: false }).waitFor();
    await fits("Another room's Board");

    assert.deepEqual(errors, [], "no page errors");
    assert.deepEqual([...new Set(unexpected)], [], "no unmocked API calls");
    assert.match(await selected(), /^Board/);
    await context.close();
    console.log(`rooms v3 ok at ${width}px`);
  }
} finally {
  await browser.close();
}
