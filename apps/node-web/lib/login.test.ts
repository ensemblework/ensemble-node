import assert from "node:assert/strict";
import { createDecipheriv, createHash, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync } from "node:crypto";
import test from "node:test";
import { cardLink, cardPage, cleanCode, loginCommand, loginProvider, remoteAsked, codeAnswer, codeHintText, codeInputMode, loginBadge, loginFingerprint, loginOpen, loginOutcomeText, loginPurpose, loginReasonText, loginRouteText, loginTitle, remoteDoneText, typedLoginAnswer, waitingLoginCard, type LoginTarget } from "./login";
import type { Message } from "./types";

function computerKey() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const spki = publicKey.export({ type: "spki", format: "der" });
  const kid = createHash("sha256").update(spki).digest("hex").slice(0, 16);
  return { privateKey, info: { kid, alg: "ECDH-P256+HKDF-SHA256+A256GCM", spki: spki.toString("base64url"), fingerprint: kid.toUpperCase().match(/.{4}/g)!.join(" ") } };
}

/** Opens a box as the computer does, with its private key. */
function openBox(privateKey: ReturnType<typeof computerKey>["privateKey"], kid: string, box: { epk: string; iv: string; ct: string; aad: string }) {
  const epk = Buffer.from(box.epk, "base64url");
  const shared = diffieHellman({ privateKey, publicKey: createPublicKey({ key: { kty: "EC", crv: "P-256", x: epk.subarray(1, 33).toString("base64url"), y: epk.subarray(33).toString("base64url") }, format: "jwk" }) });
  const aesKey = Buffer.from(hkdfSync("sha256", shared, epk, Buffer.from(`ensemble-seal-v1|${kid}`), 32));
  const ct = Buffer.from(box.ct, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", aesKey, Buffer.from(box.iv, "base64url"));
  decipher.setAAD(Buffer.from(box.aad, "base64url"));
  decipher.setAuthTag(ct.subarray(ct.length - 16));
  return { aad: JSON.parse(Buffer.from(box.aad, "base64url").toString("utf8")), plain: JSON.parse(Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]).toString("utf8")) };
}

const target = (route: LoginTarget["route"]): LoginTarget => ({
  id: "card-1",
  status: "pending",
  origin: "https://ledger.example.com",
  loginId: "lg_0123456789abcdef0123456789abcdef",
  computer: { id: "dev-1", name: "Mira's laptop", online: true },
  route,
  saved: false,
  display: false,
  takeover: false,
  ttlMs: 600_000,
});

test("a login typed here is sealed for the computer, bound to the card, the sign-in and the page; the site travels inside", async () => {
  const key = computerKey();
  const answer = await typedLoginAnswer(target({ mode: "sealed", sealKey: key.info }), { id: "card-1" }, { username: " mira@example.com ", password: "pw-123456", code: " 123 456 ", save: true }, "https://node.ensemblework.com");
  assert.equal(answer.action, "typed");
  assert.ok(answer.action === "typed");
  assert.ok(!JSON.stringify(answer).includes("pw-123456") && !JSON.stringify(answer).includes("mira@example.com"), "nothing in clear");
  const box = answer.sealed;
  const aad = JSON.parse(Buffer.from(box.aad, "base64url").toString("utf8"));
  assert.deepEqual([aad.purpose, aad.deviceId, aad.decisionId, aad.name, aad.origin], ["login", "dev-1", "card-1", "lg_0123456789abcdef0123456789abcdef", "https://node.ensemblework.com"]);
  const epk = Buffer.from(box.epk, "base64url");
  const shared = diffieHellman({ privateKey: key.privateKey, publicKey: createPublicKey({ key: { kty: "EC", crv: "P-256", x: epk.subarray(1, 33).toString("base64url"), y: epk.subarray(33).toString("base64url") }, format: "jwk" }) });
  const aesKey = Buffer.from(hkdfSync("sha256", shared, epk, Buffer.from(`ensemble-seal-v1|${key.info.kid}`), 32));
  const ct = Buffer.from(box.ct, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", aesKey, Buffer.from(box.iv, "base64url"));
  decipher.setAAD(Buffer.from(box.aad, "base64url"));
  decipher.setAuthTag(ct.subarray(ct.length - 16));
  assert.deepEqual(JSON.parse(Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]).toString("utf8")), { origin: "https://ledger.example.com", username: "mira@example.com", password: "pw-123456", code: "123 456", save: true });
  assert.equal(await loginFingerprint(target({ mode: "sealed", sealKey: key.info })), key.info.fingerprint);
});

