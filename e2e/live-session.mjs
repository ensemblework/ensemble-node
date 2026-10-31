/**
 * Local, stateful browser fixture for live sessions (Ensemble docs/35, live sessions; contract C3): a
 * node's terminal and browser on the owner's computer, on cards only the owner sees, at phone and
 * desktop widths. A fake computer in this script opens the secret the page sealed for its key
 * (node:crypto, as Ensemble's computer does) and runs a tiny shell: it sends terminal screens (runs of
 * coloured cells and the cursor) and takes keys (`tty`, `tty-key`, `tty-size`). Covered: the cards
 * ("Live terminal on Studio", "Live browser: …"), Open (`{liveCardId}`), the screen drawn with its
 * colours and cursor, keys typed on it (desktop) or in the box with the key bar (phone), Ctrl+C,
 * arrows, Fit to this screen, the time left; a live browser watched (input ignored), Take control
 * (`/control {on: true}`), typing, Hand back; the session ending folds its card into a checkpoint.
 * Nothing typed travels in the clear. Never points at a hosted account or calls a model. Usage is in
 * docs/05 (Browser regression).
 */
import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");
const WEB = process.env.NODE_WEB ?? "http://localhost:3392";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(WEB).hostname), "Use an isolated local Node server.");
const shots = process.env.NODE_CHAT_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ["--no-sandbox"] });
const NOW = Date.now();
const at = (minutes) => new Date(NOW + minutes * 60_000).toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PROMPT = [{ t: "mira@studio", fg: "green", b: 1 }, { t: ":" }, { t: "~/work", fg: "#6ea8e6" }, { t: "$ " }];

/** The fake computer's key, and its side of the channel (hub-api src/takeover/channel.ts). */
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const spki = publicKey.export({ type: "spki", format: "der" });
const kid = createHash("sha256").update(spki).digest("hex").slice(0, 16);
const sealKey = { kid, alg: "ECDH-P256+HKDF-SHA256+A256GCM", spki: spki.toString("base64url"), fingerprint: kid.toUpperCase().match(/.{4}/g).join(" ") };
function openSealed(box) {
  const epk = Buffer.from(box.epk, "base64url");
  const shared = diffieHellman({ privateKey, publicKey: createPublicKey({ key: { kty: "EC", crv: "P-256", x: epk.subarray(1, 33).toString("base64url"), y: epk.subarray(33).toString("base64url") }, format: "jwk" }) });
  const key = Buffer.from(hkdfSync("sha256", shared, epk, Buffer.from(`ensemble-seal-v1|${kid}`), 32));
  const ct = Buffer.from(box.ct, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(box.iv, "base64url"));
  decipher.setAAD(Buffer.from(box.aad, "base64url"));
  decipher.setAuthTag(ct.subarray(ct.length - 16));
  return { aad: JSON.parse(Buffer.from(box.aad, "base64url").toString("utf8")), plain: JSON.parse(Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]).toString("utf8")) };
}
const channelKey = (id, secret, direction) => Buffer.from(hkdfSync("sha256", secret, Buffer.from(`ensemble-takeover-v1|${id}`), Buffer.from(`ensemble-takeover-v1|${direction}`), 32));
const aadOf = (id, direction, seq) => Buffer.from(JSON.stringify({ v: 1, t: id, d: direction, s: seq }));
function seal(id, key, seq, plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aadOf(id, "d2w", seq));
  return { seq, iv: iv.toString("base64url"), ct: Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]).toString("base64url") };
}
function open(id, key, message) {
  const ct = Buffer.from(message.ct, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(message.iv, "base64url"));
  decipher.setAAD(aadOf(id, "w2d", message.seq));
  decipher.setAuthTag(ct.subarray(ct.length - 16));
  return JSON.parse(Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]).toString("utf8"));
}
function pack(header, payload) {
  const head = Buffer.from(JSON.stringify(header));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(head.length);
  return Buffer.concat([length, head, payload]);
}

