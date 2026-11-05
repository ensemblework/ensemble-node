/** Local session inventory fixture. Never uses a hosted account, model or computer. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");
const WEB = process.env.NODE_WEB ?? "http://localhost:3392";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(WEB).hostname));
const shots = process.env.NODE_CHAT_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ["--no-sandbox"] });
const at = minutes => new Date(Date.now() - minutes * 60000).toISOString();
const hash = text => createHash("sha1").update(text).digest("hex");
function fixture() {
  const node = { id: "builder", ownerId: "me", slug: "builder", name: "Builder", role: "engineer", avatar: { shape: "pebble", color: "#7FB3D5", eyes: "dot" }, status: "active", charter: "", autonomy: {}, createdAt: at(9000) };
  const person = { id: "person", kind: "person", accountId: "me", handle: "mira", name: "Mira", role: "owner", me: true };
  const room = { id: "crew", kind: "crew", title: "Release crew", members: [person, { id: "member", kind: "node", accountId: "me", handle: "builder", lead: true, representative: true, node }], createdBy: "me", lastSeq: 0, readSeq: 0, unread: 0, lastMessageAt: at(4), pinned: [], invites: [], leadNodeIds: [node.id], last: null };
  const entry = (path, deleted = false) => ({ source: { kind: "job", id: "exact-last-job", path }, deviceId: "device", deviceName: "Development laptop", folder: "workspace", sessionId: "live", deleted, updatedAt: at(1) });
  const sessions = [
    { id: "live", nodeId: node.id, card: { messageId: "run-card", roomId: room.id }, status: "working", agent: "copilot-cli", agentName: "GitHub Copilot", model: "gpt-6.1-sol", computer: "Development laptop", folder: "workspace", title: "Fix the login redirect", latestTask: "Don't show this task description", summary: "Don't show this work summary", runs: 2, lastActiveAt: at(1), usedBy: [{ node, room: { id: room.id, title: room.title, kind: room.kind } }], files: [entry("src/auth.ts"), entry("README.md"), entry("tests/auth.test.ts"), entry("old.txt", true)] },
    { id: "hub", nodeId: null, card: null, status: "idle", agent: "codex", agentName: "Codex", model: null, computer: "Laptop", folder: "website", title: "Update the pricing table", latestTask: "Hidden latest task", summary: "Hidden summary needle", runs: 3, lastActiveAt: at(30), usedBy: [], files: [] },
    { id: "dm", nodeId: node.id, card: null, status: "idle", agent: "claude-code", agentName: "Claude Code", model: "opus", computer: null, folder: "docs", title: "Rewrite the README", latestTask: "", summary: "", runs: 5, lastActiveAt: at(4 * 1440), usedBy: [{ node, room: null }], files: [] },
  ];
  return { boot: { me: { id: "me", name: "Mira", email: "mira@example.test", verified: true }, nodes: [node], rooms: [room], computers: [], credits: null, invites: [], templates: { nodes: [], crews: [] }, limits: { roomPeople: 10, nodesPerPerson: 3, crewNodes: 24, pins: 25, reactions: ["👍"], declineBlockDays: 30 }, models: { options: [] } }, sessions, reads: [], opened: [], content: "export const answer = 41;\n", deleteCalls: 0, deleteFails: true };
}
try {
  for (const width of [375, 1440]) {
    const state = fixture();
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "dark", reducedMotion: "reduce" });
    await context.addInitScript(() => { window.__events = []; window.EventSource = class extends EventTarget { constructor() { super(); window.__events.push(this); } close() {} }; });
    const page = await context.newPage();
    const errors = [], unexpected = [];
    page.on("pageerror", error => errors.push(error.message));
    const cors = { "access-control-allow-origin": WEB, "access-control-allow-credentials": "true" };
    await context.route("**/api/**", async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname;
      const json = (data, status = 200) => route.fulfill({ json: data, status, headers: cors });
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-methods": "GET,POST,PUT", "access-control-allow-headers": "content-type,accept" } });
      if (path === "/api/auth/me") return json({ user: state.boot.me });
      if (path === "/api/node/bootstrap") return json(state.boot);
      if (path === "/api/node/activity") return json({ approvals: [], runs: [], turns: [], computers: [], credits: null });
      if (path === "/api/node/themes/current") return json({ theme: null });
      if (path === "/api/node/files") return json({ files: state.sessions[0].files, nextCursor: null });
      if (path === "/api/node/files/open") {
        const body = request.postDataJSON();
        state.opened.push(body);
        if (body.action === "save") { assert.equal(body.expectedHash, hash(state.content)); state.content = body.content; return json({ ok: true, hash: hash(state.content) }); }
        return json({ path: body.source.path, name: body.source.path.split("/").at(-1), location: `/fixture/${body.source.path}`, content: state.content, hash: hash(state.content), size: state.content.length, binary: false, truncated: false, readOnly: null });
      }
      if (path === "/api/node/sessions") {
        const q = (url.searchParams.get("q") ?? "").toLowerCase();
        state.reads.push(q);
        return json({ sessions: state.sessions.filter(row => !q || [row.title, row.agentName, row.model, row.folder, row.computer, ...row.files.map(file => file.source.path), ...row.usedBy.flatMap(item => [item.node.slug, item.room?.title])].some(value => value?.toLowerCase().includes(q))) });
      }
      if (path === "/api/node/sessions/live" && request.method() === "DELETE") {
        assert.deepEqual(request.postDataJSON(), { confirmed: true });
        state.deleteCalls++;
        if (state.deleteFails) return json({ error: "The computer could not delete its native history. Retry." }, 409);
        state.sessions = state.sessions.filter(row => row.id !== "live");
        return json({ deleted: true, sessionId: "live" });
      }
      unexpected.push(path);
      return json({ error: `Unmocked: ${path}` }, 404);
    });
    await page.goto(`${WEB}/sessions`);
    const list = page.getByRole("list", { name: "Sessions", exact: true });
    const live = list.getByRole("article", { name: "Fix the login redirect", exact: true });
    await live.waitFor();
    assert.deepEqual(await list.getByRole("article").evaluateAll(rows => rows.map(row => row.querySelector("h2")?.textContent)), state.sessions.map(row => row.title));
    assert.ok(await live.getByText("GitHub Copilot · gpt-6.1-sol · workspace on Development laptop · 2 runs", { exact: true }).isVisible());
    assert.ok(await live.getByRole("link", { name: "Release crew", exact: true }).isVisible());
    assert.equal(await live.getByRole("link", { name: "Open in conversation", exact: true }).getAttribute("href"), "/r/crew#m-run-card");
    const dm = list.getByRole("article", { name: "Rewrite the README", exact: true });
    assert.ok(await dm.getByText("@builder", { exact: true }).isVisible());
    assert.equal(await dm.getByRole("link", { name: "Release crew", exact: true }).count(), 0, "direct node usage never invents a crew");
    assert.equal(await dm.locator("time").textContent(), "4d");
    for (const text of ["Don't show this task description", "Don't show this work summary", "No node manages this session yet.", "Give to…", "Hand to…"]) assert.equal(await list.getByText(text, { exact: true }).count(), 0);
    const files = live.getByRole("list", { name: "Files from Fix the login redirect", exact: true });
    assert.equal(await files.getByRole("button").count(), 2);
    await live.getByRole("button", { name: "Show 2 more files", exact: true }).click();
    assert.equal(await files.getByRole("button").count(), 4);
    assert.ok(await files.getByRole("button", { name: "Open old.txt", exact: true }).isDisabled());
    await live.getByRole("button", { name: "Show fewer files", exact: true }).click();
    if (shots) await page.screenshot({ path: `${shots}/sessions-${width}.png`, fullPage: true });
    await files.getByRole("button", { name: "Open src/auth.ts", exact: true }).click();
    const pane = page.getByRole("region", { name: "File editor", exact: true });
    const code = pane.getByRole("textbox", { name: "File contents: auth.ts", exact: true });
    await code.waitFor();
    assert.deepEqual(state.opened[0].source, { kind: "job", id: "exact-last-job", path: "src/auth.ts" });
    await code.fill("export const answer = 42;\n");
    await code.press("ControlOrMeta+s");
    await page.waitForFunction(() => document.querySelector('[aria-label="File editor"] footer [role="status"]')?.textContent === "Saved");
    assert.equal(state.content, "export const answer = 42;\n");
    if (width >= 768) assert.ok(await live.isVisible(), "session list remains beside the original editor");
    else assert.ok(await pane.getByRole("button", { name: "Back to sessions", exact: true }).isVisible());
    if (shots) await page.screenshot({ path: `${shots}/session-file-${width}.png` });
    await pane.getByRole("button", { name: "Close editor panel", exact: true }).click();
    const search = page.getByRole("textbox", { name: "Search sessions", exact: true });
    for (const query of ["Release crew", "auth.ts", "gpt-6.1-sol"]) {
      const read = page.waitForResponse(response => new URL(response.url()).pathname === "/api/node/sessions" && new URL(response.url()).searchParams.get("q") === query);
      await search.fill(query);
      await read;
      await page.waitForFunction(query => document.querySelector('input[name="session-search"]')?.value === query && document.querySelectorAll('[aria-label="Sessions"] article').length === 1, query);
      assert.equal(state.reads.at(-1), query.toLowerCase());
    }
    await search.fill("Hidden summary needle");
    await page.getByText("No session matches that.", { exact: true }).waitFor();
    await search.fill("");
    await page.waitForFunction(() => document.querySelectorAll('[aria-label="Sessions"] article').length === 3);
    const reads = state.reads.length;
    state.sessions[2].status = "working";
    await page.evaluate(() => { for (const source of window.__events) source.dispatchEvent(new MessageEvent("node.message.updated", { data: JSON.stringify({ id: "run", roomId: "crew", seq: 1, kind: "run", body: "Documentation", authorKind: "node", authorAccountId: "me", authorNodeId: "builder", createdAt: new Date().toISOString(), private: false, mentions: [], rootMessageId: null, clientId: null, data: { session: { id: "dm", status: "working" } } }) })); });
    await dm.getByText("Working", { exact: true }).waitFor();
    assert.ok(state.reads.length > reads);
    state.sessions.push(...Array.from({ length: 4 }, (_, index) => ({ ...state.sessions[1], id: `extra-${index}`, title: `Extra session ${index}`, lastActiveAt: at(100 + index) })));
    await page.reload();
    await list.getByRole("article").first().waitFor();
    assert.equal(await list.getByRole("article").count(), 5);
    await page.getByRole("button", { name: "Show more (2)", exact: true }).click();
    assert.equal(await list.getByRole("article").count(), 7);
    await page.getByRole("button", { name: "Show less", exact: true }).click();
    assert.equal(await list.getByRole("article").count(), 5);
    await live.getByRole("button", { name: "Delete session “Fix the login redirect”", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: "Delete session?", exact: true });
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(state.deleteCalls, 0, "opening/cancelling confirmation never deletes native history");
    await live.getByRole("button", { name: "Delete session “Fix the login redirect”", exact: true }).click();
    await confirm.getByRole("button", { name: "Delete session", exact: true }).click();
    await confirm.getByText("The computer could not delete its native history. Retry.", { exact: true }).waitFor();
    assert.ok(await live.isVisible(), "failed native deletion is never a hidden session");
    state.deleteFails = false;
    await confirm.getByRole("button", { name: "Retry deletion", exact: true }).click();
    await live.waitFor({ state: "detached" });
    assert.equal(state.deleteCalls, 2);
    await page.getByText("Session deleted. Project files kept.", { exact: true }).waitFor();
    assert.ok(await page.locator("main").evaluate(element => element.scrollWidth <= element.clientWidth + 2));
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    await context.close();
    console.log(`Session inventory passed at ${width}px`);
  }
} finally { await browser.close(); }
