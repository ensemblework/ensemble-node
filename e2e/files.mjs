/**
 * Local, stateful browser fixture for files in the chat, at 390 and 1280 px: a node's Markdown report
 * rendered (a table, Show all, Collapse), a Python script with line numbers and Copy beside its CSV
 * output, a message with every other kind (a picture that opens in the lightbox, sound in a player,
 * three text files folded until one is opened, PDF, a zipped folder, Word, Excel and PowerPoint files
 * that Ensemble types as ZIPs, HTML only as a download, a binary file) that says how many files and how
 * large, each read through its message, and a download that saves the file; a node's message about
 * a task assigned to it (the task chip, a record link by its title, an unknown one as "task"); the
 * owner's own files with "Save on my computer", which asks the node in a reply; and the composer
 * taking a script, a notebook and a picture while it refuses a program, an empty file and one too large
 * before uploading, in Ensemble's words. Never points at a hosted account or calls a model. Usage is in
 * docs/05 (Browser regression).
 */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");
const WEB = process.env.NODE_WEB ?? "http://localhost:3417";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(WEB).hostname), "Use an isolated local Node server.");
const shots = process.env.NODE_CHAT_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ["--no-sandbox"] });
const NOW = Date.now();
const at = (minutes) => new Date(NOW + minutes * 60_000).toISOString();
const APP = "http://localhost:3000";
const UNKNOWN_TASK = "8c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";

/** A small PNG with a gradient, so a picture is a real picture. */
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
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) rows.set([r, (g + Math.floor(y / 3)) % 256, (b + x) % 256], y * (width * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

/** A tiny WAV of a tone, so the player has something real to load. */
function wav(seconds = 1, rate = 8000) {
  const samples = Buffer.alloc(seconds * rate);
  for (let at = 0; at < samples.length; at += 1) samples[at] = 128 + Math.round(60 * Math.sin((2 * Math.PI * 440 * at) / rate));
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + samples.length, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate, 28);
  head.writeUInt16LE(1, 32);
  head.writeUInt16LE(8, 34);
  head.write("data", 36);
  head.writeUInt32LE(samples.length, 40);
  return Buffer.concat([head, samples]);
}

const REPORT = [
  "# Hosting providers compared",
  "",
  "Prices checked today on each provider's own pricing page.",
  "",
  "| Provider | Small | Large |",
  "| --- | ---: | ---: |",
  "| Fly.io | $5 | $62 |",
  "| Render | $7 | $85 |",
  "",
  "## Notes",
  "",
  "<script>alert('never runs')</script>",
  "",
  ...Array.from({ length: 48 }, (_, at) => `- Note ${at + 1}: prices exclude tax.`),
].join("\n");
const SCRIPT = [
  "import csv",
  "import statistics",
  "",
  "",
  "def main(path: str) -> None:",
  '    """Reads the prices and prints the median per provider."""',
  "    with open(path, newline=\"\") as handle:",
  "        rows = list(csv.DictReader(handle))",
  "    by = {}",
  "    for row in rows:",
  "        by.setdefault(row[\"provider\"], []).append(float(row[\"price\"]))",
  "    for name, prices in sorted(by.items()):",
  "        print(f\"{name:>10}: {statistics.median(prices):8.2f}  ({len(prices)} plans, the longest line in this file goes on and on so it scrolls sideways)\")",
  "",
  "",
  'if __name__ == "__main__":',
  '    main("prices.csv")',
].join("\n");
const CSV = ["provider,plan,price", "fly,small,5", "fly,large,62", "render,small,7", "render,large,85"].join("\n");
const zipLike = (size) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(size - 4, 7)]);
const FILES = {
  "e-report": { body: Buffer.from(REPORT), type: "text/html; charset=utf-8" },
  "e-py": { body: Buffer.from(SCRIPT), type: "text/plain; charset=utf-8" },
  "e-csv": { body: Buffer.from(CSV), type: "text/csv; charset=utf-8" },
  "e-chart": { body: png(480, 300, [30, 70, 140]), type: "image/png" },
  "e-json": { body: Buffer.from(JSON.stringify({ providers: [{ name: "fly", small: 5 }, { name: "render", small: 7 }] })), type: "application/json" },
  "e-log": { body: Buffer.from(Array.from({ length: 12 }, (_, at) => `12:00:${String(at).padStart(2, "0")} step ${at + 1} ok`).join("\n")), type: "text/plain; charset=utf-8" },
  "e-ts": { body: Buffer.from('export const greet = (name: string) => `Hello, ${name}`;\n'), type: "text/javascript; charset=utf-8" },
  "e-pdf": { body: Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(180_000, 32)]), type: "application/pdf" },
  "e-zip": { body: zipLike(2_400_000), type: "application/zip" },
  "e-docx": { body: zipLike(42_000), type: "application/zip" },
  "e-xlsx": { body: zipLike(18_000), type: "application/zip" },
  "e-pptx": { body: zipLike(1_200_000), type: "application/zip" },
  "e-html": { body: Buffer.from("<!doctype html><script>alert(1)</script>"), type: "text/html; charset=utf-8" },
  "e-audio": { body: wav(), type: "application/octet-stream" },
  "e-bin": { body: Buffer.from([0, 1, 2, 3, 0, 255]), type: "application/octet-stream" },
};

