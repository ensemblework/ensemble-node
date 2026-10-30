import assert from "node:assert/strict";
import test from "node:test";
import vectors from "./seal-vectors.json";
import { fromBase64Url, sealFingerprint, sealFor, sealKeyId, type Sealed } from "./seal";

// The same fixed vectors as Ensemble's (packages/shared-types/src/seal-vectors.json): this site must make
// the box byte for byte as the Hub does, so the computer opens what either sends.
async function ephemeralPair() {
  const curve = { name: "ECDH", namedCurve: "P-256" } as const;
  return {
    privateKey: await crypto.subtle.importKey("pkcs8", fromBase64Url(vectors.ephemeral.pkcs8), curve, true, ["deriveBits"]),
    publicKey: await crypto.subtle.importKey("raw", fromBase64Url(vectors.ephemeral.raw), curve, true, []),
  };
}

test("this site's sealed box matches Ensemble's fixed vector byte for byte", async () => {
  const made = await sealFor(vectors.device, vectors.context, vectors.payload, {
    now: vectors.now,
    ttlMs: vectors.ttlMs,
    iv: fromBase64Url(vectors.iv),
    nonce: fromBase64Url(vectors.nonce),
    ephemeral: await ephemeralPair(),
  });
  assert.deepEqual(made.sealed, vectors.sealed as Sealed);
  assert.equal(made.fingerprint, vectors.device.fingerprint);
});

test("the fingerprint shown is worked out from the key itself, and a key whose id does not match it is refused", async () => {
  assert.equal(await sealKeyId(vectors.device.spki), vectors.device.kid);
  assert.equal(await sealFingerprint(vectors.device.spki), vectors.device.fingerprint);
  await assert.rejects(sealFor({ spki: vectors.device.spki, kid: "0000000000000000" }, vectors.context, { value: "x" }), /does not match its id/);
});
