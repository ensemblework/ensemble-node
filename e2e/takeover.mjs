/**
 * Local, stateful browser fixture for the remote view (Ensemble docs/35 §8.16.2): "Sign in here" on a
 * sign-in card opens the page from the owner's computer over this one, at phone and desktop widths. A
 * fake computer in this script opens the secret the page sealed for its key (node:crypto, as Ensemble's
 * computer does), streams encrypted JPEG frames that say which page they show (a sign-in popup), and
 * decrypts the page's input. Covered: the picture fitting the phone's width, the header naming the site
 * ("accounts.google.com — popup"), a tap or click as a fraction of the page, the box typing into the page
 * as it changes (a correction as Backspaces), Enter, Esc and Paste, a finger kept still pressing and
 * holding the mouse until it lifts (and the mouse held on a computer), a drag scrolling the page, a lost
 * connection (the view says so, frames resume and input sent meanwhile arrives once, in order), every
 * message numbered with the capability and nothing typed in the clear; then the view closing itself when
 * the card is settled ("Signed in — @lead is carrying on"), when the computer finished it, and I'm done.
 * Also the time left and "+15 min" (an older Ensemble without it), and a latency probe over a simulated
 * phone network with a computer drawing ten frames a second: each key posted at once with several on
 * their way, applied in order by the relay, and frames from the computer to their paint
 * (`NODE_LATENCY_LABEL` names the report; `before…` measures an older build's latency only).
 * Never points at a hosted account or calls a model. Usage is in docs/05 (Browser regression).
 */
import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");
const WEB = process.env.NODE_WEB ?? "http://localhost:3392";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(WEB).hostname), "Use an isolated local Node server.");
const shots = process.env.NODE_CHAT_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ["--no-sandbox"] });
const NOW = Date.now();
const at = (minutes) => new Date(NOW + minutes * 60_000).toISOString();
const SITE = "https://accounts.google.com";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

/** A real frame: a sign-in popup as the computer's clean browser would draw it. */
const painter = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await painter.setContent(`<body style="font:20px sans-serif;margin:40px;background:#fff"><h1>Sign in</h1><p>to continue to Ledger</p><input placeholder="Email or phone" style="display:block;font-size:20px;padding:10px;width:420px;margin:12px 0"><button style="margin-top:16px;font-size:20px">Next</button></body>`);
const JPEG = await painter.screenshot({ type: "jpeg", quality: 70 });
await painter.close();

function fixture() {
  const avatar = (color) => ({ shape: "orb", color, eyes: "dot" });
  const lead = { ownerId: "me", status: "active", charter: "", autonomy: {}, runProfileId: null, templateId: null, createdAt: at(-9000), provider: "ensemble", model: "gpt-5-mini", parentNodeId: null, id: "lead", slug: "lead", name: "Lead", role: "manager", avatar: avatar("#D7B56F") };
  const me = { id: "p-me", kind: "person", handle: "mira", accountId: "me", role: "owner", name: "Mira", responsibility: null, me: true };
  const room = { id: "dm-lead", title: "Lead", kind: "dm", members: [me, { id: "m-lead", kind: "node", handle: "lead", accountId: "me", lead: true, representative: true, node: lead }], createdBy: "me", lastSeq: 2, readSeq: 2, unread: 0, lastMessageAt: at(-2), pinned: [], invites: [], leadNodeIds: ["lead"], last: null };
  const card = { id: "c-login", roomId: "dm-lead", seq: 2, kind: "approval", body: `@lead needs you to sign in to ${SITE} on Studio.`, authorKind: "node", authorAccountId: "me", authorNodeId: "lead", data: { type: "login", purpose: "sign_in", status: "pending", loginId: "lg_0123456789abcdef0123456789abcdef", deviceId: "dev-1", computer: "Studio", origin: SITE, tab: "t2", reasons: ["it was sent to sign in at accounts.google.com"], saved: false, display: false, takeover: true, expiresAt: at(120) }, private: true, mentions: [], rootMessageId: null, clientId: null, planId: null, createdAt: at(-2) };
  const messages = [{ id: "u1", roomId: "dm-lead", seq: 1, kind: "text", body: "Sign in to Ledger with my Google account and get the invoices", authorKind: "person", authorAccountId: "me", authorNodeId: null, data: {}, private: false, mentions: [], rootMessageId: null, clientId: null, planId: null, createdAt: at(-3) }, card];
  const boot = { me: { id: "me", name: "Mira", email: "mira@fieldnote.example", verified: true }, nodes: [lead], rooms: [room], computers: [], credits: null, invites: [], templates: { nodes: [], crews: [] }, limits: { roomPeople: 10, nodesPerPerson: 3, crewNodes: 24, pins: 25, reactions: ["👍"], declineBlockDays: 30 }, models: { default: "gpt-5-mini", options: [] } };
  return { boot, messages, takeover: null, takeovers: new Map(), controllerSeen: [], failFrames: 0, failInputs: 0, aborted: { frames: 0, inputs: 0 }, live: null, minutes: 15, extended: [], extendMissing: false };
}

