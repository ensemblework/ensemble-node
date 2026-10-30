/**
 * Local, stateful browser fixture for the Sessions page (Ensemble docs/35 §8.9): every agent session of
 * mine, most recently active first, with where it runs, what it did and who manages it; search; a
 * session no node manages given to a node; a managed session opened with its queue, controls and
 * recent runs (Steer); the list read again when a session's card changes on the event stream; and a
 * session's newest card, and each run's, opened in their conversation at that message.
 * Never points at a hosted account or calls a model. Usage is in docs/05 (Browser regression).
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
const IDS = { live: "1b9f3c2e-6d7a-4e8b-9c0d-1e2f3a4b5c6d", hub: "2c0a4d3f-7e8b-4f9c-8d1e-2f3a4b5c6d7e", cli: "3d1b5e4a-8f9c-4a0d-9e2f-3a4b5c6d7e8f" };

function fixture() {
  const avatar = (color) => ({ shape: "orb", color, eyes: "dot" });
  const base = { ownerId: "me", status: "active", charter: "", autonomy: {}, runProfileId: null, templateId: null, createdAt: at(-9000), provider: "ensemble", model: "gpt-5-mini", parentNodeId: null };
  const nodes = [
    { ...base, id: "lead", slug: "lead", name: "Lead", role: "manager", avatar: avatar("#D7B56F") },
    { ...base, id: "builder", slug: "builder", name: "Builder", role: "engineer", avatar: avatar("#7FB3D5") },
    { ...base, id: "designer", slug: "designer", name: "Designer", role: "designer", avatar: avatar("#F1948A") },
  ];
  const me = { id: "p-me", kind: "person", handle: "mira", accountId: "me", role: "owner", name: "Mira", responsibility: null, me: true };
  const member = (node) => ({ id: `m-${node.id}`, kind: "node", handle: node.slug, accountId: "me", lead: node.id === "lead", representative: true, node });
  const rooms = [
    { id: "dm-lead", title: "Lead", kind: "dm", members: [me, member(nodes[0])], createdBy: "me", lastSeq: 1, readSeq: 1, unread: 0, lastMessageAt: at(-60), pinned: [], invites: [], leadNodeIds: ["lead"], last: null },
    { id: "crew", title: "Release crew", kind: "crew", members: [me, ...nodes.map(member)], createdBy: "me", lastSeq: 1, readSeq: 1, unread: 0, lastMessageAt: at(-60), pinned: [], invites: [], leadNodeIds: ["lead"], last: null },
  ];
  const sessions = [
    { id: IDS.live, nodeId: "builder", card: { messageId: "card-live", roomId: "crew" }, status: "working", agent: "claude-code", agentName: "Claude Code", model: "claude-opus-4-6", computer: "Development laptop", folder: "ensemble", title: "Fix the login redirect", latestTask: "Fix the login redirect", summary: "Editing src/auth/redirect.ts", runs: 2, lastActiveAt: at(-1) },
    { id: IDS.hub, nodeId: null, card: null, status: "idle", agent: "codex", agentName: "Codex", model: null, computer: "Laptop", folder: "website", title: "Update the pricing table", latestTask: "Make the table scroll on phones", summary: "Made the pricing table scroll sideways on phones; the totals stay in view.", runs: 3, lastActiveAt: at(-30) },
    { id: IDS.cli, nodeId: "lead", card: { messageId: "card-docs", roomId: "dm-lead" }, status: "idle", agent: "copilot-cli", agentName: "GitHub Copilot", model: null, computer: null, folder: "docs", title: "Rewrite the README", latestTask: "Add the install steps", summary: "Added install steps for macOS, Linux and Windows.", runs: 5, lastActiveAt: at(-600) },
  ];
  const run = (jobId, title, status, extra = {}) => ({ jobId, title, prompt: `${title}.`, status, position: null, summary: null, error: null, settings: null, messageId: null, roomId: null, createdAt: at(-20), finishedAt: status === "running" ? null : at(-10), ...extra });
  const details = {
    [IDS.live]: { id: IDS.live, nodeId: "builder", status: "working", agent: "claude-code", agentName: "Claude Code", model: "claude-opus-4-6", computer: "Development laptop", folder: "ensemble", running: { jobId: "j-live", title: "Fix the login redirect", prompt: "Fix the login redirect so it returns to the page you came from.", status: "running" }, queue: [{ jobId: "j-q1", title: "Add tests for the redirect", prompt: "Add tests for the redirect", position: 1 }], runs: [run("j-live", "Fix the login redirect", "running", { position: 1, messageId: "card-live", roomId: "crew", settings: { resolved: { agent: "claude-code", model: "claude-opus-4-6", effort: "high" } } }), run("j-read", "Read the auth code", "succeeded", { summary: "Read the auth code: the redirect drops the query string." })] },
    [IDS.hub]: { id: IDS.hub, nodeId: null, status: "idle", agent: "codex", agentName: "Codex", model: null, computer: "Laptop", folder: "website", running: null, queue: [], runs: [run("j-h3", "Make the table scroll on phones", "succeeded", { summary: "Made the pricing table scroll sideways on phones." }), run("j-h2", "Fix the totals row", "failed", { error: "The build failed: a missing import." })] },
    [IDS.cli]: { id: IDS.cli, nodeId: "lead", status: "idle", agent: "copilot-cli", agentName: "GitHub Copilot", model: null, computer: null, folder: "docs", running: null, queue: [], runs: [] },
  };
  // The live session's newest card, in the crew.
  const liveCard = { id: "card-live", roomId: "crew", seq: 1, kind: "run", body: "Fix the login redirect", authorKind: "node", authorAccountId: "me", authorNodeId: "builder", data: { jobId: "j-live", status: "running", session: { id: IDS.live, nodeId: "builder", status: "working", agent: "Claude Code", agentId: "claude-code", computer: "Development laptop", folder: "ensemble", queue: [] } }, private: false, mentions: [], rootMessageId: null, clientId: null, planId: null, createdAt: at(-20) };
  const boot = { me: { id: "me", name: "Mira", email: "mira@fieldnote.example", verified: true }, nodes, rooms, computers: [], credits: null, invites: [], templates: { nodes: [], crews: [] }, limits: { roomPeople: 10, nodesPerPerson: 3, crewNodes: 24, pins: 25, reactions: ["👍"], declineBlockDays: 30 }, models: { default: "gpt-5-mini", options: [] } };
  return { boot, sessions, details, messages: { crew: [liveCard], "dm-lead": [] }, calls: [], reads: [] };
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
    const emit = (type, data) => page.evaluate(({ type, data }) => { for (const source of window.__nodeEvents) source.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) })); }, { type, data });
    const cors = { "access-control-allow-origin": WEB, "access-control-allow-credentials": "true" };
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      const json = (data, status = 200) => route.fulfill({ status, json: data, headers: cors });
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-methods": "GET, POST, PATCH, DELETE", "access-control-allow-headers": "content-type, accept" } });
      if (path === "/api/auth/me") return json({ user: state.boot.me });
      if (path === "/api/node/bootstrap") return json(state.boot);
      // No computer sends a live view here (e2e/captures.mjs covers it).
      if (path.startsWith("/api/node/live/")) return route.fulfill({ status: 204, headers: cors });
      if (path === "/api/node/activity") return json({ approvals: [], runs: [], turns: [], computers: [], credits: null, waitingTasks: [] });
      if (path === "/api/decisions") return json({ decisions: [] });
      if (path === "/api/approvals") return json({ approvals: [] });
      if (path === "/api/devices") return json({ devices: [] });
      if (path === "/api/documents") return json({ files: [], usage: { maxFileBytes: 25000000 } });
      if (/^\/api\/agent\/jobs\/[^/]+$/.test(path)) return json({ error: "Not here" }, 404);
      if (/^\/api\/node\/rooms\/[^/]+\/read$/.test(path)) return json({});
      const roomMessages = /^\/api\/node\/rooms\/([^/]+)\/messages$/.exec(path);
      if (roomMessages && method === "GET") return json({ messages: state.messages[roomMessages[1]] ?? [] });
      const oneMessage = /^\/api\/node\/messages\/([^/]+)$/.exec(path);
      if (oneMessage && method === "GET") {
        const found = Object.values(state.messages).flat().find((row) => row.id === oneMessage[1]);
        return found ? json({ message: found }) : json({ error: "That message is not available." }, 404);
      }
      if (path === "/api/node/sessions" && method === "GET") {
        const q = (url.searchParams.get("q") ?? "").toLowerCase();
        state.reads.push({ q, limit: url.searchParams.get("limit") });
        const rows = state.sessions.filter((row) => !q || [row.title, row.latestTask, row.summary, row.folder, row.agentName, row.computer ?? ""].some((text) => text.toLowerCase().includes(q)));
        return json({ sessions: [...rows].sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt)) });
      }
      const session = /^\/api\/node\/sessions\/([^/]+)(\/hand-over|\/control)?$/.exec(path);
      if (session) {
        const [, id, tail] = session;
        if (!state.details[id]) return json({ error: "That session is not available." }, 404);
        if (!tail && method === "GET") return json({ session: state.details[id] });
        const body = request.postDataJSON();
        if (tail === "/hand-over") {
          state.calls.push({ handOver: id, nodeId: body.nodeId });
          state.details[id].nodeId = body.nodeId;
          state.sessions.find((row) => row.id === id).nodeId = body.nodeId;
          return json({ ok: true, nodeId: body.nodeId });
        }
        if (tail === "/control") {
          if (!state.details[id].nodeId) return json({ error: "None of your nodes manages this session yet. Ask a node to continue it first." }, 409);
          state.calls.push({ control: id, body });
          return json({ ok: true, jobId: "j-new" });
        }
      }
      unexpected.push(`${method} ${path}`);
      return route.fulfill({ status: 404, json: { error: `Unmocked API: ${path}` }, headers: cors });
    });
    const fits = async () => assert.equal(await page.locator("main").evaluate((el) => el.scrollWidth <= el.clientWidth + 2), true, `${width}px fits`);
    const drawerFits = async () => assert.equal(await page.getByRole("dialog").evaluate((el) => [...el.querySelectorAll("*")].every((child) => child.getBoundingClientRect().right <= window.innerWidth + 1 || getComputedStyle(child).position === "fixed")), true, `${width}px: the drawer fits`);

    // The list, newest first: what each works on, where, what it did, and who manages it.
    await page.goto(`${WEB}/sessions`);
    await page.getByRole("heading", { name: "Sessions", level: 1 }).waitFor();
    const list = page.getByRole("list", { name: "Sessions" });
    await list.getByRole("article").first().waitFor();
    assert.deepEqual(await list.getByRole("article").evaluateAll((rows) => rows.map((row) => row.querySelector("h3")?.textContent)), ["Fix the login redirect", "Update the pricing table", "Rewrite the README"]);
    const live = list.getByRole("article", { name: "Fix the login redirect" });
    assert.ok(await live.getByText("Working", { exact: true }).isVisible());
    assert.ok(await live.getByText(/^Claude Code · claude-opus-4-6 · ensemble on Development laptop · 2 runs/).isVisible());
    assert.ok(await live.getByText("Managed by").isVisible());
    assert.ok(await live.getByText("@builder", { exact: true }).isVisible());
    assert.equal(await live.getByText(/^Latest:/).count(), 0, "the first task said once");
    const hub = list.getByRole("article", { name: "Update the pricing table" });
    assert.ok(await hub.getByText("No node manages this session yet.").isVisible());
    assert.ok(await hub.getByText("Make the table scroll on phones").isVisible(), "its newest task");
    assert.ok(await hub.getByText(/Made the pricing table scroll sideways/).isVisible(), "what it did last");
    assert.ok(await hub.getByText(/^Codex · website on Laptop · 3 runs/).isVisible());
    const cli = list.getByRole("article", { name: "Rewrite the README" });
    assert.ok(await cli.getByText("@lead", { exact: true }).isVisible());
    assert.ok(await cli.getByText(/^GitHub Copilot · docs · 5 runs/).isVisible(), "no computer known: just its folder");
    await fits();
    if (shots) await page.screenshot({ path: `${shots}/sessions-${width}.png`, fullPage: true });

    // Search: by task, folder, agent or computer, after a pause in typing.
    await page.getByRole("textbox", { name: "Search sessions" }).fill("pricing");
    await page.waitForFunction(() => document.querySelectorAll('[aria-label="Sessions"] article').length === 1);
    assert.equal(state.reads.at(-1).q, "pricing");
    await page.getByRole("textbox", { name: "Search sessions" }).fill("nothing like it");
    await page.getByText("No session matches that.").waitFor();
    await page.getByRole("textbox", { name: "Search sessions" }).fill("");
    await page.waitForFunction(() => document.querySelectorAll('[aria-label="Sessions"] article').length === 3);

    // A session no node manages: read, not told anything, until it is given to a node.
    await hub.getByRole("button", { name: "Open “Update the pricing table”" }).click();
    const unmanaged = page.getByRole("dialog", { name: "Codex in website" });
    await unmanaged.getByRole("region", { name: "Recent runs" }).getByText("The build failed: a missing import.").waitFor();
    assert.ok(await unmanaged.getByText("No node manages this session yet.").isVisible());
    assert.equal(await unmanaged.getByRole("group", { name: "Tell the session" }).count(), 0, "no controls without a node");
    await page.keyboard.press("Escape");
    await unmanaged.waitFor({ state: "detached" });
    await hub.getByRole("button", { name: "Give to…" }).click();
    const give = hub.getByRole("group", { name: "Give this session to" });
    assert.equal(await give.getByRole("radio").count(), 3, "every lasting node");
    await give.getByRole("radio", { name: /Designer/ }).check();
    if (shots) await page.screenshot({ path: `${shots}/sessions-give-${width}.png` });
    await give.getByRole("button", { name: "Give it" }).click();
    await page.getByText("@designer manages this session now.").waitFor();
    assert.deepEqual(state.calls.at(-1), { handOver: IDS.hub, nodeId: "designer" });
    await hub.getByText("@designer", { exact: true }).waitFor();

    // A managed session opened: its state, who manages it, now, its queue, controls and recent runs.
    await live.getByRole("button", { name: "Open “Fix the login redirect”" }).click();
    const drawer = page.getByRole("dialog", { name: "Claude Code in ensemble" });
    const panel = drawer.getByRole("region", { name: "Agent session" });
    await panel.getByText("Now:").waitFor();
    assert.ok(await panel.getByText(/^Now: Fix the login redirect$/).isVisible());
    assert.ok(await panel.getByText("@builder", { exact: true }).isVisible());
    assert.deepEqual(await panel.getByRole("list", { name: "Queued messages" }).locator("li").evaluateAll((rows) => rows.map((row) => row.querySelector("span.truncate")?.textContent)), ["Add tests for the redirect"]);
    const runs = drawer.getByRole("region", { name: "Recent runs" });
    assert.equal(await runs.getByRole("listitem").count(), 2);
    assert.ok(await runs.getByText("Claude Code · claude-opus-4-6 · high thinking").isVisible(), "a run's settings");
    await panel.getByRole("button", { name: "Steer…" }).click();
    await panel.getByRole("textbox", { name: "Steer the run" }).fill("Keep the query string too");
    await panel.getByRole("button", { name: "Steer", exact: true }).click();
    await panel.getByText("Sent. The run goes on with your change.").waitFor();
    assert.deepEqual(state.calls.at(-1), { control: IDS.live, body: { action: "steer", prompt: "Keep the query string too" } });
    await drawerFits();
    if (shots) await page.screenshot({ path: `${shots}/session-open-${width}.png` });
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "detached" });

    // A session's card changes on the event stream: the list is read again.
    const reads = state.reads.length;
    state.sessions.find((row) => row.id === IDS.cli).status = "working";
    state.sessions.find((row) => row.id === IDS.cli).summary = "Building the docs site";
    await emit("node.message.updated", { id: "card-docs", roomId: "crew", seq: 2, kind: "run", body: "Build the docs", authorKind: "node", authorAccountId: "me", authorNodeId: "lead", data: { jobId: "j-docs", status: "running", session: { id: IDS.cli, nodeId: "lead", status: "working", queue: [] } }, private: false, mentions: [], rootMessageId: null, clientId: null, planId: null, createdAt: new Date().toISOString() });
    await cli.getByText("Building the docs site").waitFor();
    assert.ok(await cli.getByText("Working", { exact: true }).isVisible());
    assert.ok(state.reads.length > reads, "read again after the event");
    await fits();

    // A session's newest card, and each run's, open in their conversation at that message.
    const liveLink = live.getByRole("link", { name: "Open in conversation" });
    assert.equal(await liveLink.getAttribute("href"), "/r/crew#m-card-live");
    assert.equal(await cli.getByRole("link", { name: "Open in conversation" }).getAttribute("href"), "/r/dm-lead#m-card-docs");
    assert.equal(await hub.getByRole("link", { name: "Open in conversation" }).count(), 0, "a Hub session has no card in Node");
    await live.getByRole("button", { name: "Open “Fix the login redirect”" }).click();
    const recent = page.getByRole("dialog", { name: "Claude Code in ensemble" }).getByRole("region", { name: "Recent runs" });
    await recent.getByRole("listitem").first().waitFor();
    assert.equal(await recent.getByRole("link", { name: "Fix the login redirect" }).getAttribute("href"), "/r/crew#m-card-live");
    assert.equal(await recent.getByRole("link").count(), 1, "a run without a card stays plain");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
    await liveLink.click();
    await page.waitForURL(/\/r\/crew/);
    await page.locator("#m-card-live").waitFor();
    if (shots) await page.screenshot({ path: `${shots}/session-card-${width}.png` });

    assert.deepEqual(errors, [], "no page errors");
    assert.deepEqual([...new Set(unexpected)], [], "no unmocked API calls");
    await context.close();
    console.log(`sessions ok at ${width}px`);
  }
} finally {
  await browser.close();
}
