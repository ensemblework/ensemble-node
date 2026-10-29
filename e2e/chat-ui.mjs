/** Local, stateful browser fixture. Never points at a hosted account or calls a model. */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");
const WEB = process.env.NODE_WEB ?? "http://localhost:3392";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(WEB).hostname), "Use an isolated local Node server.");
const shots = process.env.NODE_CHAT_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ["--no-sandbox"] });
const stamp = value => new Date(Date.UTC(2026, 9, 26, 12, value)).toISOString();

function fixture() {
  const avatar = { shape: "orb", color: "#D7B56F", eyes: "dot" };
  const nodes = [
    { id: "scout", slug: "scout", name: "Scout", role: "Research", model: "gpt-5-mini", provider: "ensemble" },
    { id: "writer", slug: "writer", name: "Writer", role: "Writing", model: "claude-sonnet-4-6", provider: "anthropic" },
    { id: "builder", slug: "builder", name: "Builder", role: "Code", model: "grok-4.7", provider: "ensemble" },
  ].map(node => ({ ...node, ownerId: "me", avatar, status: "active", charter: "", autonomy: {}, runProfileId: null, templateId: null, createdAt: stamp(0) }));
  const person = { id: "person", kind: "person", handle: "mira", accountId: "me", name: "Mira", role: "owner", responsibility: null, me: true };
  const member = node => ({ id: node.id, kind: "node", handle: node.slug, accountId: "me", lead: true, representative: true, node });
  const room = (id, title, kind, members, at) => ({ id, title, kind, members: [person, ...members], createdBy: "me", lastSeq: 0, lastMessageAt: stamp(at), pinned: [], invites: [], leadNodeIds: [nodes[0].id], readSeq: 0, unread: 0 });
  const rooms = [
    room("dm", "Scout", "dm", [member(nodes[0])], 1),
    room("crew", "Launch crew", "crew", nodes.map(member), 3),
    room("group", "Design room", "room", [member(nodes[0]), { ...person, id: "ben", accountId: "ben", name: "Ben", handle: "ben", me: false }], 2),
    room("writer-dm", "Writer", "dm", [member(nodes[1])], 0),
  ];
  const messages = {};
  const message = (roomId, seq, body, human = false) => ({ id: `${roomId}-${seq}`, roomId, seq, body, kind: "text", authorKind: human ? "human" : "node", authorAccountId: "me", authorNodeId: human ? null : "scout", data: {}, private: false, mentions: [], rootMessageId: null, clientId: null, createdAt: stamp(1) });
  for (const row of rooms) {
    messages[row.id] = Array.from({ length: row.id === "dm" ? 40 : 3 }, (_, index) => message(row.id, index + 1, `Message ${index + 1}. ${"A thoughtful update from the project. ".repeat(7)}`, index % 2 === 0));
    if (row.id === "dm") messages.dm[39].body = [
      "## Assigned tasks",
      "| Task | Owner | Status | Due date | Conversation | Notes |",
      "| --- | :---: | --- | ---: | --- | --- |",
      "| [Draft brief](/tasks/brief) | **@writer** | Ready | Tomorrow | [Launch crew](/r/crew) | Keep the project links working |",
      "| [Review](https://example.com/review) | `team` | In progress | Friday | [Design room](/r/group) | Escaped \\| pipe |",
      "",
      "```text",
      "| Not | a table |",
      "| --- | --- |",
      "```",
    ].join("\n");
    row.lastSeq = messages[row.id].length;
    row.readSeq = row.lastSeq;
    row.last = { ...messages[row.id].at(-1), createdAt: row.lastMessageAt };
  }
  messages.crew[2] = { ...messages.crew[2], kind: "run", body: "Build the landing page", data: { jobId: "job", taskId: "task", status: "succeeded" } };
  rooms[1].unread = 2;
  rooms[1].readSeq -= 2;
  const boot = { me: { id: "me", name: "Mira Chen", email: "mira@fieldnote.example", verified: true }, nodes, rooms, computers: [], credits: null, invites: [], templates: { nodes: [], crews: [] }, limits: { roomPeople: 10, nodesPerPerson: 3, crewNodes: 24, pins: 25, reactions: ["👍", "❤️", "😂", "🎉", "👀", "✅", "🙏", "🔥"], declineBlockDays: 30 },
    models: { default: "gpt-5-mini", options: nodes.map((node, index) => ({ provider: node.provider, model: node.model, label: index === 0 ? "GPT-5 mini" : index === 1 ? "Claude Sonnet" : "Grok 4.7", default: !index, group: index === 1 ? "keys" : "included" })) } };
  return { boot, messages, message };
}

