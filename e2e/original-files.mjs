/** Local, stateful original-file UI fixture. No hosted account, model or computer is used. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");
const WEB = process.env.NODE_WEB ?? "http://localhost:3392";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(WEB).hostname), "Use an isolated local Node server.");
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ["--no-sandbox"] });
const hash = text => createHash("sha1").update(text).digest("hex");
const INITIAL = "export const answer = 41;\n";
const SOURCE = { kind: "node", id: "file-card", fileId: "a".repeat(64), path: "src/answer.ts" };
const NOTES = { kind: "node", id: "file-card", fileId: "b".repeat(64), path: "notes.md" };
const at = new Date().toISOString();
function fixture() {
  const node = { id: "builder", ownerId: "me", slug: "builder", name: "Builder", role: "engineer", model: "fixture", provider: "ensemble", avatar: { shape: "square", color: "#D7B56F", eyes: "dot" }, status: "active", charter: "", autonomy: {}, runProfileId: null, templateId: null, createdAt: at };
  const person = { id: "person", kind: "person", accountId: "me", handle: "mira", name: "Mira", role: "owner", me: true };
  const member = { id: "member", kind: "node", accountId: "me", handle: "builder", lead: true, representative: true, node };
  const room = { id: "dm", kind: "dm", title: "Builder", members: [person, member], createdBy: "me", lastSeq: 1, readSeq: 1, unread: 0, lastMessageAt: at, pinned: [], invites: [], leadNodeIds: [], last: null };
  const card = { id: SOURCE.id, roomId: room.id, seq: 1, kind: "files", body: "", authorKind: "node", authorAccountId: "me", authorNodeId: node.id, private: true, mentions: [], rootMessageId: null, clientId: null, createdAt: at, data: { deviceId: "device", sources: [SOURCE, NOTES].map(source => ({ fileId: source.fileId, path: source.path, folder: "project" })) } };
  return {
    boot: { me: { id: "me", name: "Mira", email: "mira@example.test", verified: true }, nodes: [node], rooms: [room], computers: [], credits: null, invites: [], templates: { nodes: [], crews: [] }, limits: { roomPeople: 10, nodesPerPerson: 3, crewNodes: 24, pins: 25, reactions: ["👍"], declineBlockDays: 30 }, models: { options: [] } },
    messages: [card], content: INITIAL, offline: false, saves: [], sent: [],
  };
}
try {
  for (const width of [375, 1440]) {
    const state = fixture();
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    await context.addInitScript(() => {
      window.EventSource = class extends EventTarget { close() {} };
    });
    const page = await context.newPage();
    const errors = [], unexpected = [];
    page.on("pageerror", error => errors.push(error.message));
    const cors = { "access-control-allow-origin": WEB, "access-control-allow-credentials": "true" };
    await page.route("**/api/**", async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname;
      const json = (data, status = 200) => route.fulfill({ json: data, status, headers: cors });
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "content-type, accept" } });
      if (path === "/api/auth/me") return json({ user: state.boot.me });
      if (path === "/api/node/bootstrap") return json(state.boot);
      if (path === "/api/node/activity") return json({ approvals: [], runs: [], turns: [], computers: [], credits: null });
      if (path === "/api/documents") return json({ files: [] });
      if (path === "/api/node/rooms/dm/read") return json({});
      if (path === "/api/node/rooms/dm/messages") {
        if (request.method() === "GET") return json({ messages: state.messages });
        const body = request.postDataJSON(); state.sent.push(body);
        const message = { ...state.messages[0], id: `sent-${state.sent.length}`, seq: state.sent.length + 1, kind: "text", authorKind: "human", authorNodeId: null, body: body.body, clientId: body.clientId, data: { fileQuotes: body.fileQuotes }, private: body.private };
        state.messages.push(message);
        return json({ message });
      }
      if (path === "/api/node/files") return json({ files: [SOURCE, NOTES].map(source => ({ source, deviceId: "device", deviceName: "Fixture computer", roomId: "dm", folder: "project", nodeName: "Builder", updatedAt: at })), nextCursor: null });
      if (path === "/api/node/files/open") {
        const body = request.postDataJSON();
        const content = body.source.path === SOURCE.path ? state.content : "# Notes\n";
        if (body.action === "read") return json({ path: body.source.path, name: body.source.path.split("/").at(-1), location: `/project/${body.source.path}`, fileId: body.source.fileId, content, hash: hash(content), size: content.length, binary: false, truncated: false, readOnly: null });
        if (body.action === "save") {
          if (state.offline) return json({ error: "Fixture computer is offline. Draft retained.", code: "FILE_OFFLINE" }, 409);
          if (body.expectedHash !== hash(content)) return json({ error: "The original changed. Compare the computer version.", code: "FILE_CONFLICT" }, 409);
          state.content = body.content; state.saves.push(body.content);
          return json({ ok: true, hash: hash(body.content) });
        }
      }
      unexpected.push(path);
      return json({ error: `Unmocked: ${path}` }, 404);
    });
    await page.goto(`${WEB}/r/dm`);
    const pane = page.getByRole("region", { name: "File editor", exact: true });
    const code = () => pane.getByRole("textbox", { name: "File contents: answer.ts", exact: true });
    const composer = () => page.getByRole("textbox", { name: "Message Builder", exact: true });
    await composer().waitFor();
    await page.getByRole("region", { name: "Original files", exact: true }).getByRole("button", { name: /answer.ts/ }).click();
    await code().waitFor();
    assert.equal(await page.getByRole("complementary", { name: "Changed files", exact: true }).count(), 0);
    await code().fill("export const answer = 42;\n");
    await code().press("ControlOrMeta+s");
    await page.waitForFunction(() => document.querySelector('[aria-label="File editor"] footer [role="status"]')?.textContent === "Saved");
    assert.equal(state.content, "export const answer = 42;\n");
    await code().press("ControlOrMeta+Home"); await code().press("Shift+End");
    await pane.getByRole("button", { name: "Quote selection", exact: true }).click();
    await page.locator(".chat-composer").getByLabel("Quoted file selections").waitFor();
    await composer().fill("Explain those lines");
    const sent = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/api/node/rooms/dm/messages"));
    await composer().press("Enter"); await sent;
    assert.equal(state.sent[0].fileQuotes[0].text, "export const answer = 42;");
    assert.equal(state.sent[0].fileQuotes[0].from, 1);
    if (width < 768) await page.getByRole("button", { name: "Open editor", exact: true }).click();
    await pane.getByRole("button", { name: "Show file list", exact: true }).click();
    const list = page.getByRole("complementary", { name: "Changed files", exact: true });
    await list.getByRole("button", { name: /notes.md/ }).click();
    assert.equal(await list.isVisible(), true);
    if (width >= 768) {
      await pane.getByRole("textbox", { name: "File contents: notes.md" }).waitFor();
      assert.ok((await page.getByRole("complementary", { name: "Chat sidebar", exact: true }).boundingBox()).width <= 70);
      await pane.getByRole("button", { name: "Focus editor", exact: true }).click();
      assert.equal(await list.isVisible(), true);
      await pane.getByRole("button", { name: "Restore chat and editor", exact: true }).click();
    }
    await list.getByRole("button", { name: /answer.ts/ }).click();
    await list.getByRole("button", { name: "Close file list", exact: true }).click();
    await code().waitFor();
    state.offline = true;
    await code().fill("export const answer = 44;\n");
    await pane.getByRole("alert").getByText("Fixture computer is offline. Draft retained.", { exact: false }).waitFor();
    await pane.getByRole("button", { name: "Close editor panel", exact: true }).click();
    await page.getByRole("button", { name: "Open editor", exact: true }).click();
    assert.match(await code().innerText(), /answer = 44/);
    state.offline = false; state.content = "export const answer = 43;\n";
    await pane.getByRole("button", { name: "Refresh original (compare if unsaved)", exact: true }).click();
    const conflict = pane.getByRole("region", { name: "File conflict", exact: true });
    await conflict.getByRole("button", { name: "Save my draft over this version", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="File editor"] footer [role="status"]')?.textContent === "Saved");
    assert.equal(state.content, "export const answer = 44;\n");
    state.offline = true;
    await code().fill("discard me");
    await pane.getByRole("alert").waitFor();
    await pane.getByRole("button", { name: "Close answer.ts", exact: true }).click();
    const unsaved = page.getByRole("dialog", { name: "Unsaved file", exact: true });
    await unsaved.getByRole("button", { name: "Discard draft", exact: true }).click();
    await unsaved.waitFor({ state: "hidden" });
    assert.equal(state.content, "export const answer = 44;\n", "discard must not save the unwanted draft");
    assert.equal(await page.locator("main").evaluate(element => element.scrollWidth <= element.clientWidth + 2), true);
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    await context.close();
    console.log(`Original-file workspace passed at ${width}px`);
  }
} finally { await browser.close(); }
