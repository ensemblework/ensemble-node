"use client";

/**
 * The work of a room with other people, in its conversation (Ensemble docs/35 §12.11–12.14): the offer
 * to join the room's space, the one question when work starts, my lead's private notes of what changed
 * for me there (with Start, or Decline for a task proposed to me, and a contract's changes), the catch-up
 * digest when I come back, a result delivered into the room (and its draft, which I post), a logged
 * decision's line, a page's role line, and the private line that tells me someone declined what I asked.
 */
import { ArrowRight, BookCheck, Check, CheckSquare, CircleSlash, ExternalLink, FileText, Folder, Inbox, Lock, MessageSquare, Play } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ENSEMBLE_LINKS } from "@/lib/config";
import { mediaItems } from "@/lib/evidence";
import { useDeclineTask, useSpaceActions, useStartTask } from "@/lib/hooks";
import { contractChanges, digestSections, digestTitle, eventSubjects, offerState, pageRoleChange, resultState, startable, WORK_MODES, type DigestSection, type EventSubject } from "@/lib/room-work";
import { ago } from "@/lib/text";
import { toast, toastError } from "@/lib/toast";
import type { Message, WorkMode } from "@/lib/types";
import { Button, External, Pill, Textarea } from "../ui";
import { EvidenceGallery } from "./evidence";
import type { MessageContext } from "./message";
import { RichText } from "./rich-text";

