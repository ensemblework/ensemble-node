/**
 * Rooms with other people (rooms v2, Ensemble docs/35 §12) as the website reads them: which tab a
 * message belongs to (Room, or the person's own My crew), each tab's unread and read marker as Ensemble
 * keeps them, which tab a live reply is written in, what may be shared to the room, status cards in
 * words, and a peer request's kind and state, with what a new one needs.
 */
import { missionView, type Badge, type Tone } from "./plan";
import type { Message, PeerKind, Presence, RequestCandidate, RequestStatus, Room, StatusCard } from "./types";

export type RoomTab = "room" | "crew";

/** A room with other people follows rooms v2: a shared Room and each person's own My crew. */
export const isPeopleRoom = (room: Pick<Room, "kind">): boolean => room.kind === "room";

/** My crew is what only I and my nodes read (private messages and cards); everything else is the Room. */
export const tabOf = (message: Pick<Message, "private">): RoomTab => (message.private ? "crew" : "room");

/** Each tab's unread as Ensemble counts it (the Room's public messages, My crew's private ones); an older server counted the room as one. */
export function tabUnreadOf(room: Pick<Room, "unread" | "unreadRoom" | "unreadCrew">): Record<RoomTab, number> {
  if (typeof room.unreadRoom === "number" || typeof room.unreadCrew === "number") return { room: room.unreadRoom ?? 0, crew: room.unreadCrew ?? 0 };
  return { room: room.unread ?? 0, crew: 0 };
}

/** Where a tab was read up to: the Room's marker is `readSeq`, My crew's `readSeqCrew`. */
export const tabMarker = (room: Pick<Room, "readSeq" | "readSeqCrew" | "lastSeq">, tab: RoomTab): number => (tab === "crew" ? (room.readSeqCrew ?? room.readSeq ?? room.lastSeq) : (room.readSeq ?? room.lastSeq));

/** A tab's marker and unread set as given; the room's unread is both tabs'. */
export function withTab<T extends Pick<Room, "readSeq" | "readSeqCrew" | "lastSeq" | "unread" | "unreadRoom" | "unreadCrew">>(room: T, tab: RoomTab, marker: number, unread: number): T {
  const counts = { ...tabUnreadOf(room), [tab]: Math.max(0, unread) };
  return { ...room, ...(tab === "crew" ? { readSeqCrew: marker } : { readSeq: marker }), unreadRoom: counts.room, unreadCrew: counts.crew, unread: counts.room + counts.crew };
}

/** A tab read up to `upTo`: its marker moves on (never back) and `left` stays unread there. */
export const readTab = <T extends Pick<Room, "readSeq" | "readSeqCrew" | "lastSeq" | "unread" | "unreadRoom" | "unreadCrew">>(room: T, tab: RoomTab, upTo: number, left = 0): T => withTab(room, tab, Math.max(tabMarker(room, tab), upTo), left);

/** Which tab a node's live reply is written in: the stream says whether it is private (My crew) or for the Room. */
export const liveTabOf = (row: { private?: boolean }): RoomTab => (row.private ? "crew" : "room");

type Shareable = Pick<Message, "id" | "kind" | "private" | "authorKind" | "authorAccountId" | "sending" | "failed" | "data">;

/** Share to room: my own private message, or my own node's private reply; words that were sent and not deleted. */
export function canShare(message: Shareable, meId: string): boolean {
  if (!message.private || message.kind !== "text" || message.sending || message.failed || message.id.startsWith("local-") || message.data?.deleted) return false;
  return (message.authorKind === "human" || message.authorKind === "node") && message.authorAccountId === meId;
}

/** The Room's copy of a message shared from My crew, when it is loaded. */
export function sharedCopy<T extends Pick<Message, "private" | "data">>(messages: readonly T[], id: string): T | undefined {
  return messages.find((row) => !row.private && row.data?.sharedFrom?.id === id);
}

