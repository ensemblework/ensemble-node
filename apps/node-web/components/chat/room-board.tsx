"use client";

/**
 * A room's Board (Ensemble docs/35 §12.11–12.14): the space that holds the room's work and my place in
 * it, its tasks (proposed ones first, with who asked; mine to decide or start), the pages the room
 * follows (a contract, the decisions log, watched pages) and the decisions logged from the room. Only
 * people in the space see its board; everyone sees which space it is.
 */
import { Bell, BellOff, BookCheck, CheckSquare, ChevronRight, ExternalLink, FileText, Folder, Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ENSEMBLE_LINKS } from "@/lib/config";
import { usePageActions, useRoomBoard, useRoomDecisions, useRoomPages, useRoomSpace, useShareCandidates, useSpaceActions } from "@/lib/hooks";
import { boardGroups, canStartTask, decisionMeta, dueWords, offerOpen, PAGE_ROLES, pageRole, priorityWord, spaceLine, taskPeople, taskStatus, waitsForMe } from "@/lib/room-work";
import { toast, toastError } from "@/lib/toast";
import type { BoardTask, PageRole, PeerRequest, Room, RoomPage } from "@/lib/types";
import { Button, External, Input, Pill, Segmented, Spinner } from "../ui";
import { StartTask } from "./room-work";

type Props = {
  room: Room;
  meId: string;
  /** A request on the room's list, for the card I decide a proposed task on. */
  requestOf: (requestId: string) => PeerRequest | undefined;
  handleOf: (nodeId: string) => string | null;
  onJump: (messageId: string) => void;
  /** Opens the room's settings, where its creator links a space. */
  onSettings: () => void;
};

