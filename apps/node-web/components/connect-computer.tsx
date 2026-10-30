"use client";

import { Camera, Folder, Laptop, Monitor } from "lucide-react";
import { Fragment } from "react";
import { captureLine } from "@/lib/captures";
import { CLI_COMMAND, ENSEMBLE_LINKS } from "@/lib/config";
import { ago } from "@/lib/text";
import type { Computer, Device } from "@/lib/types";
import { External, Pill } from "./ui";

export function ComputerList({ computers }: { computers: Computer[] }) {
  if (!computers.length) return <p className="text-sm text-muted">No computer is paired yet.</p>;
  return (
    <ul className="space-y-2">
      {computers.map((computer) => (
        <li key={computer.id} className="flex items-center justify-between rounded-xl border border-line bg-bg px-3 py-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <Laptop size={16} className="shrink-0 text-muted" /> <span className="truncate">{computer.name}</span>
          </span>
          {computer.online ? <Pill tone="ok">online</Pill> : <Pill>offline</Pill>}
        </li>
      ))}
    </ul>
  );
}

const code = (command: string) => <code className="rounded bg-raised px-1">{command}</code>;

/** Whether nodes can browse and capture on a computer, or what to do there first (docs/25 §10.3). */
function CaptureLine({ device }: { device: Device }) {
  const line = captureLine(device, CLI_COMMAND);
  const command = "command" in line ? line.command : undefined;
  const parts = line.state === "setup" && command ? line.text.split(command) : [line.text];
  return (
    <p className={`mt-1 flex items-start gap-1.5 text-xs ${line.state === "ready" ? "text-muted" : "text-warn"}`} data-capture={line.state}>
      <Camera size={12} className="mt-0.5 shrink-0" aria-hidden />
      <span>
        {parts.map((part, at) => (
          <Fragment key={at}>
            {at && command ? code(command) : null}
            {part}
          </Fragment>
        ))}
        {line.state === "ready" && command ? <> {code(command)} there adds more.</> : null}
      </span>
    </p>
  );
}

/** Ensemble's paired computers with the folders each shares with Ensemble, its secret key and what it can capture. */
export function DeviceList({ devices }: { devices: Device[] }) {
  if (!devices.length) return <p className="text-sm text-muted">No computer is paired yet.</p>;
  return (
    <ul className="space-y-2">
      {devices.map((device) => (
        <li key={device.id} className="rounded-xl border border-line bg-bg p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 font-medium">
              <Laptop size={16} className="shrink-0 text-muted" /> <span className="truncate">{device.name}</span>
            </span>
            {device.online ? <Pill tone="ok">online</Pill> : <Pill>offline</Pill>}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {[device.platform, device.appVersion ? `Ensemble ${device.appVersion}` : null, device.online ? null : device.lastSeenAt ? `last seen ${ago(device.lastSeenAt)} ago` : "not seen yet"].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-1 text-xs text-muted" data-seal-key={device.sealKeyMismatch ? "mismatch" : device.sealKey?.kid ?? "none"}>
            {device.sealKeyMismatch ? (
              <span className="text-danger">Its secret key changed since it was paired: secrets are not sent to it until you pair it again ({CLI_COMMAND} login).</span>
            ) : device.sealKey ? (
              <>
                Secret key <span className="font-mono">{device.sealKey.fingerprint}</span>: secrets you type here are encrypted for it. It should match <code className="rounded bg-raised px-1">{CLI_COMMAND} secrets fingerprint</code> there.
              </>
            ) : (
              "Secrets go over HTTPS through Ensemble's server: update Ensemble there for end-to-end encryption."
            )}
          </p>
          <CaptureLine device={device} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {device.folders.length ? (
              device.folders.map((folder) => (
                <span key={folder} className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-0.5 text-xs">
                  <Folder size={12} className="text-accent" /> {folder}
                </span>
              ))
            ) : (
              <span className="text-xs text-muted">Shares no folders with Ensemble yet.</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Pairing happens in Ensemble: one sentence and the links, in a new tab. */
export function PairComputer({ paired = false }: { paired?: boolean }) {
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-panel p-4">
      <div className="flex items-start gap-3">
        <Monitor size={20} className="mt-0.5 shrink-0 text-accent" />
        <p className="text-sm text-muted">
          {paired
            ? "Pair another computer, or change the folders a computer shares, in Ensemble."
            : "Pair a computer in Ensemble: sign in to the Ensemble desktop app or the CLI with this account, and it shows up here."}{" "}
          Nodes start work there only after you approve it.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <External href={ENSEMBLE_LINKS.pairComputer} icon className="inline-flex items-center rounded-xl bg-accent px-3 py-2 text-sm font-medium text-accent-ink hover:brightness-110">
          Connect a computer in Ensemble
        </External>
        <External href={ENSEMBLE_LINKS.download} icon className="inline-flex items-center rounded-xl border border-line bg-bg px-3 py-2 text-sm hover:bg-raised">
          Download Ensemble
        </External>
      </div>
      <p className="text-xs text-muted">
        Run profiles (which agent, what it may do, which computer) are in{" "}
        <External href={ENSEMBLE_LINKS.runProfiles} icon className="underline hover:text-ink">
          Ensemble settings
        </External>
        .
      </p>
    </div>
  );
}
