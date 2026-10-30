/**
 * The work of a room with other people in words (Ensemble docs/35 §12.11–12.14): the space that holds
 * it and the offer to join it, its board (proposed tasks first, then by status), who a task is with,
 * who asked for it and which node made it for whom, the one question when work starts, the pages the
 * room follows, results, the lead's private notes of what changed, catch-up digests and the decisions
 * log. Nothing here decides anything: the server does; these say what it did.
 */
import type { Badge, Tone } from "./plan";
import type { BoardNode, BoardRequester, BoardTask, PageRole, RoomDecision, RoomSpaceView, SpaceRole, WorkMode } from "./types";

const ROLE: Record<SpaceRole, string> = { owner: "owner", editor: "editor", viewer: "viewer" };

/** "Its work lives in Mira's space “Launch”. You are an editor there." */
export function spaceLine(view: RoomSpaceView | null | undefined, meId: string): string | null {
  const space = view?.space;
  if (!space) return null;
  const name = space.name ? `“${space.name}”` : "a space";
  const owner = space.ownerId === meId ? "your space" : space.ownerName ? `${space.ownerName}'s space` : "the space";
  const role = space.role ? (space.role === "owner" ? " It is yours." : ` You are ${space.role === "editor" ? "an" : "a"} ${ROLE[space.role]} there.`) : " You are not in it.";
  return `Its work lives in ${owner} ${name}.${role}`;
}

/** An offer to join the room's space: waiting, joined, not now (which can still become Join), or ended. */
export function offerState(status: string | null | undefined): Badge {
  if (status === "joined") return { label: "Joined", tone: "ok" };
  if (status === "declined") return { label: "Not now", tone: "muted" };
  if (status === "expired") return { label: "Ended", tone: "muted" };
  return { label: "Waiting for you", tone: "warn" };
}

/** Whether I can still say yes to the offer: it waits, or I said not now. */
export const offerOpen = (status: string | null | undefined): boolean => status === "pending" || status === "declined";

const STATUS: Record<string, Badge> = {
  proposed: { label: "Proposed", tone: "warn" },
  todo: { label: "To do", tone: "muted" },
  in_progress: { label: "In progress", tone: "accent" },
  waiting_approval: { label: "Waiting for approval", tone: "warn" },
  blocked: { label: "Blocked", tone: "danger" },
  done: { label: "Done", tone: "ok" },
  dropped: { label: "Dropped", tone: "muted" },
};

export const taskStatus = (status: string): Badge => STATUS[status] ?? { label: status.replace(/_/g, " "), tone: "muted" };

/** Only what stands out: Critical, High, Low. Medium is the usual and says nothing. */
export function priorityWord(priority: string | null | undefined): { label: string; tone: Tone } | null {
  if (priority === "critical") return { label: "Critical", tone: "danger" };
  if (priority === "p0") return { label: "High", tone: "warn" };
  if (priority === "p2") return { label: "Low", tone: "muted" };
  return null;
}

export type BoardGroup = { id: string; title: string; tasks: BoardTask[] };

const GROUPS: ReadonlyArray<{ id: string; title: string; statuses: readonly string[] }> = [
  { id: "proposed", title: "Proposed", statuses: ["proposed"] },
  { id: "in_progress", title: "In progress", statuses: ["in_progress"] },
  { id: "waiting", title: "Waiting", statuses: ["waiting_approval", "blocked"] },
  { id: "todo", title: "To do", statuses: ["todo"] },
  { id: "done", title: "Done", statuses: ["done"] },
];

/** The board as the room shows it: proposed tasks first (they wait for someone's yes), then by status; empty groups go. */
export function boardGroups(tasks: readonly BoardTask[]): BoardGroup[] {
  const known = new Set(GROUPS.flatMap((group) => group.statuses));
  const groups = GROUPS.map((group) => ({ id: group.id, title: group.title, tasks: tasks.filter((task) => group.statuses.includes(task.status)) }));
  const other = tasks.filter((task) => !known.has(task.status) && task.status !== "dropped");
  if (other.length) groups.splice(groups.length - 1, 0, { id: "other", title: "Other", tasks: other });
  return groups.filter((group) => group.tasks.length);
}

/** A node as the board names it: its handle in the room, else its name (it left). */
const nodeWords = (node: BoardNode) => (node.handle ? `@${node.handle}` : (node.name ?? "a node"));

