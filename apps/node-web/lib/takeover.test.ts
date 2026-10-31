import assert from "node:assert/strict";
import { createDecipheriv, createHash, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync } from "node:crypto";
import test, { mock } from "node:test";
import { ApiError } from "./api";
import { batchEvents, endedText, fitFrame, keyEvent, keyPress, pageInfo, pageLabel, pointOnFrame, reconnectDelay, retryable, TakeoverSession, TouchGesture, typingEvents } from "./takeover";
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

test("the box types into the page as it changes: new text, a Backspace per character gone, autocorrect included", () => {
  assert.deepEqual(typingEvents("", "mira@fieldnote.example"), [{ t: "text", text: "mira@fieldnote.example" }]);
  assert.deepEqual(typingEvents("mira", "mira@"), [{ t: "text", text: "@" }]);
  assert.deepEqual(typingEvents("helo", "hello "), [...keyPress("Backspace"), { t: "text", text: "lo " }], "a word the keyboard corrected");
  assert.deepEqual(typingEvents("abc", "a"), [...keyPress("Backspace"), ...keyPress("Backspace")]);
  assert.deepEqual(typingEvents("pa👍", "pa"), keyPress("Backspace"), "one Backspace for one character, even outside the BMP");
  assert.deepEqual(typingEvents("same", "same"), []);
  const long = typingEvents("", "x".repeat(2500));
  assert.deepEqual(long.map((event) => (event.t === "text" ? event.text.length : 0)), [1000, 1000, 500], "long pastes go in pieces the computer takes");
  assert.deepEqual(keyPress("Escape"), [{ t: "key", type: "down", key: "Escape" }, { t: "key", type: "up", key: "Escape" }]);
});

test("a finger on the picture: a tap clicks, a drag scrolls the page as far as it moved, a still finger presses and holds", () => {
  const start = { client: { x: 100, y: 300 }, page: { x: 0.25, y: 0.5 } };
  const tap = new TouchGesture(start, 3);
  assert.deepEqual(tap.move({ x: 104, y: 303 }, { x: 0.26, y: 0.51 }), [], "a little wobble is still a tap");
  assert.deepEqual(tap.up(), [{ t: "mouse", type: "move", x: 0.25, y: 0.5 }, { t: "mouse", type: "down", x: 0.25, y: 0.5 }, { t: "mouse", type: "up", x: 0.25, y: 0.5 }]);

  const drag = new TouchGesture(start, 3);
  assert.deepEqual(drag.move({ x: 100, y: 250 }, { x: 0.25, y: 0.4 }), [{ t: "wheel", x: 0.25, y: 0.4, dx: 0, dy: 150 }], "50 px up on a picture at a third of the page's size scrolls 150 px down");
  assert.deepEqual(drag.hold(), [], "a drag never becomes a hold");
  assert.deepEqual(drag.up(), [], "nor a click");

  const hold = new TouchGesture(start, 3);
  assert.deepEqual(hold.hold(), [{ t: "mouse", type: "move", x: 0.25, y: 0.5 }, { t: "mouse", type: "down", x: 0.25, y: 0.5 }]);
  assert.equal(hold.isHolding, true);
  assert.deepEqual(hold.move({ x: 140, y: 300 }, { x: 0.3, y: 0.5 }), [{ t: "mouse", type: "move", x: 0.3, y: 0.5 }], "held, it drags with the button down (sliders)");
  assert.deepEqual(hold.up(), [{ t: "mouse", type: "up", x: 0.3, y: 0.5 }], "and lets go where the finger lifted");
  assert.equal(hold.isHolding, false);

  const cancelled = new TouchGesture(start, 3);
  cancelled.hold();
  assert.deepEqual(cancelled.cancel(), [{ t: "mouse", type: "up", x: 0.25, y: 0.5 }], "a cancelled hold never leaves the button down");
  assert.deepEqual(new TouchGesture(start, 3).cancel(), [], "a cancelled tap does nothing");
});

test("the picture fits the space; the header names the page's site, and a popup as one", () => {
  assert.deepEqual(fitFrame({ width: 1280, height: 800 }, { width: 390, height: 600 }), { width: 390, height: 243 }, "a phone: the whole width");
  assert.deepEqual(fitFrame({ width: 1280, height: 800 }, { width: 1400, height: 700 }), { width: 1120, height: 700 }, "a wide window: as tall as it fits");
  assert.equal(fitFrame({ width: 0, height: 0 }, { width: 390, height: 600 }), null);
  assert.equal(pageLabel({ url: "https://accounts.google.com/v3/signin/identifier?x=1", popup: true }), "accounts.google.com — popup");
  assert.equal(pageLabel({ url: "https://www.walmart.com/blocked", popup: false }), "www.walmart.com");
  assert.equal(pageLabel({ url: "", popup: false }), null);
  assert.deepEqual(pageInfo({ t: "frame", w: 1, h: 1, url: "https://x.example/a" }), { url: "https://x.example/a", title: null, popup: false }, "an older computer says only the address");
  assert.deepEqual(pageInfo({ t: "frame", url: "https://accounts.google.com/", title: " Sign in ", popup: true }), { url: "https://accounts.google.com/", title: "Sign in", popup: true });
  assert.deepEqual(pageInfo({ t: "frame", page: { url: "https://appleid.apple.com/", kind: "popup" } }), { url: "https://appleid.apple.com/", title: null, popup: true });
});

