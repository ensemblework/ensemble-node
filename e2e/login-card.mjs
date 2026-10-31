/**
 * Local, stateful browser fixture for the sign-in card, version 2 (Ensemble docs/35 §8.16.1): a node's
 * tab on the owner's computer waits for them to sign in, or to pass a human check. In the conversation,
 * at phone and desktop widths: the card's title, computer and reasons, its first answer "Sign in here"
 * (the remote view; "Works on your phone too", and on a computer "Open on your phone" with this card's
 * link as a QR code), the saved login that did not work, a login typed here and sealed in this browser
 * for the computer's key (nothing typed in the clear, bound to the card, the sign-in and this site), the
 * site then asking for a code (the code box, the code sealed the same way), signed in and folded into
 * its checkpoint; a human check (Open it here, the window on the computer, I'm done, then passed when
 * the computer sees it through, with no login answers), and Not now. Never points at a hosted account
 * or calls a model. Usage is in docs/05 (Browser regression).
 */
import assert from "node:assert/strict";
import { createDecipheriv, createHash, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync } from "node:crypto";
import { mkdirSync } from "node:fs";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");
const WEB = process.env.NODE_WEB ?? "http://localhost:3392";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(WEB).hostname), "Use an isolated local Node server.");
const shots = process.env.NODE_CHAT_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ["--no-sandbox"] });
const NOW = Date.now();
const at = (minutes) => new Date(NOW + minutes * 60_000).toISOString();
const PASSWORD = "pw-fixture-CANARY-9f3a";
const CODE = "481 516";
const SITE = "https://ledger.example.com";
const CHECK = "https://www.walmart.com";

/** The computer's key: the page seals for it, and this fixture opens the boxes as the computer would. */
const computer = generateKeyPairSync("ec", { namedCurve: "P-256" });
const spki = computer.publicKey.export({ type: "spki", format: "der" });
const kid = createHash("sha256").update(spki).digest("hex").slice(0, 16);
const sealKey = { kid, alg: "ECDH-P256+HKDF-SHA256+A256GCM", spki: spki.toString("base64url"), fingerprint: kid.toUpperCase().match(/.{4}/g).join(" ") };
function openBox(box) {
  const epk = Buffer.from(box.epk, "base64url");
  const shared = diffieHellman({ privateKey: computer.privateKey, publicKey: createPublicKey({ key: { kty: "EC", crv: "P-256", x: epk.subarray(1, 33).toString("base64url"), y: epk.subarray(33).toString("base64url") }, format: "jwk" }) });
  const key = Buffer.from(hkdfSync("sha256", shared, epk, Buffer.from(`ensemble-seal-v1|${box.kid}`), 32));
  const ct = Buffer.from(box.ct, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(box.iv, "base64url"));
  decipher.setAAD(Buffer.from(box.aad, "base64url"));
  decipher.setAuthTag(ct.subarray(ct.length - 16));
  return { aad: JSON.parse(Buffer.from(box.aad, "base64url").toString("utf8")), plain: JSON.parse(Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]).toString("utf8")) };
}

