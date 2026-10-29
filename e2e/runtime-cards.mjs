/**
 * Local, stateful browser fixture for the runtime cards: plan cards v3 (held steps, attempts, checks,
 * the requirements ledger, a work card, a contract 1 card), the session card (settings, queue edits,
 * Steer, Stop, what the agent was told), a run asked for its result, evidence and its lightbox, a
 * node's media, a routine's run in the "Working on" strip, helper threads (what a helper may do, keeping
 * it as a node) and the stop path. Never points at a hosted account or calls a model. Usage is in
 * docs/05 (Browser regression).
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
const stamp = (minute) => new Date(Date.UTC(2026, 9, 29, 10, minute)).toISOString();
const TASK = "3f2a9c1e-7b44-4d2a-9a51-0c8f5e6d7b10";
const PACKET = "## Goal\nFix the login redirect\n\n## Your part\nMake the redirect return to the page you came from, query string and all.\n\n## Constraints\nWork in the ensemble folder on testing.\n\n## Report\nCall report_result once.";
const BRIEF = `Work in the ensemble folder on testing. Then implement ONLY Expire Needs Me requests when their task ends (ensemble://task/${TASK}), read its page. Ensure terminal tasks cannot leave actionable stale requests; push to testing when done.`;

/** A small PNG of one colour, so thumbnails are real pictures. */
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

