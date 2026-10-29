"use client";

/**
 * A plan card: Ensemble's projection of a mission (node/plans.ts; build blocks B1, B2, B6). A crew's
 * plan shows its opening words, goal, status, requirements ledger and one row per step: the node, what
 * kind of step it is and who does it, whether it ran (status) and what came of it (outcome), what holds
 * it, its attempts with their checks and candidates, its report and evidence. The agent runs a step
 * started sit inside it, folded, instead of in the conversation; the steps' nodes never post there.
 * A node's own piece of work (`kind: "self"`) is the same card in one compact block, a work card.
 * Plans made before outcomes (contract 1) show what they have.
 */
import { useState } from "react";
import { AlertTriangle, Check, ChevronRight, Circle, CircleStop, CircleX, Hourglass, MinusCircle } from "lucide-react";
import { api } from "@/lib/api";
import { ENSEMBLE_APP } from "@/lib/config";
import { formatEntityText } from "@/lib/entity-text";
import { evidenceCount, evidenceOfCards } from "@/lib/evidence";
import { attemptLabel, attemptsToShow, checkTally, isWorkCard, ledgerSummary, missionView, outcomeBadge, planProgress, requirementBadge, stepBadges, stepKindLine, stepName, stepOutcome, stepRequirements } from "@/lib/plan";
import { settingsLine } from "@/lib/session";
import { toast, toastError } from "@/lib/toast";
import type { Attempt, Message, PlanData, PlanStep } from "@/lib/types";
import { NodeAvatar } from "../node-avatar";
import { Pill, Spinner } from "../ui";
import { EvidenceGallery, type RequirementLink } from "./evidence";
import type { MessageContext } from "./message";
import { CandidateTag, CheckList } from "./report";
import { RichText } from "./rich-text";
import { RunCard } from "./run-card";

/** Where a requirement is listed on the card, for evidence and steps that name it. */
export const requirementAnchor = (planId: string, id: string) => `req-${planId}-${id}`.replace(/[^\w-]/g, "-");

/** A brief or report on one line: records by kind, no links (it sits inside the step's button). */
const oneLine = (text: string | null | undefined) => formatEntityText(text ?? "", [], { plain: true, kindLinks: true, app: ENSEMBLE_APP }).replace(/\s+/g, " ").trim();

const sorted = (attempts: readonly Attempt[] | undefined) => [...(attempts ?? [])].sort((a, b) => a.n - b.n);

function StepIcon({ step, held }: { step: PlanStep; held: boolean }) {
  const outcome = stepOutcome(step);
  if (held) return <Hourglass size={14} className="text-warn" aria-hidden />;
  if (step.status === "working") return <Spinner className="h-3.5 w-3.5 text-accent" />;
  if (step.status === "done" && outcome === "fail") return <CircleX size={15} className="text-danger" aria-hidden />;
  if (step.status === "done" && (outcome === "blocked" || outcome === "unverified")) return <AlertTriangle size={15} className="text-warn" aria-hidden />;
  if (step.status === "done") return <Check size={15} className="text-ok" aria-hidden />;
  if (step.status === "blocked") return <AlertTriangle size={15} className="text-warn" aria-hidden />;
  if (step.status === "skipped" || step.status === "stopped") return <MinusCircle size={15} className="text-muted" aria-hidden />;
  return <Circle size={15} className="text-muted" aria-hidden />;
}

/** Stops a plan or a piece of work, after a confirm: Stop shows only while it runs. */
export function useStopPlan(planId: string, what: "plan" | "work") {
  const [stopping, setStopping] = useState(false);
  const stop = async () => {
    const question = what === "plan" ? "Stop this plan? Its steps stop, with the agent runs they started. What was changed so far stays." : "Stop this work? What was changed so far stays.";
    if (!confirm(question)) return;
    setStopping(true);
    try {
      const result = await api<{ stopped?: number } | undefined>(`/api/node/plans/${planId}/stop`, { body: {} });
      toast(result?.stopped ? `${what === "plan" ? "Plan" : "Work"} stopped. What was changed so far stays.` : `This ${what} had already ended.`, "ok");
    } catch (error) {
      toastError(error);
    } finally {
      setStopping(false);
    }
  };
  return { stop, stopping };
}

function StopButton({ onStop, stopping, label }: { onStop: () => void; stopping: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onStop}
      disabled={stopping}
      aria-label={label}
      title={label}
      className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-raised hover:text-danger disabled:opacity-50"
    >
      {stopping ? <Spinner className="h-3 w-3" /> : <CircleStop size={13} aria-hidden />} {stopping ? "Stopping…" : "Stop"}
    </button>
  );
}

