import assert from "node:assert/strict";
import { createDecipheriv, createHash, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, type KeyObject } from "node:crypto";
import test from "node:test";
import vectors from "./seal-vectors.json";
import { fromBase64Url, type Sealed } from "./seal";
import { commandHash, sealedSudoRun, sudoOutcome, sudoRetryNote, sudoSealContext, sudoState, type SudoTarget } from "./sudo";

function computerKey() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const spki = publicKey.export({ type: "spki", format: "der" });
  const kid = createHash("sha256").update(spki).digest("hex").slice(0, 16);
  return { privateKey, info: { kid, alg: "ECDH-P256+HKDF-SHA256+A256GCM", spki: spki.toString("base64url"), fingerprint: kid.toUpperCase().match(/.{4}/g)!.join(" ") } };
}

/** Opens a box as the computer does (hub-api credentials/seal.ts): ECDH, HKDF-SHA-256 with the ephemeral key as salt, AES-256-GCM over the AAD. */
function open(box: Sealed, key: { privateKey: KeyObject; info: { kid: string } }) {
  const epk = Buffer.from(box.epk, "base64url");
  const shared = diffieHellman({ privateKey: key.privateKey, publicKey: createPublicKey({ key: { kty: "EC", crv: "P-256", x: epk.subarray(1, 33).toString("base64url"), y: epk.subarray(33).toString("base64url") }, format: "jwk" }) });
  const aesKey = Buffer.from(hkdfSync("sha256", shared, epk, Buffer.from(`ensemble-seal-v1|${key.info.kid}`), 32));
  const ct = Buffer.from(box.ct, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", aesKey, Buffer.from(box.iv, "base64url"));
  decipher.setAAD(Buffer.from(box.aad, "base64url"));
  decipher.setAuthTag(ct.subarray(ct.length - 16));
  return { aad: JSON.parse(Buffer.from(box.aad, "base64url").toString("utf8")), plain: JSON.parse(Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]).toString("utf8")) };
}

const COMMAND = "apt-get install -y xvfb";
const HASH = createHash("sha256").update(COMMAND).digest("hex");
const card = (data: Record<string, unknown> = {}) => ({ id: "card-sudo-1", data: { type: "sudo", status: "pending", command: COMMAND, commandHash: HASH, deviceId: "dev-1", deviceName: "Akash's-HomeServer", ...data } });
const target = (route: SudoTarget["route"], more: Partial<SudoTarget> = {}): SudoTarget => ({ command: COMMAND, commandHash: HASH, deviceName: "Akash's-HomeServer", route, ...more });