function fixture() {
  const avatar = (color, shape = "orb") => ({ shape, color, eyes: "dot" });
  const base = { ownerId: "me", status: "active", charter: "", autonomy: {}, runProfileId: null, templateId: null, createdAt: at(-9000), provider: "ensemble", model: "gpt-6-luna", parentNodeId: null };
  const a3 = { ...base, id: "a3", slug: "assistant-3", name: "Assistant 3", role: "assistant", avatar: avatar("#D7B56F", "compass") };
  const me = { id: "p-me", kind: "person", handle: "akash", accountId: "me", role: "owner", name: "Akash", responsibility: null, me: true };
  const room = { id: "dm-a3", title: "Assistant 3", kind: "dm", members: [me, { id: "m-a3", kind: "node", handle: "assistant-3", accountId: "me", lead: true, representative: true, node: a3 }], createdBy: "me", lastSeq: 20, readSeq: 20, unread: 0, lastMessageAt: at(-1), pinned: [], invites: [], leadNodeIds: [], last: null };
  let seq = 0;
  const message = (id, body, data, more = {}) => ({ id, roomId: "dm-a3", seq: (seq += 1), kind: "text", body, authorKind: "node", authorAccountId: "me", authorNodeId: "a3", data, private: false, mentions: [], rootMessageId: null, clientId: null, planId: null, createdAt: at(-40 + seq), ...more });
  const media = (evidenceId, name, kind = "file", extra = {}) => ({ evidenceId, kind, name, mime: FILES[evidenceId].type.split(";")[0], size: FILES[evidenceId].body.length, ...extra });
  const messages = [
    message("u1", "Here's the brief and my notes. Save the brief on my computer when you can.", { files: [{ id: "f-brief", name: "brief.pdf", kind: "pdf", size: 240_000 }, { id: "f-notes", name: "notes.md", kind: "text", size: 2_100 }] }, { authorKind: "human", authorNodeId: null }),
    message("n-report", "Here is the comparison.", { media: [media("e-report", "hosting.md", "report", { caption: "Prices on 31 Oct" })] }),
    message("n-code", "The script and what it printed.", { media: [media("e-py", "analyse.py", "file"), media("e-csv", "prices.csv", "report")] }),
    message("n-files", "Everything from the run. The site folder is zipped.", {
      media: [
        media("e-chart", "chart.png", "image", { width: 480, height: 300 }),
        media("e-audio", "summary.wav", "file", { caption: "A spoken summary" }),
        media("e-json", "providers.json", "report"),
        media("e-log", "run.log", "log"),
        media("e-ts", "greet.ts", "file"),
        media("e-pdf", "invoice.pdf", "report"),
        media("e-zip", "site.zip", "file", { caption: "The folder site/, 14 files" }),
        media("e-docx", "proposal.docx", "file"),
        media("e-xlsx", "budget.xlsx", "file"),
        media("e-pptx", "pitch.pptx", "file"),
        media("e-html", "preview.html", "report"),
        media("e-bin", "weights.bin", "file"),
      ],
    }),
    message("n-task", `On it: [Fix the login redirect](ensemble://task/t-1). I will move it to In progress as I go. The older one (ensemble://task/${UNKNOWN_TASK}) stays with you.`, { task: { id: "t-1", title: "Fix the login redirect", due: at(3 * 24 * 60), status: "todo" }, refs: [{ kind: "task", id: "t-1", label: "Fix the login redirect" }] }),
  ];
  const boot = { me: { id: "me", name: "Akash", email: "akash@fieldnote.example", verified: true }, nodes: [a3], rooms: [room], computers: [], credits: null, invites: [], templates: { nodes: [], crews: [] }, limits: { roomPeople: 10, nodesPerPerson: 3, crewNodes: 24, pins: 25, reactions: ["👍"], declineBlockDays: 30 }, models: { default: "gpt-6-luna", options: [] } };
  return { boot, messages: { "dm-a3": messages }, reads: [], uploads: [], sent: [] };
}