test("nothing typed goes to a computer that cannot open it, and the card says why; settled cards say how", async () => {
  await assert.rejects(typedLoginAnswer(target({ mode: "pair_again" }), { id: "card-1" }, { username: "a", password: "b", save: false }, "https://node.ensemblework.com"), /Pair it again/);
  await assert.rejects(typedLoginAnswer(target({ mode: "unsupported" }), { id: "card-1" }, { username: "a", password: "b", save: false }, "https://node.ensemblework.com"), /Update it there/);
  assert.match(loginRouteText(target({ mode: "sealed", sealKey: computerKey().info }), "3F2A 9C01 77DE 4B10"), /^Encrypted in this browser for Mira's laptop: only Mira's laptop can read it.*Key 3F2A 9C01 77DE 4B10/);
  assert.equal(loginOutcomeText({ status: "signed_in", origin: "https://ledger.example.com", computer: "Mira's laptop", via: "saved" }), "Signed in to https://ledger.example.com on Mira's laptop with the saved login.");
  assert.equal(loginOutcomeText({ status: "signed_in", origin: "https://x.example", computer: "Studio", via: "typed", savedNow: true }), "Signed in to https://x.example on Studio with what you typed (encrypted for the computer). The login is saved there for next time.");
  assert.equal(loginOutcomeText({ status: "declined", origin: "https://x.example", computer: "Studio" }), "You chose not to sign in to https://x.example on Studio now.");
});

test("why the page wants a sign-in, in one line, and a sign-in from the browser here", () => {
  assert.equal(loginReasonText(["the page has a password field", "it was sent to sign in at accounts.google.com"]), "Why: the page has a password field; it was sent to sign in at accounts.google.com.");
  assert.equal(loginReasonText([]), "");
  assert.equal(loginReasonText(["the page asks: Robot or human?"]), "Why: the page asks: Robot or human?", "no stop after a question mark");
  assert.equal(loginOutcomeText({ status: "ended", note: "The work that needed this sign-in ended, or its tab closed." }), "The work that needed this sign-in ended, or its tab closed.");
});

test("a run's paused live view points to its sign-in card only while that card is open", () => {
  const card = (id: string, data: Record<string, unknown>, kind = "approval") => ({ id, roomId: "r1", kind, data }) as unknown as Message;
  const cards = [
    card("other-run", { type: "login", jobId: "J2", status: "pending" }),
    card("settled", { type: "login", jobId: "J1", status: "signed_in" }),
    card("secret", { type: "secret", jobId: "J1", status: "pending" }),
    card("acting", { type: "login", jobId: "J1", status: "working" }),
  ];
  assert.equal(waitingLoginCard(cards, "J1")?.id, "acting");
  assert.equal(waitingLoginCard([card("code", { type: "login", jobId: "J1", status: "needs_code" })], "J1")?.id, "code", "waiting for a code is still open");
  assert.equal(waitingLoginCard(cards.slice(0, 3), "J1"), undefined, "a settled sign-in or another kind of card is not it");
});

test("a sign-in and a human check say what they ask, and which statuses wait for the owner", () => {
  assert.equal(loginTitle({ origin: "https://portal.azure.com" }, "lead"), "@lead needs you to sign in to portal.azure.com");
  assert.equal(loginTitle({ origin: "https://www.walmart.com", purpose: "human_check" }, "lead"), "@lead needs you to pass a human check on www.walmart.com");
  assert.equal(loginPurpose({}), "sign_in", "an older card is a sign-in");
  for (const status of ["pending", "working", "needs_code", undefined]) assert.equal(loginOpen({ status }), true, String(status));
  for (const status of ["signed_in", "passed", "declined", "expired", "ended"]) assert.equal(loginOpen({ status }), false, status);
  assert.deepEqual(loginBadge({ status: "needs_code" }), { label: "Needs a code", tone: "warn" }, "a code to enter waits for the owner");
  assert.deepEqual(loginBadge({ status: "passed" }), { label: "Passed", tone: "ok" });
  assert.deepEqual(loginBadge({ status: "working" }), { label: "Working…", tone: "accent" });
  assert.equal(remoteDoneText({ status: "signed_in" }, "lead"), "Signed in — @lead is carrying on");
  assert.equal(remoteDoneText({ status: "passed", purpose: "human_check" }, "lead"), "Check passed — @lead is carrying on");
  assert.equal(remoteDoneText({ status: "pending" }, "lead"), null);
  assert.equal(cardLink("https://node.ensemblework.com/", "c-login"), "https://node.ensemblework.com/c/c-login", "short, for a QR code");
  assert.equal(cardPage("5e1f2a3b", "c-login", true), "/r/5e1f2a3b?remote=1#m-c-login");
  assert.equal(cardPage("5e1f2a3b", "c-login"), "/r/5e1f2a3b#m-c-login");
  assert.equal(remoteAsked("?remote=1", "#m-c-login", "c-login"), true);
  assert.equal(remoteAsked("?remote=1", "#m-other", "c-login"), false, "another card's");
  assert.equal(remoteAsked("", "#m-c-login", "c-login"), false);
});

