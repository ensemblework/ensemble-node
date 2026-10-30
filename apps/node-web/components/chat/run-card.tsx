"use client";

/**
 * A coding run inside a conversation, and the session card of the agent session it belongs to. A
 * status line (engine, model, thinking level, computer, live time, Stop) with the settings asked for,
 * sent and reported, the latest progress, what the run asks you (answered right here), the session
 * (status, what it does now, its queue and controls: components/chat/session.tsx), the work log (read
 * from the job's run while it is open), the structured report, the evidence, the files it changed and
 * its summary.
 *
 * The status line and live timer are adapted from T3 Code's ThreadStatusLine, AgentElapsed and
 * WorkingTimer, the changed-file counts from its DiffStatLabel, and the inline approvals from its
 * ComposerPendingApprovalPanel (MIT License, Copyright (c) 2026 T3 Tools Inc.).
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, CircleStop, ExternalLink, Hammer, MonitorSmartphone } from "lucide-react";
import { ENSEMBLE_LINKS } from "@/lib/config";
import { approvalsForRun, decisionsForJob } from "@/lib/decisions";
import { evidenceItems } from "@/lib/evidence";
import { useApprovals, useDecisions, useJob, useRunSteps, useStopJob } from "@/lib/hooks";
import { sessionAgent } from "@/lib/session";
import { RUN_LABEL } from "@/lib/text";
import { toast, toastError } from "@/lib/toast";
import type { AgentDecision, ApprovalRecord, Message, NodePublic, RunSession, RunSettings, StepReport } from "@/lib/types";
import { elapsedSeconds, formatElapsed, runEnded, runFacts, runStatus, shortPath, workLog } from "@/lib/work-log";
import { ApprovalActions, DecisionActions } from "../decision-answer";
import { External, Pill, Spinner } from "../ui";
import { EvidenceGallery, type RequirementLink } from "./evidence";
import type { MessageContext } from "./message";
import { ReportView } from "./report";
import { RichText } from "./rich-text";
import { SessionFooter, SessionPanel, sessionPanelShows, SettingsView, ToldDisclosure } from "./session";
import { WorkLogView } from "./work-log";
import { ModelLogo } from "../model-logo";
import { TakeoverView } from "../takeover-view";

const RUN_TONE: Record<string, "ok" | "warn" | "danger" | "accent" | "muted"> = {
  succeeded: "ok",
  failed: "danger",
  interrupted: "warn",
  cancelled: "muted",
  waiting_approval: "warn",
  blocked: "warn",
  running: "accent",
  claimed: "accent",
  stopping: "accent",
  queued: "muted",
};

/** A run its node took over with a newer call in the same session (Ensemble's node/sessions.ts). */
const QUIET: Record<string, { label: string; note: string }> = {
  steered: { label: "Updated", note: "You changed this work: it goes on with your update in the run below." },
  replaced: { label: "Replaced", note: "Replaced by newer work in the same session." },
  stopped: { label: "Stopped", note: "Stopped. What it changed so far stays." },
  paused: { label: "Stopped", note: "Stopped when you paused the node. What it changed so far stays." },
};

/** True while the element is on screen (or near it). */
function useOnScreen(ref: React.RefObject<HTMLElement | null>): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), { rootMargin: "200px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return visible;
}