function fixture() {
  const avatar = (color) => ({ shape: "orb", color, eyes: "dot" });
  const base = { ownerId: "me", status: "active", charter: "", autonomy: {}, runProfileId: null, templateId: null, createdAt: stamp(0), provider: "ensemble", model: "gpt-5-mini" };
  const nodes = [
    { ...base, id: "lead", slug: "lead", name: "Lead", role: "manager", avatar: avatar("#D7B56F") },
    { ...base, id: "builder", slug: "builder", name: "Builder", role: "engineer", avatar: avatar("#7FB3D5") },
    { ...base, id: "tester", slug: "tester", name: "Tester", role: "tester", avatar: avatar("#A9DFBF") },
  ];
  const scout = { ...base, id: "lead-scout", slug: "lead-scout", name: "Scout", role: "auditor", avatar: avatar("#9AA5B1"), parentNodeId: "lead", autonomy: { sharedRooms: "ask", grant: "sessions" } };
  const me = { id: "p-me", kind: "person", handle: "mira", accountId: "me", role: "owner", name: "Mira", responsibility: null, me: true };
  const member = (node) => ({ id: `m-${node.id}`, kind: "node", handle: node.slug, accountId: "me", lead: node.id === "lead", representative: true, node });
  const room = (id, title, kind, members, extra = {}) => ({ id, title, kind, members: [me, ...members.map(member)], createdBy: "me", lastSeq: 0, lastMessageAt: stamp(1), pinned: [], invites: [], leadNodeIds: ["lead"], readSeq: 0, unread: 0, ...extra });
  const rooms = [room("crew", "Release crew", "crew", nodes), room("dm", "Lead", "dm", [nodes[0]]), room("task", "Lead · Scout", "task", [nodes[0], scout], { lastMessageAt: stamp(20), helper: { parentNodeId: "lead", helperNodeId: "lead-scout", originRoomId: "dm", originPrivate: false } })];
  let seq = 0;
  const message = (roomId, kind, body, extra = {}) => ({ id: `${roomId}-${++seq}`, roomId, seq, kind, body, authorKind: "node", authorAccountId: "me", authorNodeId: "lead", data: {}, private: false, mentions: [], rootMessageId: null, clientId: null, planId: null, createdAt: stamp(seq), ...extra });
  const asked = message("crew", "text", "Ship the table fix and the Needs me expiry.", { authorKind: "human", authorNodeId: null });
  const step = (id, nodeId, extra) => ({ id, nodeId, handle: nodeId, name: nodeId, brief: `Do the ${id} part.`, after: [], status: "waiting", result: null, progress: null, startedAt: null, endedAt: null, requirementIds: [], held: false, heldBy: null, outcome: "unknown", attempt: 0, attempts: [], sessionId: null, ...extra });
  const attempt = (n, reason, outcome, extra = {}) => ({ n, reason, outcome, summary: null, startedAt: stamp(n), endedAt: stamp(n + 1), ...extra });
  const plan = message("crew", "plan", "Here is the plan: two features, each tested before the next.", {
    id: "plan3",
    data: {
      type: "plan",
      version: 9,
      contract: 3,
      missionId: "plan3",
      kind: "plan",
      leadNodeId: "lead",
      leadHandle: "lead",
      leadTurnId: "t1",
      originRoomId: "crew",
      originPrivate: false,
      status: "running",
      goal: "Ship the table fix and Needs me expiry, each verified",
      requirements: [
        { id: "r1", text: "Tables keep pipes in record titles", status: "accepted", acceptance: [{ id: "a1", text: "A title with | renders in one cell", mandatory: true }] },
        { id: "r2", text: "Expire Needs Me requests when their task ends", status: "in_progress", acceptance: [{ id: "a2", text: "No actionable request after the task ends", mandatory: true }, { id: "a3", text: "The card says why", mandatory: false }] },
        { id: "r3", text: "Update the docs", status: "deferred", acceptance: [] },
      ],
      deferred: [{ requirementId: "r3", reason: "The owner asked for docs next week." }],
      steps: [
        step("s1", "builder", { kind: "build", executor: "session", brief: "Fix table parsing for titles with a pipe.", requirementIds: ["r1"], status: "done", outcome: "done", attempt: 2, result: "Fixed the parser; titles with a pipe stay in one cell.", attempts: [attempt(1, "first", "done", { candidate: { commit: "a1b2c3d4e5f6a7b8", branch: "testing" } }), attempt(2, "repair", "done", { summary: "Escaped pipes in titles.", candidate: { commit: "9f8e7d6c5b4a3210", branch: "testing", repo: "ensemble" } })] }),
        step("s2", "tester", { kind: "verify", executor: "session", verifies: "s1", after: ["s1"], requirementIds: ["r1"], status: "done", outcome: "pass", attempt: 2, result: "All checks pass on 9f8e7d6.", attempts: [attempt(1, "first", "fail", { summary: "A title with a pipe splits the cell.", checks: [{ name: "Title with a pipe", verdict: "fail", detail: "Expected 1 cell, got 2." }, { name: "Plain title", verdict: "pass" }], candidate: { commit: "a1b2c3d4e5f6a7b8" } }), attempt(2, "retest", "pass", { checks: [{ name: "Title with a pipe", verdict: "pass" }, { name: "Plain title", verdict: "pass" }], candidate: { commit: "9f8e7d6c5b4a3210" } })] }),
        step("s3", "builder", { kind: "build", executor: "session", brief: BRIEF, after: ["s2"], requirementIds: ["r2"], status: "working", attempt: 1, progress: "Editing lib/decisions.ts", run: { agent: "claude-code", model: "opus", effort: "high", context: "long_context" }, attempts: [attempt(1, "first", "unknown", { endedAt: null })] }),
        step("s4", "tester", { kind: "verify", executor: "session", verifies: "s3", after: ["s3"], requirementIds: ["r2"] }),
        step("s5", "builder", { kind: "write", executor: "self", brief: "Write the release note.", status: "blocked", outcome: "blocked", result: "It needs a sign-in to the release page." }),
        step("s6", "tester", { kind: "verify", brief: "Check the release note reads well.", after: ["s5"], held: true, heldBy: "s5" }),
      ],
    },
  });
  const stepRun = message("crew", "run", "Fix table parsing", { id: "steprun", planId: "plan3", authorNodeId: "builder", data: { plan: { id: "plan3", step: "s1" }, jobId: "j-step", status: "succeeded", attempt: 2, evidence: [
    { id: "e-home", kind: "screenshot", name: "table-desktop.png", mime: "image/png", size: 48210, caption: "The table at 1280 px", requirementId: "r1", createdAt: stamp(3) },
    { id: "e-phone", kind: "screenshot", name: "table-phone.png", mime: "image/png", size: 21004, caption: "The table at 390 px", createdAt: stamp(3) },
    { id: "e-svg", kind: "screenshot", name: "diagram.svg", mime: "image/svg+xml", size: 900, caption: "A drawing", createdAt: stamp(3) },
    { id: "e-report", kind: "report", name: "report.html", mime: "text/html", size: 12000, createdAt: stamp(3) },
  ] } });
  const legacy = message("crew", "plan", "Plan", { id: "plan1", data: { type: "plan", leadNodeId: "lead", leadHandle: "lead", status: "done", steps: [step("o1", "builder", { status: "done", result: "Built it." }), step("o2", "tester", { status: "done", after: ["o1"], result: "Tested it." })] } });
  const work = message("crew", "plan", "Work", { id: "work1", data: { type: "plan", contract: 3, kind: "self", leadNodeId: "lead", leadHandle: "lead", status: "running", goal: "Compare three hosting providers", requirements: [], deferred: [], steps: [step("w1", "lead", { kind: "research", executor: "self", brief: "Compare three hosting providers on price and limits.", status: "working", progress: "Reading the pricing pages" })] } });
  const queue = [
    { jobId: "j-q1", title: "Add tests for expiry", prompt: "Add tests for the expiry", position: 1 },
    { jobId: "j-q2", title: "Fix the lint", prompt: "Fix the lint warnings", position: 2 },
    { jobId: "j-q3", title: "Update the changelog", prompt: "Update the changelog", position: 3 },
  ];
  const session = { id: "sess1", status: "running", agent: "claude-code", model: "claude-opus-4-6", computer: "Development laptop", folder: "ensemble", queue };
  const live = message("crew", "run", "Fix the login redirect", { id: "run-live", authorNodeId: "builder", data: { jobId: "j-live", status: "running", delivery: "new", agent: "claude-code", session, told: PACKET, settings: {
    requested: { agent: "claude-code", model: "opus", effort: "high", context: "long_context" },
    resolved: { agent: "claude-code", model: "claude-opus-4-6", effort: "high", context: "default" },
    observed: { agent: "claude-code", model: "not_reported", effort: "not_reported", context: "not_reported" },
  } } });
  const queued = message("crew", "run", "Add tests for expiry", { id: "run-q1", authorNodeId: "builder", data: { jobId: "j-q1", status: "queued", delivery: "queue", session } });
  const failed = message("crew", "run", "Check the sign-up page", { id: "run-fail", authorNodeId: "tester", data: { jobId: "j-fail", status: "succeeded", report: { outcome: "fail", summary: "The sign-up page breaks on phones.", checks: [{ name: "Desktop layout", verdict: "pass" }, { name: "Phone layout", verdict: "fail", detail: "The button is off screen at 390 px." }, { name: "Signed-in flow", verdict: "blocked", detail: "Needs a sign-in." }], subject: { commit: "0badc0de1234", branch: "testing" } }, evidence: [{ id: "e-phone", kind: "screenshot", name: "signup-phone.png", mime: "image/png", size: 21004, caption: "Button off screen", createdAt: stamp(9) }] } });
  const askedRun = message("crew", "run", "Report the result", { id: "run-asked", authorNodeId: "tester", data: { jobId: "j-asked", status: "succeeded", reportAsked: true, told: "You finished without reporting your result. Call the Ensemble tool report_result now. Do not redo the work." } });
  const routineRun = message("crew", "plan", "Work", { id: "routine-run", planId: "r-morning", data: { type: "plan", contract: 3, kind: "self", leadNodeId: "lead", leadHandle: "lead", status: "running", goal: "Morning summary", routine: { id: "r-morning", runId: "rr-1", title: "Morning summary", notify: "always", trigger: "Weekdays at 09:00 (Asia/Kolkata)" }, requirements: [], deferred: [], steps: [step("m1", "lead", { kind: "research", executor: "self", brief: "Summarise the board.", status: "working", progress: "Reading the board" })] } });
  const media = message("crew", "text", "Here is the table now, at both sizes.", { id: "media1", data: { media: [{ evidenceId: "e-home", kind: "screenshot", name: "table-desktop.png", mime: "image/png", caption: "Desktop" }, { evidenceId: "e-video", kind: "video", name: "walkthrough.mp4", mime: "video/mp4", caption: "Walkthrough" }] } });
  const ask = message("dm", "text", "Get an independent audit of the README.", { authorKind: "human", authorNodeId: null });
  const helped = message("dm", "text", "I asked a helper for an independent audit; I will tell you what it finds.", { id: "helped", data: { tools: [{ id: "c1", name: "node_helper", state: "done", summary: "@lead-scout is on it in “Lead · Scout”; it reports back to you there.", href: null }] } });
  const brief = message("task", "text", "@lead-scout Audit the README for stale commands.", { id: "brief" });
  const found = message("task", "text", "@lead Found 3 stale commands: `ensemble login --old`, …", { id: "found", authorNodeId: "lead-scout" });
  const messages = { crew: [asked, plan, stepRun, legacy, work, live, queued, failed, askedRun, routineRun, media], dm: [ask, helped], task: [brief, found] };
  for (const row of rooms) {
    row.lastSeq = messages[row.id].length;
    row.readSeq = row.lastSeq;
    row.last = messages[row.id].filter((item) => !item.planId).at(-1);
  }
  const boot = { me: { id: "me", name: "Mira Chen", email: "mira@fieldnote.example", verified: true }, nodes, rooms, computers: [], credits: null, invites: [], templates: { nodes: [], crews: [] }, limits: { roomPeople: 10, nodesPerPerson: 3, crewNodes: 24, pins: 25, reactions: ["👍", "❤️", "😂", "🎉", "👀", "✅", "🙏", "🔥"], declineBlockDays: 30 }, models: { default: "gpt-5-mini", options: [] } };
  const job = (id, title, status, extra = {}) => ({ id, taskId: "task", title, kind: "code", status, provider: "claude-code", model: "claude-opus-4-6", modelUsed: null, reasoningEffort: "high", contextTier: null, progress: status === "running" ? "Editing src/auth/redirect.ts" : null, summary: null, error: null, turns: 1, toolCalls: 4, runId: null, deviceName: "Development laptop", yours: true, folder: "ensemble", branch: "testing", files: [], createdAt: stamp(1), startedAt: stamp(1), finishedAt: status === "running" || status === "queued" ? null : stamp(2), ...extra });
  const jobs = { "j-step": job("j-step", "Fix table parsing", "succeeded"), "j-live": job("j-live", "Fix the login redirect", "running"), "j-q1": job("j-q1", "Add tests for expiry", "queued", { startedAt: null }), "j-fail": job("j-fail", "Check the sign-up page", "succeeded"), "j-asked": job("j-asked", "Report the result", "succeeded") };
  return { boot, messages, jobs, session: { id: "sess1", nodeId: "builder", status: "running", agent: "claude-code", agentName: "Claude Code", model: "claude-opus-4-6", computer: "Development laptop", folder: "ensemble", running: { jobId: "j-live", title: "Fix the login redirect", prompt: "Fix the login redirect so it returns to the page you came from." }, queue: queue.map((row) => ({ ...row })), runs: [] }, calls: [], refuseNextReorder: false };
}