try {
  for (const width of [320, 390, 768, 1024, 1440]) {
    const state = fixture();
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 768, isMobile: width < 768, colorScheme: width === 390 ? "light" : "dark", reducedMotion: "reduce" });
    await context.addInitScript(() => {
      window.__nodeEvents = [];
      window.EventSource = class extends EventTarget {
        constructor() { super(); window.__nodeEvents.push(this); setTimeout(() => this.onopen?.(new Event("open")), 0); }
        close() { window.__nodeEvents = window.__nodeEvents.filter(item => item !== this); }
      };
    });
    const page = await context.newPage();
    const errors = [], unexpected = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const json = async data => route.fulfill({ json: data, headers: { "access-control-allow-origin": WEB, "access-control-allow-credentials": "true" } });
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": WEB, "access-control-allow-credentials": "true", "access-control-allow-methods": "GET, POST, PATCH, DELETE", "access-control-allow-headers": "content-type, accept" } });
      if (path === "/api/auth/me") return json({ user: state.boot.me });
      if (path === "/api/node/bootstrap") return json(state.boot);
      if (path === "/api/node/activity") return json({ approvals: [], runs: [], turns: [], computers: [], credits: null });
      if (path === "/api/decisions") return json({ decisions: [] });
      if (path === "/api/approvals") return json({ approvals: [] });
      if (path === "/api/devices") return json({ devices: [] });
      if (path === "/api/node/models") return json(state.boot.models);
      if (path === "/api/documents") return json({ files: [], usage: { maxFileBytes: 25000000 } });
      if (path === "/api/agent/jobs/job") return json({ job: { id: "job", taskId: "task", title: "Build the landing page", kind: "code", status: "succeeded", provider: "copilot-cli", model: "gpt-6.1-sol", modelUsed: null, reasoningEffort: "high", progress: null, summary: "Updated the landing page.", error: null, turns: 1, toolCalls: 2, runId: null, deviceName: "Development laptop", yours: true, folder: "website", branch: "feature/landing", files: [], createdAt: stamp(1), startedAt: stamp(1), finishedAt: stamp(2) }, events: [] });
      if (path.endsWith("/memory")) return json({ memories: [] });
      if (path === "/api/node/routines") return json({ routines: [] });
      const node = /^\/api\/node\/nodes\/([^/]+)$/.exec(path);
      if (node && request.method() === "PATCH") {
        const saved = state.boot.nodes.find(row => row.id === node[1]);
        Object.assign(saved, request.postDataJSON());
        return json({ node: saved });
      }
      const read = /^\/api\/node\/rooms\/([^/]+)\/read$/.exec(path);
      if (read) {
        const room = state.boot.rooms.find(room => room.id === read[1]);
        assert.ok(request.postDataJSON().seq <= room.lastSeq, "a failed/local message cannot advance a server read marker");
        room.readSeq = Math.max(room.readSeq, request.postDataJSON().seq);
        room.unread = Math.max(0, room.lastSeq - room.readSeq);
        return json({});
      }
      const messages = /^\/api\/node\/rooms\/([^/]+)\/messages$/.exec(path);
      if (messages) {
        const id = messages[1];
        if (request.method() === "GET") return json({ messages: state.messages[id] });
        const body = request.postDataJSON();
        if (body.body === "Please fail this send") return route.fulfill({ status: 503, json: { error: "Fixture refused the send" }, headers: { "access-control-allow-origin": WEB, "access-control-allow-credentials": "true" } });
        await new Promise(resolve => setTimeout(resolve, 180));
        const row = state.boot.rooms.find(room => room.id === id);
        const sent = { ...state.message(id, ++row.lastSeq, body.body, true), private: body.private, clientId: body.clientId, createdAt: stamp(10) };
        state.messages[id].push(sent); row.last = sent; row.lastMessageAt = sent.createdAt;
        return json({ message: sent });
      }
      unexpected.push(path);
      return route.fulfill({ status: 404, json: { error: `Unmocked API: ${path}` } });
    });
    const emit = async (type, data) => page.evaluate(({ type, data }) => { for (const source of window.__nodeEvents) source.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) })); }, { type, data });
    const chats = () => width < 768 ? page.getByRole("dialog", { name: "Chats", exact: true }) : page.getByRole("complementary", { name: "Chat sidebar", exact: true });
    const openChats = async () => { if (width < 768) await page.getByRole("button", { name: "Open conversations", exact: true }).click(); };
    const closeChats = async () => { if (width < 768) await chats().getByRole("button", { name: "Close", exact: true }).click(); };
    const fits = async () => assert.equal(await page.locator("main").evaluate(el => el.scrollWidth <= el.clientWidth + 2), true, `${width}px fits`);

    await page.goto(`${WEB}/r/dm`);
    await page.getByRole("textbox", { name: "Message Scout", exact: true }).waitFor();
    const table = page.locator("#m-dm-40").getByRole("table");
    await table.waitFor();
    assert.deepEqual(await table.getByRole("columnheader").allTextContents(), ["Task", "Owner", "Status", "Due date", "Conversation", "Notes"]);
    assert.equal(await table.getByRole("row").count(), 3);
    assert.equal(await table.getByRole("cell").count(), 12);
    assert.ok((await table.getByRole("link", { name: "Draft brief", exact: true }).getAttribute("href")).endsWith("/tasks/brief"));
    assert.equal(await table.getByRole("link", { name: "Review", exact: true }).getAttribute("rel"), "noopener noreferrer");
    assert.equal(await table.getByRole("link", { name: "Launch crew", exact: true }).getAttribute("href"), "/r/crew");
    assert.equal(await table.getByRole("cell", { name: "Escaped | pipe", exact: true }).count(), 1);
    assert.equal(await table.locator("strong").textContent(), "@writer");
    assert.equal(await table.locator("code").textContent(), "team");
    assert.equal(await table.getByRole("columnheader", { name: "Owner", exact: true }).evaluate(el => getComputedStyle(el).textAlign), "center");
    assert.equal(await table.getByRole("cell", { name: "Tomorrow", exact: true }).evaluate(el => getComputedStyle(el).textAlign), "right");
    assert.equal(await page.locator("#m-dm-40 pre code").textContent(), "| Not | a table |\n| --- | --- |");
    const tableRegion = page.locator("#m-dm-40").getByRole("region", { name: "Table", exact: true });
    assert.ok(await tableRegion.evaluate(el => el.scrollWidth > el.clientWidth + 2), "wide tables scroll inside their message");
    await tableRegion.focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => document.querySelector('#m-dm-40 [role="region"]').scrollLeft > 0);
    await fits();
    if (shots) await page.screenshot({ path: `${shots}/markdown-${width}.png` });
    await openChats();
    assert.deepEqual(await chats().locator("[data-conversation]").evaluateAll(els => els.map(el => el.dataset.conversation)), ["crew", "group", "dm", "writer-dm"]);
    await chats().getByRole("button", { name: "Groups", exact: true }).click();
    assert.equal(await chats().locator("[data-conversation]").count(), 2);
    await chats().getByRole("button", { name: "All", exact: true }).click();
    await closeChats();
    assert.ok(await page.locator("header svg[data-node-avatar] .node-eyes").count(), "original Node signature in the chat header");
    assert.equal(await page.locator("[data-node-avatar] [data-model-brand]").count(), 0, "provider marks do not replace Node identities");
    assert.ok(await page.locator(".chat-timeline svg[data-node-avatar] .node-eyes").count(), "messages retain Node signatures too");
    const timeline = page.locator(".chat-timeline");
    await timeline.evaluate(el => { el.scrollTop = 0; });
    await page.waitForTimeout(80);
    const row = state.boot.rooms.find(room => room.id === "dm");
    const incoming = { ...state.message("dm", ++row.lastSeq, "A new reply while you read earlier messages."), createdAt: stamp(5) };
    state.messages.dm.push(incoming); row.last = incoming; row.lastMessageAt = incoming.createdAt; row.unread++;
    await emit("node.message", incoming);
    await page.locator(`#m-${incoming.id}`).waitFor();
    assert.ok(await timeline.evaluate(el => el.scrollTop < 50), "new reply does not pull a reader to the bottom");
    await page.getByRole("button", { name: /Jump to the latest/ }).click();
    await page.waitForFunction(() => { const el = document.querySelector(".chat-timeline"); return el.scrollHeight - el.clientHeight - el.scrollTop < 8; });
    await emit("node.status", { roomId: "dm", nodeId: "scout", state: "thinking" });
    await emit("node.frame", { roomId: "dm", nodeId: "scout", frame: { type: "delta", text: "A streamed reply. ".repeat(60) } });
    await page.waitForTimeout(100);
    assert.ok(await timeline.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop < 8), "streaming stays anchored when already at the bottom");
    await emit("node.status", { roomId: "dm", nodeId: "scout", state: "idle" });
    await page.getByRole("textbox", { name: "Message Scout", exact: true }).fill("A message from the composer");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await timeline.getByText("A message from the composer", { exact: true }).waitFor();
    await page.waitForTimeout(400);
    assert.equal(await page.locator(".chat-timeline").getByText("A message from the composer", { exact: true }).count(), 1, "pending confirmation does not duplicate the bubble");
    await page.getByRole("textbox", { name: "Message Scout", exact: true }).fill("Please fail this send");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await timeline.getByText("Not sent: Fixture refused the send", { exact: true }).waitFor();
    await timeline.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("textbox", { name: "Message Scout", exact: true }).fill("Recovered after a refused send");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await timeline.getByText("Recovered after a refused send", { exact: true }).waitFor();

    await openChats();
    await chats().locator('[data-conversation="crew"]').click();
    await page.getByRole("heading", { name: "Launch crew", exact: true }).waitFor();
    await page.locator('.chat-timeline [data-model-brand="copilot"]').waitFor();
    await page.getByRole("button", { name: "Launch crew", exact: true }).click();
    await page.getByRole("dialog", { name: "Crew settings", exact: true }).waitFor();
    await page.getByRole("dialog", { name: "Crew settings", exact: true }).getByRole("button", { name: "Close", exact: true }).last().click();
    await openChats();
    await chats().locator('[data-conversation="group"]').click();
    const groupText = page.getByRole("textbox", { name: "Message Design room", exact: true });
    await groupText.waitFor();
    await page.getByRole("button", { name: "Only me", exact: true }).click();
    await groupText.fill("A private unsent draft");
    await openChats();
    await chats().locator('[data-conversation="dm"]').click();
    await page.getByRole("textbox", { name: "Message Scout", exact: true }).waitFor();
    assert.equal(await page.locator("header").getByRole("button", { name: /^Scout's model:/ }).count(), 0, "a DM header shows no model");
    await page.getByRole("button", { name: "Scout", exact: true }).click();
    const details = page.getByRole("dialog", { name: "Node settings", exact: true });
    await details.getByRole("button", { name: /^Chat model:/ }).click();
    await page.getByRole("listbox", { name: "Chat model", exact: true }).waitFor();
    assert.ok(await page.getByRole("listbox").locator('[data-model-brand="claude"]').count(), "the picker uses real model marks too");
    await page.keyboard.press("Escape");
    assert.equal(await details.isVisible(), true, "Escape closes the picker before the drawer");
    await details.getByRole("button", { name: "Close", exact: true }).click();
    state.boot.rooms.find(room => room.id === "group").members = state.boot.rooms.find(room => room.id === "group").members.filter(member => member.accountId !== "ben");
    await emit("node.room", { roomId: "group" });
    await openChats();
    await chats().locator('[data-conversation="group"]').click();
    await page.locator("header").getByRole("button", { name: "1 person · 1 node", exact: true }).waitFor();
    assert.equal(await groupText.inputValue(), "A private unsent draft");
    assert.equal(await page.getByRole("button", { name: "Only me", exact: true }).getAttribute("aria-pressed"), "true", "restored draft cannot become public");
    await fits();
    if (shots) await page.screenshot({ path: `${shots}/chat-${width}.png` });

    if (width >= 768) {
      await page.getByRole("button", { name: "Collapse conversations", exact: true }).click();
      await page.reload();
      await page.locator('[data-sidebar-collapsed="true"]').waitFor();
      await page.getByRole("button", { name: "Expand conversations", exact: true }).click();
    } else {
      await page.setViewportSize({ width, height: 420 });
      await page.waitForFunction(() => document.querySelector('textarea[aria-label="Message Design room"]').getBoundingClientRect().bottom <= innerHeight);
      assert.ok((await groupText.boundingBox()).y + (await groupText.boundingBox()).height <= 420, "composer remains above keyboard-sized viewport");
      await openChats();
      assert.ok(await chats().locator(".chat-drawer").evaluate(el => el.scrollWidth <= el.clientWidth + 2), "short phone chat sheet stays in bounds");
      await page.setViewportSize({ width: 768, height: 844 });
      await page.getByRole("dialog", { name: "Chats", exact: true }).waitFor({ state: "hidden" });
      await page.setViewportSize({ width, height: 844 });
    }
    await page.goto(`${WEB}/n/scout`);
    const settings = page.getByRole("dialog", { name: "Node settings", exact: true });
    const appearance = settings.getByRole("group", { name: "Appearance", exact: true });
    await appearance.getByRole("button", { name: "hex", exact: true }).click();
    await appearance.getByRole("button", { name: "line eyes", exact: true }).click();
    await appearance.getByRole("button", { name: "#B39DDB", exact: true }).click();
    const preview = settings.locator("svg[data-node-avatar]").first();
    assert.equal(await preview.locator(".node-eyes rect").count(), 2);
    assert.equal(await preview.locator("stop").nth(1).getAttribute("stop-color"), "#B39DDB");
    await settings.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("Saved.", { exact: true }).waitFor();
    assert.deepEqual(state.boot.nodes[0].avatar, { shape: "hex", eyes: "line", color: "#B39DDB" });
    await page.reload();
    await page.getByRole("button", { name: "Scout's settings", exact: true }).click();
    await appearance.waitFor();
    assert.equal(await appearance.getByRole("button", { name: "hex", exact: true }).getAttribute("aria-pressed"), "true");
    assert.equal(await appearance.getByRole("button", { name: "line eyes", exact: true }).getAttribute("aria-pressed"), "true");
    await fits();
    assert.deepEqual(errors, [], "no client errors");
    assert.deepEqual(unexpected, [], "only the intended API reads/writes");
    console.log(`Node chat UX: ${width}px passed`);
    await context.close();
  }
} finally { await browser.close(); }
