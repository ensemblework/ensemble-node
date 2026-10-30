"use client";

/**
 * A question from the owner's computer, in the chat where the node is talking (Ensemble's computer
 * cards, `data.type: "computer"`): the first use of a folder, or of a website when the owner asks to be
 * asked. What the node tried, where, and the answers the computer offers (Once, This mission, Always for
 * this folder or address) or Don't allow. The node's call waits for the answer and goes on by itself.
 * The answer is Ensemble's decision for it (`POST /api/decisions/:id/decide`, the option as `reason`),
 * so answering it in the Hub, the CLI or on a phone settles this card too.
 */
import { Check, FolderOpen, Globe, Monitor, X } from "lucide-react";
import { useState } from "react";
import { cardWords } from "@/lib/cards";
import { computerAnswered, computerDecision, computerOptions } from "@/lib/checkpoints";
import { answerLocally, useDecide } from "@/lib/hooks";
import type { Badge } from "@/lib/plan";
import { clock } from "@/lib/text";
import type { Message, NodePublic } from "@/lib/types";
import { Button } from "../ui";
import type { MessageContext } from "./message";
import { OwnerCard } from "./owner-card";

type ComputerData = {
  status?: string;
  decisionId?: string;
  capability?: string;
  label?: string;
  scope?: "folder" | "origin";
  deviceName?: string;
  call?: string;
  options?: string[];
  answer?: string | null;
  answeredAt?: string | null;
  plan?: { id?: string; step?: string } | null;
};

const STATE: Record<string, Badge> = {
  pending: { label: "Waiting for you", tone: "warn" },
  allowed: { label: "Allowed", tone: "ok" },
  denied: { label: "Not allowed", tone: "muted" },
  expired: { label: "Expired", tone: "muted" },
};

/** What each answer covers, for its tooltip. */
function optionHint(option: string, data: ComputerData): string {
  const place = data.scope === "origin" ? (data.label ?? "this address") : `${data.label ?? "this folder"}${data.deviceName ? ` on ${data.deviceName}` : ""}`;
  if (/^once$/i.test(option)) return "Only this call";
  if (/mission/i.test(option)) return "Until this piece of work ends";
  if (/^always/i.test(option)) return `From now on, for this node in ${place}`;
  return option;
}

export function ComputerCard({ message, ctx, node }: { message: Message; ctx: MessageContext; node?: NodePublic }) {
  const data = message.data as ComputerData;
  const decide = useDecide();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handle = node?.slug ?? "node";
  const words = cardWords(data, handle, ctx.roomTitle);
  const status = data.status ?? "pending";
  const pending = status === "pending";
  const options = computerOptions(data);
  const decisionId = typeof data.decisionId === "string" && data.decisionId ? data.decisionId : null;
  const site = data.scope === "origin";
  const Where = site ? Globe : FolderOpen;

  const answer = (option: string | null) => {
    if (!decisionId || busy) return;
    setBusy(option ?? "deny");
    setError(null);
    decide.mutate(
      { id: decisionId, body: computerDecision(option), cardId: message.id },
      {
        onSuccess: () => answerLocally(message.id, computerAnswered(option)),
        onError: (failure) => setError(failure.message),
        onSettled: () => setBusy(null),
      },
    );
  };

  return (
    <OwnerCard title={message.body?.trim() || words.title} state={STATE[status] ?? { label: status, tone: "muted" }}>
      <div className="space-y-2.5">
        {data.call ? (
          <pre className="scroll-thin max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-bg/80 px-2.5 py-2 font-mono text-xs" tabIndex={0} aria-label="What it tried">
            {data.call}
          </pre>
        ) : null}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {data.label ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <Where size={13} className="shrink-0 text-accent" aria-hidden />
              <span className="sr-only">{site ? "Website:" : "Folder:"}</span>
              <span className="break-all">{data.label}</span>
            </span>
          ) : null}
          {data.deviceName ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <Monitor size={13} className="shrink-0" aria-hidden />
              <span className="sr-only">Computer:</span>
              <span className="break-words">{data.deviceName}</span>
            </span>
          ) : null}
          {data.plan?.id ? (
            <button type="button" onClick={() => ctx.onJump(data.plan!.id!)} className="text-accent hover:underline">
              For a step of the plan
            </button>
          ) : null}
        </p>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {pending ? (
          <>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Your answer">
              {options.map((option, at) => (
                <Button key={option} size="sm" tone={at === 0 ? "primary" : "ghost"} busy={busy === option} disabled={Boolean(busy) || !decisionId} onClick={() => answer(option)} title={optionHint(option, data)}>
                  {at === 0 ? <Check size={13} aria-hidden /> : null}
                  {option}
                </Button>
              ))}
              <Button size="sm" tone="quiet" busy={busy === "deny"} disabled={Boolean(busy) || !decisionId} onClick={() => answer(null)}>
                <X size={13} aria-hidden /> Don&apos;t allow
              </Button>
            </div>
            <p className="text-xs text-muted">{decisionId ? `@${handle} waits for your answer, then goes on by itself.` : "This card cannot be answered here. Reload the page."}</p>
          </>
        ) : (
          <p className="text-sm" aria-live="polite">
            {status === "allowed" ? (
              <span className="text-ok">You allowed it{data.answer ? `: ${data.answer}` : ""}.</span>
            ) : status === "denied" ? (
              <span className="text-muted">You didn&apos;t allow it. @{handle} goes on without it.</span>
            ) : status === "expired" ? (
              <span className="text-muted">Nobody answered in time, so it was not allowed.</span>
            ) : (
              <span className="text-muted">{STATE[status]?.label ?? status}</span>
            )}
            {data.answeredAt ? <span className="ml-1.5 text-xs text-muted">{clock(data.answeredAt)}</span> : null}
          </p>
        )}
      </div>
    </OwnerCard>
  );
}