type SharedData = { sharedFrom?: { id?: unknown; authorKind?: unknown; authorNodeId?: unknown } | null; sharedBy?: unknown; [key: string]: unknown } | null | undefined;

/**
 * The line over a message shared from someone's My crew: "Shared from Mira's crew" (posted as them),
 * "Shared by Mira" (posted by their lead), with "· @scout's reply" when it was another node's words.
 * `nameOf` names a person, `handleOf` a node.
 */
export function sharedLabel(data: SharedData, author: { accountId: string; nodeId: string | null }, meId: string, nameOf: (accountId: string) => string, handleOf: (nodeId: string) => string | null): string | null {
  const from = data?.sharedFrom;
  if (!from || typeof from.id !== "string") return null;
  const owner = typeof data?.sharedBy === "string" ? data.sharedBy : author.accountId;
  const mine = owner === meId;
  const head = typeof data?.sharedBy === "string" ? `Shared by ${mine ? "you" : nameOf(owner)}` : `Shared from ${mine ? "your" : `${nameOf(owner)}'s`} crew`;
  const node = from.authorKind === "node" && typeof from.authorNodeId === "string" && from.authorNodeId !== author.nodeId ? handleOf(from.authorNodeId) : null;
  return node ? `${head} · @${node}'s reply` : head;
}

/** `@leads status` and the same with punctuation, nothing else: Ensemble answers it with everyone's status card, without a model. */
export function leadsStatus(text: string): boolean {
  return /^\s*@leads\b[\s,:;.!?\u2013\u2014-]*status\s*[?!.]*\s*$/i.test(text);
}

// ---------------------------------------------------------------------------------------------
// Status cards

const PRESENCE: Record<Presence, Badge> = {
  online: { label: "Online", tone: "ok" },
  away: { label: "Away", tone: "warn" },
  offline: { label: "Offline", tone: "muted" },
};

export const presenceBadge = (presence: string): Badge => PRESENCE[presence as Presence] ?? PRESENCE.offline;

/** "until 18:00" today, "until Fri 18:00" this week, else the date; in `timeZone` (the reader's by default). */
export function untilText(iso: string, now = Date.now(), timeZone?: string): string {
  const at = new Date(iso);
  const day = (value: Date) => new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  if (day(at) === day(new Date(now))) return `until ${time}`;
  if (at.getTime() - now < 6 * 86_400_000 && at.getTime() > now) return `until ${new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short" }).format(at)} ${time}`;
  return `until ${new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short" }).format(at)} ${time}`;
}

export type AwayFor = "open" | "hour" | "evening" | "tomorrow" | "custom";