/** The one question when work on a task of the room's board starts: private work with a shared result (the default), or a shared run. */
export function ModeChoice({ value, onChange, name }: { value: WorkMode; onChange: (mode: WorkMode) => void; name: string }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1 text-xs font-medium text-muted">How should it run?</legend>
      {WORK_MODES.map((mode) => (
        <label key={mode.id} className={`flex cursor-pointer items-start gap-2 rounded-xl border px-2.5 py-2 text-sm transition ${value === mode.id ? "border-accent/60 bg-accent/5" : "border-line bg-bg/60 hover:border-muted"}`}>
          <input type="radio" name={name} className="mt-1 accent-[rgb(var(--accent))]" checked={value === mode.id} onChange={() => onChange(mode.id)} />
          <span className="min-w-0">
            <span className="block font-medium">
              {mode.label}
              {mode.id === "private" ? <span className="ml-1.5 text-xs font-normal text-muted">(usual)</span> : null}
            </span>
            <span className="block text-xs text-muted">{mode.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/**
 * Starts one of my tasks on the room's board: the one question first, then my lead plans it in My crew.
 * `alongside` shows next to Start until it is pressed (Decline, for a task proposed to me).
 */
export function StartTask({ roomId, taskId, title, size = "sm", alongside }: { roomId: string; taskId: string; title: string; size?: "sm" | "md"; alongside?: ReactNode }) {
  const start = useStartTask(roomId);
  const [asking, setAsking] = useState(false);
  const [mode, setMode] = useState<WorkMode>("private");
  if (start.isSuccess) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-ok" role="status">
        <Check size={13} aria-hidden /> Started: your lead plans it in My crew.
      </span>
    );
  }
  if (!asking) {
    return (
      <>
        <Button size={size} tone="ghost" onClick={() => setAsking(true)} aria-label={`Start “${title}”`}>
          <Play size={13} /> Start
        </Button>
        {alongside}
      </>
    );
  }
  return (
    <div className="w-full space-y-2 rounded-xl border border-line bg-bg/60 p-2.5" role="group" aria-label={`Start “${title}”`}>
      <ModeChoice value={mode} onChange={setMode} name={`start-${taskId}`} />
      {/* A paused lead cannot plan it (409): its words say what to do. */}
      {start.error ? <p className="text-xs text-danger">{start.error.message}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" busy={start.isPending} onClick={() => start.mutate({ taskId, mode }, { onSuccess: () => setAsking(false) })}>
          <Play size={13} /> Start it
        </Button>
        <Button size="sm" tone="quiet" disabled={start.isPending} onClick={() => setAsking(false)}>
          Not yet
        </Button>
      </div>
    </div>
  );
}

/** Says no to a task proposed to me (the steward's notes), with a note for whoever asked if I like. */
function DeclineTask({ roomId, taskId, title, asker, onBack }: { roomId: string; taskId: string; title: string; asker: string | null; onBack: () => void }) {
  const decline = useDeclineTask(roomId);
  const [note, setNote] = useState("");
  if (decline.isSuccess) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted" role="status">
        <CircleSlash size={13} aria-hidden /> Declined{asker ? `: ${asker} hears it privately` : ""}.
      </span>
    );
  }
  const send = () => decline.mutate({ taskId, note }, { onSuccess: () => toast(asker ? `Declined “${title}”. ${asker} hears it privately.` : `Declined “${title}”.`, "ok") });
  return (
    <div className="w-full space-y-2 rounded-xl border border-line bg-bg/60 p-2.5" role="group" aria-label={`Decline “${title}”`}>
      <Textarea aria-label="A note (optional)" placeholder={asker ? `A note for ${asker} (optional, only they see it)` : "A note for whoever asked (optional, only they see it)"} value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={1000} />
      {decline.error ? <p className="text-xs text-danger">{decline.error.message}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" tone="danger" busy={decline.isPending} onClick={send}>
          <CircleSlash size={13} /> Decline
        </Button>
        <Button size="sm" tone="quiet" disabled={decline.isPending} onClick={onBack}>
          Back
        </Button>
      </div>
    </div>
  );
}

/** A task proposed to me with no request behind it (the steward's notes): start it, or say no to it. */
export function ProposedTask({ roomId, taskId, title, asker }: { roomId: string; taskId: string; title: string; asker: string | null }) {
  const [declining, setDeclining] = useState(false);
  if (declining) return <DeclineTask roomId={roomId} taskId={taskId} title={title} asker={asker} onBack={() => setDeclining(false)} />;
  return (
    <StartTask
      roomId={roomId}
      taskId={taskId}
      title={title}
      alongside={
        <Button size="sm" tone="quiet" onClick={() => setDeclining(true)} aria-label={`Decline “${title}”`}>
          <CircleSlash size={13} /> Decline
        </Button>
      }
    />
  );
}

const SUBJECT_ICON = { task: CheckSquare, page: FileText, message: MessageSquare } as const;

/** Where a subject of the room's space opens: in Ensemble, in that space; a room message, here. */
function SubjectChip({ subject, ctx }: { subject: EventSubject; ctx: MessageContext }) {
  const Icon = SUBJECT_ICON[subject.kind];
  const style = "inline-flex max-w-full items-center gap-1 rounded-lg border border-line bg-bg px-2 py-0.5 text-xs hover:border-accent";
  if (subject.kind === "message") {
    return (
      <button type="button" className={style} onClick={() => ctx.onJump(subject.id)}>
        <Icon size={12} className="shrink-0 text-muted" aria-hidden /> <span className="truncate">The message in the room</span>
      </button>
    );
  }
  const href = ENSEMBLE_LINKS.inSpace(`/${subject.kind === "task" ? "tasks" : "pages"}/${encodeURIComponent(subject.id)}`, subject.spaceId);
  return (
    <External href={href} className={style} title="Open in Ensemble">
      <Icon size={12} className="shrink-0 text-muted" aria-hidden /> <span className="truncate">{subject.title}</span>
      <ExternalLink size={10} className="shrink-0 text-muted" aria-hidden />
    </External>
  );
}

/**
 * Under my lead's note of what changed for me in the room's space (`data.type: "room_events"`): what it
 * is about, each contract's changed lines and the tasks they touch, and Start for tasks now mine.
 */
export function RoomEventsExtras({ message, ctx }: { message: Message; ctx: MessageContext }) {
  const subjects = eventSubjects(message.data.items);
  const contracts = contractChanges(message.data.items);
  const tasks = startable(message.data);
  const helper = typeof message.data.suggest?.handle === "string" ? `@${message.data.suggest.handle}` : null;
  if (!subjects.length && !contracts.length && !tasks.length) return null;
  return (
    <div className="mt-2 space-y-2" data-room-events>
      {contracts.map((change) => (
        <div key={change.title} className="rounded-xl border border-line bg-bg/70 p-2.5 text-xs" aria-label={`What changed in ${change.title}`} role="group">
          <p className="mb-1 font-medium text-ink/80">What changed in “{change.title}”</p>
          <ul className="space-y-0.5 font-mono">
            {change.added.map((line) => (
              <li key={`+${line}`} className="break-words text-ok">
                + {line}
              </li>
            ))}
            {change.removed.map((line) => (
              <li key={`-${line}`} className="break-words text-danger">
                − {line}
              </li>
            ))}
          </ul>
          {change.tasks.length ? <p className="mt-1.5 text-muted">It touches your {change.tasks.map((task) => `“${task.title}”`).join(", ")}. Nothing changes until you say so.</p> : null}
        </div>
      ))}
      {subjects.length ? (
        <div className="flex flex-wrap gap-1.5" aria-label="What it is about">
          {subjects.map((subject) => (
            <SubjectChip key={`${subject.kind}:${subject.id}`} subject={subject} ctx={ctx} />
          ))}
        </div>
      ) : null}
      {tasks.length ? (
        <div className="space-y-1.5">
          {helper ? <p className="text-xs text-muted">Your lead would start it with {helper}; you can also just tell it what to do.</p> : null}
          <div className="flex flex-wrap gap-2">
            {tasks.map((task) => (
              <div key={task.taskId} className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
                {tasks.length > 1 ? <span className="min-w-0 truncate text-xs text-muted">“{task.title}”</span> : null}
                {task.proposed ? <ProposedTask roomId={ctx.roomId} taskId={task.taskId} title={task.title} asker={task.asker} /> : <StartTask roomId={ctx.roomId} taskId={task.taskId} title={task.title} />}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** My offer to join the room's space as an editor (private): Join, or Not now, which can still become Join. */
export function SpaceOfferCard({ message, ctx }: { message: Message; ctx: MessageContext }) {
  const data = message.data as { status?: string; spaceName?: string; ownerName?: string };
  const { join } = useSpaceActions(ctx.roomId);
  const state = offerState(data.status);
  const answer = (yes: boolean) =>
    join.mutate(
      { join: yes, cardId: message.id },
      { onSuccess: () => toast(yes ? `You joined “${data.spaceName ?? "the room's space"}” as an editor.` : "Not now. You can join later from the Board.", "ok"), onError: toastError },
    );
  return (
    <div className="mt-1 rounded-2xl border border-line bg-panel p-3" role="group" aria-label="The room's space">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium">
          <Folder size={15} className="shrink-0 text-accent" aria-hidden /> Join “{data.spaceName ?? "the room's space"}”?
        </span>
        <span className="flex items-center gap-1.5">
          <Pill tone="private">only you</Pill>
          <Pill tone={state.tone}>{state.label}</Pill>
        </span>
      </div>
      <p className="text-sm text-muted">
        {data.ownerName ?? "Its owner"}&apos;s space holds this room&apos;s work. As an editor you see and work on its board, pages and runs. Joining the room did not add you to it.
      </p>
      {data.status === "pending" || data.status === "declined" ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button size="sm" busy={join.isPending && join.variables?.join === true} disabled={join.isPending} onClick={() => answer(true)}>
            <Check size={13} /> Join as editor
          </Button>
          {data.status === "pending" ? (
            <Button size="sm" tone="ghost" busy={join.isPending && join.variables?.join === false} disabled={join.isPending} onClick={() => answer(false)}>
              <CircleSlash size={13} /> Not now
            </Button>
          ) : null}
        </div>
      ) : data.status === "joined" ? (
        <button type="button" onClick={() => ctx.onView?.("board")} className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline">
          See the room&apos;s board <ArrowRight size={12} aria-hidden />
        </button>
      ) : null}
      {join.error ? <p className="mt-2 text-sm text-danger">{join.error.message}</p> : null}
    </div>
  );
}

function DigestList({ section, ctx }: { section: DigestSection; ctx: MessageContext }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{section.title}</p>
      <ul className="mt-0.5 space-y-0.5">
        {section.rows.map((row, at) => {
          const jump = row.messageId ?? (row.requestId ? (ctx.requestOf?.(row.requestId)?.ownerCardId ?? ctx.requestOf?.(row.requestId)?.cardId ?? null) : null);
          return (
            <li key={at} className="text-sm">
              {jump ? (
                <button type="button" onClick={() => ctx.onJump(jump)} className="text-left hover:text-accent hover:underline">
                  {row.text}
                </button>
              ) : row.taskId ? (
                <button type="button" onClick={() => ctx.onView?.("board")} className="text-left hover:text-accent hover:underline">
                  {row.text}
                </button>
              ) : (
                row.text
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** My lead's catch-up when I come back (`data.type: "digest"`): its few lines, and everything it gathered on request. */
export function DigestCard({ message, ctx }: { message: Message; ctx: MessageContext }) {
  const [open, setOpen] = useState(false);
  const sections = digestSections(message.data.items);
  const since = typeof message.data.since === "string" ? message.data.since : null;
  return (
    <div className="rounded-2xl border border-private/30 bg-private/5 px-3 py-2.5" data-digest>
      <p className="mb-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
        <Inbox size={13} className="text-private" aria-hidden />
        <span className="font-medium text-ink/80">{digestTitle(message.data.reason)}</span>
        {since ? <span>since {ago(since)} ago</span> : null}
      </p>
      <RichText text={message.body} handles={ctx.handles} />
      {sections.length ? (
        <>
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-1.5 text-xs text-accent hover:underline">
            {open ? "Hide the details" : "Everything it gathered"}
          </button>
          {open ? (
            <div className="mt-2 space-y-2 border-t border-private/20 pt-2">
              {sections.map((section) => (
                <DigestList key={section.id} section={section} ctx={ctx} />
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

type ResultData = { outcome?: string; verdict?: string | null; taskId?: string | null; spaceId?: string | null; files?: number; requestId?: string | null; refs?: Array<{ kind?: string; id?: string; spaceId?: string; title?: string }> };

/** A result's facts beside its words: how it ended, its media (read through the message), the task it went onto, its files there. */
export function ResultFacts({ data, messageId }: { data: ResultData & { media?: unknown }; messageId: string | null }) {
  const media = mediaItems(data.media);
  const task = (data.refs ?? []).find((ref) => ref.kind === "task" && typeof ref.id === "string");
  const taskId = task?.id ?? data.taskId ?? null;
  const spaceId = task?.spaceId ?? data.spaceId ?? null;
  return (
    <div className="mt-2 space-y-2">
      <EvidenceGallery items={media} messageId={messageId} label="Media" />
      {taskId ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <External href={ENSEMBLE_LINKS.inSpace(`/tasks/${encodeURIComponent(taskId)}`, spaceId)} className="inline-flex max-w-full items-center gap-1 rounded-lg border border-line bg-bg px-2 py-0.5 hover:border-accent">
            <CheckSquare size={12} className="shrink-0 text-muted" aria-hidden /> <span className="truncate">{task?.title ?? "The task"}</span>
            <ExternalLink size={10} className="shrink-0 text-muted" aria-hidden />
          </External>
          {data.files ? <span className="text-muted">{data.files === 1 ? "1 file is" : `${data.files} files are`} on the task</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/** A result delivered into the room (`data.type: "room_result"`), posted by its owner from their lead's draft. */
export function ResultCard({ message, ctx }: { message: Message; ctx: MessageContext }) {
  const data = message.data as ResultData & { media?: unknown };
  const state = resultState(data.outcome, data.verdict);
  const request = typeof data.requestId === "string" ? ctx.requestOf?.(data.requestId) : undefined;
  return (
    <div className="rounded-2xl border border-line bg-panel p-3" role="group" aria-label="Result">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
        <BookCheck size={14} className="text-accent" aria-hidden />
        <span className="font-medium text-ink/80">Result</span>
        <Pill tone={state.tone}>{state.label}</Pill>
        {request ? <span>for {request.from.accountId === ctx.meId ? "your" : `${request.from.name}'s`} request</span> : null}
      </div>
      <RichText text={message.body} handles={ctx.handles} />
      <ResultFacts data={data} messageId={message.id} />
    </div>
  );
}

/** "Mira logged a decision: …", with the way to the room's decisions. */
export function DecisionLine({ message, ctx, highlighted }: { message: Message; ctx: MessageContext; highlighted?: boolean }) {
  return (
    <div id={`m-${message.id}`} className={`flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 py-2 text-center text-xs text-muted ${highlighted ? "rounded-lg bg-accent/10" : ""}`}>
      <span className="inline-flex items-center gap-1">
        <BookCheck size={12} className="text-ok" aria-hidden /> {message.body}
      </span>
      {typeof message.data.messageId === "string" ? (
        <button type="button" onClick={() => ctx.onJump(message.data.messageId)} className="text-accent hover:underline">
          The message
        </button>
      ) : null}
      {ctx.onView ? (
        <button type="button" onClick={() => ctx.onView?.("board")} className="text-accent hover:underline">
          All decisions
        </button>
      ) : null}
    </div>
  );
}

/** A page's role changed (`data.pageRole`): the line, what it was and is now when it lost one, and the page. */
export function PageRoleLine({ message, highlighted }: { message: Message; highlighted?: boolean }) {
  const role = message.data.pageRole as { pageId?: unknown; spaceId?: unknown } | undefined;
  const change = pageRoleChange(message.data.pageRole);
  const pageId = typeof role?.pageId === "string" ? role.pageId : null;
  return (
    <div id={`m-${message.id}`} className={`flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 py-2 text-center text-xs text-muted ${highlighted ? "rounded-lg bg-accent/10" : ""}`}>
      <span className="inline-flex items-center gap-1">
        <FileText size={12} aria-hidden /> {message.body}
      </span>
      {change ? <Pill>{change}</Pill> : null}
      {pageId ? (
        <External href={ENSEMBLE_LINKS.inSpace(`/pages/${encodeURIComponent(pageId)}`, typeof role?.spaceId === "string" ? role.spaceId : null)} className="text-accent hover:underline">
          The page
        </External>
      ) : null}
    </div>
  );
}

/**
 * Someone declined what I asked (`{requestId, declineNote}`, or a proposed task's `{taskId, declined}`): a
 * line for me alone, with the way to the request's card or the board.
 */
export function DeclinedLine({ message, ctx, highlighted }: { message: Message; ctx: MessageContext; highlighted?: boolean }) {
  const requestId = typeof message.data.requestId === "string" ? message.data.requestId : null;
  const card = requestId ? ctx.requestOf?.(requestId)?.cardId : null;
  return (
    <div id={`m-${message.id}`} data-declined className={`flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 py-2 text-center text-xs text-muted ${highlighted ? "rounded-lg bg-accent/10" : ""}`}>
      <span className="inline-flex min-w-0 items-center gap-1">
        <Lock size={11} className="shrink-0 text-private" aria-label="Only you" role="img" /> <span className="break-words">{message.body}</span>
      </span>
      {card ? (
        <button type="button" onClick={() => ctx.onJump(card)} className="text-accent hover:underline">
          The request
        </button>
      ) : typeof message.data.taskId === "string" && ctx.onView ? (
        <button type="button" onClick={() => ctx.onView?.("board")} className="text-accent hover:underline">
          The board
        </button>
      ) : null}
    </div>
  );
}