test("settled cards say how they ended, for a human check too", () => {
  assert.equal(loginOutcomeText({ status: "passed", purpose: "human_check", origin: "https://www.walmart.com", computer: "Studio", via: "takeover" }), "Passed the human check on https://www.walmart.com on Studio from the remote view.");
  assert.equal(loginOutcomeText({ status: "signed_in", origin: "https://github.com", computer: "Studio", via: "code" }), "Signed in to https://github.com on Studio with the code you gave.");
  assert.equal(loginOutcomeText({ status: "signed_in", origin: "https://github.com", computer: "Studio", via: "auto" }), "Signed in to https://github.com on Studio.", "an unknown way says nothing of how");
  assert.equal(loginOutcomeText({ status: "declined", purpose: "human_check", origin: "https://www.walmart.com", computer: "Studio" }), "You chose not to do the human check on https://www.walmart.com on Studio now.");
  assert.equal(loginOutcomeText({ status: "expired", purpose: "human_check", origin: "https://x.example", computer: "Studio" }), "Nobody passed the human check on https://x.example on Studio in time.");
});

test("a code the site asks for is sealed for the computer like a typed login, without spaces, and never in the clear", async () => {
  const key = computerKey();
  const answer = await codeAnswer(target({ mode: "sealed", sealKey: key.info }), { id: "card-1" }, " 123 456 ", "https://node.ensemblework.com");
  assert.equal(answer.action, "code");
  assert.ok(answer.action === "code" && !JSON.stringify(answer).includes("123"));
  const opened = openBox(key.privateKey, key.info.kid, answer.sealed);
  assert.deepEqual(opened.plain, { origin: "https://ledger.example.com", code: "123456" }, "the sign-in's site travels inside, as with a typed login");
  assert.deepEqual([opened.aad.purpose, opened.aad.deviceId, opened.aad.decisionId, opened.aad.name, opened.aad.origin], ["login", "dev-1", "card-1", "lg_0123456789abcdef0123456789abcdef", "https://node.ensemblework.com"]);
  await assert.rejects(codeAnswer(target({ mode: "sealed", sealKey: key.info }), { id: "card-1" }, "   ", "https://node.ensemblework.com"), /Type the code/);
  await assert.rejects(codeAnswer(target({ mode: "pair_again" }), { id: "card-1" }, "123456", "https://node.ensemblework.com"), /Pair it again/);
  assert.equal(cleanCode("123-456"), "123456");
  assert.equal(cleanCode(" AB12 CD "), "AB12CD");
  assert.equal(codeHintText({ codeHint: "Enter the 6-digit code from your authenticator app.", origin: "https://github.com" }), "github.com says: “Enter the 6-digit code from your authenticator app”");
  assert.equal(codeHintText({ origin: "https://github.com" }), null, "an older computer says nothing more");
  assert.equal(codeInputMode({ codeHint: "Enter the 6-digit code" }), "numeric");
  assert.equal(codeInputMode({ codeHint: "Enter the code we emailed you" }), "text");
});

test("a command's sign-in names the command and who runs the site, on the card and once settled", () => {
  const data = { source: "cli", command: "az login", computer: "Studio", origin: "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?client_id=x" };
  assert.equal(loginCommand(data), "az login");
  assert.equal(loginCommand({ source: "cli" }), "a command");
  assert.equal(loginCommand({ command: "az login" }), null, "a node's own browser");
  assert.equal(loginTitle(data, "lead"), "az login on Studio needs you to sign in to Microsoft");
  assert.equal(loginProvider("https://github.com/login/device"), "GitHub");
  assert.equal(loginProvider("https://accounts.google.com/o/oauth2/auth"), "Google");
  assert.equal(loginProvider("https://d-1234.awsapps.com/start"), "AWS");
  assert.equal(loginProvider("https://wandb.ai/authorize"), "Weights & Biases");
  assert.equal(loginProvider("https://sso.example.org/login"), "sso.example.org", "an unknown site is its host");
  assert.equal(loginProvider("https://notmicrosoft.com.evil.example"), "notmicrosoft.com.evil.example");
  assert.equal(loginOutcomeText({ ...data, status: "signed_in", via: "takeover" }), "Signed in to Microsoft for az login on Studio from the remote view: the command carries on.");
  assert.equal(loginOutcomeText({ ...data, status: "declined" }), "You chose not to sign in to Microsoft for az login on Studio now.");
  assert.equal(loginOutcomeText({ ...data, status: "ended" }), "az login ended before it was signed in.");
});