function Attempts({ attempts, kind, handles }: { attempts: Attempt[]; kind?: string; handles: ReadonlySet<string> }) {
  return (
    <ol className="space-y-1.5" aria-label="Attempts">
      {attempts.map((attempt) => {
        const badge = outcomeBadge(attempt.outcome);
        const tally = checkTally(attempt.checks);
        return (
          <li key={attempt.n} className="rounded-lg border border-line/70 bg-panel/60 px-2.5 py-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="font-medium text-ink">{attemptLabel(attempt)}</span>
              {badge ? <Pill tone={badge.tone}>{badge.label}</Pill> : !attempt.endedAt ? <Pill tone="accent">Working</Pill> : null}
              {tally ? <span className="text-muted">{tally}</span> : null}
              <span className="ml-auto min-w-0">
                <CandidateTag candidate={attempt.candidate} label={kind === "verify" ? "Tested" : "Built"} />
              </span>
            </div>
            {attempt.summary ? (
              <div className="mt-1 text-muted">
                <RichText text={attempt.summary} handles={handles} small kindLinks />
              </div>
            ) : null}
            {attempt.checks?.length ? (
              <div className="mt-1.5">
                <CheckList checks={attempt.checks} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Every requirement the owner asked for and where it stands; deferred ones with why. */
function Ledger({ plan, planId }: { plan: PlanData; planId: string }) {
  const [criteria, setCriteria] = useState(false);
  const requirements = Array.isArray(plan.requirements) ? plan.requirements : [];
  const deferred = Array.isArray(plan.deferred) ? plan.deferred : [];
  if (!requirements.length && !deferred.length) return null;
  const hasCriteria = requirements.some((row) => row.acceptance?.length);
  const textOf = (id: string) => requirements.find((row) => row.id === id)?.text ?? id;
  return (
    <section className="rounded-xl border border-line bg-bg/60" aria-label="Requirements">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-xs text-muted">
        <span className="font-semibold uppercase tracking-wide">Requirements</span>
        {requirements.length ? <span>{ledgerSummary(requirements)}</span> : null}
        {hasCriteria ? (
          <button type="button" onClick={() => setCriteria(!criteria)} aria-expanded={criteria} className="ml-auto rounded-md px-1.5 py-0.5 text-accent hover:bg-raised">
            {criteria ? "Hide criteria" : "Show criteria"}
          </button>
        ) : null}
      </div>
      {requirements.length ? (
        <ul className="divide-y divide-line/70 border-t border-line/70">
          {requirements.map((row) => {
            const badge = requirementBadge(row.status);
            return (
              <li key={row.id} id={requirementAnchor(planId, row.id)} tabIndex={-1} className="flex items-start gap-2 px-3 py-1.5 text-sm outline-none transition-colors focus:bg-accent/10">
                <span className="mt-0.5 shrink-0">
                  <Pill tone={badge.tone}>{badge.label}</Pill>
                </span>
                <span className="min-w-0 flex-1">
                  <span className={criteria ? "block break-words" : "line-clamp-2 break-words"}>{row.text}</span>
                  {criteria && row.acceptance?.length ? (
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted" aria-label="Acceptance criteria">
                      {row.acceptance.map((item) => (
                        <li key={item.id}>
                          {item.text}
                          {item.mandatory === false ? <span className="ml-1 italic">(optional)</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {deferred.length ? (
        <ul className="space-y-1 border-t border-line/70 px-3 py-2 text-xs text-muted" aria-label="Deferred">
          {deferred.map((row) => (
            <li key={row.requirementId} className="break-words">
              <span className="font-medium text-ink/80">Deferred: {textOf(row.requirementId)}</span> · {row.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Step({ step, plan, planId, cards, ctx }: { step: PlanStep; plan: PlanData; planId: string; cards: Message[]; ctx: MessageContext }) {
  const [open, setOpen] = useState(false);
  const node = ctx.nodes.get(step.nodeId);
  const steps = plan.steps;
  const runs = cards.filter((row) => row.kind === "run" && row.data?.plan?.step === step.id);
  const badges = stepBadges(step, steps);
  const after = (step.after ?? []).map((id) => steps.find((row) => row.id === id)).filter((row): row is PlanStep => Boolean(row));
  const said = step.result ?? step.progress;
  const kindLine = stepKindLine(step);
  const attempts = attemptsToShow(step);
  const current = sorted(step.attempts).at(-1);
  const evidence = evidenceOfCards(runs);
  const covers = stepRequirements(step, plan);
  const asked = settingsLine(step.run);
  const working = step.status === "working";
  const bodyId = `step-${planId}-${step.id}`.replace(/[^\w-]/g, "-");
  const requirementOf = (id: string): RequirementLink | null => {
    const found = plan.requirements?.find((row) => row.id === id);
    return found ? { text: found.text, href: `#${requirementAnchor(planId, id)}` } : { text: id };
  };
  return (
    <li className="rounded-xl border border-line bg-bg/60">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={bodyId} className="flex w-full items-start gap-2.5 px-3 py-2 text-left">
        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
          <StepIcon step={step} held={badges.held} />
        </span>
        {node ? <NodeAvatar node={node} size={20} /> : null}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <span className="font-medium">@{step.handle}</span>
            {kindLine ? <span className="text-xs text-muted">{kindLine}</span> : null}
            <Pill tone={badges.status.tone}>{badges.status.label}</Pill>
            {badges.outcome ? <Pill tone={badges.outcome.tone}>{badges.outcome.label}</Pill> : null}
            {badges.held ? (
              <span className="text-xs text-warn">{badges.holder ? `held by ${stepName(badges.holder, steps)}` : "held by an earlier step"}</span>
            ) : step.status === "waiting" && after.length ? (
              <span className="text-xs text-muted">after {after.map((row) => stepName(row, steps)).join(", ")}</span>
            ) : null}
            {current && current.n > 1 ? <span className="text-xs text-muted">{attemptLabel(current)}</span> : null}
            {runs.length ? <span className="text-xs text-muted">{runs.length} agent run{runs.length === 1 ? "" : "s"}</span> : null}
            {evidence.length ? <span className="text-xs text-muted">{evidenceCount(evidence)}</span> : null}
          </span>
          {open ? null : <span className="mt-0.5 line-clamp-1 text-sm text-muted">{oneLine(step.brief)}</span>}
        </span>
        <ChevronRight size={15} className={`mt-1 shrink-0 text-muted transition ${open ? "rotate-90" : ""}`} aria-hidden />
      </button>
      {open ? (
        <div id={bodyId} className="space-y-2.5 border-t border-line px-3 py-2.5 text-sm">
          <div className="text-muted">
            <RichText text={step.brief ?? ""} handles={ctx.handles} small kindLinks />
          </div>
          {covers.length || asked ? (
            <div className="space-y-0.5 text-xs text-muted">
              {covers.length ? (
                <p>
                  For:{" "}
                  {covers.map((row, at) => (
                    <span key={row.id}>
                      {at ? ", " : ""}
                      <a href={`#${requirementAnchor(planId, row.id)}`} className="text-accent hover:underline">
                        {row.text}
                      </a>
                    </span>
                  ))}
                </p>
              ) : null}
              {asked ? <p>Runs with {asked}</p> : null}
            </div>
          ) : null}
          {said ? (
            <div className={working ? "live-shine" : ""}>
              <RichText text={said} handles={ctx.handles} small kindLinks />
            </div>
          ) : null}
          {attempts.length ? <Attempts attempts={attempts} kind={step.kind} handles={ctx.handles} /> : null}
          {evidence.length ? <EvidenceGallery items={evidence} requirementOf={requirementOf} label={`Evidence from @${step.handle}`} /> : null}
          {runs.length ? (
            <div className="space-y-2">
              {runs.map((run) => (
                <RunCard key={run.id} message={run} ctx={ctx} node={node} requirementOf={requirementOf} inStep />
              ))}
            </div>
          ) : null}
        </div>
      ) : said && !working ? (
        <div className="line-clamp-3 border-t border-line px-3 py-2 text-sm">
          <RichText text={said} handles={ctx.handles} small kindLinks />
        </div>
      ) : working && step.progress ? (
        <p className="live-shine truncate border-t border-line px-3 py-1.5 text-[13px]" title={oneLine(step.progress)} aria-live="polite">
          {oneLine(step.progress)}
        </p>
      ) : null}
    </li>
  );
}

/** A node's own piece of work: one step, shown as one block. */
function WorkCard({ message, plan, cards, ctx }: { message: Message; plan: PlanData; cards: Message[]; ctx: MessageContext }) {
  const [open, setOpen] = useState(false);
  const step = plan.steps[0];
  const mission = missionView(plan.status);
  const { stop, stopping } = useStopPlan(message.id, "work");
  const node = ctx.nodes.get(step?.nodeId ?? plan.leadNodeId);
  const runs = step ? cards.filter((row) => row.kind === "run" && row.data?.plan?.step === step.id) : [];
  const evidence = evidenceOfCards(runs);
  const badges = step ? stepBadges(step, plan.steps) : null;
  const opening = message.body && !["Plan", "Work"].includes(message.body.trim()) ? message.body.trim() : null;
  const title = plan.goal?.trim() || (step ? oneLine(step.brief).split(/(?<=[.!?])\s/)[0] : null) || "Work";
  const said = step ? (step.result ?? step.progress) : null;
  const attempts = step ? attemptsToShow(step) : [];
  const current = step ? sorted(step.attempts).at(-1) : undefined;
  const kindLine = step ? stepKindLine({ kind: step.kind }) : "";
  const bodyId = `work-${message.id}`;
  return (
    <div className="space-y-2 rounded-2xl border border-line bg-panel px-3 py-3">
      {opening && opening !== title ? <RichText text={opening} handles={ctx.handles} /> : null}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        {node ? <NodeAvatar node={node} size={18} /> : null}
        <span className="font-semibold uppercase tracking-wide">Work</span>
        {kindLine ? <span>{kindLine}</span> : null}
        <Pill tone={mission.tone}>{mission.label}</Pill>
        {badges?.outcome && !mission.live ? <Pill tone={badges.outcome.tone}>{badges.outcome.label}</Pill> : null}
        {current && current.n > 1 ? <span>{attemptLabel(current)}</span> : null}
        {mission.live && message.authorAccountId === ctx.meId ? <StopButton onStop={() => void stop()} stopping={stopping} label="Stop this work" /> : null}
      </div>
      <p className="break-words text-sm font-medium">{title}</p>
      {said ? (
        step?.status === "working" ? (
          <p className="live-shine truncate text-[13px]" title={oneLine(said)} aria-live="polite">
            {oneLine(said)}
          </p>
        ) : (
          <div className={open ? "" : "line-clamp-3"}>
            <RichText text={said} handles={ctx.handles} small kindLinks />
          </div>
        )
      ) : null}
      {step ? (
        <div className="border-t border-line/70 pt-1.5">
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={bodyId} className="flex min-h-7 w-full items-center gap-2 rounded-md px-1 text-left text-[13px] text-muted hover:bg-raised/70 hover:text-ink">
            <ChevronRight size={13} className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              {[open ? "Hide the details" : "Details", attempts.length ? `${attempts.length} attempts` : null, runs.length ? `${runs.length} agent run${runs.length === 1 ? "" : "s"}` : null, evidenceCount(evidence)].filter(Boolean).join(" · ")}
            </span>
          </button>
          {open ? (
            <div id={bodyId} className="mt-1.5 space-y-2.5 text-sm">
              <div className="text-muted">
                <RichText text={step.brief ?? ""} handles={ctx.handles} small kindLinks />
              </div>
              {attempts.length ? <Attempts attempts={attempts} kind={step.kind} handles={ctx.handles} /> : null}
              {evidence.length ? <EvidenceGallery items={evidence} /> : null}
              {runs.map((run) => (
                <RunCard key={run.id} message={run} ctx={ctx} node={node} inStep />
              ))}
            </div>
          ) : evidence.length ? (
            <EvidenceGallery items={evidence} className="mt-1.5" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PlanCard({ message, ctx }: { message: Message; ctx: MessageContext }) {
  const data = message.data as PlanData;
  const plan: PlanData = { ...data, steps: Array.isArray(data.steps) ? data.steps : [] };
  const mission = missionView(plan.status);
  const { stop, stopping } = useStopPlan(message.id, "plan");
  const cards = ctx.inPlan.get(message.id) ?? [];
  if (isWorkCard(plan)) return <WorkCard message={message} plan={plan} cards={cards} ctx={ctx} />;
  const progress = planProgress(plan);
  const counting = mission.status === "running" && mission.live;
  return (
    <div className="space-y-2.5 rounded-2xl border border-line bg-panel px-3 py-3">
      {message.body && message.body !== "Plan" ? <RichText text={message.body} handles={ctx.handles} /> : null}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-semibold uppercase tracking-wide">Plan</span>
        {counting ? <Pill tone="accent">{progress.done} of {progress.total} done</Pill> : <Pill tone={mission.tone}>{mission.label}</Pill>}
        {!counting && progress.total && mission.status !== "succeeded" ? <span>{progress.done} of {progress.total} done</span> : null}
        {mission.live && message.authorAccountId === ctx.meId ? <StopButton onStop={() => void stop()} stopping={stopping} label="Stop this plan" /> : null}
      </div>
      {plan.goal?.trim() ? (
        <p className="break-words text-sm">
          <span className="text-muted">Goal: </span>
          {plan.goal.trim()}
        </p>
      ) : null}
      <Ledger plan={plan} planId={message.id} />
      <ol className="space-y-1.5">
        {plan.steps.map((step) => (
          <Step key={step.id} step={step} plan={plan} planId={message.id} cards={cards} ctx={ctx} />
        ))}
      </ol>
    </div>
  );
}
