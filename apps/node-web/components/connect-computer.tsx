"use client";

import { Check, Copy, Laptop, Monitor } from "lucide-react";
import { useState } from "react";
import { ENSEMBLE_APP } from "@/lib/config";
import type { Computer } from "@/lib/types";
import { Pill } from "./ui";

const INSTALLS = [
  { os: "macOS / Linux", command: "curl -fsSL https://ensemblework.com/install.sh | sh" },
  { os: "Homebrew", command: "brew install ensemblework/tap/ensemble" },
  { os: "Windows", command: "irm https://ensemblework.com/install.ps1 | iex" },
];

function CopyLine({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => void navigator.clipboard.writeText(command).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))}
      className="group flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-bg px-3 py-2 text-left font-mono text-xs hover:border-accent"
    >
      <span className="truncate">{command}</span>
      {copied ? <Check size={14} className="text-ok" /> : <Copy size={14} className="text-muted group-hover:text-ink" />}
    </button>
  );
}

export function ComputerList({ computers }: { computers: Computer[] }) {
  if (!computers.length) return <p className="text-sm text-muted">No computer is paired yet.</p>;
  return (
    <ul className="space-y-2">
      {computers.map((computer) => (
        <li key={computer.id} className="flex items-center justify-between rounded-xl border border-line bg-bg px-3 py-2 text-sm">
          <span className="flex items-center gap-2">
            <Laptop size={16} className="text-muted" /> {computer.name}
          </span>
          {computer.online ? <Pill tone="ok">online</Pill> : <Pill>offline</Pill>}
        </li>
      ))}
    </ul>
  );
}

/** How to pair a computer: the Ensemble CLI or the signed-in desktop app. Nodes start work there. */
export function ConnectComputer({ computers }: { computers: Computer[] }) {
  return (
    <div className="space-y-4">
      <ComputerList computers={computers} />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2 rounded-2xl border border-line bg-panel p-4">
          <div className="flex items-center gap-2 font-medium">
            <span className="font-mono text-accent">&gt;_</span> Ensemble CLI
          </div>
          <p className="text-sm text-muted">Install it, then run <code className="rounded bg-raised px-1">ensemble login</code> and approve in the browser. The computer is paired and keeps running tasks in the background.</p>
          {INSTALLS.map((row) => (
            <div key={row.os} className="space-y-1">
              <div className="text-xs text-muted">{row.os}</div>
              <CopyLine command={row.command} />
            </div>
          ))}
          <CopyLine command="ensemble login" />
        </div>
        <div className="space-y-2 rounded-2xl border border-line bg-panel p-4">
          <div className="flex items-center gap-2 font-medium">
            <Monitor size={16} className="text-accent" /> Ensemble desktop app
          </div>
          <p className="text-sm text-muted">Download it and sign in with this account (synced, not local-only). It pairs this computer the same way.</p>
          <a href="https://ensemblework.com/download" className="inline-flex rounded-xl border border-line bg-bg px-3 py-2 text-sm hover:bg-raised">
            Download Ensemble
          </a>
          <p className="text-xs text-muted">
            Run profiles (which agent, what it may do, which computer) live in <a className="underline" href={`${ENSEMBLE_APP}/settings`}>Ensemble → Settings</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
