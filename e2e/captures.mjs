/**
 * Local, stateful browser fixture for browsing and capture on the owner's computer (Ensemble docs/35
 * §8.12–8.16, docs/25 §10): captures held for the owner to check first, on their card in the
 * conversation (why, previews fetched from the computer with clear words when it is offline or a file
 * is too large, a video's poster instead, one file sent and one discarded on their own, then the card
 * sent or discarded and folded into its checkpoint); a working run card's live view (a picture with its page, larger on a tap, where
 * Take over opens the takeover view for that very tab; paused while signing in, pointing to the run's
 * sign-in card once there is one; back again; nothing for a run whose computer sends none); run evidence with held
 * and kept files; a node's video with its poster, length and measured shape; a node's own captures in
 * its settings; and what each computer can capture. Never points at a hosted account or calls a model.
 * Usage is in docs/05 (Browser regression).
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
const J1 = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const J2 = "8d2e3f4a-5b6c-4d7e-9f0a-1b2c3d4e5f6a";
const SECRET = "It shows one of your saved secret values.";
const PREVIEW_SITE = "The owner asked to see captures of this site before they are sent.";
const DESKTOP = "A desktop app's window cannot be checked for secrets on this computer, so the owner previews it first.";
const TOO_LARGE = "“flow.mp4” is too large to preview from the computer (40 MB); preview its poster, or release it.";

/** A small PNG of one colour, so pictures are real pictures. */
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

const pictures = {
  "h-shot": png(160, 100, [150, 60, 60]),
  "h-poster": png(160, 90, [60, 60, 150]),
  "h-desk": png(160, 100, [60, 130, 80]),
  "p-run": png(160, 90, [90, 90, 40]),
  "m-poster": png(160, 90, [40, 110, 140]),
  "m-tall": png(78, 169, [140, 100, 40]),
  "n-shot": png(160, 100, [100, 70, 140]),
  "n-poster": png(160, 90, [130, 130, 60]),
};
const LIVE = png(200, 125, [30, 80, 130]);
const VIDEOS = new Set(["v-run", "m-video", "n-video"]);

