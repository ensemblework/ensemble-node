"use client";

/**
 * A lead's plan for its crew (Ensemble's node/plans.ts): its opening words, then each step with its
 * node, what it was asked, where it stands and its report. The agent runs a step started sit inside
 * its step, folded, instead of in the conversation; the steps' nodes never post there.
 */
import { useState } from "react";
import { AlertTriangle, Check, ChevronRight, Circle, CircleStop, MinusCircle } from "lucide-react";
import { api } from "@/lib/api";
import { toast, toastError } from "@/lib/toast";
import type { Message, PlanData, PlanStep, PlanStepStatus } from "@/lib/types";
import { NodeAvatar } from "../node-avatar";
import { Pill, Spinner } from "../ui";
import type { MessageContext } from "./message";
import { RichText } from "./rich-text";
import { RunCard } from "./run-card";

const STEP_LABEL: Record<PlanStepStatus, string> = { waiting: "Waiting", working: "Working", done: "Done", blocked: "Blocked", skipped: "Skipped", stopped: "Stopped" };
const STEP_TONE: Record<PlanStepStatus, "muted" | "accent" | "ok" | "warn"> = { waiting: "muted", working: "accent", done: "ok", blocked: "warn", skipped: "muted", stopped: "muted" };

function StepIcon({ status }: { status: PlanStepStatus }) {
  if (status === "working") return <Spinner className="h-3.5 w-3.5 text-accent" />;
  if (status === "done") return <Check size={15} className="text-ok" />;
  if (status === "blocked") return <AlertTriangle size={15} className="text-warn" />;
  if (status === "skipped" || status === "stopped") return <MinusCircle size={15} className="text-muted" />;
  return <Circle size={15} className="text-muted" />;
}

function Step({ step, plan, cards, ctx }: { step: PlanStep; plan: PlanData; cards: Message[]; ctx: MessageContext }) {
  const [open, setOpen] = useState(false);
  const node = ctx.nodes.get(step.nodeId);
  const runs = cards.filter((row) => row.kind === "run" && row.data?.plan?.step === step.id);
  const after = step.after.map((id) => plan.steps.find((row) => row.id === id)?.handle).filter(Boolean);
  const said = step.result ?? step.progress;
  return (
    <li className="rounded-xl border border-line bg-bg/60">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-start gap-2.5 px-3 py-2 text-left">
        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
          <StepIcon status={step.status} />
        </span>
        {node ? <NodeAvatar node={node} size={20} /> : null}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 text-sm">
            <span className="font-medium">@{step.handle}</span>
            <Pill tone={STEP_TONE[step.status]}>{STEP_LABEL[step.status]}</Pill>
            {step.status === "waiting" && after.length ? <span className="text-xs text-muted">after {after.map((handle) => `@${handle}`).join(", ")}</span> : null}
            {runs.length ? <span className="text-xs text-muted">{runs.length} agent run{runs.length === 1 ? "" : "s"}</span> : null}
          </span>
          <span className={`block text-sm text-muted ${open ? "whitespace-pre-wrap" : "line-clamp-1"}`}>{step.brief}</span>
        </span>
        <ChevronRight size={15} className={`mt-1 shrink-0 text-muted transition ${open ? "rotate-90" : ""}`} />
      </button>
      {said && (open || step.status !== "working") ? (
        <div className={`border-t border-line px-3 py-2 text-sm ${open ? "" : "line-clamp-3"}`}>
          <RichText text={said} handles={ctx.handles} />
        </div>
      ) : null}
      {open && runs.length ? (
        <div className="space-y-2 border-t border-line px-3 py-2">
          {runs.map((run) => (
            <RunCard key={run.id} message={run} ctx={ctx} node={node} />
          ))}
        </div>
      ) : null}
    </li>
  );
}

export function PlanCard({ message, ctx }: { message: Message; ctx: MessageContext }) {
  const plan = message.data as PlanData;
  const [stopping, setStopping] = useState(false);
  const steps = Array.isArray(plan.steps) ? plan.steps : [];
  const done = steps.filter((row) => row.status === "done").length;
  const live = plan.status === "running" || plan.status === "draft";
  const cards = ctx.inPlan.get(message.id) ?? [];
  const status =
    plan.status === "done" ? <Pill tone="ok">Done</Pill>
    : plan.status === "stopped" ? <Pill>Stopped</Pill>
    : plan.status === "reporting" ? <Pill tone="accent">Reporting</Pill>
    : <Pill tone="accent">{done} of {steps.length} done</Pill>;
  const stop = async () => {
    if (!confirm("Stop this plan? Its steps stop, with the agent runs they started. What was changed so far stays.")) return;
    setStopping(true);
    try {
      await api(`/api/node/plans/${message.id}/stop`, { body: {} });
      toast("Plan stopped.", "ok");
    } catch (error) {
      toastError(error);
    } finally {
      setStopping(false);
    }
  };
  return (
    <div className="space-y-2.5 rounded-2xl border border-line bg-panel px-3 py-3">
      {message.body && message.body !== "Plan" ? <RichText text={message.body} handles={ctx.handles} /> : null}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-semibold uppercase tracking-wide">Plan</span>
        {status}
        {live && message.authorAccountId === ctx.meId ? (
          <button type="button" onClick={() => void stop()} disabled={stopping} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-raised hover:text-ink disabled:opacity-50">
            <CircleStop size={13} /> Stop
          </button>
        ) : null}
      </div>
      <ol className="space-y-1.5">
        {steps.map((step) => (
          <Step key={step.id} step={step} plan={plan} cards={cards} ctx={ctx} />
        ))}
      </ol>
    </div>
  );
}
