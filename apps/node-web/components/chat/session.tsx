"use client";

/**
 * The session parts of a run card (build blocks B3, B16; Ensemble's node/sessions.ts): the settings a
 * run was asked for, sent with and reported back, and the agent session it belongs to with its status,
 * the node that manages it, what it is doing now, its queue (move up, move down, cancel) and the
 * owner's controls: Steer…, Queue…, Stop and send…, Stop (keeping or dropping the queue) and Hand to…
 * another node. Each control calls the same code as the node's own session tools, so the node always
 * knows. Changes show at once; refusals show here.
 */
import { AlertTriangle, ArrowDown, ArrowUp, ArrowRightLeft, ChevronDown, ScrollText, SlidersHorizontal, X } from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useBootstrap, useHandOver, useSession, useSessionControl, useSessionQueue } from "@/lib/hooks";
import { handOverChoices, observedMissing, queuedLine, queueOrder, sessionActions, sessionManager, sessionStatus, settingsRows } from "@/lib/session";
import { toast } from "@/lib/toast";
import type { NodePublic, RunSession, RunSettings, SessionAction } from "@/lib/types";
import { NodeAvatar } from "../node-avatar";
import { Button, Input, Pill, Textarea } from "../ui";
import { RichText } from "./rich-text";

/** What the agent was told: the packet Ensemble compiled for it (`data.told`, Markdown with its parts as small labels), scrolling inside the card. */
export function ToldView({ told, handles, id }: { told: string; handles: ReadonlySet<string>; id?: string }) {
  return (
    <div id={id} role="region" aria-label="What the agent was told" tabIndex={0} className="scroll-thin mt-1.5 max-h-80 overflow-auto rounded-lg border border-line bg-bg/60 px-2.5 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
      <RichText text={told} handles={handles} small kindLinks labelHeadings />
    </div>
  );
}

/** "What the agent was told", folded, for a run whose session panel is not showing it. */
export function ToldDisclosure({ told, handles }: { told: string; handles: ReadonlySet<string> }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="mt-1">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id} className="inline-flex max-w-full items-center gap-1 rounded-md text-xs text-muted hover:text-ink">
        <ScrollText size={12} className="shrink-0" aria-hidden />
        <span>What the agent was told</span>
        <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open ? <ToldView told={told} handles={handles} id={id} /> : null}
    </div>
  );
}