function Heading({ title, count, hint }: { title: string; count?: number; hint?: string }) {
  return (
    <div>
      <h2 className="text-sm font-semibold">
        {title}
        {typeof count === "number" ? <span className="ml-1.5 font-normal text-muted">{count}</span> : null}
      </h2>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/** The space, my role there, and my offer to join it. */
function SpaceHeader({ room, meId, onSettings }: Pick<Props, "room" | "meId" | "onSettings">) {
  const space = useRoomSpace(room.id, true);
  const { join } = useSpaceActions(room.id);
  const creator = room.createdBy === meId;
  if (space.isLoading) return <Spinner className="h-4 w-4 text-muted" />;
  if (space.error) return <p className="text-sm text-danger">{space.error.message}</p>;
  const view = space.data;
  if (!view?.space) {
    return (
      <section aria-label="The room's space" className="rounded-2xl border border-dashed border-line px-4 py-5 text-center">
        <Folder size={22} className="mx-auto text-muted" aria-hidden />
        <p className="mt-2 text-sm font-medium">No shared space yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">
          {creator
            ? "Link one of your spaces, or make one for this room: its board holds the room's work, and everyone here is offered to join it."
            : "Whoever made this room can link a space to hold its work. Until then each person's work stays in their own space."}
        </p>
        {creator ? (
          <Button size="sm" className="mt-3" onClick={onSettings}>
            <Plus size={13} /> Link a space
          </Button>
        ) : null}
      </section>
    );
  }
  const { space: linked, offer } = view;
  const answer = (yes: boolean) => join.mutate({ join: yes, cardId: offer?.messageId ?? null }, { onSuccess: () => toast(yes ? `You joined “${linked.name ?? "the space"}” as an editor.` : "Not now.", "ok"), onError: toastError });
  return (
    <section aria-label="The room's space" className="rounded-2xl border border-line bg-panel px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-1.5 font-semibold">
            <Folder size={16} className="shrink-0 text-accent" aria-hidden /> <span className="truncate">{linked.name ?? "The room's space"}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted">{spaceLine(view, meId)}</p>
        </div>
        {linked.role ? (
          <External href={ENSEMBLE_LINKS.inSpace("/board", linked.id)} icon className="shrink-0 text-xs text-accent hover:underline">
            Open in Ensemble
          </External>
        ) : null}
      </div>
      {!linked.role ? (
        offer && offerOpen(offer.status) ? (
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" busy={join.isPending && join.variables?.join === true} disabled={join.isPending} onClick={() => answer(true)}>
              Join as editor
            </Button>
            {offer.status === "pending" ? (
              <Button size="sm" tone="ghost" disabled={join.isPending} onClick={() => answer(false)}>
                Not now
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted">Only people in the space see its board. {linked.ownerName ?? "Its owner"} can add you.</p>
        )
      ) : null}
      {join.error ? <p className="mt-2 text-sm text-danger">{join.error.message}</p> : null}
    </section>
  );
}

function TaskRow({ task, room, meId, requestOf, handleOf, onJump, spaceId }: Omit<Props, "onSettings"> & { task: BoardTask; spaceId: string }) {
  const proposed = task.status === "proposed";
  const status = taskStatus(task.status);
  const priority = priorityWord(task.priority);
  const due = task.status === "done" ? null : dueWords(task.due);
  const mine = waitsForMe(task, meId);
  const card = mine && task.peerRequestId ? requestOf(task.peerRequestId)?.ownerCardId : null;
  return (
    <li className={`rounded-xl border px-3 py-2.5 ${proposed ? "border-dashed border-warn/50 bg-warn/5" : "border-line bg-panel"}`} data-task={task.id}>
      <div className="flex items-start gap-2">
        <CheckSquare size={15} className={`mt-0.5 shrink-0 ${task.status === "done" ? "text-ok" : proposed ? "text-warn" : "text-muted"}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <External href={ENSEMBLE_LINKS.inSpace(`/tasks/${encodeURIComponent(task.id)}`, spaceId)} className={`break-words text-sm font-medium hover:underline ${task.status === "done" ? "text-muted line-through decoration-muted/50" : ""}`}>
            {task.title}
          </External>
          <p className="mt-0.5 text-xs text-muted">{taskPeople(task, meId, handleOf).join(" · ")}</p>
          {priority || due || proposed || task.status === "blocked" || task.status === "waiting_approval" ? (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {proposed || task.status === "blocked" || task.status === "waiting_approval" ? <Pill tone={status.tone}>{status.label}</Pill> : null}
              {priority ? <Pill tone={priority.tone}>{priority.label}</Pill> : null}
              {due ? <span className={`text-[11px] ${due.late ? "text-danger" : "text-muted"}`}>{due.text}</span> : null}
            </div>
          ) : null}
        </div>
      </div>
      {mine ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
          {card ? (
            <Button size="sm" onClick={() => onJump(card)}>
              Decide in My crew
            </Button>
          ) : (
            <span className="text-xs text-muted">Your card for it is in My crew.</span>
          )}
        </div>
      ) : canStartTask(task, meId) ? (
        <div className="mt-2 flex flex-wrap pl-6">
          <StartTask roomId={room.id} taskId={task.id} title={task.title} />
        </div>
      ) : null}
    </li>
  );
}

function Tasks(props: Omit<Props, "onSettings"> & { spaceId: string }) {
  const board = useRoomBoard(props.room.id, true);
  const [done, setDone] = useState(false);
  const groups = useMemo(() => boardGroups(board.data?.tasks ?? []), [board.data]);
  if (board.isLoading) return <Spinner className="h-4 w-4 text-muted" />;
  if (board.error) return <p className="text-sm text-danger">{board.error.message}</p>;
  const total = board.data?.tasks.length ?? 0;
  return (
    <section aria-label="Board" className="space-y-3">
      <Heading title="Board" count={total} hint="Proposed tasks wait for the person they are for. Each person starts their own." />
      {!total ? <p className="text-sm text-muted">No tasks yet. A work request between people in the space becomes a proposed task here.</p> : null}
      {groups.map((group) => {
        const folded = group.id === "done" && !done;
        return (
          <div key={group.id} className="space-y-1.5" role="group" aria-label={group.title}>
            {group.id === "done" ? (
              <button type="button" onClick={() => setDone(!done)} aria-expanded={!folded} className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-ink">
                <ChevronRight size={12} className={`transition-transform ${folded ? "" : "rotate-90"}`} aria-hidden /> {group.title} ({group.tasks.length})
              </button>
            ) : (
              <p className={`text-[11px] font-semibold uppercase tracking-wide ${group.id === "proposed" ? "text-warn" : "text-muted"}`}>
                {group.title} ({group.tasks.length})
              </p>
            )}
            {folded ? null : (
              <ul className="space-y-1.5">
                {group.tasks.map((task) => (
                  <TaskRow key={task.id} task={task} {...props} />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}

const ROLE_TONE: Record<PageRole, "accent" | "ok" | "muted"> = { contract: "accent", decisions: "ok", watched: "muted" };

function PageRow({ page, roomId, spaceId, editor }: { page: RoomPage; roomId: string; spaceId: string; editor: boolean }) {
  const actions = usePageActions(roomId);
  const busy = actions.role.isPending || actions.watch.isPending;
  const href = ENSEMBLE_LINKS.inSpace(page.taskId ? `/tasks/${encodeURIComponent(page.taskId)}` : `/pages/${encodeURIComponent(page.pageId)}`, spaceId);
  return (
    <li className="rounded-xl border border-line bg-panel px-3 py-2" data-page={page.pageId}>
      <div className="flex items-start gap-2">
        <FileText size={15} className="mt-0.5 shrink-0 text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <External href={href} className="break-words text-sm font-medium hover:underline">
            {page.title}
          </External>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            {editor ? (
              // What the page is to the room: only people who can edit the space change it.
              <select
                aria-label={`What “${page.title}” is to the room`}
                value={page.role}
                disabled={busy}
                onChange={(event) => {
                  const role = event.target.value as PageRole;
                  actions.role.mutate({ pageId: page.pageId, role }, { onSuccess: () => toast(role === "watched" ? "Only watched now." : `It is the room's ${pageRole(role).toLowerCase()} now.`, "ok"), onError: toastError });
                }}
                className="rounded-full border border-line bg-bg px-2 py-0.5 text-[11px] font-medium text-ink"
              >
                {PAGE_ROLES.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
              </select>
            ) : page.role !== "watched" ? (
              <Pill tone={ROLE_TONE[page.role]}>{pageRole(page.role)}</Pill>
            ) : null}
            <span>
              {page.watchers} watching{page.watching ? ", you too" : ""}
            </span>
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          aria-pressed={page.watching}
          aria-label={page.watching ? `Stop watching ${page.title}` : `Watch ${page.title}`}
          title={page.watching ? "Stop watching: its edits stop reaching you" : "Watch: its edits reach you through your lead"}
          onClick={() => actions.watch.mutate({ pageId: page.pageId, watching: !page.watching }, { onError: toastError })}
          className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2 text-xs transition disabled:opacity-50 ${page.watching ? "border-accent/50 text-accent" : "border-line text-muted hover:text-ink"}`}
        >
          {page.watching ? <Bell size={13} aria-hidden /> : <BellOff size={13} aria-hidden />}
          <span className="hidden sm:inline">{page.watching ? "Watching" : "Watch"}</span>
        </button>
      </div>
    </li>
  );
}

/** A page of the room's space to follow: found by title, then watched, or made a contract or the decisions log. */
function AddPage({ roomId, spaceId, editor, followed, onDone }: { roomId: string; spaceId: string; editor: boolean; followed: Set<string>; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<{ id: string; title: string } | null>(null);
  const [role, setRole] = useState<PageRole>("watched");
  const found = useShareCandidates(roomId, q.trim(), true);
  const actions = usePageActions(roomId);
  const pages = (found.data?.items ?? []).filter((item) => item.kind === "page" && item.spaceId === spaceId && !followed.has(item.id)).slice(0, 8);
  const add = () => {
    if (!picked) return;
    const done = { onSuccess: () => (toast(role === "watched" ? `You watch “${picked.title}”.` : `“${picked.title}” is the room's ${pageRole(role).toLowerCase()} now.`, "ok"), onDone()), onError: toastError };
    if (role === "watched") actions.watch.mutate({ pageId: picked.id, watching: true }, done);
    else actions.role.mutate({ pageId: picked.id, role }, done);
  };
  return (
    <div className="space-y-2 rounded-xl border border-line bg-bg/60 p-2.5">
      <div className="flex items-center gap-2">
        <Search size={14} className="shrink-0 text-muted" aria-hidden />
        <Input autoFocus aria-label="Find a page of the room's space" placeholder="Find a page of the room's space" value={q} onChange={(event) => (setQ(event.target.value), setPicked(null))} className="py-1.5" />
        <button type="button" aria-label="Close" onClick={onDone} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-ink">
          <X size={14} />
        </button>
      </div>
      {found.isLoading ? (
        <Spinner className="h-3.5 w-3.5 text-muted" />
      ) : pages.length ? (
        <ul className="max-h-56 space-y-0.5 overflow-y-auto scroll-thin" aria-label="Pages">
          {pages.map((page) => (
            <li key={page.id}>
              <button type="button" aria-pressed={picked?.id === page.id} onClick={() => setPicked({ id: page.id, title: page.title })} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${picked?.id === page.id ? "bg-accent/10 text-ink" : "hover:bg-raised"}`}>
                <FileText size={14} className="shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{page.title}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-1 text-xs text-muted">{q.trim() ? "No page of the room's space matches." : "No page to add."}</p>
      )}
      {picked ? (
        <div className="space-y-2 border-t border-line pt-2">
          {editor ? <Segmented label="What it is to the room" size="sm" value={role} onChange={setRole} options={PAGE_ROLES.map((row) => ({ id: row.id, label: row.label, title: row.hint }))} /> : null}
          <p className="text-xs text-muted">{PAGE_ROLES.find((row) => row.id === role)?.hint}</p>
          <Button size="sm" busy={actions.role.isPending || actions.watch.isPending} onClick={add}>
            <Plus size={13} /> {role === "watched" ? "Watch it" : `Make it the ${pageRole(role).toLowerCase()}`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Pages({ roomId, spaceId, editor }: { roomId: string; spaceId: string; editor: boolean }) {
  const pages = useRoomPages(roomId, true);
  const [adding, setAdding] = useState(false);
  const followed = useMemo(() => new Set((pages.data ?? []).map((page) => page.pageId)), [pages.data]);
  return (
    <section aria-label="Pages the room follows" className="space-y-2">
      <Heading title="Pages the room follows" hint="A contract tells the people whose tasks use it when it changes; the decisions log keeps what the room decided; a watched page's edits reach whoever watches it." />
      {pages.isLoading ? (
        <Spinner className="h-4 w-4 text-muted" />
      ) : pages.error ? (
        <p className="text-sm text-danger">{pages.error.message}</p>
      ) : pages.data?.length ? (
        <ul className="space-y-1.5">
          {pages.data.map((page) => (
            <PageRow key={page.pageId} page={page} roomId={roomId} spaceId={spaceId} editor={editor} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">None yet.</p>
      )}
      {adding ? (
        <AddPage roomId={roomId} spaceId={spaceId} editor={editor} followed={followed} onDone={() => setAdding(false)} />
      ) : (
        <Button size="sm" tone="ghost" onClick={() => setAdding(true)}>
          <Plus size={13} /> Follow a page
        </Button>
      )}
    </section>
  );
}

function Decisions({ roomId, meId, spaceId, onJump }: { roomId: string; meId: string; spaceId: string; onJump: (messageId: string) => void }) {
  const decisions = useRoomDecisions(roomId, true);
  const log = decisions.data?.[0]?.pageId ?? null;
  return (
    <section aria-label="Decisions" className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Heading title="Decisions" count={decisions.data?.length} hint="A room message enters the log when someone who can edit the space confirms it: ✅ on it, or a reply “log this”." />
        {log ? (
          <External href={ENSEMBLE_LINKS.inSpace(`/pages/${encodeURIComponent(log)}`, spaceId)} icon className="text-xs text-accent hover:underline">
            The log in Ensemble
          </External>
        ) : null}
      </div>
      {decisions.isLoading ? (
        <Spinner className="h-4 w-4 text-muted" />
      ) : decisions.error ? (
        <p className="text-sm text-danger">{decisions.error.message}</p>
      ) : decisions.data?.length ? (
        <ol className="space-y-1.5">
          {decisions.data.map((decision) => (
            <li key={decision.id} className={`rounded-xl border border-line bg-panel px-3 py-2 ${decision.replaced ? "opacity-70" : ""}`} data-decision={decision.id}>
              <p className="flex items-start gap-2 text-sm">
                <BookCheck size={15} className={`mt-0.5 shrink-0 ${decision.replaced ? "text-muted" : "text-ok"}`} aria-hidden />
                <span className={`min-w-0 break-words ${decision.replaced ? "line-through decoration-muted/60" : ""}`}>{decision.text}</span>
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 pl-6 text-xs text-muted">
                <span>{decisionMeta(decision, meId)}</span>
                <span>{new Date(decision.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                <button type="button" onClick={() => onJump(decision.messageId)} className="text-accent hover:underline">
                  In the room
                </button>
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted">No decisions yet.</p>
      )}
    </section>
  );
}

export function RoomBoardView(props: Props) {
  const space = useRoomSpace(props.room.id, true);
  const linked = space.data?.space;
  const member = Boolean(linked?.role);
  const editor = linked?.role === "owner" || linked?.role === "editor";
  return (
    <div className="mx-auto w-full max-w-[840px] space-y-6 px-4 pb-10 pt-5 md:px-8">
      <SpaceHeader room={props.room} meId={props.meId} onSettings={props.onSettings} />
      {linked && member ? (
        <>
          <Tasks {...props} spaceId={linked.id} />
          <Pages roomId={props.room.id} spaceId={linked.id} editor={editor} />
          <Decisions roomId={props.room.id} meId={props.meId} spaceId={linked.id} onJump={props.onJump} />
        </>
      ) : null}
      {linked && member ? (
        <p className="text-center text-xs text-muted">
          <ExternalLink size={11} className="mr-1 inline" aria-hidden />
          Tasks, pages and files open in Ensemble, in “{linked.name ?? "the space"}”.
        </p>
      ) : null}
    </div>
  );
}