/** A browser frame: a pricing page, as the node's browser would draw it. */
const painter = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await painter.setContent(`<body style="font:20px sans-serif;margin:40px;background:#fff"><h1>Pricing</h1><p>Team plan · $12 per seat</p><button style="font-size:20px">Start trial</button></body>`);
const JPEG = await painter.screenshot({ type: "jpeg", quality: 70 });
await painter.close();

/** A tiny shell: lines of runs, a line being typed, the cursor, and what each key does. */
function newShell() {
  const shell = {
    cols: 80,
    rows: 24,
    lines: [[{ t: "Last login: Sat Oct 31 12:00 on ttys001", dim: 1 }], [...PROMPT]],
    typed: "",
    seq: 1,
    keys: [],
    sizes: [],
    screen() {
      const lines = shell.lines.slice(-shell.rows).map((line, index, all) => (index === all.length - 1 ? [...line, ...(shell.typed ? [{ t: shell.typed }] : [])] : line));
      const last = lines.length - 1;
      const x = lines[last].reduce((sum, run) => sum + Array.from(run.t).length, 0);
      return { header: { t: "frame", kind: "terminal", cols: shell.cols, rows: shell.rows, cursor: { x, y: last }, title: "zsh — ~/work" }, payload: Buffer.from(JSON.stringify({ rows: lines })) };
    },
    input(event) {
      shell.keys.push(event);
      if (event.t === "tty") shell.typed += event.text;
      else if (event.t === "tty-size") {
        shell.sizes.push([event.cols, event.rows]);
        shell.cols = event.cols;
        shell.rows = event.rows;
      } else if (event.t === "tty-key") {
        if (event.key === "Backspace") shell.typed = Array.from(shell.typed).slice(0, -1).join("");
        else if (event.key === "Enter") {
          const command = shell.typed.trim();
          shell.lines[shell.lines.length - 1] = [...PROMPT, { t: shell.typed }];
          shell.typed = "";
          if (command === "ls") shell.lines.push([{ t: "README.md", fg: "white" }, { t: "  " }, { t: "src", fg: "brightBlue", b: 1 }]);
          else if (command) shell.lines.push([{ t: `zsh: command not found: ${command}`, fg: "red" }]);
          shell.lines.push([...PROMPT]);
        } else if (event.key === "Ctrl+C") {
          shell.lines[shell.lines.length - 1] = [...PROMPT, { t: `${shell.typed}^C` }];
          shell.typed = "";
          shell.lines.push([...PROMPT]);
        }
      }
      shell.seq += 1;
    },
  };
  return shell;
}

function fixture() {
  const avatar = (color) => ({ shape: "orb", color, eyes: "dot" });
  const lead = { ownerId: "me", status: "active", charter: "", autonomy: {}, runProfileId: null, templateId: null, createdAt: at(-9000), provider: "ensemble", model: "gpt-5-mini", parentNodeId: null, id: "lead", slug: "lead", name: "Lead", role: "manager", avatar: avatar("#D7B56F") };
  const me = { id: "p-me", kind: "person", handle: "mira", accountId: "me", role: "owner", name: "Mira", responsibility: null, me: true };
  const room = { id: "dm-lead", title: "Lead", kind: "dm", members: [me, { id: "m-lead", kind: "node", handle: "lead", accountId: "me", lead: true, representative: true, node: lead }], createdBy: "me", lastSeq: 4, readSeq: 4, unread: 0, lastMessageAt: at(-1), pinned: [], invites: [], leadNodeIds: ["lead"], last: null };
  const message = (id, seq, authorKind, body, data = {}, minutes = -5) => ({ id, roomId: "dm-lead", seq, kind: "text", body, authorKind, authorAccountId: "me", authorNodeId: authorKind === "node" ? "lead" : null, data, private: authorKind === "node" && Boolean(data.type), mentions: [], rootMessageId: null, clientId: null, planId: null, createdAt: at(minutes) });
  const messages = [
    message("u1", 1, "person", "Show me the terminal you build in, and the pricing page you're on", {}, -6),
    message("n1", 2, "node", "Here they are: you can watch both live.", {}, -5),
    message("c-term", 3, "node", "Live terminal on Studio", { type: "live", kind: "terminal", status: "open", liveId: "live-1", deviceId: "dev-1", computer: "Studio", title: "zsh", session: "pty-1", startedAt: at(-5) }, -4),
    message("c-web", 4, "node", "Live browser: Pricing — Fieldnote", { type: "live", kind: "browser", status: "open", liveId: "live-2", deviceId: "dev-1", computer: "Studio", title: "Pricing — Fieldnote", tab: "t7", startedAt: at(-3) }, -3),
  ];
  const boot = { me: { id: "me", name: "Mira", email: "mira@fieldnote.example", verified: true }, nodes: [lead], rooms: [room], computers: [], credits: null, invites: [], templates: { nodes: [], crews: [] }, limits: { roomPeople: 10, nodesPerPerson: 3, crewNodes: 24, pins: 25, reactions: ["👍"], declineBlockDays: 30 }, models: { default: "gpt-5-mini", options: [] } };
  return { boot, messages, takeovers: new Map(), created: [], controls: [], ended: [] };
}