/** A new takeover on the fake computer. */
const newTakeover = () => ({ id: randomUUID(), keys: null, inputs: [], events: [], frameSeq: 0, ended: null, endedBy: null, applied: 0, early: new Map() });

/** The relay and the computer together (C1): input is applied in its numbers' order, whatever order it arrives in; a number at or below the last applied is refused. */
function applyInOrder(takeover, message, events, when) {
  if (message.seq <= takeover.applied) return;
  takeover.early.set(message.seq, events);
  while (takeover.early.has(takeover.applied + 1)) {
    takeover.applied += 1;
    const next = takeover.early.get(takeover.applied);
    takeover.early.delete(takeover.applied);
    takeover.events.push(...next.map((event) => ({ ...event, when, applied: Date.now() })));
  }
}
const percentile = (values, p) => (values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor((values.length - 1) * p))] : NaN);
const stats = (values) => ({ n: values.length, mean: Math.round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)), p50: percentile(values, 0.5), p95: percentile(values, 0.95), max: Math.max(...values) });

try {
  for (const width of [390, 1280]) {
    const state = fixture();
    const phone = width < 768;
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: phone, isMobile: phone, colorScheme: "dark", reducedMotion: "reduce", locale: "en-GB" });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(WEB).origin });
    await context.addInitScript(() => {
      // For the latency probe: when each key went down in a box, and when each picture was painted.
      window.__keys = [];
      window.__paints = [];
      // When the page posts each input message (its number), before any network or fixture overhead.
      window.__posts = [];
      const original = window.fetch;
      window.fetch = function (input, init) {
        try {
          const url = typeof input === "string" ? input : input.url;
          if (/\/takeovers\/[^/]+\/input$/.test(url) && typeof init?.body === "string") window.__posts.push({ seq: JSON.parse(init.body).seq, at: Date.now() });
        } catch {}
        return original.apply(this, arguments);
      };
      document.addEventListener("keydown", (event) => { if (event.target instanceof HTMLInputElement) window.__keys.push(Date.now()); }, true);
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (...args) {
        window.__paints.push(Date.now());
        return draw.apply(this, args);
      };
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
    const cardOf = () => state.messages.find((row) => row.id === "c-login");
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
      if (path === "/api/node/messages/c-login" && method === "GET") return json({ message: cardOf() });
      if (path === "/api/node/takeovers" && method === "POST") {
        assert.deepEqual(request.postDataJSON(), { loginCardId: "c-login" });
        state.takeover = newTakeover();
        state.takeovers.set(state.takeover.id, state.takeover);
        return json({ takeover: { id: state.takeover.id, computer: { id: "dev-1", name: "Studio" }, tab: "t2", origin: SITE, state: "created", startBy: at(2), endsAt: null, loginCardId: "c-login", sealKey }, controller: "cap-fixture" });
      }
      const call = /^\/api\/node\/takeovers\/([^/]+)\/(start|frames|input|end|extend)$/.exec(path);
      if (call) {
        // Each takeover by its own id: a view that closed may still end its own after a newer one opened.
        const takeover = state.takeovers.get(call[1]);
        assert.ok(takeover, "a takeover this page opened");
        state.controllerSeen.push(request.headers()["x-ensemble-takeover"]);
        if (call[2] === "start") {
          const { aad, plain } = openSealed(request.postDataJSON().sealed);
          assert.deepEqual([aad.purpose, aad.decisionId, aad.name, aad.deviceId, aad.origin], ["takeover", takeover.id, "t2", "dev-1", new URL(WEB).origin], "sealed for this takeover and tab");
          const secret = Buffer.from(plain.k, "base64url");
          takeover.keys = { d2w: channelKey(takeover.id, secret, "d2w"), w2d: channelKey(takeover.id, secret, "w2d") };
          takeover.endsAt = new Date(Date.now() + state.minutes * 60_000).toISOString();
          return json({ takeover: { id: takeover.id, computer: { id: "dev-1", name: "Studio" }, tab: "t2", origin: SITE, state: "live", startBy: at(2), endsAt: takeover.endsAt, loginCardId: "c-login", mode: "clean" }, width: 1280, height: 800 });
        }
        if (call[2] === "extend") {
          state.extended.push({ capability: request.headers()["x-ensemble-takeover"], body: request.postDataJSON() });
          // An older Ensemble has no such route.
          if (state.extendMissing) return route.fulfill({ status: 404, json: { message: `Route POST:${path} not found`, error: "Not Found", statusCode: 404 }, headers: cors });
          takeover.endsAt = new Date(Date.parse(takeover.endsAt) + 15 * 60_000).toISOString();
          return json({ takeover: { id: takeover.id, state: "live", endsAt: takeover.endsAt } });
        }
        if (call[2] === "frames") {
          if (state.failFrames > 0) {
            state.failFrames -= 1;
            state.aborted.frames += 1;
            return route.abort("internetdisconnected");
          }
          if (takeover.ended) return json({ state: "ended", reason: takeover.ended, frame: null });
          const after = Number(url.searchParams.get("after") ?? 0);
          const live = state.live;
          if (live) {
            // A computer drawing a frame every `every` ms, over a phone's network (`up` and `down` ms each way): the relay answers with the latest frame as soon as there is one newer than `after`.
            await sleep(live.up);
            const latest = () => live.base + Math.floor((Date.now() - live.start) / live.every);
            for (let waited = 0; latest() <= after && waited < 20_000 && !takeover.ended; waited += 2) await sleep(2);
            const seq = latest();
            takeover.frameSeq = Math.max(takeover.frameSeq, seq);
            const frame = seal(takeover.id, takeover.keys.d2w, seq, pack({ t: "frame", w: 1280, h: 800, url: `${SITE}/v3/signin/identifier?flowName=GlifWebSignIn`, title: "Sign in – Google Accounts", popup: true }, JPEG));
            await sleep(live.down);
            live.answered.push({ seq, made: live.start + (seq - live.base) * live.every, at: Date.now() });
            return json({ state: "live", frame });
          }
          if (after >= takeover.frameSeq) {
            await sleep(takeover.frameSeq ? 400 : 0);
            if (takeover.ended) return json({ state: "ended", reason: takeover.ended, frame: null });
            takeover.frameSeq += 1;
            return json({ state: "live", frame: seal(takeover.id, takeover.keys.d2w, takeover.frameSeq, pack({ t: "frame", w: 1280, h: 800, url: `${SITE}/v3/signin/identifier?flowName=GlifWebSignIn`, title: "Sign in – Google Accounts", popup: true }, JPEG)) });
          }
          return json({ state: "live", frame: null });
        }
        if (call[2] === "input") {
          const raw = request.postData() ?? "";
          if (state.failInputs > 0) {
            state.failInputs -= 1;
            state.aborted.inputs += 1;
            return route.abort("internetdisconnected");
          }
          const message = JSON.parse(raw);
          const probe = state.live;
          if (probe) {
            probe.active += 1;
            probe.maxActive = Math.max(probe.maxActive, probe.active);
            await sleep(probe.up);
          }
          takeover.inputs.push({ raw, seq: message.seq });
          const when = Date.now();
          const opened = open(takeover.id, takeover.keys.w2d, message).events;
          if (probe) probe.inputs.push({ seq: message.seq, at: when, chars: opened.filter((event) => event.t === "text").reduce((sum, event) => sum + Array.from(event.text).length, 0) });
          applyInOrder(takeover, message, opened, when);
          if (probe) {
            await sleep(probe.down);
            probe.active -= 1;
          }
          return json({ ok: true });
        }
        if (call[2] === "end") {
          const done = request.postDataJSON().done === true;
          takeover.endedBy = done ? "done" : "stopped";
          if (!takeover.ended) takeover.ended = takeover.endedBy;
          const card = cardOf();
          if (done && card.data.status === "pending") card.data = { ...card.data, status: "signed_in", via: "takeover", resolvedAt: at(0) };
          return json({ takeover: { id: takeover.id, state: "ended" }, signedIn: done ? true : null, card: done ? card : null });
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
      assert.fail(`no ${what} in ${JSON.stringify(state.takeover?.events.slice(-12))}`);
    };
    const events = () => state.takeover.events;
    const cdp = phone ? await context.newCDPSession(page) : null;
    const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y]) => ({ x, y, id: 1 })) });

    const openView = async () => {
      const card = page.locator("#m-c-login");
      await card.getByRole("button", { name: "Sign in here" }).click();
      const view = page.getByRole("dialog", { name: "Remote view: accounts.google.com on Studio" });
      await page.locator('[data-takeover="live"]').waitFor();
      await page.waitForFunction(() => (document.querySelector('[role="dialog"] canvas')?.width ?? 0) > 1000, null, { timeout: 15_000 });
      return view;
    };

    // The phone's view is opened with four minutes left, so "+15 min" shows; the desktop's talks to an older Ensemble without it.
    state.minutes = phone ? 4 : 4.5;
    state.extendMissing = !phone;
    await page.goto(`${WEB}/r/dm-lead`);
    const card = page.locator("#m-c-login");
    await card.getByText("@lead needs you to sign in to accounts.google.com").waitFor();
    const view = await openView();
    // Measuring an older build (`NODE_LATENCY_LABEL=before…`): only its latency.
    const older = (process.env.NODE_LATENCY_LABEL ?? "").startsWith("before");
    // The time left, ticking, and "+15 min" in the last five minutes.
    const timer = view.getByRole("timer");
    if (!older) {
      assert.match(await timer.innerText(), /^[34]:\d\d left$/);
      const more = view.getByRole("button", { name: "15 min" });
      await more.waitFor();
      if (shots) await page.screenshot({ path: `${shots}/remote-view-time-${width}.png` });
      await more.click();
      if (phone) {
        await page.waitForFunction(() => /^1[89]:\d\d left$/.test(document.querySelector('[role="dialog"] [role="timer"]')?.textContent?.trim() ?? ""), null, { timeout: 5000 });
        assert.equal(await more.count(), 0, "more than five minutes left again");
      } else {
        await view.getByText("This Ensemble cannot add time yet: open it again when it ends.").waitFor();
        assert.equal(await more.count(), 0, "an older server: no button that cannot work");
        assert.match(await timer.innerText(), /^[34]:\d\d left$/, "the time stays as it was");
      }
      assert.deepEqual(state.extended.map((row) => [row.capability, row.body]), [["cap-fixture", {}]], "asked once, with the capability");
    }
    const canvas = view.getByLabel("The page on Studio. Click, type and scroll here.");
    // The header names the site the picture shows, and that it is a popup.
    await view.getByText("accounts.google.com — popup").waitFor();
    assert.ok(await view.getByText("Sign in – Google Accounts · on Studio").isVisible());
    assert.ok(await view.getByText(/Encrypted between this browser and Studio/).isVisible());
    const box = await canvas.boundingBox();
    if (phone) assert.ok(box.width >= width - 2 && Math.abs(box.height - (box.width * 800) / 1280) < 3, `the picture fits the phone's width: ${JSON.stringify(box)}`);
    else assert.ok(Math.abs(box.width / box.height - 1.6) < 0.02, "the picture keeps its shape");
    assert.ok(await view.getByText(phone ? /Tap to click · drag to scroll · keep your finger down to press and hold/ : /Click, scroll and type on the page/).isVisible());
    if (shots) await page.screenshot({ path: `${shots}/remote-view-${width}.png` });

    // Latency over a phone's network (60 ms each way) with a computer drawing ten frames a second. Frames
    // alone first: from a frame drawn on the computer (and from the relay's answer) to its paint here, and
    // paints a second. Then typing 20 keys a second: from each key to its input reaching the relay, and to
    // its being applied in order.
    {
      const live = { up: 60, down: 60, every: 100, base: state.takeover.frameSeq + 1, start: Date.now(), answered: [], inputs: [], active: 0, maxActive: 0 };
      state.live = live;
      await sleep(1000);
      const paintsFrom = await page.evaluate(() => window.__paints.length);
      const framesFrom = Date.now();
      await sleep(3000);
      const framesUntil = Date.now();
      const paints = (await page.evaluate(() => window.__paints)).slice(paintsFrom).filter((time) => time <= framesUntil);
      const painted = paints.map((time) => live.answered.filter((frame) => frame.at <= time).at(-1)).map((frame, index) => frame && { answered: paints[index] - frame.at, made: paints[index] - frame.made }).filter(Boolean);
      const keysFrom = await page.evaluate(() => window.__keys.length);
      const from = Date.now();
      const words = "the quick brown fox jumps";
      const field = view.getByLabel("Type into the page");
      await field.pressSequentially(words, { delay: 50 });
      await waitFor(() => live.inputs.reduce((sum, row) => sum + row.chars, 0) >= words.length && events().filter((event) => event.t === "text" && event.when >= from).reduce((sum, event) => sum + Array.from(event.text).length, 0) >= words.length, "every key typed, applied");
      state.live = null;
      const keys = (await page.evaluate(() => window.__keys)).slice(keysFrom);
      const posts = await page.evaluate(() => window.__posts);
      const postedAt = (seq) => posts.find((row) => row.seq === seq)?.at ?? Number.NaN;
      const ordered = [...live.inputs].sort((a, b) => a.seq - b.seq);
      const posted = ordered.flatMap((row) => Array(row.chars).fill(postedAt(row.seq)));
      const arrived = ordered.flatMap((row) => Array(row.chars).fill(row.at));
      const applied = events().filter((event) => event.t === "text" && event.when >= from).flatMap((event) => Array(Array.from(event.text).length).fill(event.applied));
      const report = {
        width,
        keyToPost: stats(keys.slice(0, words.length).map((time, index) => posted[index] - time)),
        keyToInput: stats(keys.slice(0, words.length).map((time, index) => arrived[index] - time)),
        keyToApplied: stats(keys.slice(0, words.length).map((time, index) => applied[index] - time)),
        inputMessages: live.inputs.length,
        maxInFlight: live.maxActive,
        frameAnsweredToPaint: stats(painted.map((row) => row.answered)),
        frameMadeToPaint: stats(painted.map((row) => row.made)),
        paintsPerSecond: Math.round((paints.length / ((framesUntil - framesFrom) / 1000)) * 10) / 10,
      };
      console.log(`latency ${process.env.NODE_LATENCY_LABEL ?? ""} ${JSON.stringify(report)}`);
      if (shots) writeFileSync(`${shots}/latency-${process.env.NODE_LATENCY_LABEL ?? "run"}-${width}.json`, JSON.stringify(report, null, 2));
      if (!older) {
        // Each key goes at once (C1): never queued behind an answer, so no slower than the network and the fixture's own overhead.
        assert.ok(report.keyToPost.p95 <= 30, `each key is posted at once: ${JSON.stringify(report.keyToPost)}`);
        assert.ok(report.keyToInput.p95 <= 250, `and reaches the relay after the network alone: ${JSON.stringify(report.keyToInput)}`);
        assert.ok(report.maxInFlight >= 2, "several inputs on their way at once");
        assert.ok(report.frameMadeToPaint.p95 <= 250, `frames within about 200 ms: ${JSON.stringify(report.frameMadeToPaint)}`);
      }
      await field.fill("");
    }
    if (older) {
      await context.close();
      continue;
    }

    // A tap (a click on a computer) where the email field is: a fraction of the page.
    if (phone) await canvas.tap({ position: { x: box.width * 0.2, y: box.height * 0.2 } });
    else await canvas.click({ position: { x: box.width * 0.2, y: box.height * 0.2 } });
    await waitFor(() => events().some((event) => event.t === "mouse" && event.type === "up"), "a click");
    const click = events().find((event) => event.t === "mouse" && event.type === "down");
    assert.ok(Math.abs(click.x - 0.2) < 0.02 && Math.abs(click.y - 0.2) < 0.02, `the click at a fifth of the page: ${JSON.stringify(click)}`);

    // The box types into the page as it changes; a correction goes as Backspaces; Enter goes as a key and empties the box.
    const field = view.getByLabel("Type into the page");
    await field.fill("mira@fieldnote.exampel");
    await field.fill("mira@fieldnote.example");
    await field.press("Enter");
    await waitFor(() => events().some((event) => event.t === "key" && event.key === "Enter"), "Enter");
    const typed = events().filter((event) => event.t === "text" || (event.t === "key" && event.type === "down"));
    assert.deepEqual(typed.map((event) => (event.t === "text" ? event.text : event.key)).slice(-5), ["mira@fieldnote.exampel", "Backspace", "Backspace", "le", "Enter"]);
    assert.equal(await field.inputValue(), "", "the box starts afresh after Enter");
    await view.getByRole("button", { name: "Escape key" }).click();
    await waitFor(() => events().some((event) => event.t === "key" && event.key === "Escape"), "Escape");
    await page.evaluate(() => navigator.clipboard.writeText("pasted-CANARY-77")).catch(() => undefined);
    await view.getByRole("button", { name: "Paste" }).click();
    let pasted = false;
    for (let tries = 0; tries < 100 && !pasted; tries += 1) {
      pasted = events().some((event) => event.t === "text" && event.text === "pasted-CANARY-77") || (await view.getByText(/paste into the box instead|clipboard is empty/).isVisible());
      if (!pasted) await sleep(50);
    }
    assert.ok(pasted, "Paste sends the clipboard, or says how else");
    // Hidden, for a password: the box still types into the page.
    await view.getByRole("button", { name: "Hide what you type" }).click();
    assert.equal(await field.getAttribute("type"), "password");
    await field.fill("s3cret-CANARY");
    await waitFor(() => events().some((event) => event.t === "text" && event.text === "s3cret-CANARY"), "hidden typing");
    await view.getByRole("button", { name: "Show what you type" }).click();
    await field.fill("");

    // Press and hold ("Press and hold" human checks): the mouse goes down and stays down until the finger (or the button) lifts.
    const hold = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.6 };
    const before = events().length;
    if (phone) {
      await touch("touchStart", [[hold.x, hold.y]]);
      await page.locator("[data-remote-holding]").waitFor({ timeout: 3000 });
      await view.getByText("Holding: lift your finger to let go.").waitFor();
      if (shots) await page.screenshot({ path: `${shots}/remote-view-holding-${width}.png` });
      await sleep(900);
      await touch("touchEnd", []);
    } else {
      await page.mouse.move(hold.x, hold.y);
      await page.mouse.down();
      await sleep(1200);
      await page.mouse.up();
    }
    await waitFor(() => events().slice(before).some((event) => event.t === "mouse" && event.type === "up"), "the mouse let go");
    const held = events().slice(before).filter((event) => event.t === "mouse" && event.type !== "move");
    assert.deepEqual(held.map((event) => event.type), ["down", "up"], "one press, held, then let go");
    assert.ok(held[1].when - held[0].when >= 700, `held for as long as the finger was down: ${held[1].when - held[0].when} ms`);
    assert.ok(Math.abs(held[0].y - 0.6) < 0.02, "where the finger was");
    if (phone) {
      // A drag scrolls the page by as much as the finger moved over the picture.
      const from = events().length;
      await touch("touchStart", [[hold.x, hold.y]]);
      await touch("touchMove", [[hold.x, hold.y - 40]]);
      await touch("touchMove", [[hold.x, hold.y - 100]]);
      await touch("touchEnd", []);
      const scrolled = () => events().slice(from).filter((event) => event.t === "wheel").reduce((sum, event) => sum + event.dy, 0);
      const expected = 100 * (1280 / box.width);
      await waitFor(() => scrolled() >= expected - 40, "the whole scroll");
      await sleep(300);
      assert.ok(Math.abs(scrolled() - expected) < 40, `scrolled ${scrolled()} page pixels for 100 on screen`);
      assert.equal(events().slice(from).filter((event) => event.t === "mouse" && event.type === "down").length, 0, "a drag is not a click");
    }

    // The connection drops: the view says so, then frames come back and what was typed meanwhile arrives once, in order.
    state.failFrames = 3;
    state.failInputs = 1;
    await page.locator('[data-takeover="reconnecting"]').waitFor({ timeout: 15_000 });
    await view.getByText("Connection lost: reconnecting…").waitFor();
    if (shots) await page.screenshot({ path: `${shots}/remote-view-reconnecting-${width}.png` });
    await field.fill("after-outage");
    await page.locator('[data-takeover="live"]').waitFor({ timeout: 20_000 });
    await waitFor(() => events().some((event) => event.t === "text" && event.text === "after-outage"), "input sent during the outage");
    assert.ok(state.aborted.inputs >= 1 && state.aborted.frames >= 3, "the outage happened");
    await field.fill("");
    // Several on their way at once may arrive in any order: numbered from 1 with none missing, and applied in that order.
    const seqs = [...new Set(state.takeover.inputs.map((row) => row.seq))].sort((a, b) => a - b);
    assert.deepEqual(seqs, seqs.map((_, index) => index + 1), "numbered in order, none missing");
    assert.equal(state.takeover.applied, seqs.length, "every message applied, in order");
    assert.ok(state.takeover.inputs.every((row) => !row.raw.includes("mira@fieldnote") && !row.raw.includes("CANARY") && !row.raw.includes("after-outage")), "nothing typed in the clear");
    assert.ok(state.controllerSeen.length >= 5 && state.controllerSeen.every((value) => value === "cap-fixture"), "every call carries the capability");

    if (phone) {
      // Signed in by the owner on the page: the computer sees it through and the card is settled; the view says so and closes itself.
      const settled = cardOf();
      settled.data = { ...settled.data, status: "signed_in", via: "takeover", resolvedAt: at(0) };
      await emit("node.message.updated", settled);
      await view.getByText("Signed in — @lead is carrying on").waitFor();
      assert.ok(await view.getByText("accounts.google.com — popup").isVisible(), "the same view, still naming its page");
      assert.equal(await view.getByRole("button", { name: "I'm done" }).isDisabled(), true, "nothing more to do there");
      assert.equal(await view.getByLabel("Type into the page").isDisabled(), true);
      if (shots) await page.screenshot({ path: `${shots}/remote-view-signed-in-${width}.png` });
      await view.waitFor({ state: "detached", timeout: 5000 });
      await card.getByRole("button", { name: "Signed in to accounts.google.com" }).waitFor();
      await waitFor(() => state.takeover.endedBy !== null, "the view's end");
      assert.equal(state.takeovers.size, 1, "settling the card never opens the page again");
    } else {
      // The computer finished it itself (signed in, seen through): the view reads the card again and closes itself.
      state.takeover.ended = "signed_in";
      cardOf().data = { ...cardOf().data, status: "signed_in", via: "takeover", resolvedAt: at(0) };
      await view.getByText("Signed in — @lead is carrying on").waitFor({ timeout: 10_000 });
      await view.waitFor({ state: "detached", timeout: 5000 });
      await card.getByRole("button", { name: "Signed in to accounts.google.com" }).waitFor();
      assert.equal(state.takeovers.size, 1, "settling the card never opens the page again");
      // A new card, done with I'm done.
      state.messages = fixture().messages;
      await page.reload();
      await card.getByText("@lead needs you to sign in to accounts.google.com").waitFor();
      const again = await openView();
      await again.getByRole("button", { name: "I'm done" }).click();
      await again.waitFor({ state: "detached" });
      assert.equal(state.takeover.endedBy, "done");
      await card.getByRole("button", { name: "Signed in to accounts.google.com" }).click();
      await card.getByText(/Signed in to https:\/\/accounts\.google\.com on Studio from the remote view/).waitFor();
    }
    if (shots) await page.screenshot({ path: `${shots}/remote-view-done-${width}.png` });

    assert.deepEqual(errors, [], "no page errors");
    assert.deepEqual([...new Set(unexpected)], [], "no unmocked API calls");
    await context.close();
    console.log(`remote view ok at ${width}px`);
  }
  console.log("takeover fixture: ok");
} finally {
  await browser.close();
}
