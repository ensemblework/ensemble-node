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
const widths = process.env.NODE_CHAT_WIDTHS?.split(",").map(Number) ?? [320, 375, 768, 1024, 1440];
assert.ok(widths.length && widths.every(width => [320, 375, 768, 1024, 1440].includes(width)), "NODE_CHAT_WIDTHS selects supported fixture widths.");

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
    models: { default: "gpt-5-mini", options: [...nodes.map((node, index) => ({ provider: node.provider, model: node.model, label: index === 0 ? "GPT-5 mini" : index === 1 ? "Claude Sonnet" : "Grok 4.7", default: !index, group: index === 1 ? "keys" : "included" })), ...Array.from({ length: 6 }, (_, index) => ({ provider: "ensemble", model: `gpt-fixture-${index}`, label: `Fixture model ${index}`, group: "included" }))] } };
  return { boot, messages, message };
}

try {
  for (const width of widths) {
    const state = fixture();
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 768, isMobile: width < 768, colorScheme: width === 375 ? "light" : "dark", reducedMotion: width === 1440 ? "no-preference" : "reduce" });
    await context.addInitScript(() => {
      window.__nodeEvents = [];
      window.EventSource = class extends EventTarget {
        constructor() { super(); window.__nodeEvents.push(this); setTimeout(() => this.onopen?.(new Event("open")), 0); }
        close() { window.__nodeEvents = window.__nodeEvents.filter(item => item !== this); }
      };
    });
    const page = await context.newPage();
    const errors = [], unexpected = [], writes = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (!["GET", "OPTIONS"].includes(request.method()) && !path.endsWith("/read")) writes.push(path);
      const json = async data => route.fulfill({ json: data, headers: { "access-control-allow-origin": WEB, "access-control-allow-credentials": "true" } });
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": WEB, "access-control-allow-credentials": "true", "access-control-allow-methods": "GET, POST, PATCH, DELETE", "access-control-allow-headers": "content-type, accept" } });
      if (path === "/api/auth/me") return json({ user: state.boot.me });
      if (path === "/api/node/bootstrap") return json(state.boot);
      if (path === "/api/node/evidence") return json({ evidence: [] });
      if (path === "/api/node/activity") return json({ approvals: [], runs: [], turns: [], computers: [], credits: null });
      if (path === "/api/decisions") return json({ decisions: [] });
      if (path === "/api/approvals") return json({ approvals: [] });
      if (path === "/api/devices") return json({ devices: [] });
      if (path === "/api/node/models") return json(state.boot.models);
      if (path === "/api/connectors/catalog") return json({ entries: [] });
      if (path === "/api/mcp-connections") return json({ connections: [] });
      // The owner's own Ensemble settings: the run profile a node's sessions use, and Node's browsing rule.
      if (path === "/api/settings") return json({ settings: { runProfiles: [], defaultRunProfileId: null, node: { askBeforeBrowsing: false } }, connectors: [] });
      if (path === "/api/documents") return json({ files: [], usage: { maxFileBytes: 25000000 } });
      if (path === "/api/agent/jobs/job") return json({ job: { id: "job", taskId: "task", title: "Build the landing page", kind: "code", status: "succeeded", provider: "copilot-cli", model: "gpt-6.1-sol", modelUsed: null, reasoningEffort: "high", progress: null, summary: "Updated the landing page.", error: null, turns: 1, toolCalls: 2, runId: null, deviceName: "Development laptop", yours: true, folder: "website", branch: "feature/landing", files: [], createdAt: stamp(1), startedAt: stamp(1), finishedAt: stamp(2) }, events: [] });
      if (path.endsWith("/memory")) return json({ memories: [] });
      if (path === "/api/node/routines") return json({ routines: [] });
      if (/^\/api\/node\/rooms\/[^/]+\/requests$/.test(path)) return json({ requests: [] });
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
    const searchFocus = async input => {
      const field = input.locator("xpath=ancestor-or-self::*[contains(concat(' ',normalize-space(@class),' '),' search-field ')][1]");
      await input.focus();
      await page.waitForTimeout(180);
      assert.equal(await input.evaluate(el => getComputedStyle(el).outlineStyle), "none", "search has no inner focus outline");
      assert.notEqual(await field.evaluate(el => getComputedStyle(el).borderColor), await page.evaluate(() => `rgb(${getComputedStyle(document.documentElement).getPropertyValue("--line").trim().split(/\s+/).join(", ")})`), "the outer search boundary carries focus");
    };

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
    await searchFocus(chats().getByRole("textbox", { name: "Filter conversations", exact: true }));
    assert.equal(await page.getByRole("complementary", { name: "Activity", exact: true }).count(), 0, "no right activity sidebar");
    assert.deepEqual(await chats().locator("[data-conversation]").evaluateAll(els => els.map(el => el.dataset.conversation)), ["crew", "group", "dm", "writer-dm"]);
    assert.equal(await chats().locator('[data-conversation="dm"]').evaluate(el => getComputedStyle(el, "::before").content), "none", "selected chats have no accent stripe");
    await chats().locator('[data-conversation="writer-dm"] svg[data-resting="true"]').waitFor();
    assert.ok(await chats().locator(".node-eyes").evaluateAll(eyes => eyes.every(eye => getComputedStyle(eye).animationName === "none")), "idle lists do not blink in unison");
    await chats().getByRole("button", { name: "Groups", exact: true }).click();
    assert.equal(await chats().locator("[data-conversation]").count(), 2);
    await chats().getByRole("button", { name: "All", exact: true }).click();
    await closeChats();
    await page.keyboard.press("Control+k");
    await searchFocus(page.getByRole("dialog", { name: "Search", exact: true }).getByRole("textbox", { name: "Search every conversation", exact: true }));
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Search this conversation", exact: true }).click();
    await searchFocus(page.getByRole("textbox", { name: "Search this conversation", exact: true }));
    await page.getByRole("button", { name: "Close search", exact: true }).click();
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
    assert.ok(await page.locator("header .room-avatar").count(), "a crew has a graph avatar");
    const crewDraft = page.getByRole("textbox", { name: "Message your crew", exact: true });
    const tagged = "@scout please ask @writer, not @unknown.\nKeep this draft exactly as typed.";
    await crewDraft.fill(tagged);
    assert.deepEqual(await page.locator(".mention-mirror [data-mention]").allTextContents(), ["@scout", "@writer"]);
    assert.equal(await crewDraft.inputValue(), tagged);
    assert.equal(await crewDraft.evaluate(el => el.selectionEnd), tagged.length, "native text selection is preserved");
    await crewDraft.fill("Ask @wri");
    await page.keyboard.press("Enter");
    assert.equal(await crewDraft.inputValue(), "Ask @writer ");
    assert.equal(await page.locator('.mention-mirror [data-mention="writer"]').textContent(), "@writer");
    if (shots) await page.screenshot({ path: `${shots}/mentions-${width}.png` });
    await crewDraft.fill("");
    if (width === 1440) {
      await emit("node.status", { roomId: "crew", nodeId: "scout", state: "thinking" });
      await emit("node.status", { roomId: "crew", nodeId: "builder", state: "thinking" });
      await page.locator('header .room-avatar[aria-label*="Scout working"]').waitFor();
      const builder = page.locator('header [data-graph-node="builder"]');
      const sameBuilder = await builder.elementHandle();
      const before = await builder.evaluate(el => getComputedStyle(el).transform);
      await page.locator('header .room-avatar[aria-label*="Builder working"]').waitFor({ timeout: 10000 });
      await page.waitForTimeout(150);
      const during = await builder.evaluate(el => getComputedStyle(el).transform);
      await page.waitForTimeout(600);
      const after = await builder.evaluate(el => getComputedStyle(el).transform);
      assert.ok(await sameBuilder.evaluate(el => el.isConnected), "handoffs keep the same keyed node portrait mounted");
      assert.ok(before !== during && during !== after, "the working node moves smoothly into focus instead of being replaced");
      await page.getByRole("button", { name: "Launch crew settings", exact: true }).focus();
      const focused = await page.locator("header .room-avatar").getAttribute("aria-label");
      await page.waitForTimeout(7300);
      assert.equal(await page.locator("header .room-avatar").getAttribute("aria-label"), focused, "graph rotation pauses on keyboard focus");
      await emit("node.status", { roomId: "crew", nodeId: "scout", state: "idle" });
      await emit("node.status", { roomId: "crew", nodeId: "builder", state: "idle" });
    }
    await page.getByRole("button", { name: "Launch crew", exact: true }).click();
    await page.getByRole("dialog", { name: "Crew settings", exact: true }).waitFor();
    await page.getByRole("dialog", { name: "Crew settings", exact: true }).getByRole("button", { name: "Close", exact: true }).last().click();
    await openChats();
    await chats().locator('[data-conversation="group"]').click();
    const groupText = page.getByRole("textbox", { name: "Message Design room", exact: true });
    await groupText.waitFor();
    // A room with other people: Ask my nodes keeps it to me and my nodes.
    await page.getByRole("radio", { name: "Ask my nodes", exact: true }).click();
    const privateText = page.getByRole("textbox", { name: "Ask your nodes privately", exact: true });
    await privateText.fill("A private unsent draft");
    await openChats();
    await chats().locator('[data-conversation="dm"]').click();
    await page.getByRole("textbox", { name: "Message Scout", exact: true }).waitFor();
    assert.equal(await page.locator("header").getByRole("button", { name: /^Scout's model:/ }).count(), 0, "a DM header shows no model");
    await page.getByRole("button", { name: "Scout", exact: true }).click();
    const details = page.getByRole("dialog", { name: "Node settings", exact: true });
    await details.getByRole("button", { name: /^Chat model:/ }).click();
    await page.getByRole("listbox", { name: "Chat model", exact: true }).waitFor();
    await searchFocus(page.getByRole("textbox", { name: "Find a model", exact: true }));
    assert.ok(await page.getByRole("listbox").locator('[data-model-brand="claude"]').count(), "the picker uses real model marks too");
    await page.keyboard.press("Escape");
    assert.equal(await details.isVisible(), true, "Escape closes the picker before the drawer");
    await details.getByRole("button", { name: "Close", exact: true }).click();
    state.boot.rooms.find(room => room.id === "group").members = state.boot.rooms.find(room => room.id === "group").members.filter(member => member.accountId !== "ben");
    await emit("node.room", { roomId: "group" });
    await openChats();
    await chats().locator('[data-conversation="group"]').click();
    await page.locator("header").getByRole("button", { name: "1 person · 1 node", exact: true }).waitFor();
    assert.equal(await privateText.inputValue(), "A private unsent draft");
    assert.equal(await page.getByRole("radio", { name: "Ask my nodes", exact: true }).getAttribute("aria-checked"), "true", "restored draft cannot become public");
    await fits();
    if (shots) await page.screenshot({ path: `${shots}/chat-${width}.png` });

    if (width >= 768) {
      const separator = page.getByRole("separator", { name: "Conversation sidebar width", exact: true });
      await separator.focus();
      await page.keyboard.press("Home");
      assert.equal(await separator.getAttribute("aria-valuenow"), "248");
      await page.keyboard.press("ArrowRight");
      assert.equal(await separator.getAttribute("aria-valuenow"), "264");
      await page.reload();
      assert.equal(await separator.getAttribute("aria-valuenow"), "264", "keyboard-resized width persists");
      if (width === 1440) {
        const box = await separator.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + 200);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 96, box.y + 200, { steps: 8 });
        await page.mouse.up();
        assert.equal(await separator.getAttribute("aria-valuenow"), "360", "dragging persists once the pointer is released");
      }
      await page.getByRole("button", { name: "Collapse conversations", exact: true }).click();
      await page.reload();
      await page.locator('[data-sidebar-collapsed="true"]').waitFor();
      await page.getByRole("button", { name: "Expand conversations", exact: true }).click();
    } else {
      await page.setViewportSize({ width, height: 420 });
      await page.waitForFunction(() => document.querySelector('textarea[aria-label="Ask your nodes privately"]').getBoundingClientRect().bottom <= innerHeight);
      assert.ok((await privateText.boundingBox()).y + (await privateText.boundingBox()).height <= 420, "composer remains above keyboard-sized viewport");
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
    await appearance.getByRole("button", { name: "Lavender", exact: true }).click();
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
    if (width === 1440) {
      const hello = settings.getByRole("button", { name: "Say hello to Scout", exact: true });
      await hello.click();
      await page.waitForTimeout(80);
      assert.notEqual(await hello.locator(".node-body").evaluate(el => getComputedStyle(el).transform), "none", "a click gets a small response");
      const box = await hello.boundingBox();
      await page.mouse.move(box.x + box.width - 8, box.y + box.height / 2 + 4);
      await page.waitForTimeout(400);
      const gaze = await hello.locator(".node-gaze").evaluate(el => getComputedStyle(el).transform);
      assert.ok(gaze !== "none" && gaze !== "matrix(1, 0, 0, 1, 0, 0)", "only the open profile follows the nearby pointer");
      await page.mouse.move(10, 10);
    }
    await settings.getByRole("button", { name: "Close", exact: true }).click();
    if (width === 1440) {
      await page.goto(`${WEB}/r/dm`);
      await page.getByRole("textbox", { name: "Message Scout", exact: true }).waitFor();
      const headerAvatar = page.locator("header [data-node-avatar]");
      const actor = page.locator("#m-dm-40 .node-companion-message");
      const noCosmeticWrites = writes.length;
      let clicks = 0;
      for (const shape of ["orb", "square", "spark", "hex", "leaf", "compass"]) {
        state.boot.nodes[0].avatar = { shape, color: "#B39DDB", eyes: "dot" };
        await emit("node.room", { roomId: "dm" });
        await page.waitForFunction(shape => document.querySelector("header [data-node-avatar]")?.dataset.nodeShape === shape, shape);
        await emit("node.status", { roomId: "dm", nodeId: "scout", state: "thinking" });
        await page.waitForFunction(() => document.querySelector("header [data-node-avatar]")?.dataset.motionActive === "true");
        const form = headerAvatar.locator(".node-form");
        assert.equal(await form.evaluate(el => getComputedStyle(el).animationName), `node-${shape}-work`);
        const start = await form.evaluate(el => getComputedStyle(el).transform);
        await page.waitForTimeout(220);
        assert.notEqual(await form.evaluate(el => getComputedStyle(el).transform), start, `${shape} has visible working movement`);
        if (shots) await page.screenshot({ path: `${shots}/working-${shape}.png` });
        const outline = actor.locator(".node-silhouette");
        while (clicks % 4) { await actor.click(); clicks++; }
        const original = await outline.getAttribute("d");
        await actor.click(); clicks++;
        await page.waitForTimeout(220);
        assert.notEqual(await outline.getAttribute("d"), original, `${shape} morphs when pressed`);
        assert.ok(Number(await actor.locator(".node-happy-eyes").evaluate(el => getComputedStyle(el).opacity)) > .5, "a press shows happy eyes");
        if (shots) await page.screenshot({ path: `${shots}/happy-${shape}.png` });
        await page.waitForTimeout(1100);
        assert.equal(await outline.getAttribute("d"), original, "the outline returns to its saved shape");
        await emit("node.status", { roomId: "dm", nodeId: "scout", state: "idle" });
      }
      assert.equal(writes.length, noCosmeticWrites, "working and click expressions never call a mutation");
      await actor.click(); clicks++;
      assert.equal(await actor.getAttribute("data-expression"), "twinkle");
      await actor.click(); clicks++;
      assert.equal(await actor.getAttribute("data-expression"), "wink");
      await actor.click(); clicks++;
      assert.equal(await actor.getAttribute("data-expression"), "double-blink");
      await page.waitForTimeout(1200);
      await page.getByRole("button", { name: "Scout", exact: true }).click();
      const thinking = settings.getByRole("radiogroup", { name: "Thinking", exact: true });
      await thinking.getByRole("radio", { name: "Medium", exact: true }).click();
      const note = page.locator(".node-toast").filter({ hasText: "Thinking saved." });
      await note.waitFor();
      await page.waitForTimeout(650);
      await note.hover();
      await note.locator(".toast-drain").evaluate(el => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const bar = await note.locator(".toast-drain").evaluate(el => getComputedStyle(el).transform);
      await page.waitForTimeout(3300);
      assert.ok(await note.isVisible(), "hover pauses the three-second notification timer");
      assert.equal(await note.locator(".toast-drain").evaluate(el => getComputedStyle(el).transform), bar, "the countdown bar pauses with its timer");
      if (shots) await page.screenshot({ path: `${shots}/notification-paused.png` });
      await page.mouse.move(10, 10);
      await note.waitFor({ state: "detached", timeout: 3300 });
      await thinking.getByRole("radio", { name: "High", exact: true }).click();
      await note.waitFor();
      await note.getByRole("button", { name: "Pause notification timer", exact: true }).click();
      await page.mouse.move(10, 10);
      await page.waitForTimeout(3300);
      assert.ok(await note.isVisible(), "the explicit pause button keeps the notification");
      await note.getByRole("button", { name: "Resume notification timer", exact: true }).click();
      await page.mouse.move(10, 10);
      await note.waitFor({ state: "detached", timeout: 3300 });
      await settings.getByRole("button", { name: "Close", exact: true }).click();
    }
    await openChats();
    assert.equal(await chats().getByRole("link", { name: "Routines", exact: true }).count(), 0, "workspace links stay out of the chat list");
    await chats().getByRole("button", { name: "Workspace menu", exact: true }).click();
    assert.equal(await chats().getByRole("combobox", { name: "Sidebar width", exact: true }).count(), 0, "resizing has no menu setting");
    await chats().getByRole("link", { name: "Appearance", exact: true }).click();
    const preferences = page.getByRole("region", { name: "Appearance", exact: true });
    await preferences.waitFor();
    const beforeAppearance = writes.length;
    await preferences.getByRole("button", { name: "Light", exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
    await preferences.getByRole("button", { name: "Graphite", exact: true }).click();
    await preferences.getByRole("button", { name: "Tide", exact: true }).click();
    await preferences.getByRole("button", { name: "Constellation", exact: true }).click();
    await preferences.getByRole("switch", { name: "Quiet mode", exact: true }).click();
    if (shots) await page.screenshot({ path: `${shots}/appearance-${width}.png` });
    await page.reload();
    await preferences.waitFor();
    assert.deepEqual(await page.evaluate(() => {
      const { mode, theme, palette, accent, doodle, motion } = document.documentElement.dataset;
      return { mode, theme, palette, accent, doodle, motion };
    }), { mode: "light", theme: "light", palette: "graphite", accent: "tide", doodle: "constellation", motion: "off" });
    await preferences.getByRole("button", { name: "Dark", exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
    if (width === 1440) {
      const otherTab = await context.newPage();
      await otherTab.goto(`${WEB}/health`);
      await otherTab.evaluate(() => {
        const key = "node.appearance.v1";
        const saved = JSON.parse(localStorage.getItem(key));
        localStorage.setItem(key, JSON.stringify({ ...saved, mode: "light" }));
      });
      await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
      await otherTab.close();
      await preferences.getByRole("button", { name: "System", exact: true }).click();
      await page.emulateMedia({ colorScheme: "light" });
      await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
      await page.emulateMedia({ colorScheme: "dark" });
      await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
    }
    await fits();
    assert.equal(writes.length, beforeAppearance, "appearance does not write to the API");
    await page.goto(`${WEB}/r/dm`);
    await page.getByRole("textbox", { name: "Message Scout", exact: true }).waitFor();
    assert.ok((await page.locator(".chat-wallpaper").evaluate(el => getComputedStyle(el, "::before").maskImage)).includes("constellation.svg"), "the chosen doodle paints the conversation");
    assert.equal(await page.locator("header .node-work").evaluate(el => getComputedStyle(el).animationName), "none", "quiet mode keeps expressions still");
    await page.getByRole("textbox", { name: "Message Scout", exact: true }).fill("A quiet draft");
    assert.equal(await page.getByRole("textbox", { name: "Message Scout", exact: true }).evaluate(el => getComputedStyle(el).outlineStyle), "none", "the composer owns the focus outline, not an inner square");
    assert.equal(await page.locator(".chat-composer").evaluate(el => getComputedStyle(el).outlineStyle), "solid", "keyboard focus stays clearly visible on the rounded composer");
    assert.equal(await page.locator("header .node-attention").evaluate(el => getComputedStyle(el).transform), "none", "quiet mode also disables typing reactions");
    await emit("node.status", { roomId: "dm", nodeId: "scout", state: "thinking" });
    await page.waitForTimeout(100);
    assert.equal(await page.locator("header .node-form").evaluate(el => getComputedStyle(el).animationName), "none", "quiet mode does not animate working nodes");
    await emit("node.status", { roomId: "dm", nodeId: "scout", state: "idle" });
    if (shots) await page.screenshot({ path: `${shots}/quiet-chat-${width}.png` });
    await fits();
    await page.goto(`${WEB}/connections`);
    await searchFocus(page.getByRole("textbox", { name: "Find an app", exact: true }));
    assert.deepEqual(errors, [], "no client errors");
    assert.deepEqual(unexpected, [], "only the intended API reads/writes");
    console.log(`Node chat UX: ${width}px passed`);
    await context.close();
  }
} finally { await browser.close(); }