/** "Ben through @steward": who asked for a task, and the node that relayed it. An older digest named only the person. */
export function askedBy(requester: BoardRequester | string | null | undefined, meId?: string): string | null {
  if (!requester) return null;
  if (typeof requester === "string") return requester.trim() || null;
  const who = requester.accountId === meId ? "you" : requester.name;
  return requester.node ? `${who} through ${nodeWords(requester.node)}` : who;
}

/** Who a task is with and where it came from: "with you · asked by Ben through @scout", "with Ana · @steward for Ben". */
export function taskPeople(task: Pick<BoardTask, "assignee" | "requestedBy" | "madeBy">, meId: string): string[] {
  const who = (person: { accountId: string; name: string } | null | undefined) => (person ? (person.accountId === meId ? "you" : person.name) : null);
  const parts: string[] = [];
  const holder = who(task.assignee);
  parts.push(holder ? `with ${holder}` : "nobody's yet");
  if (task.requestedBy) parts.push(`asked by ${askedBy(task.requestedBy, meId)}`);
  if (task.madeBy && !task.requestedBy?.node) parts.push(`${nodeWords(task.madeBy.node)} for ${who(task.madeBy.for) ?? "someone"}`);
  return parts;
}

/** A proposed task that waits for my yes on my lead's card (it came from a request). */
export const waitsForMe = (task: Pick<BoardTask, "status" | "assignee" | "peerRequestId">, meId: string): boolean => task.status === "proposed" && task.assignee?.accountId === meId && Boolean(task.peerRequestId);

/** A task of mine I can start from the room: not from a request (that is accepted instead), not going or finished. */
export const canStartTask = (task: Pick<BoardTask, "status" | "assignee" | "peerRequestId">, meId: string): boolean =>
  task.assignee?.accountId === meId && !task.peerRequestId && ["proposed", "todo", "blocked"].includes(task.status);

/** A proposed task of mine with no request behind it (from the steward's notes): I can say no to it here. */
export const canDeclineTask = (task: Pick<BoardTask, "status" | "assignee" | "peerRequestId">, meId: string): boolean =>
  task.status === "proposed" && task.assignee?.accountId === meId && !task.peerRequestId;

/** "Due 3 Nov", "Due today", "Overdue since 1 Nov" (in the reader's time zone unless one is given). */
export function dueWords(due: string | null | undefined, now = Date.now(), timeZone?: string): { text: string; late: boolean } | null {
  if (!due) return null;
  const at = Date.parse(due);
  if (!Number.isFinite(at)) return null;
  const day = (value: number) => new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
  const label = new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short" }).format(at);
  if (day(at) === day(now)) return { text: "Due today", late: false };
  return at < now ? { text: `Overdue since ${label}`, late: true } : { text: `Due ${label}`, late: false };
}

/** The one question when work on a task of the room's board starts. */
export const WORK_MODES: ReadonlyArray<{ id: WorkMode; label: string; hint: string }> = [
  { id: "private", label: "Private work, shared result", hint: "It runs in your own space. The room gets the result and its evidence on the task, never the run or its code." },
  { id: "shared", label: "Shared run", hint: "It runs in the room's space, where its members see the run as it goes." },
];

export const modeWords = (mode: string | null | undefined): string | null => WORK_MODES.find((row) => row.id === mode)?.label ?? null;

export const PAGE_ROLES: ReadonlyArray<{ id: PageRole; label: string; hint: string }> = [
  { id: "watched", label: "Watched", hint: "Its edits reach whoever watches it, through their lead." },
  { id: "contract", label: "Contract", hint: "Where two people's work meets: when it changes, the people whose tasks use it hear what changed." },
  { id: "decisions", label: "Decisions log", hint: "Where the room's confirmed decisions are written. One per room." },
];

export const pageRole = (role: string): string => PAGE_ROLES.find((row) => row.id === role)?.label ?? role;

/** A page's role line, when it lost one: "Contract → Watched". */
export function pageRoleChange(value: unknown): string | null {
  const change = value as { role?: unknown; was?: unknown } | null | undefined;
  if (typeof change?.was !== "string" || typeof change.role !== "string" || change.was === change.role) return null;
  return `${pageRole(change.was)} → ${pageRole(change.role)}`;
}

