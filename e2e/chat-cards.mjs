/**
 * Local, stateful browser fixture for the cards in the chat (Ensemble Node has no Needs me page: every
 * question waits where the node is talking). At 320, 390 and 1280 px: a question from the owner's
 * computer answered on its card (the option travels as the decision's reason, the card folds into a
 * checkpoint at once and stays one when Ensemble settles it), the node shown waiting for an answer, a
 * command to run as administrator with the password sealed in the page for the computer's key (nothing
 * typed in the clear, bound to the card, the command's hash and this site; a refused password first,
 * which opens the card again with the tries left), one whose computer cannot take a password (Don't
 * run), checkpoints that open back into their card and close again, a crew's lead asking to add an
 * existing node, the "needs you" marks in the chat list and on the home page, the old Needs me address
 * going home, a run card's own question with its answered checkpoint and its settings from the card,
 * screenshots in a grid with a tall one that scrolls when opened, Markdown and JSON files previewed in
 * the chat, the run profile a node's sessions use, and the owner's "ask before a new website".
 * Never points at a hosted account or calls a model. Usage is in docs/05 (Browser regression).
 */
import assert from "node:assert/strict";
import { createDecipheriv, createHash, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync } from "node:crypto";
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
const J1 = "5e1f2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";
const PASSWORD = "hunter2-CANARY-7c1d";
const COMMAND = "apt-get install -y xvfb";
const HASH = createHash("sha256").update(COMMAND).digest("hex");
const OLD_COMMAND = "systemctl restart docker";

/** The computer's key: the page seals the password for it, and this fixture opens the box as the computer would. */
const computer = generateKeyPairSync("ec", { namedCurve: "P-256" });
const spki = computer.publicKey.export({ type: "spki", format: "der" });
const kid = createHash("sha256").update(spki).digest("hex").slice(0, 16);
const sealKey = { kid, alg: "ECDH-P256+HKDF-SHA256+A256GCM", spki: spki.toString("base64url"), fingerprint: kid.toUpperCase().match(/.{4}/g).join(" ") };

function openBox(box) {
  const epk = Buffer.from(box.epk, "base64url");
  const shared = diffieHellman({ privateKey: computer.privateKey, publicKey: createPublicKey({ key: { kty: "EC", crv: "P-256", x: epk.subarray(1, 33).toString("base64url"), y: epk.subarray(33).toString("base64url") }, format: "jwk" }) });
  const key = Buffer.from(hkdfSync("sha256", shared, epk, Buffer.from(`ensemble-seal-v1|${box.kid}`), 32));
  const ct = Buffer.from(box.ct, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(box.iv, "base64url"));
  decipher.setAAD(Buffer.from(box.aad, "base64url"));
  decipher.setAuthTag(ct.subarray(ct.length - 16));
  return { aad: JSON.parse(Buffer.from(box.aad, "base64url").toString("utf8")), plain: JSON.parse(Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]).toString("utf8")) };
}

