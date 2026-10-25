import assert from "node:assert/strict";
import test from "node:test";
import { connectorStatus, liveDevices, previewText } from "./ensemble";
import type { ConnectorEntry, Device } from "./types";

test("an approval preview reads as text", () => {
  assert.equal(previewText("Push to main"), "Push to main");
  assert.equal(previewText({ summary: "Create 2 tasks", calls: [] }), "Create 2 tasks");
  assert.equal(previewText({ a: 1 }), '{"a":1}');
  assert.equal(previewText(null), "");
});

test("revoked computers go and online ones come first", () => {
  const device = (name: string, online: boolean, revokedAt: string | null = null): Device => ({ id: name, name, platform: "darwin", appVersion: "1", folders: [], online, lastSeenAt: null, revokedAt });
  assert.deepEqual(liveDevices([device("b", false), device("a", true), device("c", true, "2026-01-01")]).map((row) => row.name), ["a", "b"]);
});

test("a connection says whether it is connected, as whom, or what is wrong", () => {
  const entry = (state: Partial<ConnectorEntry["state"]>, more: Partial<ConnectorEntry> = {}): ConnectorEntry => ({
    id: "x", logo: "x", name: "X", vendor: "X", category: "chat", featured: false, tagline: "", auth: ["oauth"], reads: [], writes: [], status: "ready",
    products: [{ id: "mail", name: "Gmail" }],
    state: { connected: false, account: null, appReady: true, products: {}, sources: {}, ...state },
    ...more,
  });
  assert.deepEqual(connectorStatus(entry({ connected: true, account: "mira@x.dev" })), { section: "connected", tone: "ok", label: "Connected as mira@x.dev" });
  assert.equal(connectorStatus(entry({ connected: true, needsConsent: ["mail"] })).label, "Needs your consent for Gmail");
  assert.equal(connectorStatus(entry({ connected: true, sources: { gmail: { enabled: true, lastSyncAt: null, lastError: "token expired" } } })).label, "Error: token expired");
  assert.equal(connectorStatus(entry({ mcp: { status: "error", toolCount: 0, lastError: "401" } })).tone, "danger");
  assert.equal(connectorStatus(entry({ mcp: { status: "connected", toolCount: 3, lastError: null, auth: "none" } })).label, "Public data only");
  assert.equal(connectorStatus(entry({})).section, "available");
  assert.equal(connectorStatus(entry({ appReady: false })).section, "unavailable");
});
