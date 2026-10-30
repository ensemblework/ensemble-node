import assert from "node:assert/strict";
import { createDecipheriv, createHash, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync } from "node:crypto";
import test from "node:test";
import { batchEvents, endedText, keyEvent, pointOnFrame, TakeoverSession } from "./takeover";
import { channelFromBase64Url, openMessage, packMessage, sealMessage, takeoverKeys, type ChannelMessage } from "./takeover-channel";

test("a pointer on the picture is a fraction of the page, also when the picture is letterboxed; outside it, nothing", () => {
  assert.deepEqual(pointOnFrame(110, 60, { left: 10, top: 10, width: 400, height: 250 }, { width: 1280, height: 800 }), { x: 0.25, y: 0.2 });
  // A tall box: the 16:10 picture sits in the middle, 250 high.
  assert.deepEqual(pointOnFrame(210, 300, { left: 10, top: 0, width: 400, height: 600 }, { width: 1280, height: 800 }), { x: 0.5, y: 0.5 });
  assert.equal(pointOnFrame(210, 100, { left: 10, top: 0, width: 400, height: 600 }, { width: 1280, height: 800 }), null, "above the picture");
  assert.equal(pointOnFrame(5, 5, { left: 10, top: 10, width: 400, height: 250 }, { width: 0, height: 0 }), null);
});

test("keys go as the computer takes them; composition and function keys stay here; moves and pings are merged", () => {
  assert.deepEqual(keyEvent("down", { key: "a" }), { t: "key", type: "down", key: "a" });
  assert.deepEqual(keyEvent("up", { key: "Enter" }), { t: "key", type: "up", key: "Enter" });
  assert.deepEqual(keyEvent("down", { key: " " }), { t: "key", type: "down", key: " " });
  assert.equal(keyEvent("down", { key: "F5" }), null);
  assert.equal(keyEvent("down", { key: "e", isComposing: true }), null);
  assert.equal(keyEvent("down", { key: "Process" }), null);
  const point = { x: 0.1, y: 0.2 };
  assert.deepEqual(
    batchEvents([{ t: "mouse", type: "move", ...point }, { t: "mouse", type: "move", x: 0.3, y: 0.4 }, { t: "ping" }, { t: "mouse", type: "down", ...point }, { t: "ping" }, { t: "text", text: "hi" }]),
    [{ t: "mouse", type: "move", x: 0.3, y: 0.4 }, { t: "ping" }, { t: "mouse", type: "down", ...point }, { t: "text", text: "hi" }],
  );
  assert.equal(endedText("expired", "Studio"), "Its time ran out (15 minutes). Open the browser again to go on.");
  assert.equal(endedText("unpaired", "Studio"), "Studio is no longer paired.");
});

/** The computer, as the relay passes things to it: it opens the sealed secret with its private key, as Ensemble's computer code does. */
function computer() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const spki = publicKey.export({ type: "spki", format: "der" });
  const kid = createHash("sha256").update(spki).digest("hex").slice(0, 16);
  const sealKey = { kid, alg: "ECDH-P256+HKDF-SHA256+A256GCM", spki: spki.toString("base64url"), fingerprint: kid.toUpperCase().match(/.{4}/g)!.join(" ") };
  const open = (box: { epk: string; iv: string; ct: string; aad: string }) => {
    const epk = Buffer.from(box.epk, "base64url");
    const shared = diffieHellman({ privateKey, publicKey: createPublicKey({ key: { kty: "EC", crv: "P-256", x: epk.subarray(1, 33).toString("base64url"), y: epk.subarray(33).toString("base64url") }, format: "jwk" }) });
    const key = Buffer.from(hkdfSync("sha256", shared, epk, Buffer.from(`ensemble-seal-v1|${kid}`), 32));
    const ct = Buffer.from(box.ct, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(box.iv, "base64url"));
    decipher.setAAD(Buffer.from(box.aad, "base64url"));
    decipher.setAuthTag(ct.subarray(ct.length - 16));
    return { aad: JSON.parse(Buffer.from(box.aad, "base64url").toString("utf8")), plain: JSON.parse(Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]).toString("utf8")) };
  };
  return { sealKey, open };
}

test("a session seals its secret for the computer, opens frames, and sends input numbered, in order, with the capability", async () => {
  const device = computer();
  const id = "5b0c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d";
  const calls: Array<{ path: string; body?: unknown; headers?: Record<string, string> }> = [];
  let keys: Awaited<ReturnType<typeof takeoverKeys>> | null = null;
  const frames: ChannelMessage[] = [];
  const api = async <T,>(path: string, init: { body?: unknown; headers?: Record<string, string> } = {}): Promise<T> => {
    calls.push({ path, body: init.body, headers: init.headers });
    if (path === "/api/node/takeovers") return { takeover: { id, computer: { id: "dev-1", name: "Studio" }, tab: "t3", origin: "https://bank.example", state: "created", startBy: "", endsAt: null, loginCardId: "card-1", sealKey: device.sealKey }, controller: "cap-123" } as T;
    if (path.endsWith("/start")) {
      const { aad, plain } = device.open((init.body as { sealed: { epk: string; iv: string; ct: string; aad: string } }).sealed);
      assert.deepEqual([aad.purpose, aad.decisionId, aad.name, aad.deviceId, aad.origin], ["takeover", id, "t3", "dev-1", "https://node.example"]);
      keys = await takeoverKeys(channelFromBase64Url(plain.k), id);
      frames.push(await sealMessage(keys.d2w, id, "d2w", 1, packMessage({ t: "frame", w: 1280, h: 800, url: "https://bank.example/login" }, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))));
      return { takeover: { state: "live" } } as T;
    }
    if (path.includes("/frames")) return { state: "live", frame: frames.shift() ?? null } as T;
    if (path.endsWith("/end")) return { signedIn: true } as T;
    return { ok: true } as T;
  };
  const session = new TakeoverSession(api as never, { loginCardId: "card-1" });
  await session.open("https://node.example");
  const first = await session.next();
  assert.deepEqual([first.frame?.width, first.frame?.height, first.frame?.url, [...(first.frame?.jpeg ?? [])]], [1280, 800, "https://bank.example/login", [0xff, 0xd8, 0xff, 0xd9]]);
  session.send([{ t: "text", text: "mira" }]);
  session.send([{ t: "key", type: "down", key: "Enter" }, { t: "key", type: "up", key: "Enter" }]);
  const result = await session.end(true);
  assert.deepEqual(result, { signedIn: true });
  const inputs = calls.filter((call) => call.path.endsWith("/input"));
  assert.ok(inputs.length >= 1 && inputs.every((call) => call.headers?.["x-ensemble-takeover"] === "cap-123"), "every call carries the capability");
  const sent: unknown[] = [];
  for (const [index, call] of inputs.entries()) {
    const message = call.body as ChannelMessage;
    assert.equal(message.seq, index + 1, "numbered in order");
    assert.ok(!JSON.stringify(message).includes("mira"), "encrypted");
    sent.push(...(JSON.parse(new TextDecoder().decode(await openMessage(keys!.w2d, id, "w2d", message))) as { events: unknown[] }).events);
  }
  assert.deepEqual(sent, [{ t: "text", text: "mira" }, { t: "key", type: "down", key: "Enter" }, { t: "key", type: "up", key: "Enter" }]);
  assert.ok(calls.some((call) => call.path.endsWith("/end") && (call.body as { done: boolean }).done === true));
});
