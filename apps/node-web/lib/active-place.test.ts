import assert from "node:assert/strict";
import test from "node:test";
import { acquirePlace, nextPlaceInput, placeAllowed, placeHeaders, placeQuery, setPlaceAllowed } from "./active-place";

test("a Node lease survives reload, duplicate tabs get a new id and requests identify only Node", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const id = "08857d82-5895-4e84-a8fc-c26512294764";
  let saved = JSON.stringify({ id, seq: 12, accountId: "account" });
  let heldElsewhere = false;
  const locks = {
    request: async (_name: string, _options: object, callback: (lock: object | null) => Promise<void>) => {
      if (heldElsewhere) { heldElsewhere = false; return callback(null); }
      return callback({});
    },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { sessionStorage: { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } } } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { locks } });
  try {
    let stop = await acquirePlace("account");
    const first = nextPlaceInput();
    assert.equal(first.id, id);
    assert.equal(first.seq, 13);
    assert.equal(first.surface, "node");
    assert.deepEqual(placeHeaders(), { "x-ensemble-place": id, "x-ensemble-place-account": "account", "x-ensemble-place-surface": "node" });
    assert.equal(new URLSearchParams(placeQuery()).get("place"), id);
    setPlaceAllowed(false);
    assert.equal(placeAllowed(), false);
    stop();
    stop = await acquirePlace("account");
    assert.equal(nextPlaceInput().seq, 14);
    stop();
    heldElsewhere = true;
    stop = await acquirePlace("account");
    const duplicate = nextPlaceInput();
    assert.notEqual(duplicate.id, id);
    assert.equal(duplicate.seq, 1);
    stop();
    assert.deepEqual(placeHeaders(), {});
    assert.equal(placeAllowed(), true);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});