function fixture() {
  const avatar = (color) => ({ shape: "orb", color, eyes: "dot" });
  const lead = { ownerId: "me", status: "active", charter: "", autonomy: {}, runProfileId: null, templateId: null, createdAt: at(-9000), provider: "ensemble", model: "gpt-5-mini", parentNodeId: null, id: "lead", slug: "lead", name: "Lead", role: "manager", avatar: avatar("#D7B56F") };
  const me = { id: "p-me", kind: "person", handle: "mira", accountId: "me", role: "owner", name: "Mira", responsibility: null, me: true };
  const room = { id: "dm-lead", title: "Lead", kind: "dm", members: [me, { id: "m-lead", kind: "node", handle: "lead", accountId: "me", lead: true, representative: true, node: lead }], createdBy: "me", lastSeq: 4, readSeq: 4, unread: 0, lastMessageAt: at(-2), pinned: [], invites: [], leadNodeIds: ["lead"], last: null };
  const message = (id, seq, authorKind, body, data = {}, kind = "text", minutes = -5) => ({ id, roomId: "dm-lead", seq, kind, body, authorKind, authorAccountId: "me", authorNodeId: authorKind === "node" ? "lead" : null, data, private: kind === "approval", mentions: [], rootMessageId: null, clientId: null, planId: null, createdAt: at(minutes) });
  const card = message("c-login", 3, "node", `@lead needs you to sign in to ${SITE} on Mira's laptop.`, { type: "login", purpose: "sign_in", status: "pending", loginId: "lg_0123456789abcdef0123456789abcdef", deviceId: "dev-1", computer: "Mira's laptop", origin: SITE, tab: "t4", reasons: ["the page has a password field"], saved: true, display: false, takeover: true, expiresAt: at(120), operation: "node:lead:conversation:dm-lead:shared" }, "approval", -3);
  const check = message("c-check", 4, "node", `@lead needs you to pass a human check on ${CHECK} on Mira's laptop.`, { type: "login", purpose: "human_check", status: "pending", loginId: "lg_fedcba9876543210fedcba9876543210", deviceId: "dev-1", computer: "Mira's laptop", origin: CHECK, tab: "t5", reasons: ["the page asks: Robot or human?"], saved: false, display: true, takeover: true, expiresAt: at(120) }, "approval", -2);
  const messages = [
    message("u1", 1, "person", "Check my invoices on Ledger, and the PS5 price on Walmart", {}, "text", -6),
    message("n1", 2, "node", "Ledger wants you to sign in first, and Walmart shows a human check: I asked on two cards.", { tools: [{ id: "x", name: "browser_open", state: "ok", summary: "Opened t4: Sign in." }] }, "text", -5),
    card,
    check,
  ];
  const boot = { me: { id: "me", name: "Mira", email: "mira@fieldnote.example", verified: true }, nodes: [lead], rooms: [room], computers: [], credits: null, invites: [], templates: { nodes: [], crews: [] }, limits: { roomPeople: 10, nodesPerPerson: 3, crewNodes: 24, pins: 25, reactions: ["👍"], declineBlockDays: 30 }, models: { default: "gpt-5-mini", options: [] } };
  return { boot, messages, calls: [] };
}

