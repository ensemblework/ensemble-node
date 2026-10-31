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
 * Never points at a hosted account or calls a model. Usage is in docs/05 (Browser regression).
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
  return { boot, messages, takeover: null, takeovers: new Map(), controllerSeen: [], failFrames: 0, failInputs: 0, aborted: { frames: 0, inputs: 0 } };
}

/** A new takeover on the fake computer. */
const newTakeover = () => ({ id: randomUUID(), keys: null, inputs: [], events: [], frameSeq: 0, ended: null, endedBy: null });

try {
  for (const width of [390, 1280]) {
    const state = fixture();
    const phone = width < 768;
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: phone, isMobile: phone, colorScheme: "dark", reducedMotion: "reduce", locale: "en-GB" });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(WEB).origin });
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
      const call = /^\/api\/node\/takeovers\/([^/]+)\/(start|frames|input|end)$/.exec(path);
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
          return json({ takeover: { id: takeover.id, computer: { id: "dev-1", name: "Studio" }, tab: "t2", origin: SITE, state: "live", startBy: at(2), endsAt: at(15), loginCardId: "c-login" }, width: 1280, height: 800 });
        }
        if (call[2] === "frames") {
          if (state.failFrames > 0) {
            state.failFrames -= 1;
            state.aborted.frames += 1;
            return route.abort("internetdisconnected");
          }
          if (takeover.ended) return json({ state: "ended", reason: takeover.ended, frame: null });
          const after = Number(url.searchParams.get("after") ?? 0);
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
          takeover.inputs.push({ raw, seq: message.seq });
          const when = Date.now();
          takeover.events.push(...open(takeover.id, takeover.keys.w2d, message).events.map((event) => ({ ...event, when })));
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

    await page.goto(`${WEB}/r/dm-lead`);
    const card = page.locator("#m-c-login");
    await card.getByText("@lead needs you to sign in to accounts.google.com").waitFor();
    const view = await openView();
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
    const seqs = state.takeover.inputs.map((row) => row.seq);
    assert.deepEqual(seqs, seqs.map((_, index) => index + 1), "numbered in order, each once");
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
