"use client";

/**
 * Routines (Ensemble docs/35 §6.5; build block B14): work a node does by itself on a schedule, when
 * something changes in Ensemble, or when a webhook calls. The list groups them by node, with when each
 * runs next and how its last run went, pause and resume, Run now, Edit and Delete; its history lists
 * its runs, and a run's card, which is not in the chat, opens on its own. The form makes and changes
 * them; a webhook routine's token is shown once, when it is made or renewed.
 */
import Link from "next/link";
import { CalendarClock, Check, ChevronRight, Copy, History, KeyRound, Pencil, Play, Plus, Repeat, Trash2, Webhook, Zap } from "lucide-react";
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { routines as routinesApi } from "@/lib/api";
import { ENSEMBLE_API } from "@/lib/config";
import { limitsOf, nodesById, useBootstrap, usePlan, useRoutineActions, useRoutineRuns, useRoutines } from "@/lib/hooks";
import {
  browserTimeZone,
  createBody,
  draftOf,
  draftProblems,
  EVENT_ACTIONS,
  isTimeZone,
  itemsText,
  matchTimeZones,
  newDraft,
  NOTIFY,
  notifyShort,
  patchBody,
  reportRooms,
  routinesByNode,
  runBadge,
  runTrigger,
  SCHEDULE_PRESETS,
  scheduleCron,
  scheduleNote,
  scheduleText,
  timeZones,
  untilText,
  watchedSpace,
  webhookUrl,
  WEEKDAYS,
  zoneOffset,
  type DraftField,
  type RoutineDraft,
  type Schedule,
  type SchedulePreset,
} from "@/lib/routines";
import { ago } from "@/lib/text";
import { toast, toastError } from "@/lib/toast";
import type { Bootstrap, Member, Message, NodeFull, Routine, RoutineRun } from "@/lib/types";
import type { MessageContext } from "./chat/message";
import { CodeBlock } from "./chat/code-block";
import { PlanCard } from "./chat/plan-card";
import { NodeAvatar } from "./node-avatar";
import { Button, Drawer, Field, Input, Notice, Pill, Segmented, Spinner, Textarea } from "./ui";

const TRIGGER_ICON = { schedule: CalendarClock, event: Zap, webhook: Webhook } as const;
const SELECT = "rounded-xl border border-line bg-bg px-2.5 py-2 text-sm text-ink outline-none transition focus:border-accent";

/** "5m ago", "just now", or the day for older ones. */
function pastText(iso: string | null | undefined): string {
  const text = ago(iso);
  if (!text) return "";
  if (text === "now") return "just now";
  return /^\d+[mhd]$/.test(text) ? `${text} ago` : `on ${text}`;
}

const absolute = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const hookUrl = (routine: Pick<Routine, "id" | "webhook">) => webhookUrl(ENSEMBLE_API, routine.webhook?.path ?? `/api/node/hooks/routines/${routine.id}`);

/** Where a routine reports, in words: its node's chat or the crew's title. */
function reportsIn(boot: Bootstrap, routine: Pick<Routine, "roomId" | "nodeId">): string | null {
  const room = boot.rooms.find((row) => row.id === routine.roomId);
  if (!room) return null;
  if (room.kind !== "dm") return room.title;
  return `${boot.nodes.find((node) => node.id === routine.nodeId)?.name ?? "its node"}'s chat`;
}

function CopyText({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const write = navigator.clipboard?.writeText(text) ?? Promise.reject(new Error("Copying is not available here: select the text and copy it."));
    write.then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }, toastError);
  };
  return (
    <button type="button" onClick={copy} aria-label={label} title={label} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-line bg-panel px-2 text-xs text-muted transition hover:text-ink">
      {copied ? <Check size={13} className="text-ok" aria-hidden /> : <Copy size={13} aria-hidden />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="flex items-start gap-2">
        <code className="min-w-0 flex-1 select-all break-all rounded-lg border border-line bg-bg px-2 py-1.5 font-mono text-xs text-ink">{value}</code>
        <CopyText text={value} label={`Copy the ${label.toLowerCase()}`} />
      </div>
    </div>
  );
}

/** A webhook routine's address and token, right after it was made or its token renewed: the only time the token shows. */
export function TokenPanel({ routine, token, onDone }: { routine: Routine; token: string; onDone: () => void }) {
  const url = hookUrl(routine);
  return (
    <section aria-label="Webhook token" className="mt-2 space-y-3 rounded-xl border border-warn/40 bg-warn/5 p-3">
      <p className="flex items-start gap-2 text-sm font-medium">
        <KeyRound size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden />
        Copy the token now. You will not see it again.
      </p>
      <CopyRow label="Address" value={url} />
      <CopyRow label="Token" value={token} />
      <p className="text-xs text-muted">
        Send the token as <code className="rounded bg-raised px-1">Authorization: Bearer …</code>, or add <code className="rounded bg-raised px-1">?token=…</code> to the address. What a call sends reaches the node as information, never as instructions. A new token stops this one working.
      </p>
      <CodeBlock code={`curl -X POST "${url}" \\\n  -H "Authorization: Bearer ${token}" \\\n  -H "content-type: application/json" \\\n  -d '{"text": "Deploy finished"}'`} lang="sh" />
      <Button size="sm" onClick={onDone}>
        Done
      </Button>
    </section>
  );
}

