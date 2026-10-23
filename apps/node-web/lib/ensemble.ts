/** Pure helpers for what Node shows from Ensemble itself: Needs me, paired computers, connections. */
import type { AgentDecision, ConnectorEntry, Device } from "./types";

export const SOURCE_LABEL: Record<AgentDecision["source"], string> = {
  cursor: "Cursor",
  claude: "Claude Code",
  copilot: "Copilot",
  codex: "Codex",
  ensemble: "Ensemble's agent",
  other: "An agent",
};

/**
 * How Node can answer a question from Needs me.
 * - simple: Allow or Deny here.
 * - confirm: Allow needs a second, explicit confirmation (a push, a path outside the folder…).
 * - device: that computer takes this kind of approval only on itself; Deny works here.
 * - options: the agent asks to pick an answer; answer it in Ensemble.
 * - elsewhere: someone else answers it (the person whose computer runs it).
 */
export type DecisionMode = "simple" | "confirm" | "device" | "options" | "elsewhere";

export function decisionMode(decision: Pick<AgentDecision, "canAnswer" | "detail">): DecisionMode {
  const detail = decision.detail ?? {};
  if (decision.canAnswer === false) return "elsewhere";
  if (detail.options?.length) return "options";
  if (detail.deviceId && (detail.tier === "run_branch_push" || detail.tier === "high_risk")) return "device";
  if (detail.confirm) return "confirm";
  return "simple";
}

/** A run approval's preview, as one readable line or block. */
export function previewText(preview: unknown, max = 400): string {
  if (preview == null) return "";
  if (typeof preview === "string") return preview.slice(0, max);
  if (typeof preview === "object") {
    const record = preview as Record<string, unknown>;
    for (const key of ["summary", "text", "body", "message", "command", "description"]) {
      if (typeof record[key] === "string" && record[key]) return (record[key] as string).slice(0, max);
    }
  }
  const json = JSON.stringify(preview);
  return json.length > max ? `${json.slice(0, max)}…` : json;
}

/** Paired computers that still count: revoked ones go, online ones first. */
export function liveDevices(devices: readonly Device[]): Device[] {
  return devices.filter((row) => !row.revokedAt).sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
}

export type ConnectorStatus = {
  /** connected: shown under "Connected" (including ones that need attention). available: can be connected. unavailable: not on this server. */
  section: "connected" | "available" | "unavailable";
  tone: "ok" | "warn" | "danger" | "muted";
  label: string;
};

export function connectorStatus(entry: ConnectorEntry): ConnectorStatus {
  const state = entry.state;
  const mcp = state.mcp;
  const connected = state.connected || mcp?.status === "connected";
  if (mcp?.status === "error") return { section: "connected", tone: "danger", label: `Error: ${mcp.lastError ?? "the server did not answer"}` };
  if (connected) {
    if (state.needsConsent?.length) {
      const names = state.needsConsent.map((id) => entry.products?.find((row) => row.id === id)?.name ?? id);
      return { section: "connected", tone: "warn", label: `Needs your consent for ${names.join(", ")}` };
    }
    const failing = Object.values(state.sources ?? {}).find((row) => row.enabled && row.lastError);
    if (failing) return { section: "connected", tone: "danger", label: `Error: ${failing.lastError}` };
    if (mcp?.status === "connected" && mcp.auth === "none" && !entry.mcp?.open) return { section: "connected", tone: "warn", label: "Public data only" };
    const account = state.account ?? mcp?.account ?? null;
    return { section: "connected", tone: "ok", label: account ? `Connected as ${account}` : "Connected" };
  }
  if (mcp?.status === "pending") return { section: "connected", tone: "warn", label: "Waiting for sign-in" };
  if (mcp?.status === "disabled") return { section: "connected", tone: "muted", label: "Turned off" };
  if (entry.status === "soon" || !state.appReady) return { section: "unavailable", tone: "muted", label: entry.status === "soon" ? "Coming soon" : "Not set up on this server yet" };
  return { section: "available", tone: "muted", label: "Not connected" };
}