/** How a delivered result ended: a review's verdict, else the work's outcome. */
export function resultState(outcome: string | null | undefined, verdict?: string | null): Badge {
  if (verdict === "pass") return { label: "Pass", tone: "ok" };
  if (verdict === "fail") return { label: "Fail", tone: "danger" };
  if (outcome === "succeeded") return { label: "Done", tone: "ok" };
  if (outcome === "partially_completed") return { label: "Partly done", tone: "warn" };
  if (outcome === "failed") return { label: "Failed", tone: "danger" };
  if (outcome === "stopped") return { label: "Stopped", tone: "muted" };
  return { label: (outcome ?? "Ended").replace(/_/g, " "), tone: "muted" };
}

type EventItem = { kind?: unknown; subjectKind?: unknown; subjectId?: unknown; title?: unknown; spaceId?: unknown; diff?: unknown; tasks?: unknown; pageKind?: unknown; pageId?: unknown };

export type EventSubject = { kind: "task" | "page" | "message"; id: string; title: string; spaceId: string | null };

/**
 * What the lead's note is about, each once: tasks and pages to open in Ensemble (a comment's, the one it
 * is on), and room messages that mentioned me, to go to.
 */
export function eventSubjects(items: unknown): EventSubject[] {
  const seen = new Set<string>();
  const out: EventSubject[] = [];
  for (const item of Array.isArray(items) ? (items as EventItem[]) : []) {
    if (!item) continue;
    const comment = item.subjectKind === "comment";
    const kind = comment ? (item.pageKind === "task" ? "task" : "page") : item.subjectKind === "task" || item.subjectKind === "page" || item.subjectKind === "message" ? item.subjectKind : null;
    const id = comment ? item.pageId : item.subjectId;
    if (!kind || typeof id !== "string" || seen.has(`${kind}:${id}`)) continue;
    seen.add(`${kind}:${id}`);
    out.push({ kind, id, title: typeof item.title === "string" && item.title.trim() ? item.title.trim() : "Untitled", spaceId: typeof item.spaceId === "string" ? item.spaceId : null });
  }
  return out;
}

/** A contract's changes in the lead's note: the lines added and removed, and which of my tasks they touch. */
export function contractChanges(items: unknown): Array<{ title: string; added: string[]; removed: string[]; tasks: Array<{ taskId: string; title: string }> }> {
  const strings = (value: unknown) => (Array.isArray(value) ? value.filter((line): line is string => typeof line === "string" && Boolean(line.trim())) : []);
  return (Array.isArray(items) ? (items as EventItem[]) : [])
    .filter((item) => item?.kind === "contract_changed")
    .map((item) => {
      const diff = (item.diff ?? {}) as { added?: unknown; removed?: unknown };
      const tasks = (Array.isArray(item.tasks) ? item.tasks : []).filter((task): task is { taskId: string; title: string } => typeof task?.taskId === "string").map((task) => ({ taskId: task.taskId, title: typeof task.title === "string" ? task.title : "A task" }));
      return { title: typeof item.title === "string" ? item.title : "The contract", added: strings(diff.added), removed: strings(diff.removed), tasks };
    });
}

/**
 * The tasks the note offers to start (`start.taskIds`), with their titles from its items. A task that was
 * proposed to me (the steward's notes) can also be declined.
 */
export function startable(data: Record<string, unknown> | null | undefined): Array<{ taskId: string; title: string; proposed: boolean; asker: string | null }> {
  const start = data?.start as { taskIds?: unknown } | null | undefined;
  const ids = Array.isArray(start?.taskIds) ? start.taskIds.filter((id): id is string => typeof id === "string") : [];
  const items = Array.isArray(data?.items) ? (data.items as Array<EventItem & { status?: unknown; actor?: { name?: unknown } | null }>) : [];
  return [...new Set(ids)].map((taskId) => {
    const item = items.find((row) => row?.subjectId === taskId && row.kind === "assigned") ?? items.find((row) => row?.subjectId === taskId);
    const proposed = item?.status === "proposed";
    return { taskId, title: typeof item?.title === "string" ? item.title : "This task", proposed, asker: proposed && typeof item?.actor?.name === "string" ? item.actor.name : null };
  });
}

