/**
 * Local, stateful browser fixture for taking over a tab from the web (Ensemble docs/35 §8.16.2): a
 * sign-in card on a computer without a screen offers "Open the browser"; the view opens over the page
 * at phone and desktop widths. A fake computer in this script opens the secret the page sealed for its
 * key (node:crypto, as Ensemble's computer does), sends encrypted JPEG frames of a sign-in page, and
 * decrypts the page's input: clicks and taps as fractions of the page, keys, the phone text box and
 * Paste, each message numbered in order with the capability and nothing typed in the clear. I'm done
 * closes the view and the card reads signed in. Never points at a hosted account or calls a model.
 * Usage is in docs/05 (Browser regression).
 */
import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");
const WEB = process.env.NODE_WEB ?? "http://localhost:3392";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(WEB).hostname), "Use an isolated local Node server.");
const shots = process.env.NODE_CHAT_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ["--no-sandbox"] });
const NOW = Date.now();
const at = (minutes) => new Date(NOW + minutes * 60_000).toISOString();
const SITE = "https://bank.example.com";
const TAKEOVER = "7d1e2f30-4a5b-4c6d-8e9f-0a1b2c3d4e5f";

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
const channelKey = (secret, direction) => Buffer.from(hkdfSync("sha256", secret, Buffer.from(`ensemble-takeover-v1|${TAKEOVER}`), Buffer.from(`ensemble-takeover-v1|${direction}`), 32));
const aadOf = (direction, seq) => Buffer.from(JSON.stringify({ v: 1, t: TAKEOVER, d: direction, s: seq }));
function seal(key, seq, plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aadOf("d2w", seq));
  return { seq, iv: iv.toString("base64url"), ct: Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]).toString("base64url") };
}
function open(key, message) {
  const ct = Buffer.from(message.ct, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(message.iv, "base64url"));
  decipher.setAAD(aadOf("w2d", message.seq));
  decipher.setAuthTag(ct.subarray(ct.length - 16));
  return JSON.parse(Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]).toString("utf8"));
}
function pack(header, payload) {
  const head = Buffer.from(JSON.stringify(header));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(head.length);
  return Buffer.concat([length, head, payload]);
}

/** A real frame: a sign-in page as the computer's browser would draw it. */
const painter = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await painter.setContent(`<body style="font:20px sans-serif;margin:40px;background:#fff"><h1>Sign in to the bank</h1><input placeholder="Email" style="display:block;font-size:20px;padding:10px;width:420px;margin:12px 0"><input placeholder="Password" type="password" style="display:block;font-size:20px;padding:10px;width:420px"><button style="margin-top:16px;font-size:20px">Next</button></body>`);
const JPEG = await painter.screenshot({ type: "jpeg", quality: 70 });
await painter.close();

function fixture() {
  const avatar = (color) => ({ shape: "orb", color, eyes: "dot" });
  const lead = { ownerId: "me", status: "active", charter: "", autonomy: {}, runProfileId: null, templateId: null, createdAt: at(-9000), provider: "ensemble", model: "gpt-5-mini", parentNodeId: null, id: "lead", slug: "lead", name: "Lead", role: "manager", avatar: avatar("#D7B56F") };
  const me = { id: "p-me", kind: "person", handle: "mira", accountId: "me", role: "owner", name: "Mira", responsibility: null, me: true };
  const room = { id: "dm-lead", title: "Lead", kind: "dm", members: [me, { id: "m-lead", kind: "node", handle: "lead", accountId: "me", lead: true, representative: true, node: lead }], createdBy: "me", lastSeq: 2, readSeq: 2, unread: 0, lastMessageAt: at(-2), pinned: [], invites: [], leadNodeIds: ["lead"], last: null };
  const card = { id: "c-login", roomId: "dm-lead", seq: 2, kind: "approval", body: `@lead needs you to sign in to ${SITE} on Studio.`, authorKind: "node", authorAccountId: "me", authorNodeId: "lead", data: { type: "login", status: "pending", loginId: "lg_0123456789abcdef0123456789abcdef", deviceId: "dev-1", computer: "Studio", origin: SITE, tab: "t2", reasons: ["it is a sign-in page"], saved: false, display: false, takeover: true, expiresAt: at(120) }, private: true, mentions: [], rootMessageId: null, clientId: null, planId: null, createdAt: at(-2) };
  const messages = [{ id: "u1", roomId: "dm-lead", seq: 1, kind: "text", body: "Pay the electricity bill", authorKind: "person", authorAccountId: "me", authorNodeId: null, data: {}, private: false, mentions: [], rootMessageId: null, clientId: null, planId: null, createdAt: at(-3) }, card];
  const boot = { me: { id: "me", name: "Mira", email: "mira@fieldnote.example", verified: true }, nodes: [lead], rooms: [room], computers: [], credits: null, invites: [], templates: { nodes: [], crews: [] }, limits: { roomPeople: 10, nodesPerPerson: 3, crewNodes: 24, pins: 25, reactions: ["👍"], declineBlockDays: 30 }, models: { default: "gpt-5-mini", options: [] } };
  return { boot, messages, keys: null, inputs: [], events: [], frameSeq: 0, sent: 0, controllerSeen: [], ended: null };
}

