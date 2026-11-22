"use client";

/**
 * A stuck step of a plan, for its owner (Ensemble docs/35 §6.4): the lead's question and the one decision
 * the step needs, each answer one press. "Try again" or "Finish without it"; when what the step worked
 * from changed, "Redo with the new version" or "Keep the result". The answer settles the step at once
 * (`POST /api/node/approvals/:id`); when the plan moved on first, the card closes as expired.
 */
import { CircleSlash, RotateCcw } from "lucide-react";
import { cardWords } from "@/lib/cards";
import { planDecisionChoices } from "@/lib/checkpoints";
import { useSettle } from "@/lib/hooks";
import type { Badge } from "@/lib/plan";
import { clock } from "@/lib/text";
import type { Message, NodePublic } from "@/lib/types";
import { Button, InfoTip } from "../ui";
import type { MessageContext } from "./message";
import { OwnerCard } from "./owner-card";

const STATE: Record<string, Badge> = {
  pending: { label: "Waiting for you", tone: "warn" },
  applying: { label: "Deciding…", tone: "accent" },
  approved: { label: "Decided", tone: "ok" },
  discarded: { label: "Decided", tone: "ok" },
  expired: { label: "Expired", tone: "muted" },
};

export function PlanDecisionCard({ message, ctx, node }: { message: Message; ctx: MessageContext; node?: NodePublic }) {
  const settle = useSettle();
  const data = message.data;
  const words = cardWords(data, node?.slug ?? "node", ctx.roomTitle);
  const choices = planDecisionChoices(data);
  const status = typeof data.status === "string" ? data.status : "pending";
  const pending = status === "pending";
  const question = typeof data.question === "string" && data.question.trim() ? data.question.trim() : message.body;
  const planId = typeof data.plan?.id === "string" ? data.plan.id : null;
  const chosen = status === "approved" ? choices.approve.label : status === "discarded" ? choices.discard.label : null;
  const answer = (decision: "approve" | "discard") => settle.mutate({ messageId: message.id, decision });
  return (
    <OwnerCard title={words.title} state={STATE[status] ?? { label: status, tone: "muted" }}>
      <div className="space-y-2.5" data-plan-decision={data.why ?? "stuck"}>
        <p className="whitespace-pre-wrap break-words text-sm">{question}</p>
        {planId ? (
          <button type="button" onClick={() => ctx.onJump(planId)} className="text-xs text-accent hover:underline">
            Open the plan
          </button>
        ) : null}
        {settle.error ? (
          <p className="text-sm text-danger" role="alert">
            {settle.error.message}
          </p>
        ) : null}
        {pending ? (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Your decision">
            <Button size="sm" busy={settle.isPending && settle.variables?.decision === "approve"} disabled={settle.isPending} onClick={() => answer("approve")} title={choices.approve.hint}>
              <RotateCcw size={13} aria-hidden /> {choices.approve.label}
            </Button>
            <Button size="sm" tone="ghost" busy={settle.isPending && settle.variables?.decision === "discard"} disabled={settle.isPending} onClick={() => answer("discard")} title={choices.discard.hint}>
              <CircleSlash size={13} aria-hidden /> {choices.discard.label}
            </Button>
            <InfoTip text={`${choices.approve.label}: ${choices.approve.hint}. ${choices.discard.label}: ${choices.discard.hint}. The plan goes on as soon as you choose.`} label="About this decision" />
          </div>
        ) : (
          <p className="text-sm" aria-live="polite">
            {chosen ? <span className="text-ok">You chose: {chosen}.</span> : status === "expired" ? <span className="text-muted">{typeof data.expiredReason === "string" && data.expiredReason.trim() ? data.expiredReason.trim() : "The plan moved on before an answer."}</span> : <span className="text-muted">{STATE[status]?.label ?? status}</span>}
            {typeof data.answeredAt === "string" ? <span className="ml-1.5 text-xs text-muted">{clock(data.answeredAt)}</span> : null}
          </p>
        )}
      </div>
    </OwnerCard>
  );
}
