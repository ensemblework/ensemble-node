"use client";

import { useMemo, useState } from "react";
import { Plug, Search } from "lucide-react";
import { ENSEMBLE_LINKS } from "@/lib/config";
import { CONNECTOR_TRADEMARK_NOTICE } from "@/lib/connector-logos";
import { connectorStatus } from "@/lib/ensemble";
import { useConnectors, useMcpConnections } from "@/lib/hooks";
import type { ConnectorEntry, McpConnection } from "@/lib/types";
import { External, Notice, Pill, Segmented, Spinner } from "@/components/ui";
import { ConnectorLogo } from "@/components/connector-logo";

const TONE_CLASS = { ok: "text-ok", warn: "text-warn", danger: "text-danger", muted: "text-muted" } as const;

function EntryRow({ entry }: { entry: ConnectorEntry }) {
  const status = connectorStatus(entry);
  const connected = status.section === "connected";
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line bg-bg px-3 py-2.5">
      <ConnectorLogo id={entry.logo ?? entry.id} name={entry.name} decorative />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <span className="truncate">{entry.name}</span>
          {entry.auth.includes("mcp") && !entry.provider ? <Pill>MCP</Pill> : null}
        </span>
        <span className={`block truncate text-xs ${connected ? TONE_CLASS[status.tone] : "text-muted"}`}>{connected ? status.label : entry.tagline}</span>
      </span>
      <External
        href={ENSEMBLE_LINKS.connector(entry.id)}
        icon
        className={`inline-flex shrink-0 items-center rounded-lg px-2.5 py-1.5 text-xs font-medium ${connected ? "border border-line hover:bg-raised" : "bg-accent text-accent-ink hover:brightness-110"}`}
        aria-label={`${connected ? "Manage" : "Connect"} ${entry.name} in Ensemble`}
      >
        {connected ? "Manage" : "Connect"}
      </External>
    </li>
  );
}

function CustomRow({ connection }: { connection: McpConnection }) {
  const tone = connection.status === "connected" ? "text-ok" : connection.status === "error" ? "text-danger" : "text-muted";
  let host = connection.url;
  try {
    host = new URL(connection.url).host;
  } catch {
    // keep the raw address
  }
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line bg-bg px-3 py-2.5">
      <ConnectorLogo id="custom" name={connection.name} decorative />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <span className="truncate">{connection.name}</span> <Pill>MCP</Pill>
        </span>
        <span className={`block truncate text-xs ${tone}`}>
          {connection.status === "error" ? `Error: ${connection.lastError ?? "the server did not answer"}` : connection.status === "connected" ? `Connected${connection.account ? ` as ${connection.account}` : ""} · ${connection.toolCount} tools · ${host}` : `${connection.status} · ${host}`}
        </span>
      </span>
      <External href={ENSEMBLE_LINKS.connections} icon className="inline-flex shrink-0 items-center rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium hover:bg-raised">
        Manage
      </External>
    </li>
  );
}

export default function ConnectionsPage() {
  const entries = useConnectors();
  const mcp = useMcpConnections();
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"connected" | "all">("connected");
  const { connected, available, unavailable } = useMemo(() => {
    const rows = (entries.data ?? []).map((entry) => ({ entry, status: connectorStatus(entry) }));
    const query = q.trim().toLowerCase();
    const match = (entry: ConnectorEntry) => !query || [entry.name, entry.vendor, entry.tagline, ...entry.reads].some((value) => value.toLowerCase().includes(query));
    return {
      connected: rows.filter((row) => row.status.section === "connected" && match(row.entry)).map((row) => row.entry),
      available: rows
        .filter((row) => row.status.section === "available" && match(row.entry))
        .map((row) => row.entry)
        .sort((a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name)),
      unavailable: rows.filter((row) => row.status.section === "unavailable").length,
    };
  }, [entries.data, q]);
  const known = new Set((entries.data ?? []).map((entry) => entry.id));
  const custom = (mcp.data ?? []).filter((row) => !row.serverId || !known.has(row.serverId));
  const showAll = show === "all" || Boolean(q.trim());

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:px-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Connections</h1>
          <p className="text-sm text-muted">
            Your nodes read everything connected here, and write to it only after you approve. It is the same list as in Ensemble, because it is the same account.{" "}
            <External href={ENSEMBLE_LINKS.connections} icon className="text-accent hover:underline">
              Open in Ensemble
            </External>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-bg px-3 py-2 focus-within:border-accent">
            <Search size={15} className="text-muted" />
            <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Find an app" aria-label="Find an app" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted" />
          </label>
          <Segmented
            label="Show"
            value={show}
            onChange={setShow}
            options={[
              { id: "connected", label: "Connected" },
              { id: "all", label: "Everything" },
            ]}
          />
        </div>

        {entries.isLoading ? (
          <div className="flex justify-center py-10 text-muted">
            <Spinner />
          </div>
        ) : entries.error ? (
          <Notice tone="error">{entries.error.message}</Notice>
        ) : (
          <>
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Connected ({connected.length + custom.length})</h2>
              {connected.length || custom.length ? (
                <ul className="space-y-1.5">
                  {connected.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} />
                  ))}
                  {custom.map((connection) => (
                    <CustomRow key={connection.id} connection={connection} />
                  ))}
                </ul>
              ) : (
                <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-5 text-sm text-muted">
                  <Plug size={18} className="shrink-0" /> Nothing is connected yet. Connect mail, calendar, files or your issue tracker in Ensemble, and your nodes can use them.
                </div>
              )}
            </section>

            {showAll ? (
              <section className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Can be connected ({available.length})</h2>
                <ul className="space-y-1.5">
                  {available.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} />
                  ))}
                </ul>
                {unavailable ? <p className="text-xs text-muted">{unavailable} more are listed in Ensemble but not set up on this server yet.</p> : null}
              </section>
            ) : (
              <button type="button" onClick={() => setShow("all")} className="text-sm text-accent hover:underline">
                Show the {available.length === 1 ? "app" : `${available.length} apps`} you can connect
              </button>
            )}
          </>
        )}
        <p className="text-xs text-muted">{CONNECTOR_TRADEMARK_NOTICE}</p>
      </div>
    </div>
  );
}