/** Pause and resume: a switch named after its routine. */
function RoutineSwitch({ routine, busy, onToggle }: { routine: Routine; busy: boolean; onToggle: () => void }) {
  const active = routine.status === "active";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={`${routine.title} active`}
      disabled={busy}
      onClick={onToggle}
      className="inline-flex shrink-0 items-center gap-2 rounded-lg px-1.5 py-1 text-xs text-muted transition hover:text-ink disabled:opacity-50"
    >
      <span aria-hidden>{active ? "Active" : "Paused"}</span>
      <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition ${active ? "border-accent bg-accent" : "border-line bg-raised"}`} aria-hidden>
        <span className={`inline-block h-3.5 w-3.5 rounded-full shadow transition ${active ? "translate-x-[17px] bg-accent-ink" : "translate-x-0.5 bg-muted"}`} />
      </span>
    </button>
  );
}

function RunRow({ run, onOpen }: { run: RoutineRun; onOpen: () => void }) {
  const badge = runBadge(run);
  const due = run.status === "pending" && Date.parse(run.dueAt) > Date.now();
  const at = run.startedAt ?? run.dueAt;
  return (
    <li className="flex items-start gap-2 px-3 py-2 text-xs">
      <span className="mt-0.5 shrink-0">
        <Pill tone={badge.tone}>{badge.label}</Pill>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-muted">
          {runTrigger(run.trigger)} · <span title={absolute(due ? run.dueAt : at)}>{due ? `due ${untilText(run.dueAt)}` : pastText(at)}</span>
          {itemsText(run) ? ` · ${itemsText(run)}` : ""}
        </span>
        {run.error ? <span className={`mt-0.5 block break-words ${run.status === "failed" ? "text-danger" : "text-muted"}`}>{run.error}</span> : null}
      </span>
      {run.missionId ? (
        <button type="button" onClick={onOpen} className="shrink-0 rounded-lg px-2 py-1 font-medium text-accent hover:bg-raised">
          Open
        </button>
      ) : null}
    </li>
  );
}

/** A routine's runs, newest first (Ensemble keeps the last 50 here). */
function RoutineRuns({ id, routine, onOpen }: { id: string; routine: Routine; onOpen: (run: RoutineRun) => void }) {
  const runs = useRoutineRuns(routine.id, true);
  return (
    <div id={id} className="mt-2 rounded-xl border border-line bg-bg/60">
      {runs.isLoading ? (
        <div className="flex justify-center py-3 text-muted">
          <Spinner className="h-4 w-4" />
        </div>
      ) : runs.error ? (
        <p className="px-3 py-2 text-xs text-danger">{runs.error.message}</p>
      ) : runs.data?.length ? (
        <ol aria-label={`Runs of ${routine.title}`} className="divide-y divide-line/70">
          {runs.data.map((run) => (
            <RunRow key={run.id} run={run} onOpen={() => onOpen(run)} />
          ))}
        </ol>
      ) : (
        <p className="px-3 py-2 text-xs text-muted">No runs yet. Run now starts one.</p>
      )}
    </div>
  );
}

/**
 * One routine: what it does and when, where it reports, when it runs next and how it last went, with
 * pause and resume, Run now, Edit, Delete and its history. `compact` (a node's settings) keeps the
 * switch and Run now and leaves the rest to the Routines page.
 */
export function RoutineRow({ routine, boot, compact = false, highlight = false, onEdit, onOpenRun }: { routine: Routine; boot: Bootstrap; compact?: boolean; highlight?: boolean; onEdit?: (routine: Routine) => void; onOpenRun?: (routine: Routine, run: RoutineRun) => void }) {
  const actions = useRoutineActions();
  const [busy, setBusy] = useState<null | "status" | "run" | "delete" | "token">(null);
  const [history, setHistory] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const titleId = useId();
  const historyId = useId();
  const Icon = TRIGGER_ICON[routine.trigger] ?? Repeat;
  const where = reportsIn(boot, routine);
  const watched = watchedSpace(routine, boot.me.id);
  const last = routine.runs[0];
  const lastBadge = last ? runBadge(last) : null;
  const act = async (name: NonNullable<typeof busy>, work: () => Promise<void>) => {
    setBusy(name);
    try {
      await work();
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(null);
    }
  };
  const toggle = () => act("status", () => actions.setStatus(routine, routine.status === "active" ? "paused" : "active"));
  const runNow = () =>
    act("run", async () => {
      await actions.runNow(routine);
      if (!compact) setHistory(true);
      toast(compact ? `Started “${routine.title}”. Its runs are in Routines.` : `Started “${routine.title}”.`, "ok");
    });
  const remove = () => {
    if (!confirm(`Delete “${routine.title}”? It stops running. What its runs did stays.`)) return;
    void act("delete", async () => {
      await actions.remove(routine);
      toast("Routine deleted.", "ok");
    });
  };
  const renew = () => {
    if (routine.webhook?.hasToken && !confirm("Make a new token? The one you have stops working at once.")) return;
    void act("token", async () => setToken(await actions.newToken(routine)));
  };
  return (
    <article id={`routine-${routine.id}`} aria-labelledby={titleId} className={`scroll-mt-6 rounded-2xl border bg-panel p-3.5 transition ${highlight ? "border-accent ring-2 ring-accent/40" : "border-line"}`}>
      <div className="flex items-start gap-2.5">
        <Icon size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 id={titleId} className="min-w-0 break-words text-sm font-semibold">
              {routine.title}
            </h3>
            <RoutineSwitch routine={routine} busy={busy === "status"} onToggle={() => void toggle()} />
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {routine.when}
            {watched ? ` in ${watched}` : ""} · {notifyShort(routine.notify)}
            {where ? ` · reports in ${where}` : ""}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {routine.status === "paused" ? <span>Paused: it runs only when you run it.</span> : routine.nextRunAt ? <span title={absolute(routine.nextRunAt)}>Next run {untilText(routine.nextRunAt)}</span> : null}
            {last && lastBadge ? (
              <span className="inline-flex items-center gap-1.5">
                Last run <Pill tone={lastBadge.tone}>{lastBadge.label}</Pill>
                <span title={absolute(last.startedAt ?? last.createdAt)}>{pastText(last.startedAt ?? last.createdAt)}</span>
              </span>
            ) : (
              <span>No runs yet</span>
            )}
          </p>
          {routine.trigger === "webhook" ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <code className="min-w-0 max-w-full truncate rounded-md bg-bg px-1.5 py-1 font-mono text-[11px] text-muted" title={hookUrl(routine)}>
                {hookUrl(routine)}
              </code>
              <CopyText text={hookUrl(routine)} label="Copy the address" />
              <Button size="sm" tone="quiet" busy={busy === "token"} onClick={renew}>
                <KeyRound size={13} aria-hidden /> {routine.webhook?.hasToken ? "New token" : "Make a token"}
              </Button>
              {routine.webhook?.hasToken ? null : <span className="text-warn">No token yet: calls are refused.</span>}
            </div>
          ) : null}
          {token ? <TokenPanel routine={routine} token={token} onDone={() => setToken(null)} /> : null}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Button size="sm" tone="ghost" busy={busy === "run"} onClick={() => void runNow()}>
              <Play size={13} aria-hidden /> Run now
            </Button>
            {compact ? (
              <Link href={`/routines#routine-${routine.id}`} className="rounded-lg px-2 py-1.5 text-xs text-accent hover:bg-raised">
                Edit or see its runs
              </Link>
            ) : (
              <>
                <Button size="sm" tone="ghost" onClick={() => onEdit?.(routine)}>
                  <Pencil size={13} aria-hidden /> Edit
                </Button>
                <Button size="sm" tone="quiet" busy={busy === "delete"} onClick={remove}>
                  <Trash2 size={13} aria-hidden /> Delete
                </Button>
              </>
            )}
          </div>
          {compact ? null : (
            <div className="mt-2 border-t border-line/70 pt-1.5">
              <button
                type="button"
                aria-expanded={history}
                aria-controls={historyId}
                onClick={() => setHistory(!history)}
                className="flex min-h-7 w-full items-center gap-2 rounded-md px-1 text-left text-[13px] text-muted hover:bg-raised/70 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60"
              >
                <ChevronRight size={13} className={`shrink-0 transition-transform ${history ? "rotate-90" : ""}`} aria-hidden />
                <History size={14} className="shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">History</span>
              </button>
              {history ? <RoutineRuns id={historyId} routine={routine} onOpen={(run) => onOpenRun?.(routine, run)} /> : null}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/** A run's card, read by its id with its step runs (`GET /api/node/plans/:id`): it is not in the chat. */
function RunCardView({ boot, routine, run }: { boot: Bootstrap; routine: Routine; run: RoutineRun }) {
  const card = usePlan(run.missionId);
  const message = card.data?.message;
  const steps = card.data?.runs;
  const room = boot.rooms.find((row) => row.id === message?.roomId);
  const ctx = useMemo<MessageContext | null>(() => {
    if (!message) return null;
    const people = new Map((room?.members ?? []).flatMap((row): Array<[string, Extract<Member, { kind: "person" }>]> => (row.kind === "person" ? [[row.accountId, row]] : [])));
    return {
      meId: boot.me.id,
      roomId: message.roomId,
      roomTitle: room?.title ?? "",
      roomKind: room?.kind ?? "dm",
      handles: new Set((room?.members ?? []).map((row) => row.handle)),
      nodes: nodesById(boot, room),
      people,
      reactions: limitsOf(boot).reactions,
      pinned: new Set(),
      onReply: () => undefined,
      onJump: () => undefined,
      onRetry: () => undefined,
      onEdit: () => undefined,
      inPlan: new Map<string, Message[]>([[message.id, steps ?? []]]),
    };
  }, [boot, message, room, steps]);
  const badge = runBadge(run);
  const where = reportsIn(boot, routine);
  return (
    <div className="space-y-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <Pill tone={badge.tone}>{badge.label}</Pill>
        <span>
          {runTrigger(run.trigger)} · <span title={absolute(run.startedAt ?? run.dueAt)}>{pastText(run.startedAt ?? run.dueAt)}</span>
          {itemsText(run) ? ` · ${itemsText(run)}` : ""}
        </span>
      </p>
      {run.error ? <Notice tone={run.status === "failed" ? "error" : "warn"}>{run.error}</Notice> : null}
      {card.isLoading ? (
        <div className="flex justify-center py-6 text-muted">
          <Spinner />
        </div>
      ) : card.error ? (
        <Notice tone="error">{card.error.message}</Notice>
      ) : message && ctx ? (
        <PlanCard message={message} ctx={ctx} detached />
      ) : null}
      {room ? (
        <Link href={`/r/${room.id}`} className="inline-block text-sm text-accent hover:underline">
          Open {where ?? room.title}
        </Link>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The form

/** The browser's time zones as a searchable list: type a city or region, pick with the keys or a tap. */
function TimeZoneField({ id, value, onChange, error }: { id: string; value: string; onChange: (zone: string) => void; error?: string }) {
  const zones = useMemo(() => timeZones(), []);
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  useEffect(() => setQuery(value), [value]);
  const typing = query.trim() !== value;
  const matches = useMemo(() => (typing ? matchTimeZones(zones, query, 60) : [value, ...zones.filter((zone) => zone !== value)].slice(0, 60)), [typing, zones, query, value]);
  const pick = (zone: string) => {
    onChange(zone);
    setQuery(zone);
    setOpen(false);
  };
  const leave = () => {
    setOpen(false);
    // Only a real time zone is kept; anything else goes back to the one chosen.
    if (isTimeZone(query) && query.trim() !== value) onChange(query.trim());
    else setQuery(value);
  };
  const key = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((at) => Math.max(0, Math.min(matches.length - 1, at + (event.key === "ArrowDown" ? 1 : -1))));
    } else if (event.key === "Enter" && open && matches[active]) {
      event.preventDefault();
      pick(matches[active]!);
    } else if (event.key === "Escape" && open) {
      // Closes the list, not the drawer around the form.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setQuery(value);
    }
  };
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        Time zone
      </label>
      <div className="relative">
        <Input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={(event) => {
            event.target.select();
            setOpen(true);
            setActive(0);
          }}
          onBlur={leave}
          onKeyDown={key}
        />
        {open && matches.length ? (
          <ul id={listId} role="listbox" aria-label="Time zones" className="scroll-thin absolute inset-x-0 z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-line bg-panel p-1 shadow-2xl">
            {matches.map((zone, at) => (
              <li
                key={zone}
                id={`${listId}-${at}`}
                role="option"
                aria-selected={at === active}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(zone);
                }}
                onMouseEnter={() => setActive(at)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-sm ${at === active ? "bg-raised text-ink" : "text-muted"}`}
              >
                <span className="min-w-0 truncate">{zone.replace(/_/g, " ")}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted">{zoneOffset(zone)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {error ? (
        <span className="block text-xs text-danger" role="alert">
          {error}
        </span>
      ) : (
        <span className="block text-xs text-muted">Times are in this zone, clock changes included.</span>
      )}
    </div>
  );
}

const TEMPLATE_EXAMPLE = `{
  "goal": "Cut this week's release",
  "steps": [
    { "id": "build", "to": "builder", "kind": "build", "brief": "Build the release." },
    { "id": "check", "to": "tester", "kind": "verify", "verifies": "build", "after": ["build"], "brief": "Check the release." }
  ]
}`;

const TIMED: ReadonlySet<SchedulePreset> = new Set(["daily", "weekdays", "weekly", "monthly"]);

function ScheduleFields({ formId, draft, set, problems }: { formId: string; draft: RoutineDraft; set: (patch: Partial<RoutineDraft>) => void; problems: Partial<Record<DraftField, string>> }) {
  const schedule = draft.schedule;
  const change = (patch: Partial<Schedule>) => set({ schedule: { ...schedule, ...patch } });
  const number = (text: string) => (text === "" ? Number.NaN : Number(text));
  const cron = scheduleCron(schedule);
  const words = scheduleText(schedule, draft.timezone);
  const note = scheduleNote(schedule);
  return (
    <div className="space-y-3 rounded-xl border border-line bg-bg/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          id={`${formId}-schedule`}
          aria-label="Repeats"
          value={schedule.preset}
          onChange={(event) => {
            const preset = event.target.value as SchedulePreset;
            // A custom schedule starts from the one chosen so far.
            change({ preset, ...(preset === "custom" && !schedule.cron.trim() ? { cron: scheduleCron(schedule) ?? "" } : {}) });
          }}
          className={SELECT}
        >
          {SCHEDULE_PRESETS.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </select>
        {schedule.preset === "weekly" ? (
          <select aria-label="Day of the week" value={schedule.weekday} onChange={(event) => change({ weekday: Number(event.target.value) })} className={SELECT}>
            {WEEKDAYS.map((day, at) => (
              <option key={day} value={at}>
                {day}
              </option>
            ))}
          </select>
        ) : null}
        {schedule.preset === "monthly" ? (
          <label className="inline-flex items-center gap-1.5 text-sm text-muted">
            day
            <Input type="number" inputMode="numeric" min={1} max={31} aria-label="Day of the month" className="w-20" value={Number.isFinite(schedule.day) ? schedule.day : ""} onChange={(event) => change({ day: number(event.target.value) })} />
          </label>
        ) : null}
        {schedule.preset === "hourly" ? (
          <label className="inline-flex items-center gap-1.5 text-sm text-muted">
            minute
            <Input type="number" inputMode="numeric" min={0} max={59} aria-label="Minute past the hour" className="w-20" value={Number.isFinite(schedule.minute) ? schedule.minute : ""} onChange={(event) => change({ minute: number(event.target.value) })} />
          </label>
        ) : null}
        {TIMED.has(schedule.preset) ? <Input type="time" aria-label="Time" className="w-32" value={schedule.time} onChange={(event) => change({ time: event.target.value })} /> : null}
      </div>
      {schedule.preset === "custom" ? (
        <Field label="Cron" hint="Five fields: minute, hour, day of month, month and day of week. 0 9 * * 1-5 is weekdays at 09:00.">
          <Input id={`${formId}-cron`} className="font-mono" placeholder="0 9 * * 1-5" spellCheck={false} autoComplete="off" value={schedule.cron} onChange={(event) => change({ cron: event.target.value })} />
        </Field>
      ) : null}
      {problems.schedule ? (
        <p role="alert" className="text-xs text-danger">
          {problems.schedule}
        </p>
      ) : words ? (
        <p className="text-xs text-muted" aria-live="polite">
          {words}
          {schedule.preset !== "custom" && cron ? <span className="font-mono"> · {cron}</span> : null}
        </p>
      ) : null}
      {note ? <p className="text-xs text-muted">{note}</p> : null}
      <TimeZoneField id={`${formId}-timezone`} value={draft.timezone} onChange={(timezone) => set({ timezone })} error={problems.timezone} />
    </div>
  );
}

function EventFields({ formId, draft, set, problems }: { formId: string; draft: RoutineDraft; set: (patch: Partial<RoutineDraft>) => void; problems: Partial<Record<DraftField, string>> }) {
  const event = draft.event;
  const change = (patch: Partial<RoutineDraft["event"]>) => set({ event: { ...event, ...patch } });
  const actions = EVENT_ACTIONS[event.on];
  return (
    <div className="space-y-3 rounded-xl border border-line bg-bg/60 p-3">
      <Segmented
        label="What changes"
        size="sm"
        value={event.on}
        onChange={(on) => change({ on, actions: event.actions.filter((action) => EVENT_ACTIONS[on].some((row) => row.id === action)) })}
        options={[
          { id: "task", label: "A task" },
          { id: "page", label: "A page" },
        ]}
      />
      <fieldset>
        <legend className="text-xs text-muted">When it is… (none ticked: any change)</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {actions.map((row) => {
            const on = event.actions.includes(row.id);
            return (
              <label key={row.id} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-sm transition ${on ? "border-accent/60 bg-accent/5" : "border-line"}`}>
                <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={on} onChange={(change_) => change({ actions: change_.target.checked ? [...event.actions, row.id] : event.actions.filter((action) => action !== row.id) })} />
                {row.label}
              </label>
            );
          })}
        </div>
      </fieldset>
      <Field label="Space" hint="Leave it empty for your own space, or name one you can open.">
        <Input placeholder="Your own space" value={event.space} onChange={(change_) => change({ space: change_.target.value })} maxLength={200} />
      </Field>
      <Field label="Gather changes for" error={problems.window} hint="Changes that come within this many seconds start one run together.">
        <span className="flex items-center gap-2">
          <Input id={`${formId}-window`} type="number" inputMode="numeric" min={10} max={86400} className="w-28" value={event.windowSeconds} onChange={(change_) => change({ windowSeconds: change_.target.value })} />
          <span className="text-sm text-muted">seconds</span>
        </span>
      </Field>
    </div>
  );
}

const ORDER: readonly DraftField[] = ["title", "nodeId", "instruction", "template", "schedule", "timezone", "window"];

/**
 * Makes a routine or changes one. A schedule is built from presets (or a cron) in a time zone; an event
 * routine watches tasks or pages; a webhook routine's token shows once, after it is saved. A routine's
 * node cannot change; `lockNode` keeps a new one on the node it was opened for.
 */
export function RoutineForm({ boot, routine, nodeId, lockNode = false, onDone, onCancel }: { boot: Bootstrap; routine?: Routine; nodeId?: string; lockNode?: boolean; onDone: (routine: Routine) => void; onCancel: () => void }) {
  const actions = useRoutineActions();
  const me = boot.me.id;
  const formId = useId().replace(/:/g, "");
  const [initial] = useState<RoutineDraft>(() => {
    if (routine) return draftOf(routine, me);
    const id = nodeId ?? boot.nodes[0]?.id ?? "";
    return newDraft(id, browserTimeZone(), reportRooms(boot.rooms, id, me)[0]?.id ?? "");
  });
  const [draft, setDraft] = useState(initial);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ routine: Routine; token: string } | null>(null);
  const set = (patch: Partial<RoutineDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const all = draftProblems(draft);
  // Problems show once Save was pressed; a plan's JSON and a cron as they are typed.
  const problems: Partial<Record<DraftField, string>> = tried
    ? all
    : {
        ...(draft.what === "plan" && draft.template.trim() ? { template: all.template } : {}),
        ...(draft.schedule.preset === "custom" && draft.schedule.cron.trim() ? { schedule: all.schedule } : {}),
      };
  const node: NodeFull | undefined = boot.nodes.find((row) => row.id === draft.nodeId);
  const rooms = reportRooms(boot.rooms, draft.nodeId, me);
  const roomOptions = draft.roomId && !rooms.some((row) => row.id === draft.roomId) ? [{ id: draft.roomId, title: boot.rooms.find((row) => row.id === draft.roomId)?.title ?? "Where it reports now", chat: false }, ...rooms] : rooms;
  const fixedNode = Boolean(routine) || lockNode;

  if (made) return <TokenPanel routine={made.routine} token={made.token} onDone={() => onDone(made.routine)} />;

  const save = async () => {
    setTried(true);
    setError(null);
    const first = ORDER.find((field) => all[field]);
    if (first) {
      const target = document.getElementById(`${formId}-${first === "schedule" && draft.schedule.preset === "custom" ? "cron" : first}`);
      target?.focus();
      return;
    }
    setBusy(true);
    try {
      if (routine) {
        let saved = await routinesApi.update(routine.id, patchBody(draft, initial));
        actions.saved(saved);
        // Now a webhook routine without a token: make one, and show it once.
        if (saved.trigger === "webhook" && !saved.webhook?.hasToken) {
          const token = await routinesApi.token(saved.id);
          saved = { ...saved, webhook: saved.webhook ? { ...saved.webhook, hasToken: true } : saved.webhook };
          actions.saved(saved);
          setMade({ routine: saved, token });
          return;
        }
        toast(`Saved. ${saved.when}.`, "ok");
        onDone(saved);
      } else {
        const result = await routinesApi.create(createBody(draft));
        actions.saved(result.routine);
        if (result.token) {
          setMade({ routine: result.routine, token: result.token });
          return;
        }
        toast(`Saved. ${result.routine.when}.`, "ok");
        onDone(result.routine);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      noValidate
      aria-label={routine ? `Edit ${routine.title}` : "New routine"}
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Field label="Title" error={problems.title}>
        <Input id={`${formId}-title`} aria-label="Title" value={draft.title} onChange={(event) => set({ title: event.target.value })} maxLength={120} placeholder="Morning summary" />
      </Field>

      {fixedNode ? (
        <div className="space-y-1.5">
          <span className="block text-sm font-medium">Node</span>
          <span className="flex items-center gap-2 text-sm">
            {node ? <NodeAvatar node={node} size={22} /> : null}
            {node ? (
              <>
                {node.name} <span className="font-mono text-xs text-muted">@{node.slug}</span>
              </>
            ) : (
              <span className="text-muted">A node you no longer have</span>
            )}
          </span>
        </div>
      ) : (
        <Field label="Node" error={problems.nodeId} hint="The node that does it: one of your nodes, never a helper.">
          <select
            id={`${formId}-nodeId`}
            aria-label="Node"
            value={draft.nodeId}
            onChange={(event) => set({ nodeId: event.target.value, roomId: reportRooms(boot.rooms, event.target.value, me)[0]?.id ?? "" })}
            className={`${SELECT} w-full`}
          >
            {boot.nodes.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} (@{row.slug})
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Reports in" hint="Only where you read alone: the node's chat, or one of your crews it is in.">
        <select aria-label="Reports in" value={draft.roomId} onChange={(event) => set({ roomId: event.target.value })} className={`${SELECT} w-full`} disabled={!roomOptions.length}>
          {roomOptions.length ? null : <option value="">{node ? `${node.name}'s chat` : "The node's chat"}</option>}
          {roomOptions.map((row) => (
            <option key={row.id} value={row.id}>
              {row.chat ? `${node?.name ?? "The node"}'s chat` : row.title}
            </option>
          ))}
        </select>
      </Field>

      <Field label="What it does" group error={draft.what === "instruction" ? problems.instruction : problems.template}>
        <Segmented
          label="What it does"
          size="sm"
          value={draft.what}
          onChange={(what) => set({ what })}
          options={[
            { id: "instruction", label: "Instruction" },
            { id: "plan", label: "Saved plan (advanced)" },
          ]}
        />
        {draft.what === "instruction" ? (
          <Textarea id={`${formId}-instruction`} aria-label="Instruction" rows={4} maxLength={4000} value={draft.instruction} onChange={(event) => set({ instruction: event.target.value })} placeholder="Summarise what changed on my board since yesterday, and what is due this week." />
        ) : (
          <>
            <Textarea id={`${formId}-template`} aria-label="Saved plan (JSON)" rows={10} spellCheck={false} className="font-mono text-xs" value={draft.template} onChange={(event) => set({ template: event.target.value })} placeholder={TEMPLATE_EXAMPLE} />
            <span className="block text-xs text-muted">A whole plan, as a lead makes one: a goal, requirements, constraints and steps, each step for one of your nodes (`to` is its handle). It runs as a plan in {node ? `${node.name}'s` : "the node's"} crew.</span>
          </>
        )}
      </Field>

      <Field label="When" group>
        <Segmented
          label="When"
          size="sm"
          value={draft.trigger}
          onChange={(trigger) => set({ trigger })}
          options={[
            { id: "schedule", label: "Schedule" },
            { id: "event", label: "Event" },
            { id: "webhook", label: "Webhook" },
          ]}
        />
        {draft.trigger === "schedule" ? (
          <ScheduleFields formId={formId} draft={draft} set={set} problems={problems} />
        ) : draft.trigger === "event" ? (
          <EventFields formId={formId} draft={draft} set={set} problems={problems} />
        ) : (
          <div className="space-y-2 rounded-xl border border-line bg-bg/60 p-3 text-sm text-muted">
            {routine?.trigger === "webhook" ? (
              <>
                <CopyRow label="Address" value={hookUrl(routine)} />
                <p>{routine.webhook?.hasToken ? "It has a token. Make a new one from its row in Routines: the old one stops working." : "It has no token yet: saving makes one, shown once."}</p>
              </>
            ) : (
              <p>Saving gives this routine its own address and a token, shown once. Anything that can send a POST with the token starts it; what it sends reaches the node as information, never as instructions.</p>
            )}
          </div>
        )}
      </Field>

      <Field label="Tell me" group>
        <div className="flex flex-col gap-2">
          {NOTIFY.map((row) => (
            <label key={row.id} className="flex items-start gap-2 text-sm">
              <input type="radio" name={`${formId}-notify`} checked={draft.notify === row.id} onChange={() => set({ notify: row.id })} className="mt-1 accent-[rgb(var(--accent))]" />
              <span>
                <strong>{row.title}</strong> <span className="text-muted">— {row.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </Field>

      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" busy={busy}>
          {routine ? "Save changes" : "Create routine"}
        </Button>
        <Button type="button" tone="quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------
// The page and a node's settings

/** The Routines page: every routine, grouped by node, the form in a drawer and a run's card in another. */
export function RoutinesView() {
  const boot = useBootstrap();
  const list = useRoutines();
  const [form, setForm] = useState<{ routine?: Routine } | null>(null);
  const [opened, setOpened] = useState<{ routine: Routine; run: RoutineRun } | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const ready = Boolean(list.data);
  // `#routine-<id>` (a card's routine chip, a node's settings) opens the page at that routine.
  useEffect(() => {
    if (!ready) return;
    const show = () => {
      const id = window.location.hash.startsWith("#routine-") ? window.location.hash.slice("#routine-".length) : null;
      const element = id ? document.getElementById(`routine-${id}`) : null;
      if (!id || !element) return;
      element.scrollIntoView({ block: "center" });
      setHighlight(id);
      setTimeout(() => setHighlight((current) => (current === id ? null : current)), 2600);
    };
    show();
    window.addEventListener("hashchange", show);
    return () => window.removeEventListener("hashchange", show);
  }, [ready]);
  if (!boot.data) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  }
  const data = boot.data;
  const groups = routinesByNode(list.data ?? [], data.nodes);
  const canMake = data.nodes.length > 0;
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:px-8">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold">Routines</h1>
            {canMake ? (
              <Button onClick={() => setForm({})}>
                <Plus size={15} aria-hidden /> New routine
              </Button>
            ) : null}
          </div>
          <p className="text-sm text-muted">Work your nodes do on their own: on a schedule, when something changes in Ensemble, or when a webhook calls. Each run reports by its routine&apos;s rule.</p>
        </div>

        {list.isLoading ? (
          <div className="flex justify-center py-10 text-muted">
            <Spinner />
          </div>
        ) : list.error ? (
          <Notice tone="error">
            {list.error.message}{" "}
            <button type="button" className="font-medium underline" onClick={() => void list.refetch()}>
              Try again
            </button>
          </Notice>
        ) : groups.length ? (
          groups.map((group) => (
            <section key={group.nodeId} aria-label={group.node ? `${group.node.name}'s routines` : "Other routines"} className="space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                {group.node ? <NodeAvatar node={group.node} size={22} /> : null}
                {group.node ? group.node.name : "A node you no longer have"}
                {group.node ? <span className="font-mono text-xs font-normal text-muted">@{group.node.slug}</span> : null}
              </h2>
              <ul className="space-y-2">
                {group.routines.map((routine) => (
                  <li key={routine.id}>
                    <RoutineRow routine={routine} boot={data} highlight={highlight === routine.id} onEdit={(row) => setForm({ routine: row })} onOpenRun={(row, run) => setOpened({ routine: row, run })} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-line px-5 py-10 text-center">
            <Repeat size={26} className="mx-auto text-accent" aria-hidden />
            <h2 className="mt-3 font-semibold">No routines yet</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">
              For example: every weekday at 09:00, summarise what changed on my board; when a task moves, check its page; when the deploy calls, read its logs.
            </p>
            {canMake ? (
              <Button className="mt-4" onClick={() => setForm({})}>
                <Plus size={15} aria-hidden /> New routine
              </Button>
            ) : (
              <p className="mt-4 text-sm">
                <Link href="/new" className="text-accent hover:underline">
                  Make a node first
                </Link>
              </p>
            )}
          </div>
        )}
      </div>

      <Drawer open={Boolean(form)} onClose={() => setForm(null)} title={form?.routine ? "Edit routine" : "New routine"}>
        {form ? <RoutineForm key={form.routine?.id ?? "new"} boot={data} routine={form.routine} onDone={() => setForm(null)} onCancel={() => setForm(null)} /> : null}
      </Drawer>
      <Drawer open={Boolean(opened)} onClose={() => setOpened(null)} title={opened ? opened.routine.title : "Run"}>
        {opened ? <RunCardView boot={data} routine={opened.routine} run={opened.run} /> : null}
      </Drawer>
    </div>
  );
}

/** A node's routines in its settings, with New routine for that node; the rest is on the Routines page. */
export function NodeRoutines({ node }: { node: NodeFull }) {
  const boot = useBootstrap();
  const list = useRoutines();
  const [adding, setAdding] = useState(false);
  if (!boot.data) return null;
  const mine = (list.data ?? []).filter((row) => row.nodeId === node.id);
  return (
    <div className="space-y-2.5">
      {list.isLoading ? (
        <div className="flex justify-center py-2 text-muted">
          <Spinner className="h-4 w-4" />
        </div>
      ) : list.error ? (
        <p className="text-sm text-danger">{list.error.message}</p>
      ) : mine.length ? (
        <ul className="space-y-2">
          {mine.map((routine) => (
            <li key={routine.id}>
              <RoutineRow routine={routine} boot={boot.data!} compact />
            </li>
          ))}
        </ul>
      ) : adding ? null : (
        <p className="text-sm text-muted">None yet.</p>
      )}
      {adding ? (
        <div className="rounded-xl border border-line bg-bg/60 p-3">
          <RoutineForm boot={boot.data} nodeId={node.id} lockNode onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button tone="ghost" onClick={() => setAdding(true)}>
            <Plus size={15} aria-hidden /> New routine
          </Button>
          <Link href="/routines" className="text-sm text-accent hover:underline">
            All routines
          </Link>
        </div>
      )}
    </div>
  );
}