test("a lost connection is tried again, waiting longer each time; an ended takeover is not", () => {
  assert.equal(retryable(new ApiError(0, "Ensemble cannot be reached.")), true);
  assert.equal(retryable(new ApiError(502, "Bad gateway")), true);
  assert.equal(retryable(new ApiError(410, "This takeover has ended.")), false);
  assert.equal(retryable(new ApiError(403, "Only the browser that opened it can control it.")), false);
  assert.equal(retryable(new Error("x")), false);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(reconnectDelay), [500, 1000, 2000, 4000, 8000, 8000, 8000]);
  assert.equal(endedText("signed_in", "Studio"), "Signed in.");
});

test("input sent while the link is down goes again, the same message with the same number; a page's address comes without a picture", async () => {
  const device = computer();
  const id = "6c0d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f";
  let keys: Awaited<ReturnType<typeof takeoverKeys>> | null = null;
  const posted: ChannelMessage[] = [];
  let failures = 1;
  const frames: ChannelMessage[] = [];
  const api = async <T,>(path: string, init: { body?: unknown } = {}): Promise<T> => {
    if (path === "/api/node/takeovers") return { takeover: { id, computer: { id: "dev-1", name: "Studio" }, tab: "t3", origin: "https://shop.example", state: "created", startBy: "", endsAt: null, loginCardId: "card-1", sealKey: device.sealKey }, controller: "cap" } as T;
    if (path.endsWith("/start")) {
      keys = await takeoverKeys(channelFromBase64Url(device.open((init.body as { sealed: { epk: string; iv: string; ct: string; aad: string } }).sealed).plain.k), id);
      frames.push(await sealMessage(keys.d2w, id, "d2w", 1, packMessage({ t: "page", url: "https://accounts.google.com/o/oauth2", popup: true })));
      return { takeover: { state: "live" } } as T;
    }
    if (path.includes("/frames")) return { state: "live", frame: frames.shift() ?? null } as T;
    if (path.endsWith("/input")) {
      posted.push(init.body as ChannelMessage);
      if (failures-- > 0) throw new ApiError(0, "Ensemble cannot be reached.");
      return { ok: true } as T;
    }
    return { signedIn: null } as T;
  };
  const session = new TakeoverSession(api as never, { loginCardId: "card-1" });
  await session.open("https://node.example");
  const first = await session.next();
  assert.equal(first.frame, null, "no picture to draw");
  assert.deepEqual(first.page, { url: "https://accounts.google.com/o/oauth2", title: null, popup: true });
  session.send(typingEvents("", "code"));
  for (let waited = 0; posted.length < 2 && waited < 3000; waited += 20) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(posted.length, 2, "tried again after the failure");
  assert.deepEqual(posted[1], posted[0], "the same message, the same number");
  assert.deepEqual(JSON.parse(new TextDecoder().decode(await openMessage(keys!.w2d, id, "w2d", posted[1]!))).events, [{ t: "text", text: "code" }]);
  session.close();
});

test("a held finger is let go before the view ends, and input keeps being tried for as long as the link is down", async () => {
  const device = computer();
  const id = "7d1e2f30-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
  let keys: Awaited<ReturnType<typeof takeoverKeys>> | null = null;
  const order: string[] = [];
  let failures = 0;
  const api = async <T,>(path: string, init: { body?: unknown } = {}): Promise<T> => {
    if (path === "/api/node/takeovers") return { takeover: { id, computer: { id: "dev-1", name: "Studio" }, tab: "t3", origin: "https://shop.example", state: "created", startBy: "", endsAt: null, loginCardId: "card-1", sealKey: device.sealKey }, controller: "cap" } as T;
    if (path.endsWith("/start")) {
      keys = await takeoverKeys(channelFromBase64Url(device.open((init.body as { sealed: { epk: string; iv: string; ct: string; aad: string } }).sealed).plain.k), id);
      return { takeover: { state: "live" } } as T;
    }
    if (path.endsWith("/input")) {
      if (failures > 0) {
        failures -= 1;
        throw new ApiError(0, "Ensemble cannot be reached.");
      }
      const message = init.body as ChannelMessage;
      const events = (JSON.parse(new TextDecoder().decode(await openMessage(keys!.w2d, id, "w2d", message))) as { events: Array<{ t: string; type?: string }> }).events;
      order.push(`${message.seq}:${events.filter((event) => event.t === "mouse").map((event) => event.type).join(",")}`);
      return { ok: true } as T;
    }
    if (path.endsWith("/end")) order.push("end");
    return { signedIn: null } as T;
  };
  const session = new TakeoverSession(api as never, { loginCardId: "card-1" });
  await session.open("https://node.example");
  const gesture = new TouchGesture({ client: { x: 10, y: 10 }, page: { x: 0.5, y: 0.5 } }, 1);
  session.send(gesture.hold());
  session.send(gesture.cancel());
  await session.end(false);
  assert.deepEqual(order, ["1:move,down", "2:up", "end"], "the mouse goes up before the end");

  mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  try {
    const again = new TakeoverSession(api as never, { loginCardId: "card-1" });
    await again.open("https://node.example");
    order.length = 0;
    failures = 20;
    again.send([{ t: "mouse", type: "down", x: 0.1, y: 0.1 }]);
    for (let turn = 0; turn < 200 && !order.length; turn += 1) {
      await new Promise((resolve) => setImmediate(resolve));
      mock.timers.tick(8_000);
    }
    assert.deepEqual(order, ["1:down"], "still delivered after 20 failed tries, the same message");
    again.close();
  } finally {
    mock.timers.reset();
  }
});