/** Time since `since`, ticking each second without re-rendering the card. */
function Elapsed({ since }: { since: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const tick = () => {
      const text = formatElapsed(elapsedSeconds(since, null) ?? 0);
      if (ref.current && ref.current.textContent !== text) ref.current.textContent = text;
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [since]);
  return (
    <span ref={ref} className="whitespace-nowrap tabular-nums">
      {formatElapsed(elapsedSeconds(since, null) ?? 0)}
    </span>
  );
}

function DiffStat({ added, removed }: { added: number; removed: number }) {
  return (
    <span className="inline-flex shrink-0 gap-1.5 font-mono text-[11px] tabular-nums" aria-label={`${added} added, ${removed} removed`}>
      <span className="text-ok">+{added}</span>
      <span className="text-danger">−{removed}</span>
    </span>
  );
}

function ChangedFiles({ files }: { files: Array<{ path: string; added: number; removed: number }> }) {
  const [all, setAll] = useState(false);
  const shown = all ? files : files.slice(0, 6);
  const added = files.reduce((sum, file) => sum + (file.added || 0), 0);
  const removed = files.reduce((sum, file) => sum + (file.removed || 0), 0);
  return (
    <section className="mt-3 rounded-xl border border-line bg-bg/60 px-2.5 py-2" aria-label="Changed files">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium">
          {files.length} {files.length === 1 ? "file" : "files"} changed
        </span>
        <DiffStat added={added} removed={removed} />
      </div>
      <ul className="mt-1 space-y-0.5">
        {shown.map((file) => (
          <li key={file.path} className="flex items-center justify-between gap-3 font-mono text-[11px]">
            <span className="min-w-0 truncate text-muted" title={file.path}>
              {shortPath(file.path, 60)}
            </span>
            <DiffStat added={file.added || 0} removed={file.removed || 0} />
          </li>
        ))}
      </ul>
      {files.length > shown.length ? (
        <button type="button" className="mt-1 text-xs text-accent hover:underline" onClick={() => setAll(true)}>
          Show all {files.length}
        </button>
      ) : null}
    </section>
  );
}

/** What the run asks, one card at a time, answered here. */
function NeedsYou({ decisions, approvals, jobId }: { decisions: AgentDecision[]; approvals: ApprovalRecord[]; jobId: string }) {
  const total = decisions.length + approvals.length;
  const decision = decisions[0];
  const approval = decision ? undefined : approvals[0];
  const label = decision ? (decision.event === "question" ? "Question" : decision.detail?.command ? "Command approval" : "Permission") : "Approval";
  return (
    <section className="mt-3 rounded-xl border border-warn/40 bg-warn/5 p-3" role="group" aria-label={`Needs you: ${label}`}>
      <div className="flex items-center gap-2 text-[11px]">
        <span className="font-semibold uppercase tracking-wide text-warn">Needs you · {label}</span>
        {total > 1 ? <span className="ml-auto tabular-nums text-muted">1 of {total}</span> : null}
      </div>
      {decision ? (
        <>
          <p className="mt-1 break-words text-sm font-medium">
            {decision.detail?.header ? `${decision.detail.header}: ` : ""}
            {decision.title}
          </p>
          {decision.detail?.command ? (
            <pre className="scroll-thin mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-bg p-2 font-mono text-xs" tabIndex={0} aria-label="Command">
              {decision.detail.command}
            </pre>
          ) : null}
          <div className="mt-2.5">
            <DecisionActions key={decision.id} decision={decision} size="sm" />
          </div>
        </>
      ) : approval ? (
        <>
          <p className="mt-1 break-words text-sm font-medium">{approval.title}</p>
          <div className="mt-2.5">
            <ApprovalActions key={approval.id} approval={approval} jobId={jobId} size="sm" />
          </div>
        </>
      ) : null}
    </section>
  );
}

/** A run's agent session (`data.session`), when Ensemble sends one with an id. */
function sessionOf(value: unknown): RunSession | null {
  const raw = value as Partial<RunSession> | null | undefined;
  return raw && typeof raw.id === "string" ? { ...raw, id: raw.id, status: typeof raw.status === "string" ? raw.status : "", queue: Array.isArray(raw.queue) ? raw.queue : [] } : null;
}

/** A run's structured report (`data.report`), when it is one. */
function reportOf(value: unknown): StepReport | null {
  const raw = value as Partial<StepReport> | null | undefined;
  return raw && typeof raw.outcome === "string" && typeof raw.summary === "string" ? (raw as StepReport) : null;
}

export function RunCard({ message, ctx, node, requirementOf, inStep = false }: { message: Message; ctx: MessageContext; node?: NodePublic; requirementOf?: (id: string) => RequirementLink | null; inStep?: boolean }) {
  const data = message.data;
  const jobId = typeof data.jobId === "string" ? data.jobId : "";
  const box = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(box);
  const [open, setOpen] = useState(false);
  const [controlling, setControlling] = useState(false);
  const job = useJob(jobId, { enabled: Boolean(jobId) && (onScreen || open), poll: !runEnded(data.status) && (onScreen || open) });
  const detail = job.data?.job;
  const status = runStatus(data.status, detail?.status);
  const ended = runEnded(status);
  const steps = useRunSteps(jobId, detail?.runId, open, !ended && open && onScreen);
  const events = job.data?.events;
  const log = useMemo(() => (steps.data ? workLog(steps.data, events ?? []) : null), [steps.data, events]);
  const decisions = useDecisions();
  const approvals = useApprovals();
  const asks = decisionsForJob(decisions.data, jobId);
  const runApprovals = approvalsForRun(approvals.data, detail?.runId);
  const stop = useStopJob();
  const session = sessionOf(data.session);
  const agent = sessionAgent(session);
  const report = reportOf(data.report);
  const evidence = useMemo(() => evidenceItems(data.evidence), [data.evidence]);
  const owner = node?.ownerId === ctx.meId;
  // The packet Ensemble compiled for the agent (a plan step sent straight to it), or its one request for a result.
  const told = typeof data.told === "string" && data.told.trim() ? data.told : null;
  const reportAsked = data.reportAsked === true;

  const progress = (detail?.progress ?? data.progress ?? "").trim();
  const summary = (detail?.summary ?? data.summary ?? log?.result ?? "").trim();
  const error = (detail?.error ?? data.error ?? "").trim();
  const computer = detail?.deviceName ?? data.computer ?? null;
  // Before the job is read (or when it cannot be), the session's agent names the engine.
  const facts = detail ? runFacts(detail) : agent.name ? [agent.name] : [];
  const took = ended ? elapsedSeconds(detail?.startedAt, detail?.finishedAt) : null;
  const toolCalls = detail?.toolCalls ?? 0;
  const quiet = typeof data.quiet === "string" ? QUIET[data.quiet] : undefined;
  // A run in a session stops from its session (keeping or dropping the queue); others from here.
  const canStop = !session && !ended && status !== "stopping" && !quiet && owner && detail?.yours !== false;
  const pill = quiet && (ended || status === "stopping") ? { label: quiet.label, tone: "muted" as const } : { label: RUN_LABEL[status] ?? status, tone: RUN_TONE[status] ?? "muted" };
  const queuedNote = status === "queued" && data.delivery === "queue" ? "Queued in the session: it starts when the run before it ends." : null;
  const waiting = status === "waiting_approval";
  const attempt = typeof data.attempt === "number" && data.attempt > 1 ? data.attempt : null;
  const sessionPanel = Boolean(session && !quiet && sessionPanelShows(status));

  const stopRun = () => {
    if (!confirm("Stop this run? The agent stops where it is; what it changed so far stays.")) return;
    stop.mutate(jobId, { onSuccess: () => toast("Stopping the run.", "ok"), onError: toastError });
  };

  return (
    <div ref={box} className="mt-1 rounded-2xl border border-line bg-panel p-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0"><ModelLogo provider={detail?.provider ?? agent.id} model={detail?.provider === "ensemble" ? detail.model : undefined} size={19} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <p className="min-w-0 break-words text-sm font-medium">{message.body}</p>
            <div className="flex shrink-0 items-center gap-1.5">
              {reportAsked ? (
                <span title="It ended without reporting its result, so Ensemble asked it once, in the same session.">
                  <Pill tone="muted">Asked for its result</Pill>
                </span>
              ) : null}
              <Pill tone={pill.tone}>{pill.label}</Pill>
              {owner && !ended && (status === "running" || status === "claimed") ? (
                <button
                  type="button"
                  onClick={() => setControlling(true)}
                  aria-label="Open the run's browser"
                  title="Control the run's browser tab from here, encrypted end to end; the agent waits meanwhile"
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-line px-2 text-xs text-muted transition hover:border-accent/50 hover:text-ink"
                >
                  <MonitorSmartphone size={13} /> Open browser
                </button>
              ) : null}
              {canStop ? (
                <button
                  type="button"
                  onClick={stopRun}
                  disabled={stop.isPending}
                  aria-label="Stop the run"
                  title="Stop the run"
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-line px-2 text-xs text-muted transition hover:border-danger/50 hover:text-danger disabled:opacity-50"
                >
                  {stop.isPending ? <Spinner className="h-3 w-3" /> : <CircleStop size={13} />} Stop
                </button>
              ) : null}
            </div>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            {facts.length ? <span className="font-medium text-ink/80">{facts[0]}</span> : null}
            {[...facts.slice(1), computer ? `on ${computer}` : "on your computer"].map((fact, at) => (
              <Fragment key={fact}>
                {at || facts.length ? " · " : ""}
                <span>{fact}</span>
              </Fragment>
            ))}
            {!ended && detail?.startedAt ? (
              <>
                {" · "}
                <Elapsed since={detail.startedAt} />
              </>
            ) : took !== null ? (
              <>
                {" · "}
                <span className="whitespace-nowrap tabular-nums">{formatElapsed(took)}</span>
              </>
            ) : null}
            {attempt ? <span className="whitespace-nowrap">{` · attempt ${attempt}`}</span> : null}
          </p>
          <SettingsView settings={data.settings as RunSettings | undefined} />
          {told && !sessionPanel ? <ToldDisclosure told={told} handles={ctx.handles} /> : null}
        </div>
      </div>

      {controlling && jobId ? (
        <TakeoverView
          source={{ jobId }}
          site={message.body}
          computer={computer ?? "your computer"}
          onClose={() => setControlling(false)}
        />
      ) : null}

      {quiet ? <p className="mt-2 text-[13px] text-muted">{quiet.note}</p> : queuedNote ? <p className="mt-2 text-[13px] text-muted">{queuedNote}</p> : null}

      {progress && !ended && !quiet && !queuedNote && !asks.length && !runApprovals.length ? (
        <p className={`mt-2 truncate text-[13px] ${status === "running" || status === "claimed" ? "live-shine" : "text-muted"}`} title={progress} aria-live="polite">
          {progress}
        </p>
      ) : null}

      {asks.length || runApprovals.length ? <NeedsYou decisions={asks} approvals={runApprovals} jobId={jobId} /> : null}

      {sessionPanel && session ? (
        <SessionPanel session={session} jobId={jobId} cardId={message.id} runStatus={status} runTitle={message.body} onScreen={onScreen} owner={owner} told={told} handles={ctx.handles} nodes={ctx.nodes} />
      ) : session && !quiet && ctx.sessionCardOf?.(session.id) === message.id ? (
        <SessionFooter session={session} cardId={message.id} owner={owner} nodes={ctx.nodes} />
      ) : null}

      {jobId ? (
        <div className="mt-2 border-t border-line/70 pt-1.5">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls={`work-${message.id}`}
            className="flex min-h-7 w-full items-center gap-2 rounded-md px-1 text-left text-[13px] text-muted hover:bg-raised/70 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60"
          >
            <ChevronRight size={13} className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
            <Hammer size={14} className="shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              {ended ? `Worked${took !== null ? ` for ${formatElapsed(took)}` : ""}` : "Working"}
              {detail ? ` · ${toolCalls} tool ${toolCalls === 1 ? "call" : "calls"}` : ""}
            </span>
            <span className="hidden shrink-0 text-xs sm:inline">{open ? "Hide the work" : "Show the work"}</span>
          </button>
          {open ? (
            <div id={`work-${message.id}`} className="mt-1">
              {job.error ? (
                <p className="px-1 text-xs text-danger">{job.error.message}</p>
              ) : !detail || (steps.isLoading && !steps.data) ? (
                <div className="flex justify-center py-3 text-muted">
                  <Spinner className="h-4 w-4" />
                </div>
              ) : !detail.runId ? (
                <p className="px-1 py-1 text-xs text-muted">{ended ? "This run kept no steps." : "The steps appear here once the computer starts the run."}</p>
              ) : steps.error ? (
                <p className="px-1 text-xs text-danger">{steps.error.message}</p>
              ) : log ? (
                <WorkLogView items={log.items} active={!ended} />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {report ? <ReportView report={report} handles={ctx.handles} /> : null}
      {/* Inside a plan step, the step's own gallery already holds its runs' evidence. */}
      {evidence.length && !inStep ? <EvidenceGallery items={evidence} requirementOf={requirementOf} className="mt-3" /> : null}
      {detail?.files?.length ? <ChangedFiles files={detail.files} /> : null}
      {summary && ended && !report ? (
        <div className="mt-3">
          <RichText text={summary} handles={ctx.handles} small />
        </div>
      ) : null}
      {error ? <p className="mt-2 break-words text-sm text-danger">{error}</p> : null}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {data.taskId ? (
          <External href={ENSEMBLE_LINKS.task(data.taskId)} className="inline-flex items-center gap-1 text-accent hover:underline">
            Open the task in Ensemble <ExternalLink size={11} />
          </External>
        ) : null}
        {waiting && !asks.length && !runApprovals.length ? (
          <External href={ENSEMBLE_LINKS.needsMe} className="inline-flex items-center gap-1 text-warn hover:underline">
            Answer it in Needs me <ExternalLink size={11} />
          </External>
        ) : null}
      </div>
    </div>
  );
}