type DigestItems = {
  asked?: Array<{ requestId?: string; kind?: string; from?: { name?: string }; text?: string; status?: string }>;
  proposed?: Array<{ taskId?: string; title?: string; requestedBy?: BoardRequester | string | null }>;
  events?: unknown[];
  board?: Array<{ taskId?: string; title?: string; status?: string }>;
  results?: Array<{ messageId?: string; text?: string }>;
  decisions?: Array<{ messageId?: string; text?: string }>;
  room?: { messages?: number; from?: string[] };
};

export type DigestRow = { text: string; taskId?: string; requestId?: string; messageId?: string };
export type DigestSection = { id: "asked" | "proposed" | "events" | "board" | "results" | "decisions" | "room"; title: string; rows: DigestRow[] };

const REQUEST_STATUS: Record<string, string> = { open: "open", awaiting_owner: "waiting for you", approved: "accepted", answered: "answered", declined: "declined", done: "done", cancelled: "cancelled" };
const ASKED_FOR: Record<string, string> = { question: "an answer", share: "something shared", review: "a review", work: "work" };

/** Everything a catch-up digest gathered, in sections, what needs me first. */
export function digestSections(items: DigestItems | null | undefined): DigestSection[] {
  const text = (value: unknown, fallback = "") => (typeof value === "string" && value.trim() ? value.trim() : fallback);
  const sections: DigestSection[] = [
    {
      id: "asked",
      title: "Asked of you",
      rows: (items?.asked ?? []).map((row) => ({ text: `${text(row.from?.name, "Someone")} asked for ${ASKED_FOR[text(row.kind)] ?? text(row.kind, "something")}: “${text(row.text)}” (${REQUEST_STATUS[text(row.status)] ?? text(row.status, "open").replace(/_/g, " ")})`, ...(row.requestId ? { requestId: row.requestId } : {}) })),
    },
    {
      id: "proposed",
      title: "Proposed to you",
      rows: (items?.proposed ?? []).map((row) => {
        const asker = askedBy(row.requestedBy);
        return { text: `“${text(row.title, "A task")}”${asker ? `, asked by ${asker}` : ""}`, ...(row.taskId ? { taskId: row.taskId } : {}) };
      }),
    },
    { id: "events", title: "For you", rows: (items?.events ?? []).length ? [{ text: `${(items?.events ?? []).length} ${(items?.events ?? []).length === 1 ? "change" : "changes"} on the room's board and pages` }] : [] },
    { id: "board", title: "On the board", rows: (items?.board ?? []).map((row) => ({ text: `“${text(row.title, "A task")}” is ${taskStatus(text(row.status, "todo")).label.toLowerCase()}`, ...(row.taskId ? { taskId: row.taskId } : {}) })) },
    { id: "results", title: "Results", rows: (items?.results ?? []).map((row) => ({ text: text(row.text, "A result"), ...(row.messageId ? { messageId: row.messageId } : {}) })) },
    { id: "decisions", title: "Decisions", rows: (items?.decisions ?? []).map((row) => ({ text: text(row.text, "A decision"), ...(row.messageId ? { messageId: row.messageId } : {}) })) },
    {
      id: "room",
      title: "In the room",
      rows: items?.room?.messages ? [{ text: `${items.room.messages} ${items.room.messages === 1 ? "message" : "messages"}${items.room.from?.length ? ` from ${listOf(items.room.from)}` : ""}` }] : [],
    },
  ];
  return sections.filter((section) => section.rows.length);
}

const listOf = (names: string[]) => (names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

/** The digest's heading: back from away, or here again after a while. */
export const digestTitle = (reason: unknown): string => (reason === "back" ? "While you were away" : "Since you were last here");

/** A logged decision's line: who said it and who confirmed it, and whether a later one replaced it. */
export function decisionMeta(decision: Pick<RoomDecision, "saidBy" | "loggedBy" | "replaced" | "supersedesId">, meId: string): string {
  const who = (person: { accountId: string; name: string }) => (person.accountId === meId ? "you" : person.name);
  const parts = [decision.saidBy.accountId === decision.loggedBy.accountId ? `${capital(who(decision.saidBy))} said and logged it` : `${capital(who(decision.saidBy))} said it, ${who(decision.loggedBy)} logged it`];
  if (decision.supersedesId) parts.push("replaces an earlier one");
  if (decision.replaced) parts.push("replaced since");
  return parts.join(" · ");
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