/** A small PNG of one colour with a gradient, so pictures are real pictures. */
function png(width, height, [r, g, b]) {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buffer) => {
    let c = 0xffffffff;
    for (const byte of buffer) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
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
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) rows.set([r, (g + Math.floor(y / 4)) % 256, (b + x) % 256], y * (width * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

const REPORT = ["# TV prices: Walmart vs Best Buy", "", "Checked on both sites today, viewport screenshots attached.", "", "| TV | Walmart | Best Buy |", "| --- | ---: | ---: |", "| TCL 55\" Q6 | $298 | $329 |", "| Hisense 65\" U7 | $698 | $649 |", "", "## Notes", "", ...Array.from({ length: 50 }, (_, at) => `- Note ${at + 1}: prices include delivery to 10001.`)].join("\n");
const FILES = {
  "e-walmart": { body: png(320, 200, [40, 90, 160]), type: "image/png" },
  "e-bestbuy": { body: png(320, 200, [20, 60, 120]), type: "image/png" },
  "e-full": { body: png(160, 1183, [30, 120, 90]), type: "image/png" },
  "e-report": { body: Buffer.from(REPORT), type: "text/markdown; charset=utf-8" },
  "e-json": { body: Buffer.from(JSON.stringify({ walmart: { tcl55: 298 }, bestbuy: { tcl55: 329 } })), type: "application/json" },
};

function fixture() {
  const avatar = (color, shape = "orb") => ({ shape, color, eyes: "dot" });
  const base = { ownerId: "me", status: "active", charter: "", autonomy: {}, runProfileId: null, templateId: null, createdAt: at(-9000), provider: "ensemble", model: "gpt-6-luna", parentNodeId: null };
  const a3 = { ...base, id: "a3", slug: "assistant-3", name: "Assistant 3", role: "assistant", avatar: avatar("#D7B56F", "compass") };
  const lead = { ...base, id: "lead", slug: "lead", name: "Lead", role: "manager", avatar: avatar("#7FB3D5", "square") };
  const tester = { ...base, id: "tester", slug: "tester", name: "Tester", role: "tester", avatar: avatar("#E07A5F", "hex") };
  const me = { id: "p-me", kind: "person", handle: "akash", accountId: "me", role: "owner", name: "Akash", responsibility: null, me: true };
  const member = (node, isLead = false) => ({ id: `m-${node.id}`, kind: "node", handle: node.slug, accountId: "me", lead: isLead, representative: isLead, node });
  const room = (id, title, kind, members, minutes) => ({ id, title, kind, members, createdBy: "me", lastSeq: 20, readSeq: 20, unread: 0, lastMessageAt: at(minutes), pinned: [], invites: [], leadNodeIds: [], last: null });
  const rooms = [
    room("dm-a3", "Assistant 3", "dm", [me, member(a3, true)], -1),
    room("crew", "EnsembleWork Software Team", "crew", [me, member(lead, true), member(a3)], -3),
    room("dm-lead", "Lead", "dm", [me, member(lead, true)], -5),
    room("dm-tester", "Tester", "dm", [me, member(tester, true)], -9),
  ];
  let seq = 0;
  const message = (roomId, id, kind, body, data, more = {}) => ({ id, roomId, seq: (seq += 1), kind, body, authorKind: "node", authorAccountId: "me", authorNodeId: "a3", data, private: kind === "approval", mentions: [], rootMessageId: null, clientId: null, planId: null, createdAt: at(-30 + seq), ...more });
  const computerCard = (id, status, more) => message("dm-a3", id, "approval", more.body, { type: "computer", status, private: true, answer: null, answeredAt: null, deviceName: "Akash's-HomeServer", ...more.data });
  const media = (evidenceId, name, mime, extra = {}) => ({ evidenceId, kind: mime.startsWith("image/") ? "screenshot" : "report", name, mime, size: FILES[evidenceId].body.length, ...extra });
  const messages = {
    "dm-a3": [
      message("dm-a3", "u1", "text", "Compare TV prices on Walmart and Best Buy, with screenshots, and write me a short .md report", {}, { authorKind: "human", authorNodeId: null }),
      computerCard("c-browse", "pending", { body: "@assistant-3 wants to open walmart.com in the Ensemble browser on Akash's-HomeServer", data: { decisionId: "dec-browse", capability: "browse", label: "walmart.com", scope: "origin", call: "Open: https://www.walmart.com/search?q=tv+55", options: ["Once", "This mission", "Always for this address"] } }),
      computerCard("c-folder", "allowed", { body: "@assistant-3 wants to run commands in live-test on Akash's-HomeServer", data: { decisionId: "dec-folder", capability: "run", label: "live-test", scope: "folder", call: "Run: npm test", options: ["Once", "This mission", "Always for this folder"], answer: "Always for this folder", answeredAt: at(-20) } }),
      message("dm-a3", "c-sudo", "approval", `@assistant-3 wants to run as administrator on Akash's-HomeServer: ${COMMAND}`, { type: "sudo", status: "pending", command: COMMAND, commandHash: HASH, reason: "Install Xvfb so apps can be captured on a screen", deviceId: "dev-1", deviceName: "Akash's-HomeServer", folder: null, exitCode: null, error: null, answeredAt: null, private: true }),
      message("dm-a3", "c-sudo-old", "approval", `@assistant-3 wants to run as administrator on Old-Laptop: ${OLD_COMMAND}`, { type: "sudo", status: "pending", command: OLD_COMMAND, commandHash: createHash("sha256").update(OLD_COMMAND).digest("hex"), reason: "Docker stopped answering", deviceId: "dev-2", deviceName: "Old-Laptop", folder: "infra", exitCode: null, error: null, answeredAt: null, private: true }),
      message("dm-a3", "c-sudo-done", "approval", "@assistant-3 wants to run as administrator", { type: "sudo", status: "done", command: "apt-get update", commandHash: "x", deviceId: "dev-1", deviceName: "Akash's-HomeServer", exitCode: 0, answeredAt: at(-25) }),
      message("dm-a3", "c-sudo-fail", "approval", "@assistant-3 wants to run as administrator", { type: "sudo", status: "done", command: "apt-get install -y nonexistent-package", commandHash: "y", deviceId: "dev-1", deviceName: "Akash's-HomeServer", exitCode: 100, answeredAt: at(-24) }),
      message("dm-a3", "c-secret", "approval", "Needed to call the pricing API.", { type: "secret", status: "saved", name: "PRICES_KEY", computer: "Akash's-HomeServer", sealed: true }),
      message("dm-a3", "n-media", "text", "Here are both sites and the report. Best Buy is cheaper for the 65\" Hisense.", { media: [media("e-walmart", "walmart.png", "image/png", { width: 1280, height: 800, caption: "Walmart search" }), media("e-bestbuy", "bestbuy.png", "image/png", { width: 1280, height: 800 }), media("e-full", "walmart-full.png", "image/png", { width: 1280, height: 9464, caption: "The whole results page" }), media("e-report", "tv-prices.md", "text/markdown"), media("e-json", "prices.json", "application/json")] }),
      message("dm-a3", "r1", "run", "Fix the flaky price parser", { jobId: J1, taskId: "t1", sessionId: "s-1", status: "waiting_approval", agent: "GitHub Copilot", computer: "Akash's-HomeServer", engine: "copilot-cli", model: "gpt-6.1-sol", effort: "medium", context: "1M" }),
    ],
    crew: [message("crew", "c-crew-add", "approval", "@lead wants to add @tester to this crew", { type: "crew_add", status: "pending", nodeId: "tester", nodeSlug: "tester", nodeName: "Tester", roomId: "crew", reason: "The plan needs someone who knows the test suite.", private: true }, { authorNodeId: "lead" })],
    "dm-lead": [],
    "dm-tester": [],
  };
  const runs = [
    { id: "run-1", nodeId: "a3", roomId: "dm-a3", messageId: "r1", jobId: J1, taskId: "t1", title: "Fix the flaky price parser", status: "waiting_approval", progress: null, summary: null, computer: "Akash's-HomeServer", createdAt: at(-4) },
    { id: "run-2", nodeId: "lead", roomId: "dm-lead", messageId: null, jobId: "j-2", taskId: "t2", title: "Release notes", status: "waiting_approval", progress: null, summary: null, computer: "Akash's-HomeServer", createdAt: at(-8) },
  ];
  const decisions = [
    { id: "dec-run-0", source: "copilot", event: "permission", toolName: "Bash", title: "Run git status?", detail: { command: "git status" }, cwd: "/work/prices", sessionId: J1, canAnswer: true, status: "decided", decision: "allow", scope: "once", reason: null, requestedAt: at(-6), decidedAt: at(-6), expiresAt: at(60) },
    { id: "dec-run-1", source: "copilot", event: "permission", toolName: "Bash", title: "Run npm test?", detail: { command: "npm test -- --runInBand" }, cwd: "/work/prices", sessionId: J1, canAnswer: true, status: "pending", requestedAt: at(-3), expiresAt: at(60) },
  ];
  const boot = { me: { id: "me", name: "Akash", email: "akash@fieldnote.example", verified: true }, nodes: [a3, lead, tester], rooms, computers: [], credits: null, invites: [], templates: { nodes: [], crews: [] }, limits: { roomPeople: 10, nodesPerPerson: 3, crewNodes: 24, pins: 25, reactions: ["👍"], declineBlockDays: 30 }, models: { default: "gpt-6-luna", options: [] } };
  const settings = { runProfiles: [{ id: "copilot", name: "Copilot", engine: "copilot-cli", model: "gpt-6.1-sol", effort: "medium", context: "long_context" }], defaultRunProfileId: "copilot", node: { askBeforeBrowsing: false } };
  return { boot, messages, runs, decisions, settings, calls: [] };
}

try {
  for (const width of [320, 390, 1280]) {
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
    page.setDefaultTimeout(60_000);
    const errors = [];
    const unexpected = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const emit = (type, data) => page.evaluate(({ type, data }) => { for (const source of window.__nodeEvents) source.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) })); }, { type, data });
    const cors = { "access-control-allow-origin": WEB, "access-control-allow-credentials": "true" };
    const all = () => Object.values(state.messages).flat();
    const card = (id) => all().find((row) => row.id === id);
    const update = (id, data) => {
      const row = card(id);
      row.data = { ...row.data, ...data };
      return row;
    };
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      const json = (data, status = 200) => route.fulfill({ status, json: data, headers: cors });
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-methods": "GET, POST, PATCH, PUT, DELETE", "access-control-allow-headers": "content-type, accept" } });
      if (path === "/api/auth/me") return json({ user: state.boot.me });
      if (path === "/api/node/bootstrap") return json(state.boot);
      if (path === "/api/node/activity") return json({ approvals: all().filter((row) => row.kind === "approval" && row.data.status === "pending").reverse(), runs: state.runs, turns: [], computers: [], credits: null, waitingTasks: [] });
      if (path === "/api/decisions") return json({ decisions: url.searchParams.get("status") === "recent" ? state.decisions : state.decisions.filter((row) => row.status === "pending") });
      if (path === "/api/approvals") return json({ approvals: [] });
      if (path === "/api/devices") return json({ devices: [] });
      if (path === "/api/documents") return json({ files: [], usage: { maxFileBytes: 25000000 } });
      if (path === "/api/node/models") return json({ default: "gpt-6-luna", options: [] });
      if (path === "/api/node/routines") return json({ routines: [] });
      if (path === "/api/node/evidence" && method === "GET") return json({ evidence: [] });
      if (/^\/api\/node\/nodes\/[^/]+\/memory$/.test(path)) return json({ memories: [] });
      if (/^\/api\/node\/rooms\/[^/]+\/read$/.test(path)) return json({});
      if (path === "/api/settings" && method === "GET") return json({ settings: state.settings, connectors: [] });
      if (path === "/api/settings" && method === "PATCH") {
        const body = request.postDataJSON();
        state.calls.push({ settings: body });
        state.settings = { ...state.settings, node: { ...state.settings.node, ...body.node } };
        return json({ settings: state.settings });
      }
      const messages = /^\/api\/node\/rooms\/([^/]+)\/messages$/.exec(path);
      if (messages && method === "GET") return json({ messages: state.messages[messages[1]] ?? [] });
      const one = /^\/api\/node\/messages\/([^/]+)$/.exec(path);
      if (one && method === "GET") return card(one[1]) ? json({ message: card(one[1]) }) : json({ error: "That message is not available." }, 404);
      const decide = /^\/api\/decisions\/([^/]+)\/decide$/.exec(path);
      if (decide && method === "POST") {
        state.calls.push({ decide: decide[1], body: request.postDataJSON() });
        // The card stays pending for a moment: the page shows the answer before Ensemble updates it.
        return json({ decision: { id: decide[1], status: "decided" } });
      }
      const sudo = /^\/api\/node\/sudo\/([^/]+)$/.exec(path);
      if (sudo && method === "GET") {
        const row = card(sudo[1]);
        if (row.data.deviceId === "dev-2") return json({ command: row.data.command, commandHash: row.data.commandHash, deviceName: "Old-Laptop", route: { mode: "unavailable", reason: "Update Ensemble on Old-Laptop to run commands as administrator from here." } });
        return json({ command: row.data.command, commandHash: row.data.commandHash, deviceName: row.data.deviceName, route: { mode: "sealed", sealKey } });
      }
      if (sudo && method === "POST") {
        const body = request.postDataJSON();
        state.calls.push({ sudo: sudo[1], body, raw: request.postData() });
        return json({ message: update(sudo[1], body.action === "deny" ? { status: "denied", answeredAt: new Date().toISOString() } : { status: "running", answeredAt: new Date().toISOString() }) });
      }
      const settle = /^\/api\/node\/approvals\/([^/]+)$/.exec(path);
      if (settle && method === "POST") {
        const body = request.postDataJSON();
        state.calls.push({ settle: settle[1], body });
        return json({ message: update(settle[1], { status: body.decision === "approve" ? "approved" : "discarded" }) });
      }
      const job = /^\/api\/agent\/jobs\/([^/]+)$/.exec(path);
      if (job) return json({ error: "Not found." }, 404);
      const file = /^\/api\/node\/evidence\/([^/]+)$/.exec(path);
      if (file && method === "GET" && FILES[file[1]]) {
        state.calls.push({ evidence: file[1], via: url.searchParams.get("message") });
        return route.fulfill({ status: 200, body: FILES[file[1]].body, headers: { ...cors, "content-type": FILES[file[1]].type } });
      }
      unexpected.push(`${method} ${path}`);
      return route.fulfill({ status: 404, json: { error: `Unmocked API: ${path}` }, headers: cors });
    });
    /** Nothing sticks out past the screen's right edge, unless a container that fits clips or scrolls it. */
    const fits = async (label) => {
      const wide = await page.locator("main").evaluate((main) => {
        if (main.scrollWidth <= main.clientWidth + 2) return [];
        const edge = main.getBoundingClientRect().right + 2;
        const clipped = (el) => {
          for (let up = el.parentElement; up && up !== main; up = up.parentElement) if (getComputedStyle(up).overflowX !== "visible" && up.getBoundingClientRect().right <= edge) return true;
          return false;
        };
        return [...main.querySelectorAll("*")].filter((el) => el.getBoundingClientRect().right > edge && getComputedStyle(el).position !== "fixed" && !clipped(el)).slice(0, 6).map((el) => `${el.tagName.toLowerCase()}.${String(el.getAttribute("class")).slice(0, 80)} → ${Math.round(el.getBoundingClientRect().right)}`);
      });
      assert.deepEqual(wide, [], `${label} fits at ${width}px`);
    };
    const shot = async (name, fullPage = false) => {
      if (shots) await page.screenshot({ path: `${shots}/${name}-${width}.png`, fullPage });
    };

    try {
    // The old Needs me address goes home, and home lists the chats where something waits.
    await page.goto(`${WEB}/needs-me`);
    await page.waitForURL(`${WEB}/chat`);
    const waiting = page.getByRole("region", { name: /wait for you/ });
    await waiting.getByText("6 things wait for you in 3 chats").waitFor();
    assert.equal(await waiting.getByRole("link", { name: /Assistant 3/ }).getAttribute("href"), "/r/dm-a3#m-c-browse", "a chat opens at what waits there, oldest first");
    assert.ok(await waiting.getByRole("link", { name: /EnsembleWork Software Team/ }).isVisible());
    await fits("home");
    await shot("cards-home");

    // The chat list marks those chats "needs you"; nothing else marks them.
    if (width >= 768) {
      const list = page.getByRole("navigation", { name: "Conversations" });
      assert.equal(await list.getByRole("link", { name: "Assistant 3, needs you" }).count(), 1);
      assert.equal(await list.getByRole("link", { name: "Lead, needs you" }).count(), 1, "a run that waits on me marks its chat");
      assert.equal(await list.getByRole("link", { name: "Tester" }).count(), 1);
      assert.equal(await list.locator("[data-needs-you]").count(), 3);
      assert.equal(await page.getByRole("link", { name: "Needs me" }).count(), 0, "no Needs me in the navigation");
    } else {
      await page.getByRole("button", { name: "Menu" }).click();
      const drawer = page.getByRole("dialog", { name: "Chats" });
      assert.equal(await drawer.locator("[data-needs-you]").count(), 3);
      assert.equal(await drawer.getByRole("link", { name: "Needs me" }).count(), 0);
      await drawer.getByRole("button", { name: "Close" }).click();
    }

    await page.goto(`${WEB}/r/dm-a3`);
    const timeline = page.locator(".chat-timeline");
    if (width < 768) await page.locator('.chat-shell[data-needs-you="true"] .chat-open-conversations').waitFor();
    const browse = timeline.locator('[id="m-c-browse"]');
    await browse.getByText("@assistant-3 wants to open walmart.com in the Ensemble browser on Akash's-HomeServer").waitFor();

    // A question from the computer: what it tried, where, and the computer's own answers.
    assert.ok(await browse.getByText("Waiting for you").isVisible());
    assert.ok(await browse.getByLabel("What it tried").getByText("Open: https://www.walmart.com/search?q=tv+55").isVisible());
    assert.deepEqual(await browse.getByRole("group", { name: "Your answer" }).getByRole("button").allInnerTexts(), ["Once", "This mission", "Always for this address", "Don't allow"]);
    assert.equal(await browse.locator('[data-owner-card="waiting"]').count(), 1, "a card that waits stands out");

    // A settled one is a checkpoint that opens back into its card, and closes again.
    const folder = timeline.locator('[id="m-c-folder"]');
    const chip = folder.getByRole("button", { name: /Allowed @assistant-3 to run commands in live-test · Always for this folder/ });
    assert.equal(await chip.getAttribute("aria-expanded"), "false");
    assert.equal(await folder.getByText("Run: npm test").isVisible(), false, "folded");
    await chip.click();
    assert.equal(await chip.getAttribute("aria-expanded"), "true");
    await folder.getByText("You allowed it: Always for this folder.").waitFor();
    assert.equal(await folder.locator('[data-owner-card="settled"]').count(), 1, "opened, it reads as a record");
    assert.equal(await folder.getByRole("button", { name: "Once" }).count(), 0, "and cannot be answered again");
    await chip.press("Enter");
    assert.equal(await chip.getAttribute("aria-expanded"), "false");

    // Commands run as administrator: the one waiting, one that ran, one that failed, a saved secret.
    const sudo = timeline.locator('[id="m-c-sudo"]');
    await sudo.getByLabel("The command").getByText(COMMAND).waitFor();
    assert.ok(await sudo.getByText("Install Xvfb so apps can be captured on a screen").isVisible());
    const password = sudo.getByLabel("Password for Akash's-HomeServer");
    await password.waitFor();
    assert.equal(await password.getAttribute("type"), "password");
    assert.equal(await password.getAttribute("autocomplete"), "off");
    assert.ok(await sudo.getByText(new RegExp(`Key ${sealKey.fingerprint}`)).isVisible(), "the key it is sealed for");
    assert.equal(await sudo.getByRole("button", { name: "Run as administrator" }).isDisabled(), true, "not without a password");
    await timeline.getByRole("button", { name: "Ran as administrator: apt-get update · exit 0" }).waitFor();
    assert.ok(await timeline.getByRole("button", { name: "Ran as administrator: apt-get install -y nonexistent-package · failed, exit 100" }).isVisible());
    assert.ok(await timeline.getByRole("button", { name: /Saved secret PRICES_KEY/ }).isVisible());
    // A computer too old for a sealed password says so, and offers only what it can do.
    const old = timeline.locator('[id="m-c-sudo-old"]');
    await old.getByText("Update Ensemble on Old-Laptop to run commands as administrator from here.").waitFor();
    assert.equal(await old.getByLabel(/Password for/).count(), 0);
    assert.equal(await old.getByRole("button", { name: "Run as administrator" }).count(), 0);
    await fits("cards");
    await sudo.evaluate((element) => element.scrollIntoView({ block: "start" }));
    await shot("cards-sudo");
    await browse.scrollIntoViewIfNeeded();
    await shot("cards-waiting");

    // Answered: the option goes as the reason, and the card folds into its checkpoint at once.
    await browse.getByRole("button", { name: "This mission" }).click();
    await browse.getByRole("button", { name: /Allowed @assistant-3 to browse walmart.com · This mission/ }).waitFor();
    assert.deepEqual(state.calls.find((row) => row.decide), { decide: "dec-browse", body: { decision: "allow", scope: "once", reason: "This mission" } });
    // Ensemble settles the card: it stays a checkpoint, now with Ensemble's own record.
    await emit("node.message.updated", update("c-browse", { status: "allowed", answer: "This mission", answeredAt: new Date().toISOString() }));
    await browse.getByRole("button", { name: /Allowed @assistant-3 to browse walmart.com · This mission/ }).waitFor();

    // While a node waits for an answer, the chat says so and points to the card.
    await emit("node.status", { roomId: "dm-a3", nodeId: "a3", state: "waiting", cardId: "c-sudo", private: false });
    const waitingRow = timeline.locator('[data-live-row="waiting"]');
    await waitingRow.getByText("Waiting for your answer, then it goes on.").waitFor();
    await waitingRow.getByRole("button", { name: "Go to the card" }).click();
    await page.waitForFunction(() => {
      const box = document.querySelector("#m-c-sudo")?.getBoundingClientRect();
      return box && box.top < window.innerHeight && box.bottom > 0;
    });

    // A password the computer refused: the card waits again, saying so and how many tries are left.
    await password.fill("wrong-password");
    await sudo.getByRole("button", { name: "Run as administrator" }).click();
    await sudo.getByText("Running on Akash's-HomeServer…").waitFor();
    await emit("node.message.updated", update("c-sudo", { status: "pending", tries: 1, answeredAt: null, error: "The password was not accepted. Type it again." }));
    await sudo.getByText("The password was not accepted. Type it again. 2 tries left.").waitFor();
    assert.equal(await password.inputValue(), "", "what was typed before is gone");

    // The password is sealed here for the computer, bound to the card and the command; nothing typed is sent in the clear.
    await password.fill(PASSWORD);
    await sudo.getByRole("button", { name: "Run as administrator" }).click();
    await sudo.getByText("Running on Akash's-HomeServer…").waitFor();
    await emit("node.status", { roomId: "dm-a3", nodeId: "a3", state: "thinking", private: false });
    await waitingRow.waitFor({ state: "detached" });
    await emit("node.status", { roomId: "dm-a3", nodeId: "a3", state: "idle", private: false });
    const sent = state.calls.filter((row) => row.sudo === "c-sudo").at(-1);
    assert.ok(!sent.raw.includes(PASSWORD), "no password in the clear");
    assert.equal(sent.body.action, "run");
    const opened = openBox(sent.body.sealed);
    assert.deepEqual(opened.plain, { password: PASSWORD });
    assert.deepEqual([opened.aad.purpose, opened.aad.kid, opened.aad.deviceId, opened.aad.decisionId, opened.aad.name, opened.aad.origin], ["sudo", kid, "dev-1", "c-sudo", HASH, new URL(WEB).origin]);
    assert.equal(await sudo.getByLabel(/Password for/).count(), 0, "the box is gone, and with it what was typed");
    await emit("node.message.updated", update("c-sudo", { status: "done", exitCode: 0 }));
    await sudo.getByRole("button", { name: `Ran as administrator: ${COMMAND} · exit 0` }).waitFor();
    // Don't run, on the computer that cannot take a password.
    await old.getByRole("button", { name: "Don't run" }).click();
    await old.getByRole("button", { name: `Didn't run as administrator: ${OLD_COMMAND}` }).waitFor();
    assert.deepEqual(state.calls.find((row) => row.sudo === "c-sudo-old").body, { action: "deny" });
    await browse.evaluate((element) => element.scrollIntoView({ block: "start" }));
    await shot("cards-answered");

    // Screenshots in a grid; the full page shows its top and says it scrolls.
    const media = timeline.locator('[id="m-n-media"]');
    const pictures = media.getByRole("button", { name: /^Open Screenshot/ });
    await pictures.first().waitFor();
    assert.equal(await pictures.count(), 3);
    const tall = media.locator("[data-tall]");
    await tall.waitFor();
    assert.equal(await tall.count(), 1);
    await tall.getByText(/Tall · open to scroll/).waitFor();
    // Markdown rendered in the chat, its first lines until Show all; JSON indented.
    const report = media.locator('[data-text-preview="markdown"]');
    await report.getByText("TV prices: Walmart vs Best Buy").waitFor();
    assert.ok(await report.getByRole("table").isVisible(), "a Markdown table renders");
    assert.equal(await report.getByText("Note 50: prices include delivery to 10001.").count(), 0, "40 lines first");
    const showAll = report.getByRole("button", { name: "Show all 61 lines" });
    await showAll.click();
    await report.getByText("Note 50: prices include delivery to 10001.").waitFor();
    assert.equal(await report.getByRole("button", { name: "Collapse" }).getAttribute("aria-expanded"), "true");
    await report.getByRole("button", { name: "Collapse" }).click();
    const data = media.locator('[data-text-preview="json"]');
    await data.getByText('"tcl55": 298').waitFor();
    assert.ok(await data.getByRole("button", { name: "Download prices.json" }).isVisible());
    assert.ok(state.calls.some((row) => row.evidence === "e-report" && row.via === "n-media"), "read through the message that shows it");
    await fits("media");
    await media.evaluate((element) => element.scrollIntoView({ block: "start" }));
    await shot("cards-media");
    // Opened, the tall picture fills the width and scrolls from its top.
    await tall.click();
    const view = page.locator("[data-tall-view]");
    await view.waitFor();
    await page.waitForFunction(() => {
      const element = document.querySelector("[data-tall-view]");
      return element && element.scrollHeight > element.clientHeight + 100;
    });
    await shot("cards-tall-lightbox");
    await page.keyboard.press("Escape");
    await view.waitFor({ state: "detached" });

    // A run's own question, answered on its card; what it asked before stays as a checkpoint; its settings come from the card.
    const run = timeline.locator('[id="m-r1"]');
    await run.getByText("GitHub Copilot").waitFor();
    assert.ok(await run.getByText("gpt-6.1-sol").isVisible());
    assert.ok(await run.getByText("medium thinking").isVisible());
    assert.ok(await run.getByText("1M context").isVisible());
    const asks = run.getByRole("group", { name: /Waiting for you: Command approval/ });
    assert.ok(await asks.getByLabel("Command").getByText("npm test -- --runInBand").isVisible());
    const before = run.getByRole("button", { name: "Allowed once: git status" });
    await before.waitFor();
    await before.click();
    await run.getByText("Run git status?").waitFor();
    assert.equal(await run.getByText(/Needs me/).count(), 0);
    await fits("run card");
    await run.evaluate((element) => element.scrollIntoView({ block: "start" }));
    await shot("cards-run");

    // A crew's lead asks to bring an existing node in: Approve, and it folds into what happened.
    await page.goto(`${WEB}/r/crew`);
    const add = page.locator('[id="m-c-crew-add"]');
    await add.getByText("@lead wants to add @tester to this crew").waitFor();
    assert.ok(await add.getByText("The plan needs someone who knows the test suite.").isVisible());
    await fits("crew add");
    await shot("cards-crew-add");
    await add.getByRole("button", { name: "Approve" }).click();
    await add.getByRole("button", { name: "Added @tester to the crew" }).waitFor();
    assert.deepEqual(state.calls.find((row) => row.settle), { settle: "c-crew-add", body: { decision: "approve" } });

    // The run profile a node's agent sessions use, in its settings.
    await page.goto(`${WEB}/n/a3`);
    const settings = page.getByRole("dialog", { name: "Node settings" });
    await settings.getByText("Agent sessions use:").waitFor();
    assert.ok(await settings.getByText("(GitHub Copilot · gpt-6.1-sol · medium thinking · long context)", { exact: false }).isVisible());
    await page.keyboard.press("Escape");

    // Ask before a node opens a new website: off by default, saved in Ensemble's settings.
    await page.goto(`${WEB}/settings`);
    const ask = page.getByRole("switch", { name: "Ask before a node opens a new website" });
    await ask.waitFor();
    assert.equal(await ask.getAttribute("aria-checked"), "false");
    await ask.click();
    await page.waitForFunction(() => document.querySelector('[role="switch"][aria-checked="true"]'));
    assert.deepEqual(state.calls.find((row) => row.settings), { settings: { node: { askBeforeBrowsing: true } } });
    assert.equal(await page.getByRole("link", { name: /Needs me/ }).count(), 0, "no Needs me in Settings");
    await fits("settings");

    } catch (error) {
      if (shots) await page.screenshot({ path: `${shots}/cards-failure-${width}.png`, fullPage: false }).catch(() => undefined);
      console.error(`At ${width}px, ${page.url()}:`, { errors, unexpected: [...new Set(unexpected)] });
      throw error;
    }
    assert.deepEqual(errors, [], "no page errors");
    assert.deepEqual([...new Set(unexpected)], [], "no unmocked API calls");
    await context.close();
    console.log(`chat cards ok at ${width}px`);
  }
} finally {
  await browser.close();
}