try {
  for (const width of [390, 1280]) {
    const state = fixture();
    const phone = width < 768;
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: phone, isMobile: phone, colorScheme: "dark", reducedMotion: "reduce", locale: "en-GB" });
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
    const cardOf = (id) => state.messages.find((row) => row.id === id);
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      const json = (data, status = 200) => route.fulfill({ status, json: data, headers: cors });
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-methods": "GET, POST, PATCH, DELETE", "access-control-allow-headers": "content-type, accept" } });
      if (path === "/api/auth/me") return json({ user: state.boot.me });
      if (path === "/api/node/bootstrap") return json(state.boot);
      if (path === "/api/node/activity") {
        const pending = state.messages.filter((row) => row.kind === "approval" && ["pending", "working", "needs_code"].includes(row.data.status));
        return json({ approvals: pending.map((row) => ({ ...row, node: state.boot.nodes[0], room: { id: "dm-lead", title: "Lead", kind: "dm" } })), runs: [], turns: [], computers: [], credits: null, waitingTasks: [] });
      }
      if (path === "/api/decisions") return json({ decisions: [] });
      if (path === "/api/approvals") return json({ approvals: [] });
      if (path === "/api/devices") return json({ devices: [] });
      if (path === "/api/documents") return json({ files: [], usage: { maxFileBytes: 25000000 } });
      if (/^\/api\/node\/rooms\/dm-lead\/read$/.test(path)) return json({});
      if (path === "/api/node/rooms/dm-lead/messages" && method === "GET") return json({ messages: state.messages });
      const one = /^\/api\/node\/messages\/([^/]+)$/.exec(path);
      if (one && method === "GET" && cardOf(one[1])) return json({ message: cardOf(one[1]) });
      const login = /^\/api\/node\/logins\/([^/]+)$/.exec(path);
      if (login && method === "GET") {
        const data = cardOf(login[1]).data;
        return json({ id: login[1], status: data.status, origin: data.origin, loginId: data.loginId, computer: { id: "dev-1", name: "Mira's laptop", online: true }, route: { mode: "sealed", sealKey }, saved: data.saved, display: data.display, takeover: data.takeover, ttlMs: 600_000 });
      }
      if (login && method === "POST") {
        const raw = request.postData() ?? "";
        const body = JSON.parse(raw);
        state.calls.push({ card: login[1], raw, body });
        const card = cardOf(login[1]);
        if (body.action === "saved") {
          card.data = { ...card.data, status: "pending", error: "Still not signed in after filling the saved login: The sign-in form is still on the page." };
          return json({ message: card, result: { status: "failed", message: card.data.error } });
        }
        if (body.action === "typed") {
          // The site asks for a code after the password: the card asks for it.
          card.data = { ...card.data, status: "needs_code", error: null, codeHint: "Enter the 6-digit code from your authenticator app", savedNow: true };
          return json({ message: card, result: { status: "needs_code", message: card.data.codeHint } });
        }
        if (body.action === "code") {
          card.data = { ...card.data, status: "signed_in", error: null, codeHint: null, via: "code", resolvedAt: at(0) };
          return json({ message: card, result: { status: "signed_in" } });
        }
        if (body.action === "local") {
          card.data = { ...card.data, status: "pending", note: "It is open on Mira's laptop. Do it there: it is seen through by itself, or press I'm done.", shownAt: at(0) };
          return json({ message: card, result: { status: "shown" } });
        }
        if (body.action === "decline") {
          card.data = { ...card.data, status: "declined", error: null };
          return json({ message: card, result: { status: "declined" } });
        }
      }
      unexpected.push(`${method} ${path}`);
      return route.fulfill({ status: 404, json: { error: `Unmocked API: ${path}` }, headers: cors });
    });
    const fits = async () => assert.equal(await page.locator("main").evaluate((el) => el.scrollWidth <= el.clientWidth + 2), true, `${width}px fits`);

    // In the conversation: the card says which site, which computer and why; its first answer is the remote view.
    await page.goto(`${WEB}/r/dm-lead`);
    const card = page.locator("#m-c-login");
    await card.getByText("@lead needs you to sign in to ledger.example.com").waitFor();
    assert.ok(await card.getByText("On Mira's laptop · Why: the page has a password field.").isVisible());
    assert.ok(await card.getByText("only you").isVisible(), "owner only");
    const answers = await card.getByRole("button").allInnerTexts();
    assert.deepEqual(answers.map((text) => text.trim()).filter((text) => !/Open on your phone/.test(text)), ["Sign in here", "Type my login", "Use saved login", "Not now"], "the remote view first, then the rest");
    assert.equal(await card.getByRole("button", { name: "Use the window on Mira's laptop" }).count(), 0, "no screen there: no window to use");
    if (phone) {
      assert.equal(await card.getByText(/Works on your phone too/).count(), 0, "on a phone it is already one");
    } else {
      // "Open on your phone": this card's link as a QR code.
      await card.getByText(/Works on your phone too/).waitFor();
      await card.getByRole("button", { name: "Open on your phone" }).click();
      const qr = card.getByRole("img", { name: "QR code of this card's link" });
      await qr.waitFor();
      assert.ok(Number(await qr.getAttribute("data-qr-version")) >= 2, "a real symbol");
      assert.ok(await card.getByText(`${WEB}/r/dm-lead#m-c-login`).isVisible(), "the link it holds");
      await card.getByRole("button", { name: "Copy link" }).click();
      await page.getByText("Link copied.").waitFor();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `${WEB}/r/dm-lead#m-c-login`);
    }
    await fits();
    if (shots) await page.screenshot({ path: `${shots}/login-v2-${width}.png`, fullPage: true });
    if (!phone) await card.getByRole("button", { name: "Open on your phone" }).click();

    // The saved login did not work: the card says so and stays open.
    await card.getByRole("button", { name: "Use saved login" }).click();
    await card.getByText(/Still not signed in after filling the saved login/).waitFor();
    assert.deepEqual(state.calls.at(-1).body, { action: "saved" });

    // Typed here, sealed in this browser for the computer.
    await card.getByRole("button", { name: "Type my login" }).click();
    await card.getByLabel(`User name or email for ${SITE}`).fill("mira@fieldnote.example");
    await card.getByLabel(`Password for ${SITE}`).fill(PASSWORD);
    await card.getByLabel(/Save on Mira's laptop/).check();
    await card.locator('[data-login-route="sealed"]').waitFor();
    assert.ok(await card.getByText(new RegExp(`Encrypted in this browser for Mira's laptop.*Key ${sealKey.fingerprint}`)).isVisible(), "the key's fingerprint to compare");
    assert.equal(await card.getByLabel(/One-time code/).count(), 0, "a code is asked for when the site wants one");
    await card.getByRole("button", { name: "Sign in on Mira's laptop" }).click();
    const typed = state.calls.at(-1);
    assert.equal(typed.body.action, "typed");
    assert.ok(!typed.raw.includes(PASSWORD) && !typed.raw.includes("mira@fieldnote.example"), "nothing typed travels in the clear");
    const login = openBox(typed.body.sealed);
    assert.deepEqual(login.plain, { origin: SITE, username: "mira@fieldnote.example", password: PASSWORD, save: true });
    assert.deepEqual([login.aad.purpose, login.aad.kid, login.aad.deviceId, login.aad.decisionId, login.aad.name, login.aad.origin], ["login", kid, "dev-1", "c-login", "lg_0123456789abcdef0123456789abcdef", new URL(WEB).origin]);

    // The site asks for a code: the card asks for it, sealed the same way.
    const box = card.locator("[data-login-code]");
    await box.getByText("Enter the code from your authenticator app, a text message or an email").waitFor();
    assert.ok(await box.getByText("ledger.example.com says: “Enter the 6-digit code from your authenticator app”").isVisible(), "the site's own words");
    assert.ok(await card.getByText("Needs a code").isVisible(), "a code to enter waits for the owner");
    assert.equal(await card.locator('[data-owner-card="waiting"]').count(), 1, "it stands out as waiting");
    assert.equal(await card.getByLabel(`Password for ${SITE}`).count(), 0, "the login form is gone, and with it what was typed");
    const codeField = box.getByLabel("Code for ledger.example.com");
    assert.equal(await codeField.getAttribute("inputmode"), "numeric");
    assert.equal(await codeField.getAttribute("autocomplete"), "one-time-code");
    await codeField.fill(CODE);
    await fits();
    if (shots) await card.screenshot({ path: `${shots}/login-v2-code-${width}.png` });
    await box.getByRole("button", { name: "Send the code" }).click();
    const coded = state.calls.at(-1);
    assert.equal(coded.body.action, "code");
    assert.ok(!coded.raw.includes("481") && !coded.raw.includes("516"), "the code does not travel in the clear");
    const opened = openBox(coded.body.sealed);
    assert.deepEqual(opened.plain, { origin: SITE, code: "481516" });
    assert.deepEqual([opened.aad.purpose, opened.aad.decisionId, opened.aad.name], ["login", "c-login", "lg_0123456789abcdef0123456789abcdef"]);
    // Signed in, the card folds into its checkpoint; opened, it says how.
    const signedIn = card.getByRole("button", { name: "Signed in to ledger.example.com" });
    await signedIn.waitFor();
    await signedIn.click();
    await card.getByText(/Signed in to https:\/\/ledger\.example\.com on Mira's laptop with the code you gave\. The login is saved there for next time\./).waitFor();
    await signedIn.click();

    // A human check: only the remote view, the window on the computer, and Not now.
    const check = page.locator("#m-c-check");
    await check.getByText("@lead needs you to pass a human check on www.walmart.com").waitFor();
    assert.deepEqual((await check.getByRole("button").allInnerTexts()).map((text) => text.trim()).filter((text) => !/Open on your phone/.test(text)), ["Open it here", "Use the window on Mira's laptop", "Not now"]);
    if (shots) await check.screenshot({ path: `${shots}/login-v2-human-check-${width}.png` });
    await check.getByRole("button", { name: "Use the window on Mira's laptop" }).click();
    await check.getByText(/It is open on Mira's laptop/).waitFor();
    assert.ok(await check.getByRole("button", { name: "I'm done" }).isVisible(), "a manual check once it is open there");
    assert.deepEqual(state.calls.at(-1).body, { action: "local" });
    // The computer sees it through by itself: the card folds into its checkpoint.
    const passed = cardOf("c-check");
    passed.data = { ...passed.data, status: "passed", via: "local", resolvedAt: at(0) };
    await emit("node.message.updated", passed);
    await check.getByRole("button", { name: "Passed the human check on www.walmart.com" }).waitFor();
    await fits();
    if (shots) await page.screenshot({ path: `${shots}/login-v2-checkpoints-${width}.png`, fullPage: true });

    // A new card: Not now ends it, and it folds into its checkpoint.
    const fresh = fixture();
    state.messages = fresh.messages;
    await page.reload();
    await card.getByText("@lead needs you to sign in to ledger.example.com").waitFor();
    assert.equal(await card.getByRole("button", { name: "Approve" }).count(), 0, "no generic approve for a sign-in");
    await card.getByRole("button", { name: "Not now" }).click();
    await card.getByRole("button", { name: "Didn't sign in to ledger.example.com" }).waitFor();
    assert.deepEqual(state.calls.at(-1).body, { action: "decline" });
    await fits();

    assert.deepEqual(errors, [], "no page errors");
    assert.deepEqual([...new Set(unexpected)], [], "no unmocked API calls");
    await context.close();
    console.log(`login card ok at ${width}px`);
  }
  console.log("login card fixture: ok");
} finally {
  await browser.close();
}