try {
  for (const width of [390, 1280]) {
    const state = fixture();
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 768, isMobile: width < 768, colorScheme: "dark", reducedMotion: "reduce", locale: "en-GB" });
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
    const cors = { "access-control-allow-origin": WEB, "access-control-allow-credentials": "true" };
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
        assert.deepEqual(request.postDataJSON(), { loginCardId: "c-login" });
        return json({ takeover: { id: TAKEOVER, computer: { id: "dev-1", name: "Studio" }, tab: "t2", origin: SITE, state: "created", startBy: at(2), endsAt: null, loginCardId: "c-login", sealKey }, controller: "cap-fixture" });
      }
      const takeover = new RegExp(`^/api/node/takeovers/${TAKEOVER}/(start|frames|input|end)$`).exec(path);
      if (takeover) {
        state.controllerSeen.push(request.headers()["x-ensemble-takeover"]);
        if (takeover[1] === "start") {
          const { aad, plain } = openSealed(request.postDataJSON().sealed);
          assert.deepEqual([aad.purpose, aad.decisionId, aad.name, aad.deviceId, aad.origin], ["takeover", TAKEOVER, "t2", "dev-1", new URL(WEB).origin], "sealed for this takeover and tab");
          const secret = Buffer.from(plain.k, "base64url");
          state.keys = { d2w: channelKey(secret, "d2w"), w2d: channelKey(secret, "w2d") };
          return json({ takeover: { id: TAKEOVER, computer: { id: "dev-1", name: "Studio" }, tab: "t2", origin: SITE, state: "live", startBy: at(2), endsAt: at(15), loginCardId: "c-login" }, width: 1280, height: 800 });
        }
        if (takeover[1] === "frames") {
          if (state.ended) return json({ state: "ended", reason: state.ended, frame: null });
          const after = Number(url.searchParams.get("after") ?? 0);
          if (state.frameSeq <= after && state.sent < 3) {
            state.frameSeq += 1;
            state.sent += 1;
            return json({ state: "live", frame: seal(state.keys.d2w, state.frameSeq, pack({ t: "frame", w: 1280, h: 800, url: `${SITE}/login` }, JPEG)) });
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
          return json({ state: "live", frame: null });
        }
        if (takeover[1] === "input") {
          const raw = request.postData() ?? "";
          const message = JSON.parse(raw);
          state.inputs.push({ raw, seq: message.seq });
          state.events.push(...open(state.keys.w2d, message).events);
          return json({ ok: true });
        }
        if (takeover[1] === "end") {
          state.ended = request.postDataJSON().done ? "done" : "stopped";
          const card = state.messages.find((row) => row.id === "c-login");
          card.data = { ...card.data, status: "signed_in", via: "takeover", resolvedAt: at(0) };
          return json({ takeover: { id: TAKEOVER, state: "ended" }, signedIn: true, card });
        }
      }
      unexpected.push(`${method} ${path}`);
      return route.fulfill({ status: 404, json: { error: `Unmocked API: ${path}` }, headers: cors });
    });

    await page.goto(`${WEB}/r/dm-lead`);
    const card = page.locator("#m-c-login");
    await card.getByText("Studio has no screen to sign in on: open its browser here instead, or type it.").waitFor();
    await card.getByRole("button", { name: "Open the browser" }).click();
    const view = page.getByRole("dialog", { name: "Control the browser on Studio" });
    await view.locator('[data-takeover="live"]').or(view).first().waitFor();
    await page.locator('[data-takeover="live"]').waitFor();
    const canvas = view.getByLabel("The tab on Studio. Click, type and scroll here.");
    await page.waitForFunction(() => (document.querySelector("canvas")?.width ?? 0) > 0, null, { timeout: 15_000 });
    assert.ok(await view.getByText(`${SITE}/login`).isVisible(), "the tab's address");
    assert.ok(await view.getByText(/Encrypted between this browser and Studio/).isVisible());
    if (shots) await page.screenshot({ path: `${shots}/takeover-${width}.png` });

    // A click (or a tap on a phone) where the email field is: a fraction of the page.
    const box = await canvas.boundingBox();
    if (width < 768) await canvas.tap({ position: { x: box.width * 0.2, y: box.height * 0.2 } });
    else await canvas.click({ position: { x: box.width * 0.2, y: box.height * 0.2 } });
    await page.waitForFunction(() => true);
    await view.getByLabel("Type into the tab").fill("mira@fieldnote.example");
    await view.getByRole("button", { name: "Send" }).click();
    await view.getByRole("button", { name: "Tab key" }).click();
    await page.evaluate(() => navigator.clipboard.writeText("pasted-CANARY-77")).catch(() => undefined);
    await view.getByRole("button", { name: "Paste" }).click();
    if (width >= 768) {
      await canvas.focus();
      await page.keyboard.press("Backspace");
    }
    const waitFor = async (check, what) => {
      for (let tries = 0; tries < 100; tries += 1) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.fail(`no ${what} in ${JSON.stringify(state.events)}`);
    };
    await waitFor(() => state.events.some((event) => event.t === "text" && event.text === "mira@fieldnote.example"), "typed text");
    await waitFor(() => state.events.some((event) => event.t === "key" && event.key === "Tab"), "Tab");
    const click = state.events.find((event) => event.t === "mouse" && event.type === "down");
    assert.ok(click && Math.abs(click.x - 0.2) < 0.02 && Math.abs(click.y - 0.2) < 0.02, `the click at a fifth of the page: ${JSON.stringify(click)}`);
    assert.ok(state.events.some((event) => event.t === "mouse" && event.type === "up"));
    let pasted = false;
    for (let tries = 0; tries < 100 && !pasted; tries += 1) {
      pasted = state.events.some((event) => event.t === "text" && event.text === "pasted-CANARY-77") || (await view.getByText(/paste into the box below instead|clipboard is empty/).isVisible());
      if (!pasted) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(pasted, "Paste sends the clipboard, or says how else");
    if (width >= 768) await waitFor(() => state.events.some((event) => event.t === "key" && event.key === "Backspace"), "a key from the keyboard");
    const seqs = state.inputs.map((row) => row.seq);
    assert.deepEqual(seqs, seqs.map((_, index) => index + 1), "numbered in order, one at a time");
    assert.ok(state.inputs.every((row) => !row.raw.includes("mira@fieldnote.example") && !row.raw.includes("pasted-CANARY")), "nothing typed in the clear");
    assert.ok(state.controllerSeen.length >= 3 && state.controllerSeen.every((value) => value === "cap-fixture"), "every call carries the capability");

    await view.getByRole("button", { name: "I'm done" }).click();
    await view.waitFor({ state: "detached" });
    assert.equal(state.ended, "done");
    // Signed in, the card folds into its checkpoint; opened, it says how.
    await card.getByRole("button", { name: "Signed in to bank.example.com" }).click();
    await card.getByText(/Signed in to https:\/\/bank\.example\.com on Studio from here, in its browser/).waitFor();
    if (shots) await page.screenshot({ path: `${shots}/takeover-done-${width}.png` });

    assert.deepEqual(errors, [], "no page errors");
    assert.deepEqual([...new Set(unexpected)], [], "no unmocked API calls");
    await context.close();
  }
  console.log("takeover fixture: ok");
} finally {
  await browser.close();
}
