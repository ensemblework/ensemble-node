/** Local, stateful original-file UI fixture. No hosted account, model or computer is used. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../apps/node-web/package.json", import.meta.url));
const { zipSync, strToU8 } = require("fflate");
const XML = '<?xml version="1.0" encoding="UTF-8"?>';
const documents = {
  "sample.docx": zipSync({
    "[Content_Types].xml": strToU8(`${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`),
    "_rels/.rels": strToU8(`${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    "word/document.xml": strToU8(`${XML}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Word preview verification</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`),
  }),
  "sample.pptx": zipSync({
    "ppt/presentation.xml": strToU8(`${XML}<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/></p:presentation>`),
    "ppt/_rels/presentation.xml.rels": strToU8(`${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`),
    "ppt/slides/slide1.xml": strToU8(`${XML}<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="1" name="Text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="500000" y="500000"/><a:ext cx="8000000" cy="1000000"/></a:xfrm><a:prstGeom prst="rect"/></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="2400"/><a:t>PowerPoint preview verification</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`),
    "ppt/slides/_rels/slide1.xml.rels": strToU8(`${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="layout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`),
    "ppt/slideLayouts/slideLayout1.xml": strToU8(`${XML}<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree/></p:cSld></p:sldLayout>`),
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels": strToU8(`${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="master" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`),
    "ppt/slideMasters/slideMaster1.xml": strToU8(`${XML}<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree/></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2"/></p:sldMaster>`),
  }),
};
const pdfText = "BT /F1 16 Tf 50 700 Td (PDF preview verification) Tj ET";
const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${pdfText.length} >>\nstream\n${pdfText}\nendstream`];
let pdf = "%PDF-1.4\n", offsets = [0];
for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; }
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
documents["sample.pdf"] = Buffer.from(pdf);
const XLSX = require("xlsx");
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Title", "Value"], ["Spreadsheet preview verification", 42]]), "Summary");
documents["sample.xlsx"] = XLSX.write(book, { type: "buffer", bookType: "xlsx" });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");
const WEB = process.env.NODE_WEB ?? "http://localhost:3392";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(WEB).hostname), "Use an isolated local Node server.");
const shots = process.env.NODE_CHAT_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ["--no-sandbox"] });
const hash = text => createHash("sha1").update(text).digest("hex");
const INITIAL = "export const answer = 41;\n";
const SOURCE = { kind: "node", id: "file-card", fileId: "a".repeat(64), path: "src/answer.ts" };
const NOTES = { kind: "node", id: "file-card", fileId: "b".repeat(64), path: "notes.md" };
const DOCUMENTS = Object.keys(documents).map((path, index) => ({ kind: "node", id: "file-card", fileId: String(index + 1).repeat(64), path }));
const at = new Date().toISOString();
function fixture() {
  const node = { id: "builder", ownerId: "me", slug: "builder", name: "Builder", role: "engineer", model: "fixture", provider: "ensemble", avatar: { shape: "square", color: "#D7B56F", eyes: "dot" }, status: "active", charter: "", autonomy: {}, runProfileId: null, templateId: null, createdAt: at };
  const person = { id: "person", kind: "person", accountId: "me", handle: "mira", name: "Mira", role: "owner", me: true };
  const member = { id: "member", kind: "node", accountId: "me", handle: "builder", lead: true, representative: true, node };
  const editor = { ...node, id: "editor", slug: "editor", name: "Editor" };
  const room = { id: "dm", kind: "dm", title: "Builder", members: [person, member], createdBy: "me", lastSeq: 1, readSeq: 1, unread: 0, lastMessageAt: at, pinned: [], invites: [], leadNodeIds: [], last: null };
  const card = { id: SOURCE.id, roomId: room.id, seq: 1, kind: "files", body: "", authorKind: "node", authorAccountId: "me", authorNodeId: node.id, private: true, mentions: [], rootMessageId: null, clientId: null, createdAt: at, data: { deviceId: "device", sources: [SOURCE, NOTES].map(source => ({ fileId: source.fileId, path: source.path, folder: "project" })) } };
  return {
    boot: { me: { id: "me", name: "Mira", email: "mira@example.test", verified: true }, nodes: [node, editor], rooms: [room, { ...room, id: "editor-dm", title: "Editor", members: [person, { ...member, id: "editor-member", node: editor, handle: "editor" }] }, { ...room, id: "crew", kind: "crew", title: "Software Team", members: [person, member, { ...member, id: "crew-editor", node: editor, handle: "editor", lead: false }], leadNodeIds: [node.id] }], computers: [], credits: null, invites: [], templates: { nodes: [], crews: [] }, limits: { roomPeople: 10, nodesPerPerson: 3, crewNodes: 24, pins: 25, reactions: ["👍"], declineBlockDays: 30 }, models: { options: [] } },
    theme: { id: "builtin:ensemble-default", label: "Ensemble Default", uiTheme: "vs-dark", kind: "dark", cssVars: {}, editor: null, tokens: [] },
    messages: [card], content: INITIAL, offline: false, saves: [], sent: [],
    target: { kind: "node", nodeId: editor.id, nodeName: editor.name, roomId: "editor-dm" },
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
    const respond = async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname;
      const json = (data, status = 200) => route.fulfill({ json: data, status, headers: cors });
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "content-type, accept" } });
      if (path === "/api/auth/me") return json({ user: state.boot.me });
      if (path === "/api/node/bootstrap") return json(state.boot);
      if (path === "/api/node/activity") return json({ approvals: [], runs: [], turns: [], computers: [], credits: null });
      if (path === "/api/documents") return json({ files: [] });
      if (path.endsWith("/read")) return json({});
      if (path === "/api/node/themes/current") {
        if (request.method() === "PUT") state.theme = request.postDataJSON().theme;
        return json({ theme: state.theme });
      }
      if (path === "/api/node/files/target") return json({ target: state.target });
      if (/\/api\/node\/rooms\/[^/]+\/messages$/.test(path) || path === "/api/node/files/query") {
        if (request.method() === "GET") return json({ messages: state.messages });
        const body = request.postDataJSON(); state.sent.push(body);
        const message = { ...state.messages[0], roomId: body.target?.roomId ?? "dm", id: `sent-${state.sent.length}`, seq: state.sent.length + 1, kind: "text", authorKind: "human", authorNodeId: null, body: body.body, clientId: body.clientId, data: { fileQuotes: body.fileQuotes, fileTarget: body.target }, private: body.private };
        state.messages.push(message);
        return json({ message });
      }
      if (path === "/api/node/files") return json({ files: [SOURCE, NOTES, ...DOCUMENTS].map(source => ({ source, deviceId: "device", deviceName: "Fixture computer", roomId: "dm", folder: "project", nodeName: "Builder", updatedAt: at })), nextCursor: null });
      if (path === "/api/node/files/open") {
        const body = request.postDataJSON();
        const document = documents[body.source.path];
        if (document) {
          if (body.action === "download") return route.fulfill({ body: Buffer.from(document), headers: { ...cors, "content-type": body.source.path.endsWith(".pdf") ? "application/pdf" : "application/zip" } });
          return json({ path: body.source.path, name: body.source.path, location: `/project/${body.source.path}`, fileId: body.source.fileId, content: null, hash: hash(document), size: document.length, binary: true, truncated: false, readOnly: "This format is previewed, not edited as text." });
        }
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
    };
    await context.route("**/api/**", respond);
    await page.goto(`${WEB}/r/dm`);
    const pane = page.getByRole("region", { name: "File editor", exact: true });
    const code = () => pane.getByRole("textbox", { name: "File contents: answer.ts", exact: true });
    const composer = () => page.getByRole("textbox", { name: /Message (Builder|Editor)/ });
    await composer().waitFor();
    await page.getByRole("region", { name: "Original files", exact: true }).getByRole("button", { name: /answer.ts/ }).click();
    await code().waitFor();
    assert.equal(await pane.locator("footer").getByRole("button", { name: "Quote selection", exact: true }).count(), 0, "selection actions never live in the bottom bar");
    assert.equal(await pane.getByRole("button", { name: "Preview Markdown", exact: true }).count(), 0, "code files have no Markdown preview toggle");
    assert.equal(await page.getByRole("complementary", { name: "Changed files", exact: true }).count(), 0);
    await code().fill("export const answer = 42;\n");
    await code().press("ControlOrMeta+s");
    await page.waitForFunction(() => document.querySelector('[aria-label="File editor"] footer [role="status"]')?.textContent === "Saved");
    assert.equal(state.content, "export const answer = 42;\n");
    await code().press("ControlOrMeta+Home"); await code().press("Shift+End");
    const floating = page.getByRole("toolbar", { name: "Selected file text actions", exact: true });
    await floating.getByRole("button", { name: "Quote selection", exact: true }).click();
    await page.waitForURL("**/r/editor-dm");
    await page.locator(".chat-composer").getByLabel("Quoted file selections").waitFor();
    await composer().fill("Explain those lines");
    const sent = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/api/node/files/query"));
    await composer().press("Enter"); await sent;
    assert.equal(state.sent[0].fileQuotes[0].text, "export const answer = 42;");
    assert.equal(state.sent[0].fileQuotes[0].from, 1);
    assert.equal(state.sent[0].target.nodeId, "editor", "quote routes to the editing node instead of the original open chat");
    if (width < 768) await page.getByRole("button", { name: "Open editor", exact: true }).click();
    await pane.getByRole("button", { name: "Show file list", exact: true }).click();
    const list = page.getByRole("complementary", { name: "Changed files", exact: true });
    await list.getByRole("button", { name: /notes.md/ }).click();
    assert.equal(await list.isVisible(), true);
    if (width >= 768) {
      await pane.getByRole("textbox", { name: "File contents: notes.md" }).waitFor();
      await pane.getByRole("button", { name: "Preview Markdown", exact: true }).click();
      await pane.getByRole("article", { name: "Markdown preview" }).getByRole("heading", { name: "Notes" }).waitFor();
      await pane.getByRole("button", { name: "Edit Markdown", exact: true }).click();
      assert.ok((await page.getByRole("complementary", { name: "Chat sidebar", exact: true }).boundingBox()).width <= 70);
      await pane.getByRole("button", { name: "Focus editor", exact: true }).click();
      assert.equal(await list.isVisible(), true);
      await pane.getByRole("button", { name: "Restore chat and editor", exact: true }).click();
    }
    await list.getByRole("button", { name: /answer.ts/ }).click();
    await list.getByRole("button", { name: "Close file list", exact: true }).click();
    await code().waitFor();
    if (width >= 768) {
      await pane.getByRole("button", { name: "Editor theme", exact: true }).click();
      await page.getByRole("dialog", { name: "Editor theme", exact: true }).getByRole("button", { name: "GitHub Dark", exact: true }).click();
      await page.getByRole("dialog", { name: "Editor theme", exact: true }).waitFor({ state: "hidden" });
      assert.equal(state.theme.id, "builtin:github-dark");
      const anotherDevice = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await anotherDevice.addInitScript(() => { window.EventSource = class extends EventTarget { close() {} }; });
      await anotherDevice.route("**/api/**", respond);
      const other = await anotherDevice.newPage();
      await other.goto(`${WEB}/r/editor-dm`);
      await other.getByRole("region", { name: "Original files", exact: true }).getByRole("button", { name: /answer.ts/ }).click();
      await other.getByRole("button", { name: "Editor theme", exact: true }).click();
      assert.equal(await other.getByRole("dialog", { name: "Editor theme", exact: true }).getByRole("button", { name: "GitHub Dark", exact: true }).getAttribute("aria-pressed"), "true", "a fresh browser restores the account theme without local storage");
      await anotherDevice.close();
    }
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
    state.target = { ...state.target, kind: "session", sessionId: "session", agentName: "GitHub Copilot" };
    await code().press("ControlOrMeta+Home"); await code().press("Shift+End");
    await page.getByRole("toolbar", { name: "Selected file text actions", exact: true }).getByRole("button", { name: "Quote selection", exact: true }).click();
    await page.locator(".chat-composer").getByText(/Direct to GitHub Copilot/).waitFor();
    assert.equal(state.sent.length, 1, "quoting prepares a draft; it does not send");
    await composer().fill("Explain this in the existing session");
    const sessionSend = page.waitForResponse(response => response.url().endsWith("/api/node/files/query"));
    await composer().press("Enter"); await sessionSend;
    assert.equal(state.sent[1].target.sessionId, "session");
    if (width < 768) await page.getByRole("button", { name: "Open editor", exact: true }).click();
    state.offline = true;
    await code().fill("discard me");
    await pane.getByRole("alert").waitFor();
    await pane.getByRole("button", { name: "Close answer.ts", exact: true }).click();
    const unsaved = page.getByRole("dialog", { name: "Unsaved file", exact: true });
    await unsaved.getByRole("button", { name: "Discard draft", exact: true }).click();
    await unsaved.waitFor({ state: "hidden" });
    assert.equal(state.content, "export const answer = 44;\n", "discard must not save the unwanted draft");
    if (width >= 768) {
      await pane.getByRole("button", { name: "Show file list", exact: true }).click();
      const files = page.getByRole("complementary", { name: "Changed files", exact: true });
      await files.getByRole("button", { name: /sample.docx/ }).click();
      await pane.frameLocator('iframe[title="sample.docx preview"]').getByText("Word preview verification").waitFor();
      await files.getByRole("button", { name: /sample.pptx/ }).click();
      await pane.locator("[data-pptx-viewer]").getByText("PowerPoint preview verification").last().waitFor();
      await files.getByRole("button", { name: /sample.pdf/ }).click();
      await pane.locator('[data-pdf-page="1"] canvas').waitFor();
      await page.waitForFunction(() => {
        const canvas = document.querySelector('[data-pdf-page="1"] canvas');
        if (!canvas || canvas.width < 100 || canvas.height < 100) return false;
        const pixels = canvas.getContext("2d").getImageData(0, 0, Math.min(canvas.width, 350), Math.min(canvas.height, 350)).data;
        for (let at = 0; at < pixels.length; at += 4) if (pixels[at + 3] && pixels[at] < 200 && pixels[at + 1] < 200 && pixels[at + 2] < 200) return true;
        return false;
      });
      await files.getByRole("button", { name: "Close file list", exact: true }).click();
      await pane.getByRole("button", { name: "Focus editor", exact: true }).click();
      await pane.locator("[data-reader-header]").getByRole("textbox", { name: "Page number", exact: true }).waitFor();
      assert.equal(await pane.locator('[role="tablist"][aria-label="Open files"]').count(), 0, "reading focus hides file tabs");
      assert.equal(await pane.locator("footer").count(), 0, "document reading has no code status/footer");
      assert.equal(await pane.getByText("This format is previewed, not edited as text.", { exact: true }).count(), 0);
      assert.ok((await pane.locator("[data-reader-header]").boundingBox()).height <= 44, "PDF controls share one compact reading bar");
      const readerSize = await pane.boundingBox(), pageSize = await pane.locator("#node-file-panel").boundingBox();
      assert.ok(pageSize.height / readerSize.height > .9, "more than 90% of focused desktop height belongs to the document");
      if (shots) await page.screenshot({ path: `${shots}/original-pdf-focus-${width}.png` });
      await pane.getByRole("button", { name: "Restore chat and editor", exact: true }).click();
      await pane.getByRole("button", { name: "Show file list", exact: true }).click();
      await files.getByRole("button", { name: /sample.xlsx/ }).click();
      const cell = pane.getByRole("cell", { name: "Spreadsheet preview verification", exact: true });
      await cell.waitFor();
      const contrast = await cell.evaluate(element => {
        const luma = color => {
          const [r, g, b] = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
          return .2126 * r + .7152 * g + .0722 * b;
        };
        let parent = element, background;
        while (parent) {
          background = getComputedStyle(parent).backgroundColor;
          if (background.startsWith("rgb(") || /,\s*1\)$/.test(background)) break;
          parent = parent.parentElement;
        }
        const values = [luma(getComputedStyle(element).color), luma(background)].sort((a, b) => a - b);
        return (values[1] + .05) / (values[0] + .05);
      });
      assert.ok(contrast >= 4.5, "a dark code theme never makes document text unreadable in the light app");
      await page.getByRole("link", { name: "Software Team", exact: true }).click();
      const handle = page.locator('.file-list [aria-label="Resize file list"]');
      const before = await handle.getAttribute("aria-valuenow");
      const box = await handle.boundingBox();
      await page.locator(".chat-header h1 button").click();
      const settings = page.getByRole("dialog", { name: "Crew settings", exact: true });
      await settings.waitFor();
      assert.equal(await page.locator(".chat-shell").evaluate(element => element.inert), true);
      assert.equal(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="dialog"]')?.getAttribute("aria-label"), { x: box.x + 2, y: 200 }), "Crew settings", "the modal, not the file divider, owns the pointer hit");
      if (shots) await page.screenshot({ path: `${shots}/original-crew-settings-${width}.png` });
      await handle.evaluate(element => element.focus());
      await page.keyboard.press("ArrowLeft");
      assert.equal(await handle.getAttribute("aria-valuenow"), before, "background resize handles cannot receive keyboard interaction");
      for (let at = 0; at < 8; at++) {
        await page.keyboard.press("Tab");
        assert.equal(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]')?.getAttribute("aria-label")), "Crew settings");
      }
      await page.keyboard.press("Escape");
      await settings.waitFor({ state: "hidden" });
      assert.equal(await page.locator(".chat-shell").evaluate(element => element.inert), false);
      assert.ok(await page.getByRole("link", { name: "Add a node or crew", exact: true }).isVisible());
      await page.evaluate(() => { document.documentElement.dataset.doodle = "orbits"; });
      assert.match(await page.locator(".chat-wallpaper").evaluate(element => getComputedStyle(element, "::before").maskImage), /orbits.svg/);
      const backgrounds = await page.locator("[data-message-surface]").evaluateAll(elements => elements.map(element => getComputedStyle(element).backgroundColor));
      assert.ok(backgrounds.length);
      assert.ok(backgrounds.every(color => color.startsWith("rgb(") || /,\s*1\)$/.test(color)), "message surfaces stay opaque above doodles");
      if (shots) await page.screenshot({ path: `${shots}/original-doodles-${width}.png` });
    }
    assert.equal(await page.locator("main").evaluate(element => element.scrollWidth <= element.clientWidth + 2), true);
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    await context.close();
    console.log(`Original-file workspace passed at ${width}px`);
  }
} catch (error) {
  for (const context of browser.contexts()) for (const page of context.pages()) console.error((await page.locator("body").innerText()).slice(-6000));
  throw error;
} finally { await browser.close(); }