try {
  for (const width of [390, 1280]) {
    const state = fixture();
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 768, isMobile: width < 768, colorScheme: "dark", reducedMotion: "reduce", locale: "en-GB", acceptDownloads: true });
    await context.addInitScript(() => {
      window.EventSource = class extends EventTarget {
        constructor() { super(); setTimeout(() => this.onopen?.(new Event("open")), 0); }
        close() {}
      };
      Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text) => { window.__copied = text; } }, configurable: true });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    const errors = [];
    const unexpected = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => {
      errors.push(`a dialog opened: ${dialog.message()}`);
      void dialog.dismiss();
    });
    const cors = { "access-control-allow-origin": WEB, "access-control-allow-credentials": "true" };
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      const json = (data, status = 200) => route.fulfill({ status, json: data, headers: cors });
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-methods": "GET, POST, PATCH, PUT, DELETE", "access-control-allow-headers": "content-type, accept" } });
      if (path === "/api/auth/me") return json({ user: state.boot.me });
      if (path === "/api/node/bootstrap") return json(state.boot);
      if (path === "/api/node/activity") return json({ approvals: [], runs: [], turns: [], computers: [], credits: null, waitingTasks: [] });
      if (path === "/api/decisions") return json({ decisions: [] });
      if (path === "/api/approvals") return json({ approvals: [] });
      if (path === "/api/devices") return json({ devices: [] });
      if (path === "/api/documents" && method === "GET") return json({ files: [], usage: { maxFileBytes: 1024 * 1024 } });
      if (path === "/api/documents" && method === "POST") {
        const body = request.postDataJSON();
        state.uploads.push(body.filename);
        const ext = body.filename.split(".").pop();
        const kind = { py: "code", ipynb: "code", png: "image" }[ext] ?? "other";
        return json({ file: { id: `f-${state.uploads.length}`, filename: body.filename, mediaType: body.mediaType, byteSize: Buffer.from(body.dataBase64, "base64").length, kind, format: ext, createdAt: new Date().toISOString() } });
      }
      if (path === "/api/node/routines") return json({ routines: [] });
      if (/^\/api\/node\/rooms\/[^/]+\/read$/.test(path)) return json({});
      const messages = /^\/api\/node\/rooms\/([^/]+)\/messages$/.exec(path);
      if (messages && method === "GET") return json({ messages: state.messages[messages[1]] ?? [] });
      if (messages && method === "POST") {
        const body = request.postDataJSON();
        state.sent.push(body);
        const sent = { id: `sent-${state.sent.length}`, roomId: messages[1], seq: 100 + state.sent.length, kind: "text", body: body.body, authorKind: "human", authorAccountId: "me", authorNodeId: null, data: {}, private: false, mentions: [], rootMessageId: null, clientId: body.clientId, planId: null, createdAt: new Date().toISOString() };
        state.messages[messages[1]].push(sent);
        return json({ message: sent });
      }
      const file = /^\/api\/node\/evidence\/([^/]+)$/.exec(path);
      if (file && method === "GET" && FILES[file[1]]) {
        state.reads.push({ id: file[1], via: url.searchParams.get("message") });
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
    /** The whole message (on a screen tall enough for it), else the screen. */
    const shot = async (name, locator) => {
      if (!shots) return;
      if (!locator) return void (await page.screenshot({ path: `${shots}/files-${name}-${width}.png` }));
      const height = Math.ceil((await locator.boundingBox())?.height ?? 0);
      await page.setViewportSize({ width, height: Math.max(900, height + 320) });
      await locator.evaluate((element) => element.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(200);
      await locator.screenshot({ path: `${shots}/files-${name}-${width}.png` });
      await page.setViewportSize({ width, height: 900 });
    };
    const reads = (id) => state.reads.filter((row) => row.id === id);

    try {
      await page.goto(`${WEB}/r/dm-a3`);
      const timeline = page.locator(".chat-timeline");

      // A Markdown report, rendered: its table, its first lines, Show all and Collapse. Its <script> is text.
      const report = timeline.locator("#m-n-report").locator('[data-text-preview="markdown"]');
      // Read once it comes near the screen.
      await report.scrollIntoViewIfNeeded();
      await report.getByText("Hosting providers compared").waitFor();
      assert.ok(await report.getByText("Markdown · ", { exact: false }).isVisible(), "its type");
      assert.ok(await report.getByRole("table").isVisible(), "a Markdown table renders");
      assert.equal(await report.getByText("Note 48: prices exclude tax.").count(), 0, "the first 40 lines first");
      await report.getByRole("button", { name: /^Show all \d+ lines$/ }).click();
      await report.getByText("Note 48: prices exclude tax.").waitFor();
      assert.equal(await page.locator("#m-n-report script").count(), 0, "raw HTML stays text");
      assert.ok(await report.getByText("<script>alert('never runs')</script>").isVisible(), "shown as written");
      await report.getByRole("button", { name: "Collapse" }).click();
      assert.deepEqual(reads("e-report").map((row) => row.via), ["n-report"], "read once, through its message");
      await fits("report");
      await shot("markdown", timeline.locator("#m-n-report"));

      // A Python script with line numbers and Copy, beside its CSV output.
      const code = timeline.locator("#m-n-code").locator('[data-text-preview="code"]');
      await code.scrollIntoViewIfNeeded();
      await code.getByText("def main(path: str) -> None:").waitFor();
      assert.ok(await code.getByText(/^Python · /).isVisible(), "Ensemble's text/plain, named .py, is Python");
      assert.match(await code.locator("pre[aria-hidden]").innerText(), /^1\n2\n3\n[\s\S]*\n17$/, "one number per line");
      assert.equal(await code.locator("pre[aria-hidden]").evaluate((element) => getComputedStyle(element).userSelect), "none", "copying the code leaves the numbers out");
      await code.getByRole("button", { name: "Copy analyse.py" }).click();
      assert.equal(await page.evaluate(() => window.__copied), `${[...SCRIPT.split("\n")].join("\n")}`, "Copy takes the code");
      const long = code.locator('pre[aria-label="Python code"]');
      assert.ok(await long.evaluate((element) => element.scrollWidth > element.clientWidth), "a long line scrolls sideways");
      const csv = timeline.locator("#m-n-code").locator('[data-text-preview="text"]');
      await csv.getByText("render,large,85").waitFor();
      assert.ok(await csv.getByText(/^CSV · /).isVisible());
      await fits("code");
      await shot("code", timeline.locator("#m-n-code"));

      // Every other kind on one message: how many and how large, a picture, sound, folded text files and downloads.
      const all = timeline.locator("#m-n-files").getByRole("region", { name: "Media" });
      await all.scrollIntoViewIfNeeded();
      assert.match(await all.locator("[data-files-line]").innerText(), /^11 files · 3\.\d MB$/, "the picture is in the grid; the rest are counted");
      await all.getByRole("button", { name: /^Open Image “chart.png”/ }).locator("img").waitFor();
      const folded = all.locator("[data-text-preview][data-folded]");
      assert.equal(await folded.count(), 3, "three text files start folded");
      assert.deepEqual(await folded.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-text-preview"))), ["json", "text", "code"]);
      assert.equal(reads("e-json").length + reads("e-log").length + reads("e-ts").length, 0, "a folded file is not read");
      await all.getByRole("button", { name: "Preview providers.json" }).click();
      await all.locator('[data-text-preview="json"]').getByText('"name": "fly",').waitFor();
      assert.equal(await all.getByRole("button", { name: "Hide providers.json" }).getAttribute("aria-expanded"), "true");
      assert.deepEqual(reads("e-json").map((row) => row.via), ["n-files"]);
      await all.getByRole("button", { name: "Preview greet.ts" }).click();
      await all.locator('[data-text-preview="code"]').getByText("export const greet").waitFor();
      assert.ok(await all.locator('[data-text-preview="code"]').getByText(/^TypeScript · /).isVisible(), "a script is shown as text, never run");
      // Sound plays here; it is read through the message too.
      const player = all.locator("audio");
      await player.waitFor();
      assert.match(await player.getAttribute("src"), /\/api\/node\/evidence\/e-audio\?message=n-files$/);
      assert.ok(await all.getByText(/^WAV audio · /).isVisible());
      // Downloads: each with its type, by its name where Ensemble saw a ZIP.
      const row = (name) => all.getByRole("button", { name: new RegExp(`^Download .*“${name.replace(".", "\\.")}”`) });
      for (const [name, words] of [["invoice.pdf", /^PDF · 176 KB/], ["site.zip", /^ZIP archive · 2\.3 MB · The folder site\/, 14 files/], ["proposal.docx", /^Word document · 41 KB/], ["budget.xlsx", /^Excel spreadsheet · 18 KB/], ["pitch.pptx", /^PowerPoint · 1\.1 MB/], ["preview.html", /^HTML · /], ["weights.bin", /^File · 6 B/]]) {
        assert.match((await row(name).innerText()).split("\n").at(-1), words, name);
      }
      assert.equal(await all.locator('[data-text-preview]').filter({ hasText: "preview.html" }).count(), 0, "HTML is never previewed");
      assert.deepEqual(await all.locator("[data-file-family]").evaluateAll((icons) => [...new Set(icons.map((icon) => icon.getAttribute("data-file-family")))].sort()), ["archive", "audio", "code", "data", "document", "markup", "other", "pdf", "presentation", "spreadsheet", "text"].sort());
      const saved = page.waitForEvent("download");
      await row("site.zip").click();
      const download = await saved;
      assert.equal(download.suggestedFilename(), "site.zip", "saved under its name");
      assert.deepEqual(reads("e-zip").map((row) => row.via), ["n-files"], "downloaded through its message");
      await fits("files");
      await shot("all-kinds", timeline.locator("#m-n-files"));
      // The picture opens in the lightbox.
      await all.getByRole("button", { name: /^Open Image “chart.png”/ }).click();
      await page.getByRole("dialog", { name: /chart\.png/ }).waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("dialog", { name: /chart\.png/ }).waitFor({ state: "detached" });

      // A node's message about a task assigned to it: the task's chip and its links.
      const task = timeline.locator("#m-n-task");
      await task.scrollIntoViewIfNeeded();
      const chip = task.locator("[data-task-chip]");
      assert.equal(await chip.getAttribute("href"), `${APP}/tasks/t-1`);
      assert.match(await chip.innerText(), /Task\s*Fix the login redirect\s*· due \d+ \w+/);
      assert.equal(await task.getByRole("link", { name: "Fix the login redirect", exact: true }).getAttribute("href"), `${APP}/tasks/t-1`, "a record link shows its title");
      assert.equal(await task.getByRole("link", { name: "task", exact: true }).getAttribute("href"), `${APP}/tasks/${UNKNOWN_TASK}`, "a task nobody named shows as its kind, linked");
      assert.equal(await task.getByText("ensemble://").count(), 0, "no raw addresses");
      await shot("task", task);

      // My own files: Save on my computer asks the node, as a reply to that message.
      const mine = timeline.locator("#m-u1");
      await mine.scrollIntoViewIfNeeded();
      await mine.getByRole("button", { name: "Ask to save brief.pdf on your computer" }).click();
      const box = page.getByRole("textbox", { name: "Message Assistant 3" });
      assert.equal(await box.inputValue(), "Save “brief.pdf” on my computer.");
      assert.ok(await page.getByText("Replying to you", { exact: false }).or(page.getByText("Replying to Akash")).first().isVisible(), "a reply to that message");
      await shot("save-ask", null);
      await box.press("Enter");
      await page.waitForFunction(() => document.querySelector("#m-sent-1"));
      assert.equal(state.sent[0].body, "Save “brief.pdf” on my computer.");
      assert.equal(state.sent[0].replyToId, "u1", "the node reads which file from the message it replies to");

      // The composer takes any file Ensemble keeps, and refuses a program, an empty file and one too large before uploading.
      await page.locator('input[type="file"]').setInputFiles([
        { name: "clean.py", mimeType: "text/x-python", buffer: Buffer.from("print('hi')\n") },
        { name: "analysis.ipynb", mimeType: "", buffer: Buffer.from('{"cells": []}') },
        { name: "photo.png", mimeType: "image/png", buffer: png(40, 30, [200, 40, 40]) },
        { name: "setup.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") },
        { name: "empty.txt", mimeType: "text/plain", buffer: Buffer.alloc(0) },
        { name: "huge.mov", mimeType: "video/quicktime", buffer: Buffer.alloc(1024 * 1024 + 10, 1) },
      ]);
      const shelf = page.getByRole("list", { name: /^Attached files/ });
      await shelf.getByText(".exe files are programs or raw binary data, which Files does not keep.").waitFor();
      await shelf.getByText("This file is empty, so there is nothing to keep.").waitFor();
      await shelf.getByText("Files can be up to 1 MB here. For a larger file on your computer, tell your node where it is.").waitFor();
      assert.equal(await shelf.getByRole("button", { name: /^Retry uploading/ }).count(), 0, "uploading those again cannot help");
      await page.waitForFunction(() => document.querySelectorAll('[aria-label^="Attached files"] [role="progressbar"]').length === 0);
      assert.deepEqual([...state.uploads].sort(), ["analysis.ipynb", "clean.py", "photo.png"], "only what Ensemble keeps is uploaded");
      await page.getByText("3 files did not upload. Remove them to send.").first().waitFor();
      await fits("composer");
      await shelf.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
      await shot("composer", null);
    } catch (error) {
      if (shots) await page.screenshot({ path: `${shots}/files-failure-${width}.png` }).catch(() => undefined);
      console.error(`At ${width}px, ${page.url()}:`, { errors, unexpected: [...new Set(unexpected)] });
      throw error;
    }
    assert.deepEqual(errors, [], "no page errors");
    assert.deepEqual([...new Set(unexpected)], [], "no unmocked API calls");
    await context.close();
    console.log(`files ok at ${width}px`);
  }
} finally {
  await browser.close();
}