/** Until when "away" lasts, from the form's choice: an hour, this evening (18:00), tomorrow at 09:00, a picked time, or until I am back (null). */
export function awayUntil(choice: AwayFor, now: Date, picked = ""): string | null {
  const at = new Date(now);
  if (choice === "hour") return new Date(now.getTime() + 3_600_000).toISOString();
  if (choice === "evening") {
    at.setHours(18, 0, 0, 0);
    return at.getTime() > now.getTime() ? at.toISOString() : null;
  }
  if (choice === "tomorrow") {
    at.setDate(at.getDate() + 1);
    at.setHours(9, 0, 0, 0);
    return at.toISOString();
  }
  if (choice === "custom" && picked) {
    const value = new Date(picked);
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  return null;
}

/** An away status in a line: "Away until 18:00 · In a meeting"; null when they are not away. */
export function awayLine(away: StatusCard["away"], now = Date.now(), timeZone?: string): string | null {
  if (!away) return null;
  return [`Away${away.until ? ` ${untilText(away.until, now, timeZone)}` : ""}`, away.note?.trim() || null].filter(Boolean).join(" · ");
}

export type StatusCardView = {
  presence: Badge;
  away: string | null;
  /** Why the card shows no work: they ask first, share nothing, or have nothing going on here. */
  note: string | null;
  missions: Array<{ title: string; status: Badge; steps: string | null; requirements: Array<{ text: string; status: Badge }> }>;
  tasks: Array<{ title: string; status: string; due: string | null }>;
};

const REQUIREMENT: Record<string, Badge> = {
  open: { label: "Open", tone: "muted" },
  in_progress: { label: "In progress", tone: "accent" },
  accepted: { label: "Accepted", tone: "ok" },
  failed: { label: "Failed", tone: "danger" },
  deferred: { label: "Deferred", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

/** A status card as the page shows it, at the detail its person chose for the reader. */
export function statusCardView(card: StatusCard, now = Date.now(), timeZone?: string): StatusCardView {
  const missions = (card.missions ?? []).map((mission) => {
    const view = mission.status === "starting" ? { label: "Starting", tone: "accent" as Tone } : missionView(mission.status);
    return {
      title: mission.title,
      status: { label: view.label, tone: view.tone },
      steps: mission.steps ? `${mission.steps.done} of ${mission.steps.total} steps done` : null,
      requirements: (mission.requirements ?? []).map((row) => ({ text: row.text, status: REQUIREMENT[row.status] ?? { label: row.status.replace(/_/g, " "), tone: "muted" as Tone } })),
    };
  });
  const tasks = (card.tasks ?? []).map((task) => ({ title: task.title, status: task.status.replace(/_/g, " "), due: task.due ?? null }));
  const note = card.asks
    ? "Asks to be asked before sharing their status."
    : card.detail === "nothing"
      ? "Shares no status here."
      : !missions.length && !tasks.length
        ? "Nothing in progress for this room."
        : null;
  return { presence: presenceBadge(card.presence), away: awayLine(card.away, now, timeZone), note, missions, tasks };
}

// ---------------------------------------------------------------------------------------------
// Peer requests

const KIND: Record<PeerKind, string> = { question: "Question", share: "Share", review: "Review", work: "Work" };
export const requestKind = (kind: string): string => KIND[kind as PeerKind] ?? kind;

/** What each kind asks for, in a line, for the form. */
export const REQUEST_KINDS: ReadonlyArray<{ id: PeerKind; label: string; hint: string }> = [
  { id: "question", label: "Question", hint: "Their lead answers in the room, with only what the room may see." },
  { id: "share", label: "Share", hint: "Their lead shares something of theirs, in the room, if they allow it." },
  { id: "review", label: "Review", hint: "They check an exact commit or address you name. Nothing runs before they accept." },
  { id: "work", label: "Work", hint: "Their nodes do it, on their computer and credits. Nothing runs before they accept." },
];

/** Who I am to a request: the person who asked, the person asked, or someone else in the room. */
export function requestRole(data: { from?: { accountId?: unknown } | null; to?: { accountId?: unknown } | null } | null | undefined, meId: string): "from" | "to" | "other" {
  if (data?.from?.accountId === meId) return "from";
  if (data?.to?.accountId === meId) return "to";
  return "other";
}

/** Still to be decided: the target can answer, accept or decline it, and the requester can cancel it. */
export const requestUndecided = (status: string): boolean => status === "open" || status === "awaiting_owner";

/** A request's state on its public card: "Waiting for Ben", "Accepted by Ben", "Done"… */
export function requestState(status: string, toName: string): Badge {
  switch (status as RequestStatus) {
    case "open":
      return { label: "Open", tone: "accent" };
    case "answered":
      return { label: "Answered", tone: "ok" };
    case "awaiting_owner":
      return { label: `Waiting for ${toName}`, tone: "warn" };
    case "approved":
      return { label: `Accepted by ${toName}`, tone: "accent" };
    case "declined":
      return { label: "Declined", tone: "muted" };
    case "done":
      return { label: "Done", tone: "ok" };
    case "cancelled":
      return { label: "Cancelled", tone: "muted" };
    default:
      return { label: status.replace(/_/g, " "), tone: "muted" };
  }
}

/** The target owner's own card for a request. */
export function ownerCardState(status: string): Badge {
  const states: Record<string, Badge> = {
    pending: { label: "Waiting for you", tone: "warn" },
    applying: { label: "Accepting…", tone: "accent" },
    accepted: { label: "Accepted", tone: "ok" },
    answered: { label: "Answered", tone: "ok" },
    declined: { label: "Declined", tone: "muted" },
    cancelled: { label: "Cancelled", tone: "muted" },
    expired: { label: "Expired", tone: "muted" },
  };
  return states[status] ?? { label: status, tone: "muted" };
}

/** A disclosure card: may the lead share something private, or answer in its own words? */
export function disclosureState(status: string, mode: string): Badge {
  const share = mode !== "answer";
  const states: Record<string, Badge> = {
    pending: { label: "Waiting for you", tone: "warn" },
    applying: { label: "Working…", tone: "accent" },
    approved: { label: share ? "Allowed" : "Answering", tone: "ok" },
    declined: { label: share ? "Not shared" : "Not answered", tone: "muted" },
    expired: { label: "Expired", tone: "muted" },
  };
  return states[status] ?? { label: status, tone: "muted" };
}

export type RequestDraft = { to: string; kind: PeerKind; text: string; repo: string; commit: string; url: string };

const COMMIT = /^[0-9a-f]{7,64}$/i;
const isUrl = (value: string) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

/** What a new request still needs, by field. A review names its exact candidate: a commit in a repository, or an address. */
export function requestProblems(draft: RequestDraft): Partial<Record<"to" | "text" | "candidate", string>> {
  const problems: Partial<Record<"to" | "text" | "candidate", string>> = {};
  if (!draft.to) problems.to = "Pick who it is for.";
  if (!draft.text.trim()) problems.text = "Say what you need.";
  else if (draft.text.trim().length > 4000) problems.text = "At most 4,000 characters.";
  const commit = draft.commit.trim();
  const url = draft.url.trim();
  if (commit && !COMMIT.test(commit)) problems.candidate = "A commit is its hash: 7 to 64 hexadecimal characters.";
  else if (url && !isUrl(url)) problems.candidate = "That is not a web address.";
  else if (commit && !draft.repo.trim()) problems.candidate = "Name the repository the commit is in.";
  else if (draft.kind === "review" && !commit && !url) problems.candidate = "A review needs its exact candidate: a commit with its repository, or an address.";
  return problems;
}

/** `POST /api/node/rooms/:id/requests`: a candidate only when one was named. */
export function requestBody(draft: RequestDraft): { to: string; kind: PeerKind; text: string; candidate?: RequestCandidate } {
  const candidate: RequestCandidate = {
    ...(draft.repo.trim() ? { repo: draft.repo.trim() } : {}),
    ...(draft.commit.trim() ? { commit: draft.commit.trim() } : {}),
    ...(draft.url.trim() ? { url: draft.url.trim() } : {}),
  };
  return { to: draft.to, kind: draft.kind, text: draft.text.trim(), ...(Object.keys(candidate).length ? { candidate } : {}) };
}

/** A candidate in a line: "ensemble at 9f8e7d6", or its address. */
export function candidateText(candidate: RequestCandidate | null | undefined): string | null {
  if (!candidate) return null;
  const commit = candidate.commit ? `at ${candidate.commit.slice(0, 7)}` : null;
  return [candidate.repo, commit, candidate.url].filter(Boolean).join(" ") || null;
}

/**
 * A reaction or pin refused in a room with other people: almost always a message from before I joined,
 * which nobody there reacts to, pins or logs for me (docs/35 §12.14). Null elsewhere: the server's words stand.
 */
export function joinedRefusal(action: "react" | "pin", status: number | undefined, roomKind: string | undefined): string | null {
  if (roomKind !== "room") return null;
  if (action === "react" && status === 404) return "You can react only to messages from since you joined.";
  if (action === "pin" && status === 400) return "You can pin only messages everyone here can read, from since you joined.";
  return null;
}
