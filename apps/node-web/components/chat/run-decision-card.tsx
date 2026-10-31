"use client";

/**
 * A question or permission from a run a node started, in the chat where the run's card is (Ensemble's
 * run decisions, `data.type: "run_decision"`): the coding agent asks to run a command, or asks which way
 * to go. Its words, the command, the folder and the run it is part of, then the answers: options (the
 * recommended one marked), a typed answer when the agent takes one, Allow once and Don't allow for a
 * permission. The answer is Ensemble's decision (`POST /api/decisions/:id/decide`), so the first answer
 * counts wherever it is given (the Hub, the CLI); the card follows it, its expiry and the run's end, and
 * folds into a checkpoint ("Allowed GitHub Copilot to run python3 search.py · Once").
 */
import { FolderOpen, MessageCircleQuestion, TerminalSquare } from "lucide-react";
import { cardWords } from "@/lib/cards";
import { runDecisionAnswered } from "@/lib/checkpoints";
import { runDecisionRow, runDecisionView, type RunDecisionCardData as RunDecisionData } from "@/lib/decisions";
import { answerLocally, useDecisions } from "@/lib/hooks";
import type { Badge } from "@/lib/plan";
import { clock } from "@/lib/text";
import type { Message, NodePublic } from "@/lib/types";
import { shortPath } from "@/lib/work-log";
import { DecisionActions } from "../decision-answer";
import type { MessageContext } from "./message";
import { OwnerCard } from "./owner-card";

/** The card's pill: waiting, or how it ended. */
function state(data: RunDecisionData): Badge {
  const question = data.event === "question";
  switch (data.status ?? "pending") {
    case "pending":
      return { label: "Waiting for you", tone: "warn" };
    case "answered":
    case "decided":
      return data.decision === "deny" ? { label: question ? "Skipped" : "Not allowed", tone: "muted" } : { label: question ? "Answered" : "Allowed", tone: "ok" };
    case "expired":
      return { label: "Expired", tone: "muted" };
    case "closed":
      return { label: "Closed", tone: "muted" };
    default:
      return { label: (data.status ?? "").replace(/_/g, " "), tone: "muted" };
  }
}

/** Who answered and when, for a settled card opened from its checkpoint. */
function answeredLine(data: RunDecisionData, handle: string): string {
  const when = data.answeredAt ? ` at ${clock(data.answeredAt)}` : "";
  if (data.status === "expired") return "Nobody answered in time, so the agent was told no.";
  if (data.status === "closed") return "The run ended before anyone answered.";
  const who = data.answeredBy === "node" ? `@${handle}` : data.answeredBy === "elsewhere" ? "You, in Ensemble," : "You";
  if (data.decision === "deny") return data.event === "question" ? `${who} let the agent decide${when}.` : `${who} didn't allow it${when}. The agent was told.`;
  return `${who} answered${when}.`;
}

export function RunDecisionCard({ message, ctx, node }: { message: Message; ctx: MessageContext; node?: NodePublic }) {
  const data = message.data as RunDecisionData;
  const status = data.status ?? "pending";
  const pending = status === "pending";
  const handle = node?.slug ?? "node";
  const words = cardWords(data, handle, ctx.roomTitle);
  const decisions = useDecisions();
  const decisionId = typeof data.decisionId === "string" && data.decisionId ? data.decisionId : null;
  const live = decisionId ? (decisions.data?.find((row) => row.id === decisionId) ?? null) : null;
  const view = runDecisionView(data, live);
  const row = live ?? runDecisionRow(data);
  const runCard = data.jobId ? ctx.runCardOf?.(data.jobId) : undefined;
  const question = data.event === "question";
  const Icon = question ? MessageCircleQuestion : TerminalSquare;

  return (
    <OwnerCard title={words.title} state={state(data)}>
      <div className="space-y-2.5">
        {data.title ? (
          <p className="flex items-start gap-2 break-words text-sm font-medium">
            <Icon size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden />
            <span className="min-w-0">{data.title}</span>
          </p>
        ) : null}
        {data.command ? (
          <pre className="scroll-thin max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-bg/80 px-2.5 py-2 font-mono text-xs" tabIndex={0} aria-label="Command">
            {data.command}
          </pre>
        ) : null}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {data.cwd ? (
            <span className="inline-flex min-w-0 items-center gap-1" title={data.cwd}>
              <FolderOpen size={13} className="shrink-0 text-accent" aria-hidden />
              <span className="sr-only">Folder:</span>
              <span className="break-all font-mono">{shortPath(data.cwd, 48)}</span>
            </span>
          ) : null}
          {data.runTitle ? (
            runCard ? (
              <button type="button" onClick={() => ctx.onJump(runCard.id)} className="min-w-0 break-words text-left text-accent hover:underline">
                In the run “{data.runTitle}”
              </button>
            ) : (
              <span className="min-w-0 break-words">In the run “{data.runTitle}”</span>
            )
          ) : null}
          {data.plan?.id ? (
            <button type="button" onClick={() => ctx.onJump(data.plan!.id!)} className="text-accent hover:underline">
              For a step of the plan
            </button>
          ) : null}
        </p>
        {pending ? (
          decisionId ? (
            <>
              <DecisionActions decision={row} view={view} cardId={message.id} denyLabel="Don't allow" size="sm" onAnswered={(body) => answerLocally(message.id, runDecisionAnswered(body))} />
              <p className="text-xs text-muted">The run waits for your answer, then goes on by itself.</p>
            </>
          ) : (
            <p className="text-xs text-muted">This card cannot be answered here. Reload the page.</p>
          )
        ) : (
          <p className="text-xs text-muted" aria-live="polite">
            {answeredLine(data, handle)}
          </p>
        )}
      </div>
    </OwnerCard>
  );
}
