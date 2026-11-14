import assert from "node:assert/strict";
import test from "node:test";
import { api, ApiError, eventsUrl, nodeFetch } from "./api";
import { acquirePlace, nextPlaceInput, PLACE_BLOCKED_EVENT, setPlaceAllowed } from "./active-place";

test("JSON and byte requests carry Node leases, refusals keep their chooser data and blocked writes never reach the server", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const events: Event[] = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    sessionStorage: { getItem: () => null, setItem() {} },
    dispatchEvent: (event: Event) => { events.push(event); return true; },
  } });
  const stop = await acquirePlace("owner");
  const place = nextPlaceInput();
  let calls = 0;
  let status = 200;
  globalThis.fetch = async (_input, init) => {
    calls += 1;
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("x-ensemble-place"), place.id);
    assert.equal(headers.get("x-ensemble-place-account"), "owner");
    assert.equal(headers.get("x-ensemble-place-surface"), "node");
    assert.equal(headers.get("x-test"), "preserved");
    return Response.json(status === 200 ? { ok: true } : { code: "PLACE_REPLACED", places: [{ label: "Firefox on Linux" }] }, { status });
  };
  try {
    await api("/api/node/bootstrap", { headers: { "x-test": "preserved" } });
    await nodeFetch("/api/documents/one/original", { headers: { "x-test": "preserved" } });
    assert.match(eventsUrl(), /place=/);
    status = 409;
    await assert.rejects(api("/api/node/bootstrap", { headers: { "x-test": "preserved" } }), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, "PLACE_REPLACED");
      assert.match(JSON.stringify(error.data), /Firefox on Linux/);
      return true;
    });
    assert.equal(events.at(-1)?.type, PLACE_BLOCKED_EVENT);
    setPlaceAllowed(false);
    await assert.rejects(api("/api/node/rooms/one/messages", { body: { body: "Do not send" } }), (error: unknown) => error instanceof ApiError && error.code === "PLACE_BLOCKED");
    assert.equal(calls, 3);
  } finally {
    stop();
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
