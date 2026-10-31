"use client";

/**
 * A device code for the owner (Ensemble docs/35, CLI sign-ins): a command the node runs on their
 * computer printed a one-time code to enter on a website (`az login`, `gh auth login`…). Only the owner
 * sees it: the code, large, with Copy; the website, opened in a new tab; the command and the computer;
 * how long the code lasts. The command sees the sign-in by itself, and the card then says it is done
 * (or that the code expired) and folds into its checkpoint.
 */
import { Check, Copy, ExternalLink, SquareTerminal } from "lucide-react";
import { useState } from "react";
import { deviceCodeBadge, deviceCodeCommand, deviceCodeLink, deviceCodeOpen, deviceCodeOutcome, deviceCodeTitle, deviceCodeValue, type DeviceCodeData } from "@/lib/device-code";
import { toast } from "@/lib/toast";
import type { Message } from "@/lib/types";
import { Countdown, useTimeLeft } from "../countdown";
import { Button } from "../ui";
import { OwnerCard } from "./owner-card";

export function DeviceCodeCard({ message }: { message: Message }) {
  const data = message.data as DeviceCodeData;
  const open = deviceCodeOpen(data);
  const left = useTimeLeft(data.expiresAt ?? null, open);
  const [copied, setCopied] = useState(false);
  const code = deviceCodeValue(data);
  const link = deviceCodeLink(data.url);
  const command = deviceCodeCommand(data);
  const computer = typeof data.computer === "string" && data.computer.trim() ? data.computer.trim() : "your computer";
  const copy = () =>
    void navigator.clipboard?.writeText(code).then(
      () => {
        setCopied(true);
        toast("Code copied.", "ok");
        setTimeout(() => setCopied(false), 2000);
      },
      () => toast("This browser would not copy it: select the code instead.", "error"),
    );
  return (
    <OwnerCard
      title={
        <>
          Sign-in code for <code className="font-mono">{command}</code> on {computer}
        </>
      }
      state={deviceCodeBadge(data)}
    >
      <div className="space-y-2.5" data-device-code={data.status ?? "pending"} aria-label={deviceCodeTitle(data)}>
        {open ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="select-all rounded-xl border border-line bg-bg px-3 py-2 font-mono text-2xl font-semibold tracking-[0.18em] text-ink sm:text-3xl" data-device-code-value>
                {code || "—"}
              </span>
              <Button size="sm" tone="ghost" onClick={copy} disabled={!code} aria-label="Copy the code">
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
              </Button>
              <Countdown left={left} what="to enter the code" className="ml-auto" />
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>
                {link ? (
                  <a href={link.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                    Open {link.label} <ExternalLink size={12} aria-hidden />
                  </a>
                ) : (
                  <span>Open the sign-in page the command names</span>
                )}{" "}
                on this phone or computer.
              </li>
              <li>Enter the code, then sign in with your own account.</li>
              <li>
                <code className="font-mono">{command}</code> on {computer} sees it and carries on by itself.
              </li>
            </ol>
            <p className="flex items-start gap-1.5 text-xs text-muted">
              <SquareTerminal size={13} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                Only you see this code. Enter it only on that page: it signs <code className="font-mono">{command}</code> on {computer} in to the account you use there.
              </span>
            </p>
          </>
        ) : (
          <p className={`text-sm ${data.status === "done" ? "text-ok" : "text-muted"}`}>{deviceCodeOutcome(data)}</p>
        )}
      </div>
    </OwnerCard>
  );
}