try {
  for (const width of [390, 1280]) {
    const state = fixture();
    const phone = width < 768;
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: phone, isMobile: phone, colorScheme: "dark", reducedMotion: "reduce", locale: "en-GB" });
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
    const cardOf = (id) => state.messages.find((row) => row.id === id);
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      const json = (data, status = 200) => route.fulfill({ status, json: data, headers: cors });
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-methods": "GET, POST, PATCH, DELETE", "access-control-allow-headers": "content-type, accept, x-ensemble-takeover" } });
      if (path === "/api/auth/me") return json({ user: state.boot.me });
      if (path === "/api/node/bootstrap") return json(state.boot);
      if (path === "/api/node/activity") return json({ approvals: [], runs: [], turns: [], computers: [], credits: null, waitingTasks: [] });
      if (path === "/api/decisions") return json({ decisions: [] });
      if (path === "/api/approvals") return json({ approvals: [] });
      if (path === "/api/devices") return json({ devices: [] });
      if (path === "/api/documents") return json({ files: [], usage: { maxFileBytes: 25000000 } });
      if (/^\/api\/node\/rooms\/dm-lead\/read$/.test(path)) return json({});
      if (path === "/api/node/rooms/dm-lead/messages" && method === "GET") return json({ messages: state.messages });
      if (path === "/api/node/takeovers" && method === "POST") {
        const body = request.postDataJSON();
        state.created.push(body);
        const card = cardOf(body.liveCardId);
        assert.ok(card?.data.type === "live", "a live card");
        const terminal = card.data.kind === "terminal";
        const takeover = { id: randomUUID(), kind: terminal ? "terminal" : "browser", mode: "watch", tab: terminal ? card.data.session : card.data.tab, keys: null, inputs: [], events: [], shell: terminal ? newShell() : null, frameSeq: 0, ended: null, endsAt: at(15) };
        state.takeovers.set(takeover.id, takeover);
        state.current = takeover;
        return json({ takeover: { id: takeover.id, computer: { id: "dev-1", name: "Studio" }, tab: takeover.tab, origin: terminal ? "terminal://pty-1" : "https://fieldnote.example", state: "created", startBy: at(2), endsAt: null, loginCardId: null, kind: takeover.kind, mode: "watch", sealKey }, controller: "cap-live" });
      }
      const call = /^\/api\/node\/takeovers\/([^/]+)\/(start|frames|input|end|control|extend)$/.exec(path);
      if (call) {
        const takeover = state.takeovers.get(call[1]);
        assert.ok(takeover, "a takeover this page opened");
        assert.equal(request.headers()["x-ensemble-takeover"], "cap-live", "every call carries the capability");
        const info = () => ({ id: takeover.id, computer: { id: "dev-1", name: "Studio" }, tab: takeover.tab, origin: "", state: takeover.ended ? "ended" : "live", startBy: at(2), endsAt: takeover.endsAt, loginCardId: null, kind: takeover.kind, mode: takeover.mode });
        if (call[2] === "start") {
          const { aad, plain } = openSealed(request.postDataJSON().sealed);
          assert.deepEqual([aad.purpose, aad.decisionId, aad.name, aad.deviceId], ["takeover", takeover.id, takeover.tab, "dev-1"], "sealed for this takeover");
          const secret = Buffer.from(plain.k, "base64url");
          takeover.keys = { d2w: channelKey(takeover.id, secret, "d2w"), w2d: channelKey(takeover.id, secret, "w2d") };
          return json({ takeover: info() });
        }
        if (call[2] === "frames") {
          const after = Number(url.searchParams.get("after") ?? 0);
          if (takeover.shell) {
            // A screen as soon as it changed (the computer sends the latest only), else nothing after a while.
            for (let waited = 0; takeover.shell.seq <= after && waited < 2000 && !takeover.ended; waited += 10) await sleep(10);
            if (takeover.ended) return json({ state: "ended", reason: takeover.ended, frame: null });
            if (takeover.shell.seq <= after) return json({ state: "live", frame: null });
            const { header, payload } = takeover.shell.screen();
            return json({ state: "live", frame: seal(takeover.id, takeover.keys.d2w, takeover.shell.seq, pack(header, payload)) });
          }
          if (takeover.ended) return json({ state: "ended", reason: takeover.ended, frame: null });
          if (after >= takeover.frameSeq) await sleep(takeover.frameSeq ? 300 : 0);
          takeover.frameSeq = Math.max(takeover.frameSeq, after) + 1;
          return json({ state: "live", frame: seal(takeover.id, takeover.keys.d2w, takeover.frameSeq, pack({ t: "frame", w: 1280, h: 800, url: "https://fieldnote.example/pricing", title: "Pricing — Fieldnote", popup: false }, JPEG)) });
        }
        if (call[2] === "input") {
          const raw = request.postData() ?? "";
          const message = JSON.parse(raw);
          takeover.inputs.push({ raw, seq: message.seq });
          const events = open(takeover.id, takeover.keys.w2d, message).events;
          takeover.events.push(...events);
          for (const event of events) if (takeover.shell && event.t.startsWith("tty")) takeover.shell.input(event);
          return json({ ok: true });
        }
        if (call[2] === "control") {
          const on = request.postDataJSON().on === true;
          state.controls.push(on);
          takeover.mode = on ? "control" : "watch";
          return json({ takeover: info() });
        }
        if (call[2] === "extend") return json({ takeover: info() });
        if (call[2] === "end") {
          state.ended.push(request.postDataJSON());
          takeover.ended = "stopped";
          return json({ takeover: info(), signedIn: null, card: null });
        }
      }
      unexpected.push(`${method} ${path}`);
      return route.fulfill({ status: 404, json: { error: `Unmocked API: ${path}` }, headers: cors });
    });
    const waitFor = async (check, what) => {
      for (let tries = 0; tries < 160; tries += 1) {
        if (check()) return;
        await sleep(50);
      }
      assert.fail(`no ${what}`);
    };
    const fits = async () => assert.equal(await page.locator("main").evaluate((el) => el.scrollWidth <= el.clientWidth + 2), true, `${width}px fits`);

    // The cards: what each shows, where, that only I see them, and Open.
    await page.goto(`${WEB}/r/dm-lead`);
    const termCard = page.locator("#m-c-term");
    await termCard.getByText("Live terminal on Studio").waitFor();
    assert.ok(await termCard.getByText("only you", { exact: true }).isVisible(), "owner only");
    assert.ok(await termCard.getByText("Live", { exact: true }).isVisible());
    assert.ok(await termCard.getByText(/@lead works in this terminal\. Watch it live, and type in it too: it is your shell\./).isVisible());
    const webCard = page.locator("#m-c-web");
    assert.ok(await webCard.getByText("Live browser: Pricing — Fieldnote").isVisible());
    assert.ok(await webCard.getByText(/Take control to click and type: @lead waits on that tab until you hand it back\./).isVisible());
    await fits();
    if (shots) await page.screenshot({ path: `${shots}/live-cards-${width}.png` });

    // The terminal, live: its screen with colours and the cursor, the time left.
    await termCard.getByRole("button", { name: "Open" }).click();
    const terminal = page.getByRole("dialog", { name: "Live terminal on Studio" });
    await terminal.waitFor();
    assert.deepEqual(state.created.at(-1), { liveCardId: "c-term" });
    const screen = terminal.locator("[data-terminal-screen]");
    await page.waitForFunction(() => document.querySelector("[data-terminal-screen]")?.getAttribute("data-terminal-screen") === "80x24");
    await terminal.locator("[data-terminal-text]").filter({ hasText: "mira@studio:~/work$" }).waitFor();
    assert.ok(await terminal.getByText("zsh — ~/work · on Studio").isVisible(), "the shell's title");
    const promptColour = await terminal.locator("span", { hasText: /^mira@studio$/ }).first().evaluate((element) => [getComputedStyle(element).color, getComputedStyle(element).fontWeight]);
    assert.deepEqual(promptColour, ["rgb(124, 198, 143)", "700"], "green and bold, as the shell drew it");
    assert.equal(await terminal.locator("[data-terminal-cursor]").count(), 1, "one cursor");
    assert.match(await terminal.getByRole("timer").innerText(), /^1[45]:\d\d left$/);
    assert.equal(await page.locator('[data-takeover-kind="terminal"]').count(), 1);
    const shell = () => state.current.shell;
    if (phone) {
      // A phone: the box types into the shell as you type; the key bar has what its keyboard has not.
      const box = terminal.getByLabel("Type into the terminal");
      await box.fill("lss");
      await box.press("Backspace");
      await terminal.getByRole("button", { name: "Enter key" }).click();
      await waitFor(() => shell().lines.some((line) => line.some((run) => run.t === "README.md")), "ls ran");
      assert.equal(await box.inputValue(), "", "the box starts afresh after Enter");
      await terminal.locator("[data-terminal-text]").filter({ hasText: "README.md  src" }).waitFor();
      await terminal.getByRole("button", { name: "Up arrow" }).click();
      await terminal.getByRole("button", { name: "Control C" }).click();
      await terminal.getByRole("button", { name: "Escape key" }).click();
      await terminal.getByRole("button", { name: "Tab key" }).click();
      await waitFor(() => shell().keys.some((event) => event.key === "Tab"), "Tab");
      assert.deepEqual(shell().keys.filter((event) => event.t === "tty-key").map((event) => event.key), ["Backspace", "Enter", "Up", "Ctrl+C", "Escape", "Tab"]);
      assert.equal(shell().keys.filter((event) => event.t === "tty").map((event) => event.text).join(""), "lss");
    } else {
      // A computer: keys typed on the terminal itself, Ctrl+C by name, a paste.
      await screen.click();
      await page.keyboard.type("ls");
      await page.keyboard.press("Enter");
      await waitFor(() => shell().lines.some((line) => line.some((run) => run.t === "README.md")), "ls ran");
      await terminal.locator("[data-terminal-text]").filter({ hasText: "README.md  src" }).waitFor();
      const src = await terminal.locator("span", { hasText: /^src$/ }).first().evaluate((element) => getComputedStyle(element).color);
      assert.equal(src, "rgb(147, 194, 245)", "bright blue");
      await page.keyboard.type("sleep 100");
      await page.keyboard.press("Control+c");
      await page.keyboard.press("ArrowUp");
      await waitFor(() => shell().keys.some((event) => event.key === "Up"), "the arrow");
      assert.deepEqual(shell().keys.filter((event) => event.t === "tty-key").map((event) => event.key), ["Enter", "Ctrl+C", "Up"]);
      assert.equal(shell().keys.filter((event) => event.t === "tty").map((event) => event.text).join(""), "lssleep 100");
      await terminal.locator("[data-terminal-text]").filter({ hasText: "sleep 100^C" }).waitFor();
    }
    // Fit to this screen: as many columns and rows as fit here.
    await terminal.getByRole("button", { name: "Fit to this screen" }).click();
    await waitFor(() => shell().sizes.length === 1, "a new size");
    const [cols, rows] = shell().sizes[0];
    assert.ok(phone ? cols >= 30 && cols <= 60 : cols >= 120, `columns for ${width}px: ${cols}`);
    assert.ok(rows >= 10, `rows: ${rows}`);
    await page.waitForFunction((size) => document.querySelector("[data-terminal-screen]")?.getAttribute("data-terminal-screen") === size, `${cols}x${rows}`);
    const tooWide = await screen.evaluate((element) => element.scrollWidth > element.clientWidth + 2);
    assert.equal(tooWide, false, "fitted: the whole width shows");
    assert.ok(state.current.inputs.every((row) => !row.raw.includes("sleep") && !row.raw.includes("lss")), "nothing typed in the clear");
    if (shots) await page.screenshot({ path: `${shots}/live-terminal-${width}.png` });
    await terminal.getByRole("button", { name: "Close" }).last().click();
    await terminal.waitFor({ state: "detached" });
    assert.deepEqual(state.ended.at(-1), { done: false });

    // The browser, watched: the node keeps it; clicks and keys go nowhere until Take control.
    await webCard.getByRole("button", { name: "Open" }).click();
    const web = page.getByRole("dialog", { name: "Live browser: Pricing — Fieldnote on Studio" });
    await web.waitFor();
    await page.waitForFunction(() => (document.querySelector('[role="dialog"] canvas')?.width ?? 0) > 1000, null, { timeout: 15_000 });
    assert.equal(await page.locator('[data-takeover-mode="watch"]').count(), 1);
    await web.getByText("Watching live. Take control to click and type.").waitFor();
    assert.equal(await web.getByLabel("Type into the page").count(), 0, "no box while watching");
    const canvas = web.getByLabel("The page on Studio. Click, type and scroll here.");
    const box = await canvas.boundingBox();
    if (phone) await canvas.tap({ position: { x: box.width * 0.3, y: box.height * 0.3 } });
    else await canvas.click({ position: { x: box.width * 0.3, y: box.height * 0.3 } });
    await sleep(400);
    assert.equal(state.current.events.filter((event) => event.t !== "ping").length, 0, "watching sends nothing");
    if (shots) await page.screenshot({ path: `${shots}/live-browser-watch-${width}.png` });
    await web.getByRole("button", { name: "Take control" }).click();
    await page.locator('[data-takeover-mode="control"]').waitFor();
    assert.deepEqual(state.controls, [true]);
    await web.getByText(/The node waits on this tab until you hand it back\./).waitFor();
    const field = web.getByLabel("Type into the page");
    await field.fill("team plan");
    await waitFor(() => state.current.events.some((event) => event.t === "text" && event.text === "team plan"), "typing in control");
    if (phone) await canvas.tap({ position: { x: box.width * 0.3, y: box.height * 0.3 } });
    else await canvas.click({ position: { x: box.width * 0.3, y: box.height * 0.3 } });
    await waitFor(() => state.current.events.some((event) => event.t === "mouse" && event.type === "up"), "a click in control");
    if (shots) await page.screenshot({ path: `${shots}/live-browser-control-${width}.png` });
    await web.getByRole("button", { name: "Hand back" }).click();
    await page.locator('[data-takeover-mode="watch"]').waitFor();
    assert.deepEqual(state.controls, [true, false]);
    await web.getByRole("button", { name: "Close" }).last().click();
    await web.waitFor({ state: "detached" });

    // The terminal closed on the computer: its card says so and folds into a checkpoint.
    const ended = cardOf("c-term");
    ended.data = { ...ended.data, status: "ended", endedAt: at(0) };
    await emit("node.message.updated", ended);
    const chip = termCard.getByRole("button", { name: "Live terminal on Studio ended" });
    await chip.waitFor();
    await chip.click();
    await termCard.getByText("The terminal on Studio is closed.").waitFor();
    assert.equal(await termCard.getByRole("button", { name: "Open" }).count(), 0, "nothing to open");
    await fits();
    if (shots) await page.screenshot({ path: `${shots}/live-ended-${width}.png` });

    assert.deepEqual(errors, [], "no page errors");
    assert.deepEqual([...new Set(unexpected)], [], "no unmocked API calls");
    await context.close();
    console.log(`live sessions ok at ${width}px`);
  }
  console.log("live sessions fixture: ok");
} finally {
  await browser.close();
}