/** The settings asked for (requested), sent to the engine (resolved) and reported by it (observed). */
export function SettingsView({ settings }: { settings: RunSettings | null | undefined }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const rows = settingsRows(settings);
  if (!rows.length) return null;
  const mismatch = rows.some((row) => row.mismatch);
  const status = mismatch ? { text: "not as asked", tone: "text-warn" } : observedMissing(settings) ? { text: "not reported by the engine", tone: "text-muted" } : { text: "as asked", tone: "text-ok" };
  return (
    <div className="mt-1">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id} className="inline-flex max-w-full items-center gap-1 rounded-md text-xs text-muted hover:text-ink">
        <SlidersHorizontal size={12} className="shrink-0" aria-hidden />
        <span>Settings</span>
        <span className={`truncate ${status.tone}`}>· {status.text}</span>
        <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open ? (
        <div id={id} className="mt-1.5 rounded-lg border border-line bg-bg/60">
          {/* Phones: one block per setting; wider screens: a table. */}
          <dl className="divide-y divide-line/70 text-[11px] sm:hidden">
            {rows.map((row) => (
              <div key={row.key} className={`px-2 py-1 ${row.mismatch ? "bg-warn/5" : ""}`}>
                <dt className="inline-flex items-center gap-1 font-medium text-muted">
                  {row.mismatch ? <AlertTriangle size={11} className="text-warn" role="img" aria-label="Not as asked" /> : null}
                  {row.label}
                </dt>
                <dd className="mt-0.5 flex flex-wrap gap-x-2.5 break-all">
                  <span>
                    <span className="text-muted">Requested </span>
                    {row.requested ?? "—"}
                  </span>
                  <span className={row.mismatch ? "text-warn" : ""}>
                    <span className="text-muted">Resolved </span>
                    {row.resolved ?? "—"}
                  </span>
                  <span className={row.observed === "not reported" ? "italic text-muted" : row.mismatch ? "text-warn" : ""}>
                    <span className="not-italic text-muted">Observed </span>
                    {row.observed ?? "—"}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
          <table className="hidden w-full text-left text-[11px] sm:table">
            <caption className="sr-only">The run's settings: requested, resolved (sent to the engine) and observed (reported by the engine)</caption>
            <thead className="text-muted">
              <tr>
                <th scope="col" className="px-2 py-1 font-medium">
                  Setting
                </th>
                <th scope="col" className="px-2 py-1 font-medium">
                  Requested
                </th>
                <th scope="col" className="px-2 py-1 font-medium">
                  Resolved
                </th>
                <th scope="col" className="px-2 py-1 font-medium">
                  Observed
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className={`border-t border-line/70 ${row.mismatch ? "bg-warn/5" : ""}`}>
                  <th scope="row" className="whitespace-nowrap px-2 py-1 font-medium text-muted">
                    <span className="inline-flex items-center gap-1">
                      {row.mismatch ? <AlertTriangle size={11} className="text-warn" role="img" aria-label="Not as asked" /> : null}
                      {row.label}
                    </span>
                  </th>
                  <td className="break-all px-2 py-1">{row.requested ?? "—"}</td>
                  <td className={`break-all px-2 py-1 ${row.mismatch ? "text-warn" : ""}`}>{row.resolved ?? "—"}</td>
                  <td className={`break-all px-2 py-1 ${row.observed === "not reported" ? "italic text-muted" : row.mismatch ? "text-warn" : ""}`}>{row.observed ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

type Mode = "steer" | "queue" | "replace" | "stop";

const FORMS: Record<Exclude<Mode, "stop">, { title: string; submit: string; hint: string; placeholder: string; done: string }> = {
  steer: {
    title: "Steer the run",
    submit: "Steer",
    hint: "It stops where it is and goes on at once with your change, in the same conversation. Queued messages stay after it.",
    placeholder: "Also update the README",
    done: "Sent. The run goes on with your change.",
  },
  queue: { title: "Queue a message", submit: "Queue", hint: "It runs after the run going on and what is already queued.", placeholder: "Then add tests for it", done: "Queued." },
  replace: { title: "Stop and send", submit: "Stop and send", hint: "The run stops, the queue is dropped, and this goes in its place.", placeholder: "Stop that and do the PDF export", done: "Stopped the run and sent your message." },
};

function ActionForm({ mode, queued, busy, onSubmit, onCancel }: { mode: Mode; queued: number; busy: boolean; onSubmit: (body: SessionAction) => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const id = useId();
  if (mode === "stop") {
    return (
      <div className="mt-2 rounded-lg border border-danger/30 bg-danger/5 p-2" role="group" aria-label="Stop the run">
        <p className="text-[13px]">Stop the run? The agent stops where it is; what it changed so far stays.</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {queued ? (
            <>
              <Button size="sm" tone="danger" busy={busy} onClick={() => onSubmit({ action: "stop", queued: "keep" })}>
                Stop, keep the queue ({queued})
              </Button>
              <Button size="sm" tone="danger" disabled={busy} onClick={() => onSubmit({ action: "stop", queued: "drop" })}>
                Stop and drop the queue
              </Button>
            </>
          ) : (
            <Button size="sm" tone="danger" busy={busy} onClick={() => onSubmit({ action: "stop", queued: "keep" })}>
              Stop
            </Button>
          )}
          <Button size="sm" tone="quiet" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }
  const form = FORMS[mode];
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!text.trim() || busy) return;
    onSubmit({ action: mode, prompt: text.trim(), ...(mode !== "steer" && title.trim() ? { title: title.trim() } : {}) });
  };
  return (
    <form onSubmit={submit} className="mt-2 space-y-1.5" aria-label={form.title}>
      <label htmlFor={`${id}-text`} className="block text-xs font-medium">
        {form.title}
      </label>
      <Textarea
        id={`${id}-text`}
        autoFocus
        rows={3}
        value={text}
        placeholder={form.placeholder}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        aria-describedby={`${id}-hint`}
      />
      {mode !== "steer" ? <Input aria-label="Title (optional)" placeholder="Title (optional)" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} /> : null}
      <p id={`${id}-hint`} className="text-xs text-muted">
        {form.hint}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" type="submit" busy={busy} disabled={!text.trim()}>
          {form.submit}
        </Button>
        <Button size="sm" tone="quiet" type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function QueueButton({ label, onClick, inert, children }: { label: string; onClick: () => void; inert: boolean; children: ReactNode }) {
  // Stays focusable when it cannot act (first or last place, an edit on its way), so focus is not lost.
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-disabled={inert || undefined}
      onClick={() => (inert ? undefined : onClick())}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition ${inert ? "cursor-default opacity-35" : "hover:bg-raised hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

/**
 * Who manages a session and, for its owner, Hand to… another of their lasting nodes (Give to… when no
 * node manages it). The node it goes to sees what the session did, sends it messages and answers for
 * it; runs already started still report to the node that started them.
 */
export function SessionManager({ sessionId, managerId, cardId, owner, nodes }: { sessionId: string; managerId: string | null; cardId: string; owner: boolean; nodes: ReadonlyMap<string, NodePublic> }) {
  const boot = useBootstrap();
  const handOver = useHandOver(sessionId, cardId);
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const id = useId();
  const mine = boot.data?.nodes ?? [];
  const manager = managerId ? (nodes.get(managerId) ?? mine.find((row) => row.id === managerId)) : undefined;
  const choices = handOverChoices(mine, managerId);
  const close = () => {
    setPicking(false);
    setChosen(null);
    handOver.reset();
  };
  const submit = () => {
    const to = choices.find((row) => row.id === chosen);
    if (!to) return;
    handOver.mutate(to.id, {
      onSuccess: () => {
        close();
        toast(`@${to.slug} manages this session now.`, "ok");
      },
    });
  };
  return (
    <div className="mt-1.5">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
        {managerId ? (
          <>
            <span>Managed by</span>
            {manager ? (
              <span aria-hidden className="inline-flex">
                <NodeAvatar node={manager} size={16} />
              </span>
            ) : null}
            <span className="font-medium text-ink/90">{manager ? `@${manager.slug}` : "another node"}</span>
          </>
        ) : (
          <span>No node manages this session yet.</span>
        )}
        {owner && choices.length && !picking ? (
          <button type="button" onClick={() => setPicking(true)} className="inline-flex items-center gap-1 rounded-md px-1 text-accent hover:underline">
            <ArrowRightLeft size={12} aria-hidden /> {managerId ? "Hand to…" : "Give to…"}
          </button>
        ) : null}
      </p>
      {picking ? (
        <fieldset className="mt-1.5 rounded-lg border border-line bg-panel/70 p-2">
          <legend className="px-1 text-xs font-medium">{managerId ? "Hand this session to" : "Give this session to"}</legend>
          <ul className="space-y-0.5">
            {choices.map((node) => (
              <li key={node.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[13px] hover:bg-raised">
                  <input type="radio" name={id} value={node.id} checked={chosen === node.id} onChange={() => setChosen(node.id)} className="shrink-0 accent-[rgb(var(--accent))]" />
                  <span aria-hidden className="inline-flex shrink-0">
                    <NodeAvatar node={node} size={20} dim={node.status === "paused"} />
                  </span>
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{node.name}</span> <span className="text-muted">@{node.slug} · {node.role}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-1 px-1 text-xs text-muted">It sees what the session did, sends it messages and answers for it. Runs already started still report to the node that started them.</p>
          {handOver.error ? (
            <p role="alert" className="mt-1 px-1 text-xs text-danger">
              {handOver.error.message}
            </p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Button size="sm" busy={handOver.isPending} disabled={!chosen} onClick={submit}>
              {managerId ? "Hand it over" : "Give it"}
            </Button>
            <Button size="sm" tone="quiet" disabled={handOver.isPending} onClick={close}>
              Cancel
            </Button>
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}

/**
 * A session's line on its newest card once that card's run has ended: its state and who manages it,
 * with Hand to… for its owner. The card of a live run has the whole panel instead.
 */
export function SessionFooter({ session, cardId, owner, nodes }: { session: RunSession; cardId: string; owner: boolean; nodes: ReadonlyMap<string, NodePublic> }) {
  const badge = sessionStatus(session.status);
  return (
    <section className="mt-2 rounded-xl border border-line/70 bg-bg/40 px-2.5 py-1.5" aria-label="Agent session">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="font-semibold uppercase tracking-wide text-muted">Session</span>
        <Pill tone={badge.tone}>{badge.label}</Pill>
        {session.queue.length ? <span className="text-muted">{session.queue.length} queued</span> : null}
      </div>
      <SessionManager sessionId={session.id} managerId={sessionManager(session)} cardId={cardId} owner={owner} nodes={nodes} />
    </section>
  );
}

const LIVE_RUN: ReadonlySet<string> = new Set(["running", "claimed", "waiting_approval", "stopping"]);

/** Whether a run card's session panel shows (its run is live or queued); it then shows what the run was told. */
export const sessionPanelShows = (runStatus: string): boolean => LIVE_RUN.has(runStatus) || runStatus === "queued";

const DONE: Record<string, (queued: SessionAction["queued"]) => string> = {
  steer: () => FORMS.steer.done,
  queue: () => FORMS.queue.done,
  replace: () => FORMS.replace.done,
  stop: (queued) => (queued === "drop" ? "Stopping. The queue is dropped." : "Stopping. Queued messages stay."),
};

/**
 * The agent session of a run card, while its run is live: on the run going on, the session's status,
 * what it is doing (and what it was told: the card's packet, `told`, before the session's own prompt),
 * its queue and the controls; on a queued run, its place in line and Cancel.
 */
export function SessionPanel({
  session,
  jobId,
  cardId,
  runStatus,
  runTitle,
  onScreen,
  owner,
  told,
  handles,
  nodes,
}: {
  session: RunSession;
  jobId: string;
  cardId: string;
  runStatus: string;
  runTitle: string;
  onScreen: boolean;
  owner: boolean;
  told?: string | null;
  handles: ReadonlySet<string>;
  nodes: ReadonlyMap<string, NodePublic>;
}) {
  const live = sessionPanelShows(runStatus);
  const query = useSession(session.id, { enabled: owner && onScreen && live, poll: owner && onScreen && live });
  const detail = query.data;
  const queue = useSessionQueue(session.id, queueOrder(detail?.queue ?? session.queue));
  const control = useSessionControl(session.id, jobId);
  const [mode, setMode] = useState<Mode | null>(null);
  const [showTold, setShowTold] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [moved, setMoved] = useState("");
  const status = detail?.status ?? session.status;
  // A session no node manages is read here but not told anything (Ensemble refuses): it can be given to a node.
  const managerId = sessionManager(session, detail);
  const running = detail?.running ?? null;
  const current = running ? running.jobId === jobId : LIVE_RUN.has(runStatus);
  if (!live) return null;

  if (!current) {
    // What it was told stays on the card when the session shows another run as the one going on.
    const toldHere = told ? <ToldDisclosure told={told} handles={handles} /> : null;
    if (runStatus !== "queued") return toldHere;
    const place = queue.queue.findIndex((row) => row.jobId === jobId);
    return (
      <>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
          <span aria-live="polite">{place >= 0 ? `Number ${place + 1} of ${queue.queue.length} in the session's queue.` : "Taken out of the queue."}</span>
          {owner && managerId && place >= 0 ? (
            <button type="button" disabled={queue.busy} onClick={() => queue.cancel(jobId)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs hover:bg-raised hover:text-danger disabled:opacity-50">
              <X size={12} aria-hidden /> Cancel this message
            </button>
          ) : null}
          {queue.error ? (
            <span role="alert" className="w-full text-xs text-danger">
              {queue.error}
            </span>
          ) : null}
        </div>
        {toldHere}
      </>
    );
  }

  const badge = sessionStatus(status);
  const actions = owner && managerId ? sessionActions(status) : [];
  const where = [detail?.folder ?? session.folder, detail?.computer ?? session.computer].filter(Boolean).join(" on ");
  const send = (body: SessionAction) => {
    setNote(null);
    control.mutate(body, {
      onSuccess: () => {
        setMode(null);
        setNote(DONE[body.action]!(body.queued));
      },
    });
  };
  const announce = (text: string) => setMoved(text);
  return (
    <section className="mt-3 rounded-xl border border-line bg-bg/60 px-2.5 py-2" aria-label="Agent session">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="font-semibold uppercase tracking-wide text-muted">Session</span>
        <Pill tone={badge.tone}>{badge.label}</Pill>
        {queue.queue.length ? <span className="text-muted">{queue.queue.length} queued</span> : null}
        {where ? (
          <span className="min-w-0 truncate text-muted" title={where}>
            {where}
          </span>
        ) : null}
      </div>
      <SessionManager sessionId={session.id} managerId={managerId} cardId={cardId} owner={owner} nodes={nodes} />
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-[13px]">
        <span className="min-w-0 break-words">
          <span className="text-muted">Now: </span>
          {running?.title || runTitle}
        </span>
        {told || running?.prompt ? (
          <button type="button" onClick={() => setShowTold(!showTold)} aria-expanded={showTold} className="text-xs text-accent hover:underline">
            {showTold ? "Hide what it was told" : "What it was told"}
          </button>
        ) : null}
      </div>
      {showTold && told ? (
        <ToldView told={told} handles={handles} />
      ) : showTold && running?.prompt ? (
        <pre className="scroll-thin mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-bg p-2 font-sans text-xs" tabIndex={0} aria-label="What the agent was told">
          {running.prompt}
        </pre>
      ) : null}
      {queue.queue.length ? (
        <ol className="mt-2 space-y-1" aria-label="Queued messages">
          {queue.queue.map((row, at) => {
            const line = queuedLine(row);
            return (
              <li key={row.jobId} className="flex items-center gap-1.5 rounded-lg bg-panel/70 py-0.5 pl-2 pr-1 text-[13px]">
                <span className="w-4 shrink-0 text-right text-xs tabular-nums text-muted">{at + 1}</span>
                <span className="min-w-0 flex-1 truncate" title={row.prompt}>
                  {line}
                </span>
                {owner && managerId ? (
                  <>
                    <QueueButton
                      label={`Move “${line}” earlier`}
                      inert={at === 0 || queue.busy}
                      onClick={() => {
                        queue.move(row.jobId, -1);
                        announce(`Moved “${line}” to number ${at}.`);
                      }}
                    >
                      <ArrowUp size={13} aria-hidden />
                    </QueueButton>
                    <QueueButton
                      label={`Move “${line}” later`}
                      inert={at === queue.queue.length - 1 || queue.busy}
                      onClick={() => {
                        queue.move(row.jobId, 1);
                        announce(`Moved “${line}” to number ${at + 2}.`);
                      }}
                    >
                      <ArrowDown size={13} aria-hidden />
                    </QueueButton>
                    <QueueButton
                      label={`Cancel “${line}”`}
                      inert={queue.busy}
                      onClick={() => {
                        queue.cancel(row.jobId);
                        announce(`Cancelled “${line}”.`);
                      }}
                    >
                      <X size={13} aria-hidden />
                    </QueueButton>
                  </>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
      {mode ? (
        <ActionForm
          key={mode}
          mode={mode}
          queued={queue.queue.length}
          busy={control.isPending}
          onSubmit={send}
          onCancel={() => {
            setMode(null);
            control.reset();
          }}
        />
      ) : actions.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Tell the session">
          {actions.includes("steer") ? (
            <Button size="sm" tone="ghost" onClick={() => (setNote(null), control.reset(), setMode("steer"))}>
              Steer…
            </Button>
          ) : null}
          {actions.includes("queue") ? (
            <Button size="sm" tone="ghost" onClick={() => (setNote(null), control.reset(), setMode("queue"))}>
              Queue…
            </Button>
          ) : null}
          {actions.includes("replace") ? (
            <Button size="sm" tone="ghost" onClick={() => (setNote(null), control.reset(), setMode("replace"))}>
              Stop and send…
            </Button>
          ) : null}
          {actions.includes("stop") ? (
            <Button size="sm" tone="danger" onClick={() => (setNote(null), control.reset(), setMode("stop"))}>
              Stop
            </Button>
          ) : null}
        </div>
      ) : null}
      {control.error ? (
        <p role="alert" className="mt-1.5 text-xs text-danger">
          {control.error.message}
        </p>
      ) : queue.error ? (
        <p role="alert" className="mt-1.5 text-xs text-danger">
          {queue.error}
        </p>
      ) : null}
      <p role="status" aria-live="polite" className={note ? "mt-1.5 text-xs text-ok" : "sr-only"}>
        {note ?? ""}
      </p>
      <p aria-live="polite" className="sr-only">
        {queue.error ? "" : moved}
      </p>
    </section>
  );
}
