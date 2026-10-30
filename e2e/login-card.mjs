/**
 * Local, stateful browser fixture for a sign-in card (Ensemble docs/35 §8.16.1): a node's tab on the
 * owner's computer waits for them to sign in. In the conversation and on Needs me, at phone and desktop
 * widths: the card's reasons and answers (the saved login, typing it here, Not now; no "sign in on the
 * computer" for a computer without a screen), a saved login that did not work, a login typed here and
 * sealed in this browser for the computer's key (the request carries no password or user name in the
 * clear, bound to the card, the sign-in and this site), the signed-in card, and Not now from Needs me.
 * Never points at a hosted account or calls a model. Usage is in docs/05 (Browser regression).
 */
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
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
const SITE = "https://ledger.example.com";

/** The computer's key, as the web is given it: the box is made for it in the page. */
const { publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const spki = publicKey.export({ type: "spki", format: "der" });
const kid = createHash("sha256").update(spki).digest("hex").slice(0, 16);
const sealKey = { kid, alg: "ECDH-P256+HKDF-SHA256+A256GCM", spki: spki.toString("base64url"), fingerprint: kid.toUpperCase().match(/.{4}/g).join(" ") };

function fixture() {
  const avatar = (color) => ({ shape: "orb", color, eyes: "dot" });
  const lead = { ownerId: "me", status: "active", charter: "", autonomy: {}, runProfileId: null, templateId: null, createdAt: at(-9000), provider: "ensemble", model: "gpt-5-mini", parentNodeId: null, id: "lead", slug: "lead", name: "Lead", role: "manager", avatar: avatar("#D7B56F") };
  const me = { id: "p-me", kind: "person", handle: "mira", accountId: "me", role: "owner", name: "Mira", responsibility: null, me: true };
  const room = { id: "dm-lead", title: "Lead", kind: "dm", members: [me, { id: "m-lead", kind: "node", handle: "lead", accountId: "me", lead: true, representative: true, node: lead }], createdBy: "me", lastSeq: 3, readSeq: 3, unread: 0, lastMessageAt: at(-2), pinned: [], invites: [], leadNodeIds: ["lead"], last: null };
  const message = (id, seq, authorKind, body, data = {}, kind = "text", minutes = -5) => ({ id, roomId: "dm-lead", seq, kind, body, authorKind, authorAccountId: "me", authorNodeId: authorKind === "node" ? "lead" : null, data, private: kind === "approval", mentions: [], rootMessageId: null, clientId: null, planId: null, createdAt: at(minutes) });
  const card = message("c-login", 3, "node", `@lead needs you to sign in to ${SITE} on Mira's laptop.`, { type: "login", status: "pending", loginId: "lg_0123456789abcdef0123456789abcdef", deviceId: "dev-1", computer: "Mira's laptop", origin: SITE, tab: "t4", reasons: ["the page has a password field"], saved: true, display: false, takeover: false, expiresAt: at(120), operation: "node:lead:conversation:dm-lead:shared" }, "approval", -2);
  const messages = [
    message("u1", 1, "person", "Check my invoices on Ledger", {}, "text", -6),
    message("n1", 2, "node", "Ledger wants you to sign in first: I asked on a card.", { tools: [{ id: "x", name: "browser_open", state: "ok", summary: "Opened t4: Sign in." }] }, "text", -5),
    card,
  ];
  const boot = { me: { id: "me", name: "Mira", email: "mira@fieldnote.example", verified: true }, nodes: [lead], rooms: [room], computers: [], credits: null, invites: [], templates: { nodes: [], crews: [] }, limits: { roomPeople: 10, nodesPerPerson: 3, crewNodes: 24, pins: 25, reactions: ["👍"], declineBlockDays: 30 }, models: { default: "gpt-5-mini", options: [] } };
  return { boot, messages, calls: [] };
}

try {
  for (const width of [390, 1280]) {
    const state = fixture();
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 768, isMobile: width < 768, colorScheme: "dark", reducedMotion: "reduce", locale: "en-GB" });
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
    const cardOf = () => state.messages.find((row) => row.id === "c-login");
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      const json = (data, status = 200) => route.fulfill({ status, json: data, headers: cors });
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-methods": "GET, POST, PATCH, DELETE", "access-control-allow-headers": "content-type, accept" } });
      if (path === "/api/auth/me") return json({ user: state.boot.me });
      if (path === "/api/node/bootstrap") return json(state.boot);
      if (path === "/api/node/activity") {
        const pending = state.messages.filter((row) => row.kind === "approval" && (row.data.status === "pending" || row.data.status === "working"));
        return json({ approvals: pending.map((row) => ({ ...row, node: state.boot.nodes[0], room: { id: "dm-lead", title: "Lead", kind: "dm" } })), runs: [], turns: [], computers: [], credits: null, waitingTasks: [] });
      }
      if (path === "/api/decisions") return json({ decisions: [] });
      if (path === "/api/approvals") return json({ approvals: [] });
      if (path === "/api/devices") return json({ devices: [] });
      if (path === "/api/documents") return json({ files: [], usage: { maxFileBytes: 25000000 } });
      if (/^\/api\/node\/rooms\/dm-lead\/read$/.test(path)) return json({});
      if (path === "/api/node/rooms/dm-lead/messages" && method === "GET") return json({ messages: state.messages });
      if (path === "/api/node/logins/c-login" && method === "GET") {
        const data = cardOf().data;
        return json({ id: "c-login", status: data.status, origin: SITE, loginId: data.loginId, computer: { id: "dev-1", name: "Mira's laptop", online: true }, route: { mode: "sealed", sealKey }, saved: true, display: false, takeover: false, ttlMs: 600_000 });
      }
      if (path === "/api/node/logins/c-login" && method === "POST") {
        const raw = request.postData() ?? "";
        const body = JSON.parse(raw);
        state.calls.push({ raw, body });
        const card = cardOf();
        if (body.action === "saved") {
          card.data = { ...card.data, status: "pending", error: "Still not signed in after filling the saved login: The sign-in form is still on the page." };
          return json({ message: card, result: { status: "failed", message: card.data.error } });
        }
        if (body.action === "typed") {
          card.data = { ...card.data, status: "signed_in", error: null, via: "typed", savedNow: true, resolvedAt: at(0) };
          return json({ message: card, result: { status: "signed_in" } });
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

    // In the conversation: the card says which site and computer, why, and what the owner can do.
    await page.goto(`${WEB}/r/dm-lead`);
    const card = page.locator("#m-c-login");
    await card.getByText(`@lead needs you to sign in to ${SITE} on Mira's laptop`).first().waitFor();
    assert.ok(await card.getByText("Why: the page has a password field.").isVisible());
    assert.ok(await card.getByText("only you").isVisible(), "owner only");
    assert.ok(await card.getByRole("button", { name: "Use saved login" }).isVisible());
    assert.ok(await card.getByRole("button", { name: "Type it here" }).isVisible());
    assert.ok(await card.getByRole("button", { name: "Not now" }).isVisible());
    assert.equal(await card.getByRole("button", { name: /Sign in on Mira's laptop/ }).count(), 0, "no screen there: no signing in on the computer");
    assert.ok(await card.getByText("Mira's laptop has no screen to sign in on.").isVisible());

    // The saved login did not work: the card says so and stays open.
    await card.getByRole("button", { name: "Use saved login" }).click();
    await card.getByText(/Still not signed in after filling the saved login/).waitFor();
    assert.deepEqual(state.calls.at(-1).body, { action: "saved" });

    // Typed here, sealed in this browser for the computer.
    await card.getByRole("button", { name: "Type it here" }).click();
    await card.getByLabel(`User name or email for ${SITE}`).fill("mira@fieldnote.example");
    await card.getByLabel(`Password for ${SITE}`).fill(PASSWORD);
    await card.getByLabel("One-time code (optional)").fill("123 456");
    await card.getByLabel(/Save on Mira's laptop/).check();
    await card.locator('[data-login-route="sealed"]').waitFor();
    assert.ok(await card.getByText(new RegExp(`Encrypted in this browser for Mira's laptop.*Key ${sealKey.fingerprint}`)).isVisible(), "the key's fingerprint to compare");
    await fits();
    if (shots) await page.screenshot({ path: `${shots}/login-card-${width}.png`, fullPage: true });
    await card.getByRole("button", { name: "Sign in on Mira's laptop" }).click();
    await card.getByText(/Signed in to https:\/\/ledger\.example\.com on Mira's laptop with what you typed/).waitFor();
    const sent = state.calls.at(-1);
    assert.equal(sent.body.action, "typed");
    assert.ok(!sent.raw.includes(PASSWORD) && !sent.raw.includes("mira@fieldnote.example") && !sent.raw.includes("123456"), "nothing typed travels in the clear");
    const aad = JSON.parse(Buffer.from(sent.body.sealed.aad, "base64url").toString("utf8"));
    assert.deepEqual([aad.purpose, aad.kid, aad.deviceId, aad.decisionId, aad.name, aad.origin], ["login", kid, "dev-1", "c-login", "lg_0123456789abcdef0123456789abcdef", new URL(WEB).origin]);
    assert.ok(await card.getByText("The login is saved there for next time.").isVisible());
    assert.equal(await card.getByLabel(`Password for ${SITE}`).count(), 0, "the form is gone, and with it what was typed");
    await fits();
    if (shots) await page.screenshot({ path: `${shots}/login-card-signed-in-${width}.png`, fullPage: true });

    // On Needs me: the same card, answered there; Not now ends it.
    const fresh = fixture();
    state.messages = fresh.messages;
    await page.goto(`${WEB}/needs-me`);
    const fromNodes = page.getByRole("region", { name: /From your nodes/ });
    await fromNodes.getByRole("heading", { name: "From your nodes (1)" }).waitFor();
    const item = fromNodes.getByRole("listitem").filter({ hasText: "needs you to sign in" });
    assert.ok(await item.getByText(`@lead needs you to sign in to ${SITE}`).first().isVisible());
    assert.ok(await item.getByRole("button", { name: "Use saved login" }).isVisible());
    assert.equal(await item.getByRole("button", { name: "Approve" }).count(), 0, "no generic approve for a sign-in");
    await fits();
    if (shots) await page.screenshot({ path: `${shots}/login-needs-me-${width}.png`, fullPage: true });
    await item.getByRole("button", { name: "Not now" }).click();
    await page.getByText(/All caught up/).waitFor();
    assert.deepEqual(state.calls.at(-1).body, { action: "decline" });

    assert.deepEqual(errors, [], "no page errors");
    assert.deepEqual([...new Set(unexpected)], [], "no unmocked API calls");
    await context.close();
  }
  console.log("login card fixture: ok");
} finally {
  await browser.close();
}
