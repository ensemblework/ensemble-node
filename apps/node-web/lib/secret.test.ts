import assert from "node:assert/strict";
import { createDecipheriv, createHash, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync } from "node:crypto";
import test from "node:test";
import { keptText, parseAllow, routeText, savedText, secretAnswer, targetFingerprint, type SecretTarget } from "./secret";

function computerKey() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const spki = publicKey.export({ type: "spki", format: "der" });
  const kid = createHash("sha256").update(spki).digest("hex").slice(0, 16);
  return { privateKey, info: { kid, alg: "ECDH-P256+HKDF-SHA256+A256GCM", spki: spki.toString("base64url"), fingerprint: kid.toUpperCase().match(/.{4}/g)!.join(" ") } };
}

const target = (route: SecretTarget["route"]): SecretTarget => ({ id: "card-1", name: "STRIPE_KEY", status: "pending", computer: { id: "dev-1", name: "Mira's laptop", online: true }, route, ttlMs: 600_000, allow: [] });

test("the box is sealed for the computer and bound to the card, this site and the name; the computer's own key opens it", async () => {
  const key = computerKey();
  const answer = await secretAnswer(target({ mode: "sealed", sealKey: key.info }), { id: "card-1" }, "sk_test_123", ["https://api.stripe.com"], "https://node.ensemblework.com");
  assert.ok("sealed" in answer);
  assert.ok(!JSON.stringify(answer).includes("sk_test_123"), "nothing in clear");
  const box = answer.sealed;
  const aad = JSON.parse(Buffer.from(box.aad, "base64url").toString("utf8"));
  assert.deepEqual([aad.deviceId, aad.decisionId, aad.name, aad.origin], ["dev-1", "card-1", "STRIPE_KEY", "https://node.ensemblework.com"]);
  const epk = Buffer.from(box.epk, "base64url");
  const shared = diffieHellman({ privateKey: key.privateKey, publicKey: createPublicKey({ key: { kty: "EC", crv: "P-256", x: epk.subarray(1, 33).toString("base64url"), y: epk.subarray(33).toString("base64url") }, format: "jwk" }) });
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(hkdfSync("sha256", shared, epk, Buffer.from(`ensemble-seal-v1|${key.info.kid}`), 32)), Buffer.from(box.iv, "base64url"));
  const ct = Buffer.from(box.ct, "base64url");
  decipher.setAAD(Buffer.from(box.aad, "base64url"));
  decipher.setAuthTag(ct.subarray(ct.length - 16));
  assert.deepEqual(JSON.parse(Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]).toString("utf8")), { value: "sk_test_123", allow: ["https://api.stripe.com"] });
  assert.equal(await targetFingerprint(target({ mode: "sealed", sealKey: key.info })), key.info.fingerprint);
});

test("the card's words are accurate for each way the value travels", async () => {
  assert.deepEqual(await secretAnswer(target({ mode: "tls" }), { id: "card-1" }, "v", [], "https://node.ensemblework.com"), { value: "v" });
  await assert.rejects(secretAnswer(target({ mode: "pair_again" }), { id: "card-1" }, "v", [], "https://node.ensemblework.com"), /Pair it again/);
  assert.equal(routeText(target({ mode: "tls" }), null), "Sent over HTTPS to Ensemble's server, which passes it to Mira's laptop without keeping it. Mira's laptop is too old for end-to-end encryption; update Ensemble there.");
  assert.match(routeText(target({ mode: "sealed", sealKey: computerKey().info }), "AAAA BBBB CCCC DDDD", "ensemble-test"), /Key AAAA BBBB CCCC DDDD: it should match `ensemble-test secrets fingerprint` on Mira's laptop\.$/);
  assert.match(keptText("STRIPE_KEY", "Mira's laptop", ["https://api.stripe.com"]), /by reference only/);
  assert.equal(savedText({ name: "STRIPE_KEY", computer: "Mira's laptop", sealed: true, allow: [] }), "Saved on Mira's laptop. Runs there get it as $STRIPE_KEY. Encrypted end to end.");
  assert.equal(savedText({ name: "K", computer: "Laptop", sealed: false, allow: ["https://api.x.com"] }), "Saved on Laptop. Runs there use it by reference only, sent to https://api.x.com. Sent over HTTPS through Ensemble's server (not end to end).");
  assert.deepEqual(parseAllow("https://a.example, https://b.example https://a.example"), ["https://a.example", "https://b.example"]);
});
