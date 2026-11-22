"use client";

/**
 * A question from the owner's computer, in the chat where the node is talking (Ensemble's computer
 * cards, `data.type: "computer"`): the first use of a folder, or of a website when the owner asks to be
 * asked. What the node tried, where, and the answers the computer offers, the lasting one first (Allow in
 * this folder from now on, Only this mission, Just once) or Don't allow: the owner is asked at most once
 * per folder. The node's call waits for the answer and goes on by itself.
 * The same card asks about one of the agent's own calls on the owner's AI plan (changes and commands in a
 * folder, an address, a program or tool, a call that names no path) and about an app on a screen, the
 * owner's or the node's own agent screen: exactly the answers Ensemble offers ("Allow", "Allow for this
 * run", "Allow once", "This mission"), each one press, or Don't allow.
 * The answer is Ensemble's decision for it (`POST /api/decisions/:id/decide`, the option as `reason`),
 * so answering it in the Hub, the CLI or on a phone settles this card too.
 */
import { AppWindow, Check, FolderOpen, Globe, Monitor, SquareTerminal, X, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { cardWords, computerAskKind, ownAsk, type ComputerAskKind } from "@/lib/cards";
import { answerScope, choiceHint, computerAnswered, computerAskInfo, computerChoices, computerDecision } from "@/lib/checkpoints";
import { answerLocally, useDecide } from "@/lib/hooks";
import type { Badge } from "@/lib/plan";
import { clock } from "@/lib/text";
import type { Message, NodePublic } from "@/lib/types";
import { Button, InfoTip } from "../ui";
import type { MessageContext } from "./message";
import { OwnerCard } from "./owner-card";

type ComputerData = {
  status?: string;
  decisionId?: string;
  capability?: string;
  label?: string;
  scope?: "folder" | "origin" | "app";
  /** An app's screen: the node's own agent screen or the owner's (absent: the owner's). */
  screen?: "agent" | "owner";
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

/** What the card's label names, by the kind of question: a folder, an address, a program or tool, an app; nothing for a call that names no path, or an own call of a kind the card does not make clear (its title names it). */
const WHERE: Record<ComputerAskKind, { icon: LucideIcon; name: string } | null> = {
  folder: { icon: FolderOpen, name: "Folder" },
  own_folder: { icon: FolderOpen, name: "Folder" },
  origin: { icon: Globe, name: "Website" },
  own_address: { icon: Globe, name: "Address" },
  own_call: { icon: SquareTerminal, name: "Program" },
  app: { icon: AppWindow, name: "App" },
  own_unnamed: null,
  own: null,
};

export function ComputerCard({ message, ctx, node }: { message: Message; ctx: MessageContext; node?: NodePublic }) {
  const data = message.data as ComputerData;
  const decide = useDecide();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handle = node?.slug ?? "node";
  const words = cardWords(data, handle, ctx.roomTitle);
  const status = data.status ?? "pending";
  const pending = status === "pending";
  const choices = computerChoices(data);
  const decisionId = typeof data.decisionId === "string" && data.decisionId ? data.decisionId : null;
  const kind = computerAskKind(data);
  const where = WHERE[kind];
  const info = computerAskInfo(data);
  const answered = data.answer && (kind === "app" || ownAsk(kind)) ? answerScope(data.answer) : data.answer;

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
          {data.label && where ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <where.icon size={13} className="shrink-0 text-accent" aria-hidden />
              <span className="sr-only">{where.name}:</span>
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
              {choices.map(({ option, label }, at) => (
                <Button key={option} size="sm" tone={at === 0 ? "primary" : "ghost"} busy={busy === option} disabled={Boolean(busy) || !decisionId} onClick={() => answer(option)} title={choiceHint(option, data)}>
                  {at === 0 ? <Check size={13} aria-hidden /> : null}
                  {label}
                </Button>
              ))}
              <Button size="sm" tone="quiet" busy={busy === "deny"} disabled={Boolean(busy) || !decisionId} onClick={() => answer(null)}>
                <X size={13} aria-hidden /> Don&apos;t allow
              </Button>
            </div>
            <p className="flex items-center gap-1 text-xs text-muted">
              {decisionId ? `@${handle} waits for your answer, then goes on by itself.` : "This card cannot be answered here. Reload the page."}
              {decisionId && info ? <InfoTip text={info} label="About this question" /> : null}
            </p>
          </>
        ) : (
          <p className="text-sm" aria-live="polite">
            {status === "allowed" ? (
              <span className="text-ok">You allowed it{answered ? `: ${answered}` : ""}.</span>
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