test("the command's hash is the SHA-256 the computer checks", async () => {
  assert.equal(await commandHash(COMMAND), HASH);
  assert.equal(await commandHash(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

test("a password typed here is sealed for the card's computer, bound to the card, the command's hash and this site", async () => {
  const key = computerKey();
  const answer = await sealedSudoRun(target({ mode: "sealed", sealKey: key.info }), card(), "hunter2-pw", "https://node.ensemblework.com");
  assert.equal(answer.action, "run");
  assert.ok(answer.action === "run" && answer.sealed);
  assert.ok(!JSON.stringify(answer).includes("hunter2-pw"), "nothing in clear");
  const { aad, plain } = open(answer.sealed!, key);
  assert.deepEqual([aad.purpose, aad.kid, aad.deviceId, aad.decisionId, aad.name, aad.origin], ["sudo", key.info.kid, "dev-1", "card-sudo-1", HASH, "https://node.ensemblework.com"]);
  assert.deepEqual(plain, { password: "hunter2-pw" });
  assert.deepEqual(sudoSealContext(card(), { commandHash: HASH }, "https://node-test.ensemblework.com"), { purpose: "sudo", deviceId: "dev-1", decisionId: "card-sudo-1", name: HASH, origin: "https://node-test.ensemblework.com" });
});

test("the box is Ensemble's sealed box v1 with the sudo context: the shared test computer opens it", async () => {
  const curve = { name: "ECDH", namedCurve: "P-256" } as const;
  const ephemeral = {
    privateKey: await crypto.subtle.importKey("pkcs8", fromBase64Url(vectors.ephemeral.pkcs8), curve, true, ["deriveBits"]),
    publicKey: await crypto.subtle.importKey("raw", fromBase64Url(vectors.ephemeral.raw), curve, true, []),
  };
  const options = { now: vectors.now, ttlMs: vectors.ttlMs, iv: fromBase64Url(vectors.iv), nonce: fromBase64Url(vectors.nonce), ephemeral };
  const sealKey = { ...vectors.device, alg: "ECDH-P256+HKDF-SHA256+A256GCM" };
  const made = await sealedSudoRun(target({ mode: "sealed", sealKey }), card({ deviceId: vectors.context.deviceId }), "pw", vectors.context.origin, options);
  assert.ok(made.action === "run" && made.sealed);
  assert.equal(made.sealed!.epk, vectors.sealed.epk, "the same fixed ephemeral key as the shared vectors");
  const computer = { privateKey: createPrivateKey({ key: Buffer.from(vectors.device.pkcs8, "base64url"), format: "der", type: "pkcs8" }), info: sealKey };
  const { aad, plain } = open(made.sealed!, computer);
  assert.deepEqual(Object.keys(aad), ["v", "purpose", "kid", "deviceId", "decisionId", "name", "origin", "expiresAt", "nonce"], "the computer reads the AAD in this key order");
  assert.deepEqual([aad.purpose, aad.deviceId, aad.decisionId, aad.name, aad.expiresAt], ["sudo", vectors.context.deviceId, "card-sudo-1", HASH, new Date(vectors.now + vectors.ttlMs).toISOString()]);
  assert.deepEqual(plain, { password: "pw" });
});

test("nothing is sealed for a command other than the one shown, or for a computer that cannot take it", async () => {
  const key = computerKey();
  const sealed = { mode: "sealed" as const, sealKey: key.info };
  await assert.rejects(sealedSudoRun(target(sealed, { command: "rm -rf /tmp/x" }), card(), "pw", "https://node.ensemblework.com"), /not the one the computer would run/);
  await assert.rejects(sealedSudoRun(target(sealed, { commandHash: "0".repeat(64) }), card(), "pw", "https://node.ensemblework.com"), /not the one the computer would run/);
  await assert.rejects(sealedSudoRun(target(sealed), card({ commandHash: "f".repeat(64) }), "pw", "https://node.ensemblework.com"), /not the one the computer would run/);
  await assert.rejects(sealedSudoRun(target({ mode: "unavailable", reason: "Update Ensemble on Akash's-HomeServer to run commands as administrator." }), card(), "pw", "https://node.ensemblework.com"), /Update Ensemble/);
  await assert.rejects(sealedSudoRun(target(sealed), card({ deviceId: "" }), "pw", "https://node.ensemblework.com"), /which computer/);
  await assert.rejects(sealedSudoRun(target(sealed), card(), "", "https://node.ensemblework.com"), /password first/);
});

test("the card's pill and its outcome, in words", () => {
  assert.deepEqual(sudoState({ status: "pending" }), { label: "Waiting for you", tone: "warn" });
  assert.deepEqual(sudoState({ status: "running" }), { label: "Running…", tone: "accent" });
  assert.deepEqual(sudoState({ status: "done", exitCode: 0 }), { label: "Done", tone: "ok" });
  assert.deepEqual(sudoState({ status: "done", exitCode: 2 }), { label: "Failed · exit 2", tone: "danger" });
  assert.deepEqual(sudoState({ status: "denied" }), { label: "Not run", tone: "muted" });
  assert.equal(sudoOutcome({ status: "done", exitCode: 0, deviceName: "Studio" }), "Ran as administrator on Studio · exit code 0.");
  assert.equal(sudoOutcome({ status: "done", exitCode: 100, deviceName: "Studio" }), "It ran on Studio and failed with exit code 100.");
  assert.equal(sudoOutcome({ status: "failed", error: "sudo: 1 incorrect password attempt", deviceName: "Studio" }), "It could not run on Studio: sudo: 1 incorrect password attempt");
  assert.equal(sudoOutcome({ status: "expired" }), "Nobody answered in time, so it was not run.");
});

test("a refused password: the card waits again and says how many tries are left; a run that exited badly failed", () => {
  assert.equal(sudoRetryNote({ status: "pending", error: "The password was not accepted. Type it again.", tries: 1 }), "The password was not accepted. Type it again. 2 tries left.");
  assert.equal(sudoRetryNote({ status: "pending", error: "The password was not accepted. Type it again.", tries: 2 }), "The password was not accepted. Type it again. 1 try left.");
  assert.equal(sudoRetryNote({ status: "pending", error: null }), null);
  assert.equal(sudoRetryNote({ status: "failed", error: "The password was not accepted 3 times, so it did not run." }), null, "only while it waits again");
  // Ensemble marks a run that ended with another code than 0 as failed, with that code.
  assert.deepEqual(sudoState({ status: "failed", exitCode: 100 }), { label: "Failed · exit 100", tone: "danger" });
  assert.equal(sudoOutcome({ status: "failed", exitCode: 100, error: "It ended with exit code 100.", deviceName: "Studio" }), "It ran on Studio and failed with exit code 100.");
  assert.equal(sudoOutcome({ status: "failed", exitCode: null, error: "Studio is offline.", deviceName: "Studio" }), "It could not run on Studio: Studio is offline.");
});

test("the computer's id comes from the card, else from Ensemble's answer; the box lasts as long as Ensemble says", async () => {
  assert.equal(sudoSealContext({ id: "c", data: {} }, { commandHash: HASH, deviceId: "dev-9" }, "https://x").deviceId, "dev-9");
  const key = computerKey();
  const made = await sealedSudoRun(target({ mode: "sealed", sealKey: key.info }, { ttlMs: 120_000 }), card(), "pw", "https://node.ensemblework.com", { now: Date.parse("2026-10-31T00:00:00Z") });
  assert.ok(made.action === "run" && made.sealed);
  assert.equal(open(made.sealed!, key).aad.expiresAt, "2026-10-31T00:02:00.000Z");
});