const pictures = { "e-home": png(160, 100, [40, 90, 120]), "e-phone": png(90, 160, [120, 60, 40]) };

try {
  for (const width of [390, 1280]) {
    const state = fixture();
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 768, isMobile: width < 768, colorScheme: "dark", reducedMotion: "reduce" });
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
      const json = (data, status = 200) => route.fulfill({ status, json: data, headers: cors });
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-methods": "GET, POST, PATCH, DELETE", "access-control-allow-headers": "content-type, accept" } });
      if (path === "/api/auth/me") return json({ user: state.boot.me });
      if (path === "/api/node/bootstrap") return json(state.boot);
      if (path === "/api/node/activity") return json({ approvals: [], runs: [], turns: [], computers: [], credits: null });
      if (path === "/api/decisions") return json({ decisions: [] });
      if (path === "/api/approvals") return json({ approvals: [] });
      if (path === "/api/devices") return json({ devices: [] });
      if (path === "/api/documents") return json({ files: [], usage: { maxFileBytes: 25000000 } });
      const evidence = /^\/api\/node\/evidence\/([^/]+)$/.exec(path);
      if (evidence) {
        if (pictures[evidence[1]]) return route.fulfill({ status: 200, body: pictures[evidence[1]], headers: { ...cors, "content-type": "image/png", "x-content-type-options": "nosniff" } });
        if (evidence[1] === "e-svg") return route.fulfill({ status: 200, body: '<svg xmlns="http://www.w3.org/2000/svg"><script>window.__svgRan = true</script></svg>', headers: { ...cors, "content-type": "image/svg+xml", "content-disposition": 'attachment; filename="diagram.svg"' } });
        return route.fulfill({ status: 404, json: { error: "Not here" }, headers: cors });
      }
      const job = /^\/api\/agent\/jobs\/([^/]+)$/.exec(path);
      if (job && state.jobs[job[1]]) return json({ job: state.jobs[job[1]], log: "", events: [] });
      if (path === "/api/node/sessions/sess1") return json({ session: state.session });
      if (path === "/api/node/sessions/sess1/control") {
        state.calls.push({ control: request.postDataJSON() });
        return json({ ok: true, jobId: "j-new" });
      }
      if (path === "/api/node/sessions/sess1/queue") {
        const { order } = request.postDataJSON();
        state.calls.push({ reorder: order });
        if (state.refuseNextReorder) {
          state.refuseNextReorder = false;
          return json({ error: "The queue changed. Look again." }, 409);
        }
        state.session.queue = order.map((id, at) => ({ ...state.session.queue.find((row) => row.jobId === id), position: at + 1 }));
        return json({ ok: true });
      }
      const cancel = /^\/api\/node\/sessions\/sess1\/queue\/([^/]+)$/.exec(path);
      if (cancel && request.method() === "DELETE") {
        state.calls.push({ cancel: cancel[1] });
        state.session.queue = state.session.queue.filter((row) => row.jobId !== cancel[1]).map((row, at) => ({ ...row, position: at + 1 }));
        return route.fulfill({ status: 204, headers: cors });
      }
      const promote = /^\/api\/node\/nodes\/([^/]+)\/promote$/.exec(path);
      if (promote && request.method() === "POST") {
        state.calls.push({ promote: promote[1] });
        const task = state.boot.rooms.find((row) => row.id === "task");
        const helper = task.members.find((row) => row.kind === "node" && row.node.id === promote[1]).node;
        helper.parentNodeId = null;
        state.boot.nodes.push(helper);
        const chat = state.boot.rooms.find((row) => row.id === "dm");
        state.boot.rooms.push({ ...chat, id: "dm-scout", title: helper.name, members: [chat.members[0], { id: "m-scout-dm", kind: "node", handle: helper.slug, accountId: "me", lead: false, representative: true, node: helper }], lastSeq: 0, readSeq: 0, last: null });
        state.messages["dm-scout"] = [];
        return json({ node: helper, room: { id: "dm-scout", title: helper.name } }, 201);
      }
      const planRead = /^\/api\/node\/plans\/([^/]+)$/.exec(path);
      if (planRead && request.method() === "GET") {
        const all = Object.values(state.messages).flat();
        const card = all.find((row) => row.id === planRead[1] && row.kind === "plan");
        return card ? json({ message: card, runs: all.filter((row) => row.planId === card.id && row.kind === "run") }) : json({ error: "That plan is not available." }, 404);
      }
      const stop = /^\/api\/node\/(rooms|plans)\/([^/]+)\/stop$/.exec(path);
      if (stop) {
        state.calls.push({ stop: `${stop[1]}/${stop[2]}` });
        return json({ stopped: 2 });
      }
      const read = /^\/api\/node\/rooms\/([^/]+)\/read$/.exec(path);
      if (read) return json({});
      const messages = /^\/api\/node\/rooms\/([^/]+)\/messages$/.exec(path);
      if (messages && request.method() === "GET") {
        const author = new URL(request.url()).searchParams.get("author");
        return json({ messages: (state.messages[messages[1]] ?? []).filter((row) => (author === "people" ? row.authorKind !== "node" : author === "nodes" ? row.authorKind === "node" : true)) });
      }
      unexpected.push(path);
      return route.fulfill({ status: 404, json: { error: `Unmocked API: ${path}` }, headers: cors });
    });
    const dialogs = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      void dialog.accept();
    });
    const fits = async () => {
      const wide = await page.locator("main").evaluate((main) => {
        if (main.scrollWidth <= main.clientWidth + 2) return [];
        const edge = main.getBoundingClientRect().right + 2;
        const clipped = (el) => {
          for (let up = el.parentElement; up && up !== main; up = up.parentElement) if (getComputedStyle(up).overflowX !== "visible" && up.getBoundingClientRect().right <= edge) return true;
          return false;
        };
        return [...main.querySelectorAll("*")].filter((el) => el.getBoundingClientRect().right > edge && getComputedStyle(el).position !== "fixed" && !clipped(el)).slice(0, 6).map((el) => `${el.tagName.toLowerCase()}.${String(el.getAttribute("class")).slice(0, 80)}#${el.id} → ${Math.round(el.getBoundingClientRect().right)}`);
      });
      assert.deepEqual(wide, [], `${width}px fits`);
    };

    // The crew: a v3 plan card, a contract 1 card, a work card, session cards and media.
    await page.goto(`${WEB}/r/crew`);
    const timeline = page.locator(".chat-timeline");
    const plan = timeline.locator("#m-plan3");
    await plan.getByText("Ship the table fix and Needs me expiry, each verified").waitFor();
    assert.ok(await plan.getByText("1 of 3 accepted · 1 in progress · 1 deferred").isVisible(), "the ledger's line");
    assert.ok(await plan.getByText("Deferred: Update the docs").isVisible());
    assert.ok(await plan.getByText("held by @builder (step 5)").isVisible(), "a held step names what holds it");

    // The brief from §4.11 reads once, by kind, clamped to one line.
    const s3 = plan.getByRole("button", { name: /implement ONLY Expire Needs Me/ });
    const brief = s3.locator("span.line-clamp-1");
    const briefText = (await brief.textContent()) ?? "";
    assert.ok(briefText.includes("Expire Needs Me requests when their task ends (task), read its page. Ensure terminal tasks cannot leave actionable stale requests;"), briefText);
    assert.equal(briefText.match(/actionable stale/g)?.length, 1, "no repeated phrase");
    assert.ok(await brief.evaluate((el) => el.getBoundingClientRect().height <= parseFloat(getComputedStyle(el).lineHeight) * 1.5), "the folded brief is one line");
    await s3.click();
    const opened = plan.locator('[id^="step-plan3-s3"]');
    assert.equal(((await opened.textContent()) ?? "").match(/actionable stale/g)?.length, 1, "the open step shows the brief once");
    assert.equal(await opened.getByRole("link", { name: "task", exact: true }).getAttribute("href"), `http://localhost:3000/tasks/${TASK}`);
    assert.ok(await opened.getByText("Runs with Claude Code · opus · high thinking · long context").isVisible());

    // Attempts: a failed check, then a retest that passed; a repair with its commit.
    await plan.getByRole("button", { name: /@tester.*Verify/ }).first().click();
    const s2 = plan.locator('[id^="step-plan3-s2"]');
    await s2.getByText("Attempt 2 · retest").waitFor();
    assert.ok(await s2.getByText("Expected 1 cell, got 2.").isVisible());
    assert.ok(await s2.getByRole("img", { name: "Failed" }).first().isVisible());
    await plan.getByRole("button", { name: /Fix table parsing for titles/ }).click();
    const s1 = plan.locator('[id^="step-plan3-s1"]');
    await s1.getByText("Attempt 2 · repair").waitFor();
    assert.ok(await s1.getByText("9f8e7d6 on testing").isVisible(), "the repair's commit");

    // Evidence: pictures as thumbnails, active formats only as downloads; the lightbox.
    const gallery = s1.getByRole("region", { name: "Evidence from @builder" });
    await gallery.locator("img").first().waitFor();
    await page.waitForFunction(() => document.querySelectorAll('[aria-label="Evidence from @builder"] img').length >= 2);
    assert.equal(await gallery.locator("img").count(), 2, "only the two PNGs show as pictures");
    assert.ok(await gallery.getByRole("button", { name: /Download Screenshot “diagram.svg”/ }).isVisible(), "an SVG is a download");
    assert.ok(await gallery.getByRole("button", { name: /Download Report “report.html”/ }).isVisible(), "an HTML report is a download");
    assert.ok(await gallery.getByRole("link", { name: "For: Tables keep pipes in record titles" }).first().isVisible(), "evidence names its requirement");
    const thumbnail = gallery.getByRole("button", { name: /Open Screenshot “table-desktop.png”/ });
    await thumbnail.click();
    const lightbox = page.getByRole("dialog", { name: /Screenshot 1 of 2: table-desktop.png/ });
    await lightbox.waitFor();
    await page.keyboard.press("ArrowRight");
    await page.getByRole("dialog", { name: /Screenshot 2 of 2: table-phone.png/ }).waitFor();
    await page.keyboard.press("End");
    await page.keyboard.press("Home");
    await page.getByRole("dialog", { name: /1 of 2/ }).waitFor();
    // Focus on the caption's requirement link, then to a piece without one: focus stays in the lightbox.
    const forLink = page.getByRole("dialog").getByRole("link", { name: "For: Tables keep pipes in record titles" });
    for (let tab = 0; tab < 6 && !(await forLink.evaluate((el) => el === document.activeElement)); tab += 1) await page.keyboard.press("Tab");
    assert.equal(await forLink.evaluate((el) => el === document.activeElement), true, "the caption's link takes focus");
    await page.keyboard.press("ArrowRight");
    await page.getByRole("dialog", { name: /2 of 2/ }).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Close", "focus moves to Close, not behind the lightbox");
    await page.keyboard.press("Shift+Tab");
    assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))), true, "Tab stays in the lightbox");
    await page.keyboard.press("Home");
    if (shots) await page.screenshot({ path: `${shots}/lightbox-${width}.png` });
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
    assert.equal(await thumbnail.evaluate((el) => el === document.activeElement), true, "focus returns to the thumbnail");
    assert.equal(await page.evaluate(() => window.__svgRan === true), false, "the SVG never ran");

    // The contract 1 card and the work card.
    assert.ok(await timeline.locator("#m-plan1").getByText("Done", { exact: true }).first().isVisible(), "a plan from before outcomes still reads Done");
    assert.equal(await timeline.locator("#m-plan1").getByText("Requirements").count(), 0);
    const workCard = timeline.locator("#m-work1");
    assert.ok(await workCard.getByText("Compare three hosting providers", { exact: true }).isVisible());
    assert.ok(await workCard.getByText("Reading the pricing pages").isVisible());

    // The session card: settings, the queue, steer and stop.
    const card = timeline.locator("#m-run-live");
    await card.getByRole("button", { name: /Settings/ }).click();
    assert.ok(await card.getByText("not as asked").isVisible());
    assert.equal(await card.locator(width < 640 ? "dl" : "table").getByText("not reported").count(), 3, "observed settings the engine did not report");
    const sessionPanel = card.getByRole("region", { name: "Agent session" });
    await sessionPanel.getByText("3 queued").waitFor();
    await sessionPanel.getByRole("button", { name: "What it was told" }).click();
    const told = sessionPanel.getByRole("region", { name: "What the agent was told" });
    await told.getByText("Make the redirect return to the page you came from, query string and all.").waitFor();
    assert.equal(await told.getByText("Your part", { exact: true }).evaluate((el) => getComputedStyle(el).textTransform), "uppercase", "its parts read as small labels");
    assert.equal(await sessionPanel.getByText("Fix the login redirect so it returns to the page you came from.").count(), 0, "the packet on the card comes before the session's own prompt");
    assert.equal(await card.getByRole("button", { name: "What the agent was told" }).count(), 0, "said once on a session card");
    const queueList = sessionPanel.getByRole("list", { name: "Queued messages" });
    const order = async () => queueList.locator("li").evaluateAll((items) => items.map((item) => item.querySelector("span.truncate")?.textContent));
    await sessionPanel.getByRole("button", { name: "Move “Fix the lint” earlier" }).click();
    assert.deepEqual(await order(), ["Fix the lint", "Add tests for expiry", "Update the changelog"], "the move shows at once");
    for (let wait = 0; wait < 100 && !state.calls.some((call) => call.reorder); wait += 1) await page.waitForTimeout(20);
    assert.deepEqual(state.calls.at(-1), { reorder: ["j-q2", "j-q1", "j-q3"] });
    state.refuseNextReorder = true;
    await sessionPanel.getByRole("button", { name: "Move “Update the changelog” earlier" }).click();
    await sessionPanel.getByRole("alert").getByText("The queue changed. Look again.").waitFor();
    assert.deepEqual(await order(), ["Fix the lint", "Add tests for expiry", "Update the changelog"], "a refused move goes back");
    const first = sessionPanel.getByRole("button", { name: "Move “Fix the lint” earlier" });
    assert.equal(await first.getAttribute("aria-disabled"), "true", "the first cannot move earlier but keeps focus");
    await sessionPanel.getByRole("button", { name: "Cancel “Update the changelog”" }).click();
    await page.waitForFunction(() => document.querySelectorAll('[aria-label="Queued messages"] li').length === 2);
    assert.deepEqual(state.calls.at(-1), { cancel: "j-q3" });
    await sessionPanel.getByRole("button", { name: "Steer…" }).click();
    await sessionPanel.getByRole("textbox", { name: "Steer the run" }).fill("Also keep the query string");
    await sessionPanel.getByRole("button", { name: "Steer", exact: true }).click();
    await sessionPanel.getByText("Sent. The run goes on with your change.").waitFor();
    assert.deepEqual(state.calls.at(-1), { control: { action: "steer", prompt: "Also keep the query string" } });
    await sessionPanel.getByRole("button", { name: "Stop", exact: true }).click();
    await sessionPanel.getByRole("button", { name: "Stop, keep the queue (2)" }).click();
    await sessionPanel.getByText("Stopping. Queued messages stay.").waitFor();
    assert.deepEqual(state.calls.at(-1), { control: { action: "stop", queued: "keep" } });
    const queuedCard = timeline.locator("#m-run-q1");
    await queuedCard.getByText(/Number 2 of 2 in the session's queue/).waitFor();
    if (shots) await card.screenshot({ path: `${shots}/session-${width}.png` });

    // A run's report, and a node's media.
    const report = timeline.locator("#m-run-fail").getByRole("region", { name: "Report" });
    assert.ok(await report.getByText("1 of 3 checks passed · 1 failed · 1 blocked").isVisible());
    assert.ok(await report.getByText("The button is off screen at 390 px.").isVisible());
    const media = timeline.locator("#m-media1").getByRole("region", { name: "Media" });
    await media.locator("img").first().waitFor();
    await media.getByRole("button", { name: /This video does not play here/ }).waitFor();
    assert.equal(await media.locator("video").count(), 0, "a video that cannot be read becomes a download");

    // A run Ensemble asked once for its result says so, and what it was asked.
    const askedCard = timeline.locator("#m-run-asked");
    assert.ok(await askedCard.getByText("Asked for its result").isVisible());
    await askedCard.getByRole("button", { name: "What the agent was told" }).click();
    await askedCard.getByRole("region", { name: "What the agent was told" }).getByText(/You finished without reporting your result/).waitFor();

    // The work strip and the room's Stop.
    const strip = page.getByRole("region", { name: "Working on" });
    // A routine's run is not in the timeline: its chip opens its card.
    assert.equal(await timeline.locator("#m-routine-run").count(), 0, "a routine's run is not in the timeline");
    await strip.getByRole("button", { name: /Routine: Morning summary/ }).click();
    const routineDrawer = page.getByRole("dialog", { name: "Routine run" });
    await routineDrawer.getByText("Reading the board").waitFor();
    assert.equal(await routineDrawer.getByRole("link", { name: "Routine · Morning summary" }).getAttribute("href"), "/routines#routine-r-morning");
    await page.keyboard.press("Escape");
    await routineDrawer.waitFor({ state: "detached" });
    assert.ok(await strip.getByText("Ship the table fix and Needs me expiry, each verified").isVisible());
    assert.ok(await strip.getByText("Fix the login redirect").isVisible());
    await page.getByRole("button", { name: "Stop this conversation's work" }).click();
    await page.getByText("Stopped. What was changed so far stays.").waitFor();
    assert.ok(dialogs.at(-1)?.startsWith("Stop this conversation's work?"), "it asks first while work runs");
    assert.deepEqual(state.calls.at(-1), { stop: "rooms/crew" });
    // People only hides the cards, not the work: Stop still asks first.
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "People only" }).click();
    await page.getByText("Showing people only").waitFor();
    const asked = dialogs.length;
    const stops = state.calls.filter((call) => call.stop).length;
    await page.getByRole("button", { name: "Stop this conversation's work" }).click();
    for (let wait = 0; wait < 100 && state.calls.filter((call) => call.stop).length === stops; wait += 1) await page.waitForTimeout(20);
    assert.equal(dialogs.length, asked + 1, "a filtered view still asks before stopping running work");
    assert.equal(state.calls.filter((call) => call.stop).length, stops + 1);
    await page.getByRole("button", { name: "Show everything" }).click();
    await fits();
    if (shots) await page.screenshot({ path: `${shots}/crew-${width}.png`, fullPage: false });
    if (shots) await plan.screenshot({ path: `${shots}/plan-${width}.png` });

    // A helper's room is a thread in its parent's chat, not a conversation in the list.
    await page.goto(`${WEB}/r/dm`);
    const chip = page.getByRole("button", { name: "@lead-scout, helper of @lead · quiet · 2 messages" });
    await chip.waitFor();
    if (width >= 768) assert.deepEqual(await page.getByRole("complementary", { name: "Chat sidebar" }).locator("[data-conversation]").evaluateAll((els) => els.map((el) => el.dataset.conversation)).then((ids) => ids.sort()), ["crew", "dm"], "no helper room in the list");
    await chip.click();
    await page.getByText("Found 3 stale commands").waitFor();
    assert.equal(await page.getByRole("link", { name: "Open the helper's room" }).getAttribute("href"), "/r/task");
    assert.ok(await page.getByText("Can run sessions · reports to @lead").isVisible(), "what the helper may do");
    if (shots) await page.screenshot({ path: `${shots}/helper-${width}.png` });
    await fits();
    // The helper's own room says whose helper it is; its settings say what it may do.
    await page.goto(`${WEB}/r/task`);
    await page.getByText("@lead brought in @lead-scout for one task").waitFor();
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: "About this helper" }).click();
    const about = page.getByRole("dialog", { name: "About this helper" });
    await about.getByText("helper · can run sessions").waitFor();
    assert.ok(await about.getByText(/may run its own coding-agent session on your computer/).isVisible());
    assert.ok(await about.getByRole("button", { name: "Keep as a node" }).isVisible());
    await page.keyboard.press("Escape");
    await page.goto(`${WEB}/r/dm`);
    await chip.click();
    await page.getByRole("button", { name: "Keep as a node" }).click();
    await page.getByText("Kept as a node").waitFor();
    assert.equal(dialogs.at(-1), "Keep @lead-scout as a lasting node? It gets its own chat.");
    assert.deepEqual(state.calls.at(-1), { promote: "lead-scout" });
    assert.equal(await page.getByRole("link", { name: "Open its chat" }).getAttribute("href"), "/r/dm-scout");
    if (width >= 768) await page.getByRole("complementary", { name: "Chat sidebar" }).locator('[data-conversation="dm-scout"]').waitFor();
    // Its room is history now: it says so, and deleting it leaves the node.
    await page.goto(`${WEB}/r/task`);
    await page.getByText("You kept @lead-scout as a node; this room is its history.").waitFor();
    assert.equal(await page.getByRole("link", { name: "Talk to Scout" }).getAttribute("href"), "/r/dm-scout");
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: "About this helper" }).click();
    const history = page.getByRole("dialog", { name: "About this helper" });
    await history.getByRole("button", { name: "Delete this room" }).waitFor();
    assert.equal(await history.getByRole("button", { name: "Keep as a node" }).count(), 0);
    await page.keyboard.press("Escape");

    assert.deepEqual(errors, [], "no page errors");
    assert.deepEqual([...new Set(unexpected)].filter((path) => !path.startsWith("/api/runs/")), [], "no unmocked API calls");
    if (shots) {
      // The whole conversation at once, cards open, for a person to look over.
      await page.setViewportSize({ width, height: 4200 });
      await page.goto(`${WEB}/r/crew`);
      const overview = page.locator(".chat-timeline #m-plan3");
      await overview.getByText("Ship the table fix and Needs me expiry, each verified").waitFor();
      for (const name of [/implement ONLY Expire Needs Me/, /Fix table parsing for titles/, /Check the release note/]) await overview.getByRole("button", { name }).click();
      await page.locator(".chat-timeline").evaluate((el) => (el.scrollTop = 0));
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${shots}/overview-${width}.png` });
    }
    await context.close();
    console.log(`runtime cards ok at ${width}px`);
  }
} finally {
  await browser.close();
}
