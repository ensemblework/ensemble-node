"use client";

import { Crown } from "lucide-react";
import { useBootstrap } from "@/lib/hooks";
import { modelName, shortModelName } from "@/lib/models";
import type { NodeFull } from "@/lib/types";
import { NodeAvatar } from "./node-avatar";

/**
 * My nodes as a checkbox list, with a Lead radio on the ones picked. Used to make a crew or a room
 * and to answer a request to join.
 */
export function NodePicker({
  nodes,
  selected,
  onChange,
  lead,
  onLead,
  max,
  label,
  leadHint = "Lead",
}: {
  nodes: readonly NodeFull[];
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  lead: string | null;
  onLead: (nodeId: string) => void;
  max: number;
  label: string;
  leadHint?: string;
}) {
  const boot = useBootstrap();
  const options = boot.data?.models.options ?? [];
  const fallback = boot.data?.models.default ?? "gpt-5-mini";
  const full = selected.size >= max;
  if (!nodes.length) return <p className="text-sm text-muted">You have no nodes yet.</p>;
  return (
    <ul className="space-y-1.5" role="group" aria-label={label}>
      {nodes.map((node) => {
        const on = selected.has(node.id);
        return (
          <li key={node.id} className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition ${on ? "border-accent/60 bg-accent/5" : "border-line bg-bg"}`}>
            <label className={`flex min-w-0 flex-1 items-center gap-2.5 ${!on && full ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
              <input
                type="checkbox"
                className="h-4 w-4 accent-[rgb(var(--accent))]"
                checked={on}
                disabled={!on && full}
                onChange={(event) => {
                  const next = new Set(selected);
                  if (event.target.checked) next.add(node.id);
                  else next.delete(node.id);
                  onChange(next);
                  if (event.target.checked && !lead) onLead(node.id);
                }}
              />
              <NodeAvatar node={node} size={28} dim={node.status === "paused"} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {node.name} <span className="font-mono text-xs font-normal text-muted">@{node.slug}</span>
                </span>
                <span className="block truncate text-xs text-muted">
                  {node.role} · {shortModelName(modelName(options, node.provider, node.model, fallback))}
                  {node.status === "paused" ? " · paused" : ""}
                </span>
              </span>
            </label>
            {on ? (
              <label className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs ${lead === node.id ? "bg-accent/15 text-accent" : "text-muted hover:bg-raised"}`}>
                <input type="radio" name={`${label}-lead`} className="sr-only" checked={lead === node.id} onChange={() => onLead(node.id)} />
                <Crown size={12} /> {lead === node.id ? leadHint : `Make ${leadHint.toLowerCase()}`}
              </label>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