function fixture() {
  const avatar = (color) => ({ shape: "orb", color, eyes: "dot" });
  const base = { ownerId: "me", status: "active", charter: "", autonomy: {}, runProfileId: null, templateId: null, createdAt: at(-9000), provider: "ensemble", model: "gpt-5-mini", parentNodeId: null };
  const nodes = [
    { ...base, id: "lead", slug: "lead", name: "Lead", role: "manager", avatar: avatar("#D7B56F") },
    { ...base, id: "builder", slug: "builder", name: "Builder", role: "engineer", avatar: avatar("#7FB3D5") },
  ];
  const me = { id: "p-me", kind: "person", handle: "mira", accountId: "me", role: "owner", name: "Mira", responsibility: null, me: true };
  const member = (node) => ({ id: `m-${node.id}`, kind: "node", handle: node.slug, accountId: "me", lead: node.id === "lead", representative: true, node });
  const room = (id, title, kind, members) => ({ id, title, kind, members, createdBy: "me", lastSeq: 1, readSeq: 1, unread: 0, lastMessageAt: at(-5), pinned: [], invites: [], leadNodeIds: ["lead"], last: null });
  const rooms = [room("dm-lead", "Lead", "dm", [me, member(nodes[0])]), room("dm-builder", "Builder", "dm", [me, member(nodes[1])])];
  let seq = 0;
  const message = (kind, body, extra = {}) => ({ id: `msg-${++seq}`, roomId: "dm-builder", seq, kind, body, authorKind: "node", authorAccountId: "me", authorNodeId: "builder", data: {}, private: false, mentions: [], rootMessageId: null, clientId: null, planId: null, createdAt: at(-30 + seq), ...extra });
  const evidence = (id, kind, name, mime, extra = {}) => ({ id, kind, name, mime, size: 48_000, createdAt: at(-20), ...extra });
  const asked = message("text", "Check the pricing page on a phone and send me a short video.", { authorKind: "human", authorNodeId: null });
  const run1 = message("run", "Check the pricing page on a phone", {
    id: "run1",
    data: {
      jobId: J1,
      status: "running",
      computer: "Studio",
      evidence: [
        evidence("v-run", "video", "pricing.mp4", "video/mp4", { size: 2_400_000, poster: "p-run", preview: "pv-run", width: 1280, height: 720, durationMs: 8_400 }),
        evidence("h-shot", "screenshot", "keys.png", "image/png", { held: true, holdReason: SECRET }),
        evidence("l-trace", "trace", "trace.zip", "application/zip", { local: true }),
      ],
    },
  });
  const run2 = message("run", "Run the unit tests", { id: "run2", data: { jobId: J2, status: "running", computer: "Studio" } });
  const held = message("approval", "Preview before it's used: “keys.png”, “flow.mp4”, “desk.png”. Nothing is sent to a model or shown in a chat until you release it.", {
    id: "card-held",
    private: true,
    data: {
      type: "media_preview",
      status: "pending",
      evidence: [
        evidence("h-shot", "screenshot", "keys.png", "image/png", { held: true, holdReason: SECRET }),
        evidence("h-video", "video", "flow.mp4", "video/mp4", { size: 41_000_000, held: true, holdReason: PREVIEW_SITE, poster: "h-poster", width: 1280, height: 720, durationMs: 12_000 }),
        evidence("h-desk", "screenshot", "desk.png", "image/png", { held: true, holdReason: DESKTOP }),
      ],
      reasons: [SECRET, PREVIEW_SITE],
      jobId: J1,
      nodeCapture: false,
    },
  });
  const media = message("text", "Here is the pricing page on a phone.", { id: "media1", data: { media: [{ evidenceId: "m-video", kind: "video", name: "pricing-phone.mp4", mime: "video/mp4", caption: "Scrolling the table", size: 3_100_000, posterId: "m-poster", width: 1280, height: 720, durationMs: 12_400 }] } });
  const tall = message("text", "And the whole page.", { id: "tall1", data: { media: [{ evidenceId: "m-tall", kind: "screenshot", name: "pricing-full.png", mime: "image/png", caption: null, size: 90_000, width: 390, height: 844 }] } });
  const messages = { "dm-builder": [asked, run1, run2, held, media, tall], "dm-lead": [] };
  for (const row of rooms) row.lastSeq = row.readSeq = messages[row.id].length;
  const boot = { me: { id: "me", name: "Mira Chen", email: "mira@fieldnote.example", verified: true }, nodes, rooms, computers: [], credits: null, invites: [], templates: { nodes: [], crews: [] }, limits: { roomPeople: 10, nodesPerPerson: 3, crewNodes: 24, pins: 25, reactions: ["👍"], declineBlockDays: 30 }, models: { default: "gpt-5-mini", options: [] } };
  const job = (id, title) => ({ id, taskId: "task", deviceId: "d1", title, kind: "code", status: "running", provider: "claude-code", model: "claude-opus-4-6", modelUsed: null, reasoningEffort: "high", contextTier: null, progress: "Opening the pricing page", summary: null, error: null, turns: 1, toolCalls: 4, runId: null, deviceName: "Studio", yours: true, folder: "website", branch: "testing", files: [], createdAt: at(-20), startedAt: at(-20), finishedAt: null });
  const capture = { browser: true, video: "mp4", targets: { web: { screenshot: true, video: true }, electron: { screenshot: true, video: false, reason: "No video encoder here." }, gui: { screenshot: false, video: false, reason: "Needs Xvfb for a private virtual display." }, terminal: { screenshot: true, video: false }, desktop: { screenshot: false, video: false } }, setup: true };
  const device = (id, name, capabilities) => ({ id, name, platform: "linux", appVersion: "0.9.0", folders: ["website"], online: true, lastSeenAt: at(-1), revokedAt: null, sealKey: null, capabilities });
  const devices = [device("d1", "Studio", { browser: 1, capture, takeover: 1, logins: 1 }), device("d2", "Old laptop", { worktrees: 1 }), device("d3", "Build box", { browser: 1, capture: { ...capture, browser: false } })];
  const nodeCaptures = [
    evidence("n-shot", "screenshot", "dashboard.png", "image/png", { width: 1280, height: 800 }),
    evidence("n-video", "video", "signup.mp4", "video/mp4", { poster: "n-poster", width: 1280, height: 720, durationMs: 5_000 }),
    evidence("n-held", "screenshot", "settings.png", "image/png", { held: true, holdReason: SECRET }),
  ];
  // The run's sign-in, posted while the test runs: the paused live view points to it.
  const login = message("approval", "@builder needs you to sign in to fieldnote.example on Studio", { id: "login1", data: { type: "login", status: "pending", loginId: "L1", origin: "https://www.fieldnote.example", computer: "Studio", tab: "t1", saved: true, display: false, takeover: true, reasons: ["the page has a password field"], jobId: J1 } });
  return { boot, messages, login, jobs: { [J1]: job(J1, "Check the pricing page on a phone"), [J2]: job(J2, "Run the unit tests") }, devices, nodeCaptures, live: "picture", fetched: [], calls: [], previews: { "h-shot": 0 } };
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
    const dialogs = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      void dialog.accept();
    });
    const emit = (type, data) => page.evaluate(({ type, data }) => { for (const source of window.__nodeEvents) source.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) })); }, { type, data });
    const cors = { "access-control-allow-origin": WEB, "access-control-allow-credentials": "true" };
    // The live view's details are headers: the API has to expose them for a browser on another origin to read.
    const exposed = { ...cors, "access-control-expose-headers": "X-Ensemble-Live-At, X-Ensemble-Live-Tab, X-Ensemble-Live-Url, X-Ensemble-Live-Title, X-Ensemble-Live-Width, X-Ensemble-Live-Height, X-Ensemble-Live-Paused" };
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      const json = (data, status = 200) => route.fulfill({ status, json: data, headers: cors });
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-methods": "GET, POST, PATCH, DELETE", "access-control-allow-headers": "content-type, accept" } });
      if (path === "/api/auth/me") return json({ user: state.boot.me });
      if (path === "/api/node/bootstrap") return json(state.boot);
      if (path === "/api/node/activity") return json({ approvals: state.messages["dm-builder"].filter((row) => row.kind === "approval" && row.data.status === "pending"), runs: [], turns: [], computers: [], credits: null, waitingTasks: [] });
      if (path === "/api/decisions") return json({ decisions: [] });
      if (path === "/api/approvals") return json({ approvals: [] });
      if (path === "/api/devices") return json({ serverRunner: false, devices: state.devices });
      if (path === "/api/documents") return json({ files: [], usage: { maxFileBytes: 25000000 } });
      if (path === "/api/node/models") return json({ default: "gpt-5-mini", options: [] });
      // The owner's own Ensemble settings: the run profile a node's sessions use, and Node's browsing rule.
      if (path === "/api/settings") return json({ settings: { runProfiles: [], defaultRunProfileId: null, node: { askBeforeBrowsing: false } }, connectors: [] });
      if (/^\/api\/node\/nodes\/[^/]+\/memory$/.test(path)) return json({ memories: [] });
      if (path === "/api/node/routines") return json({ routines: [] });
      if (/^\/api\/node\/rooms\/[^/]+\/read$/.test(path)) return json({});
      const messages = /^\/api\/node\/rooms\/([^/]+)\/messages$/.exec(path);
      if (messages && method === "GET") return json({ messages: state.messages[messages[1]] ?? [] });
      const job = /^\/api\/agent\/jobs\/([^/]+)$/.exec(path);
      if (job && state.jobs[job[1]]) return json({ job: state.jobs[job[1]], log: "", events: [] });
      const live = /^\/api\/node\/live\/([^/]+)$/.exec(path);
      if (live) {
        state.calls.push({ live: live[1] });
        // The second run's computer sends no live view.
        if (live[1] !== J1) return route.fulfill({ status: 204, headers: cors });
        const meta = { "X-Ensemble-Live-At": new Date().toISOString(), "X-Ensemble-Live-Tab": "t1", "X-Ensemble-Live-Url": encodeURIComponent("https://www.fieldnote.example/pricing?token=[hidden]"), "X-Ensemble-Live-Title": encodeURIComponent("Pricing — Fieldnote") };
        if (state.live === "paused") return route.fulfill({ status: 204, headers: { ...exposed, ...meta, "cache-control": "no-store", "X-Ensemble-Live-Paused": "sensitive" } });
        return route.fulfill({ status: 200, body: LIVE, headers: { ...exposed, ...meta, "cache-control": "no-store", "content-type": "image/jpeg", "X-Ensemble-Live-Width": "1280", "X-Ensemble-Live-Height": "800" } });
      }
      if (path === "/api/node/evidence" && method === "GET") {
        if (url.searchParams.get("nodeId") === "builder") return json({ evidence: state.nodeCaptures });
        return json({ evidence: [] });
      }
      const release = /^\/api\/node\/evidence\/([^/]+)\/release$/.exec(path);
      if (release && method === "POST") {
        const { decision } = request.postDataJSON();
        state.calls.push({ release: release[1], decision });
        return json(decision === "approve" ? { released: [release[1]], discarded: [] } : { released: [], discarded: [release[1]] });
      }
      const file = /^\/api\/node\/evidence\/([^/]+)$/.exec(path);
      if (file && method === "GET") {
        const id = file[1];
        state.fetched.push(id);
        if (id === "m-poster") state.posterVia = url.searchParams.get("message");
        // A video's bytes never come: the player waits, showing its poster.
        if (VIDEOS.has(id)) return new Promise(() => undefined);
        if (id === "h-shot" && state.previews["h-shot"]++ === 0) return route.fulfill({ status: 504, body: "<html>Gateway Timeout</html>", headers: { ...cors, "content-type": "text/html" } });
        if (id === "h-video") return json({ error: TOO_LARGE }, 413);
        if (pictures[id]) return route.fulfill({ status: 200, body: pictures[id], headers: { ...cors, "content-type": "image/png", "cache-control": id.startsWith("h-") ? "no-store" : "private, no-cache" } });
        return json({ error: "That evidence is not available." }, 404);
      }
      if (path === "/api/node/takeovers" && method === "POST") {
        state.calls.push({ takeover: request.postDataJSON() });
        return json({ error: "Someone is already controlling this tab. Stop there first." }, 409);
      }
      const approval = /^\/api\/node\/approvals\/([^/]+)$/.exec(path);
      if (approval && method === "POST") {
        const body = request.postDataJSON();
        state.calls.push({ approval: approval[1], decision: body.decision });
        const card = state.messages["dm-builder"].find((row) => row.id === approval[1]);
        const left = card.data.evidence.map((row) => row.id).filter((id) => !state.calls.some((call) => call.release === id));
        card.data = { ...card.data, status: body.decision === "approve" ? "released" : "discarded", error: null, result: body.decision === "approve" ? { released: left, discarded: [] } : { released: [], discarded: left } };
        return json({ message: card });
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
    const shot = async (name) => {
      if (shots) await page.screenshot({ path: `${shots}/${name}-${width}.png`, fullPage: false });
    };

    // The held card, in its conversation: why, in the owner's words; files previewed from the computer only when asked; an offline computer says so.
    await page.goto(`${WEB}/r/dm-builder`);
    const timeline = page.locator(".chat-timeline");
    const held = timeline.locator("#m-card-held");
    await held.getByText("@builder has 3 captures for you to check first").waitFor();
    assert.ok(await held.getByText("It shows one of your saved secrets.").isVisible(), "why, in the owner's words");
    assert.ok(await held.getByText("You asked to see captures of this site before they are sent.").isVisible());
    assert.ok(await held.getByText("A desktop app's window can't be checked for secrets, so you see it first.").isVisible(), "each file's reason too");
    assert.ok(await held.getByRole("button", { name: "Send", exact: true }).isVisible());
    assert.ok(await held.getByRole("button", { name: "Discard", exact: true }).isVisible());
    assert.ok(!state.fetched.some((id) => id.startsWith("h-")), "nothing held is read from the computer before the owner asks");
    await held.getByRole("button", { name: "Preview keys.png" }).click();
    await held.getByText("Your computer did not answer in time: it may be offline or asleep. Try again when Ensemble runs there.").waitFor();
    await held.scrollIntoViewIfNeeded();
    await fits("The held card");
    await shot("held-offline");
    await held.getByRole("button", { name: "Hide keys.png" }).click();

    // The conversation: a working run with its live view and evidence; the held card; media with posters.
    const run = timeline.locator("#m-run1");
    await run.waitFor();
    await timeline.locator("#m-run2").scrollIntoViewIfNeeded();
    await run.scrollIntoViewIfNeeded();
    await run.getByRole("region", { name: "Live view" }).waitFor();
    const liveView = run.getByRole("region", { name: "Live view" });
    assert.ok(await liveView.getByRole("img", { name: "Live view of Pricing — Fieldnote" }).isVisible(), "the picture names its page");
    assert.ok(await liveView.getByText("fieldnote.example/pricing").isVisible(), "and its address, short");
    const larger = liveView.getByRole("button", { name: "Show the live view larger" });
    const small = await larger.boundingBox();
    assert.equal(await run.getByRole("button", { name: /Take over|Open browser/ }).count(), 0, "small, it only shows; no second way into the browser on the card");
    await shot("live-small");
    await larger.click();
    const big = await liveView.getByRole("button", { name: "Show the live view smaller" }).boundingBox();
    assert.ok(big.width > small.width * 1.8, "a tap shows it larger");
    await run.scrollIntoViewIfNeeded();
    await fits("Live view, larger");
    await shot("live-view");

    // Larger, it offers to take over that tab: the takeover view opens for the run and the tab the picture shows.
    await liveView.getByRole("button", { name: "Take over" }).click();
    const takeover = page.getByRole("dialog", { name: "Control the browser on Studio" });
    await takeover.getByText("Someone is already controlling this tab. Stop there first.").waitFor();
    assert.ok(await takeover.getByText("Pricing — Fieldnote on Studio").isVisible(), "the view names the page and the computer");
    assert.deepEqual(state.calls.find((call) => call.takeover)?.takeover, { jobId: J1, tab: "t1" });
    await shot("live-takeover");
    await takeover.getByRole("button", { name: "Close" }).last().click();
    await takeover.waitFor({ state: "detached" });
    for (let tries = 0; tries < 40 && !state.calls.some((call) => call.live === J2); tries += 1) await page.waitForTimeout(100);
    assert.ok(state.calls.some((call) => call.live === J2), "the second run was asked");
    assert.equal(await timeline.locator("#m-run2 [data-live]").count(), 0, "nothing when the computer sends no live view");

    // A sensitive tab (a sign-in, or someone controlling it) pauses it; a sign-in's card is pointed to once it is there.
    state.live = "paused";
    await emit("node.live", { jobId: J1, at: new Date().toISOString(), paused: "sensitive" });
    await run.getByText("Paused: signing in").waitFor();
    assert.equal(await run.getByRole("region", { name: "Live view" }).count(), 0, "no picture while signing in");
    assert.equal(await run.getByRole("link", { name: "Go to its sign-in card" }).count(), 0, "no card to point to yet");
    state.messages["dm-builder"].push(state.login);
    await emit("node.message", state.login);
    const pointer = run.getByRole("link", { name: "Go to its sign-in card" });
    await pointer.waitFor();
    await fits("Paused live view");
    await shot("live-paused");
    await pointer.click();
    const signInCard = timeline.locator("#m-login1");
    await page.waitForFunction(() => {
      const box = document.querySelector("#m-login1")?.getBoundingClientRect();
      return box && box.top >= 0 && box.top < window.innerHeight;
    });
    assert.ok(await signInCard.getByText("@builder needs you to sign in to https://www.fieldnote.example on Studio").isVisible(), "the jump lands on the run's sign-in card");
    state.login.data = { ...state.login.data, status: "signed_in", via: "takeover" };
    await emit("node.message.updated", state.login);
    state.live = "picture";
    await emit("node.live", { jobId: J1, at: new Date().toISOString() });
    await run.scrollIntoViewIfNeeded();
    await run.getByRole("region", { name: "Live view" }).waitFor();

    // Run evidence: the video with its poster and length; held and kept files listed, never read.
    const gallery = run.getByRole("region", { name: "Evidence" });
    await gallery.scrollIntoViewIfNeeded();
    const runVideo = gallery.locator("video");
    await page.waitForFunction(() => document.querySelector("#m-run1 section[aria-label='Evidence'] video")?.getAttribute("poster")?.startsWith("blob:"));
    assert.ok(!(await runVideo.getAttribute("src")).endsWith("#t=0.1"), "the poster, not the first frame");
    assert.ok(await gallery.getByLabel("0:08 long").isVisible(), "its length");
    assert.ok(await gallery.locator('[data-kept="held"]').getByText("Held for you to check first").isVisible());
    assert.ok(await gallery.locator('[data-kept="local"]').getByText("On the computer, not uploaded").isVisible());
    assert.ok(state.fetched.filter((id) => id === "h-shot").length === 1 && !state.fetched.includes("l-trace"), "a held or kept file is never read for a thumbnail");

    // The held card: previews from the computer, a poster for a video too large, files answered one by one.
    const card = timeline.locator("#m-card-held");
    await card.scrollIntoViewIfNeeded();
    assert.ok(await card.getByText("@builder has 3 captures for you to check first").isVisible());
    assert.ok(await card.getByText("Waiting for you").isVisible());
    assert.ok(await card.getByText("Nothing goes to a model or into a chat until you send them.").isVisible());
    await card.getByRole("button", { name: "Preview keys.png" }).click();
    await card.getByRole("img", { name: "Preview of keys.png" }).waitFor();
    await card.getByRole("button", { name: "Preview flow.mp4" }).click();
    await card.getByText(TOO_LARGE).waitFor();
    await card.getByRole("button", { name: "Preview its poster" }).click();
    await card.getByRole("img", { name: "Preview of flow.mp4's poster" }).waitFor();
    await shot("held-card");
    const keys = card.locator('[data-held="h-shot"]');
    await keys.getByRole("button", { name: "Send this one" }).click();
    await keys.getByLabel("Sent").waitFor();
    assert.equal(await keys.getByRole("button", { name: "Send this one" }).count(), 0);
    await card.getByRole("button", { name: "Preview desk.png" }).click();
    const desk = card.locator('[data-held="h-desk"]');
    await desk.getByRole("img", { name: "Preview of desk.png" }).waitFor();
    await desk.getByRole("button", { name: "Discard this one" }).click();
    await desk.getByLabel("Discarded").waitFor();
    assert.equal(dialogs.at(-1), "Discard this capture? It is deleted on your computer too.");
    assert.deepEqual(state.calls.filter((call) => call.release), [{ release: "h-shot", decision: "approve" }, { release: "h-desk", decision: "discard" }]);
    // Settled, the card folds into its checkpoint, which opens back into the card.
    if (width === 390) {
      await card.getByRole("button", { name: "Send", exact: true }).click();
      await card.getByRole("button", { name: "Sent 3 captures" }).click();
      await card.getByText("Sent: they are on the run's card now.").waitFor();
      assert.ok(await card.locator('[data-held="h-video"]').getByLabel("Sent").isVisible(), "the rest went with the card");
    } else {
      await card.getByRole("button", { name: "Discard", exact: true }).click();
      await card.getByRole("button", { name: "Discarded 3 captures" }).click();
      await card.getByText("Discarded: deleted on your computer too.").waitFor();
      assert.equal(dialogs.at(-1), "Discard these captures? They are deleted on your computer too.");
    }
    assert.ok(await desk.getByLabel("Discarded").isVisible(), "a file answered on its own keeps its answer");
    assert.equal(await card.getByRole("button", { name: /^Preview/ }).count(), 0, "nothing more to preview once the card is settled");
    await card.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await shot("held-settled");

    // A node's video in a message: its poster, its measured shape and length; one tall picture keeps its shape.
    const media = timeline.locator("#m-media1");
    await media.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector("#m-media1 video")?.getAttribute("poster")?.startsWith("blob:"));
    assert.equal(state.posterVia, "media1", "the poster is read through its message");
    const frame = await media.locator("video").evaluate((video) => getComputedStyle(video.parentElement).aspectRatio);
    assert.equal(frame, "1280 / 720", "the space is kept before the video loads");
    assert.ok(await media.getByLabel("0:12 long").isVisible());
    const tall = timeline.locator("#m-tall1");
    await tall.scrollIntoViewIfNeeded();
    const box = await tall.getByRole("button", { name: /Open Screenshot “pricing-full.png”/ }).boundingBox();
    assert.ok(Math.abs(box.width / box.height - 390 / 844) < 0.02 && box.height <= 421, `a tall picture keeps its shape, no taller than the screen allows (${Math.round(box.width)}×${Math.round(box.height)})`);
    await fits("The conversation");
    await shot("media");

    // The node's own captures, in its settings.
    await page.goto(`${WEB}/r/dm-builder?settings=1`);
    const captures = page.getByRole("region", { name: "Builder's captures" });
    await captures.waitFor();
    await captures.scrollIntoViewIfNeeded();
    assert.ok(await captures.locator('[data-kept="held"]').getByText("settings.png").isVisible(), "a held capture waits on its card");
    await page.waitForFunction(() => document.querySelector("section[aria-label=\"Builder's captures\"] video")?.getAttribute("poster")?.startsWith("blob:"));
    await shot("node-captures");

    // Computers: what each can capture, or what to run there.
    await page.goto(`${WEB}/settings`);
    const ready = page.locator('[data-capture="ready"]');
    await ready.waitFor();
    assert.match(await ready.innerText(), /Captures web pages \(pictures and video\), Electron apps \(pictures\) and terminals \(pictures\)\. Videos are MP4\. ensemble(-test)? capture setup there adds more\./);
    assert.equal(await page.locator('[data-capture="update"]').innerText(), "Update Ensemble on Old laptop so your nodes can browse and capture there.");
    assert.match(await page.locator('[data-capture="setup"]').innerText(), /^Run ensemble(-test)? capture setup on Build box so your nodes can browse and capture there\.$/);
    await page.locator('[data-capture="update"]').scrollIntoViewIfNeeded();
    await fits("Computers");
    await shot("computers");

    assert.deepEqual(unexpected, [], "every API call is mocked");
    assert.deepEqual(errors, [], "no page errors");
    await context.close();
    console.log(`captures ${width}px ok`);
  }
} finally {
  await browser.close();
}
