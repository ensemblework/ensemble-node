"use client";

import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, ApiError, eventsUrl, evidence, liveFrame, messageById, peerRequests, peopleRooms, planById, routines, sessions, shareToRoom } from "./api";
import { keepOlder, matchesAuthor, optimisticMessage, reactionsOf, sendBody, toggleReaction, type SendInput } from "./chat";
import { live, type LiveCall } from "./live";
import { refsOf } from "./entity-text";
import { moveQueued, withoutQueued } from "./session";
import { mergeMessage } from "./text";
import { toast, toastError } from "./toast";
import { runEnded } from "./work-log";
import { mergeConversationSnapshot, roomWithMessage } from "./conversations";
import type {
  Activity,
  AgentDecision,
  ApprovalRecord,
  AuthStatus,
  Bootstrap,
  ConnectorEntry,
  DecisionBody,
  Device,
  FileRecord,
  FileUsage,
  JobDetail,
  IncomingInvite,
  LiveFrame,
  Limits,
  McpConnection,
  Me,
  Message,
  ModelList,
  NodePublic,
  PeerRequest,
  QueuedRun,
  Room,
  Routine,
  RoutineRun,
  RunStep,
  SearchResult,
  SessionAction,
  StatusCard,
  TrustView,
} from "./types";

export type Author = "all" | "people" | "nodes";

export const keys = {
  me: ["me"] as const,
  status: ["auth-status"] as const,
  bootstrap: ["bootstrap"] as const,
  activity: ["activity"] as const,
  /** Every loaded list of a room's messages (all, people only, nodes only). */
  roomMessages: (roomId: string) => ["messages", roomId] as const,
  messages: (roomId: string, author: Author = "all") => ["messages", roomId, author] as const,
  memory: (nodeId: string) => ["memory", nodeId] as const,
  models: ["models"] as const,
  invites: ["invites"] as const,
  pins: (roomId: string) => ["pins", roomId] as const,
  search: (q: string, roomId: string | null, author: Author) => ["search", q, roomId ?? "", author] as const,
  devices: ["devices"] as const,
  approvals: ["approvals"] as const,
  decisions: ["decisions"] as const,
  connectors: ["connectors"] as const,
  mcp: ["mcp-connections"] as const,
  /** The person's Ensemble Files matching a name ("" for the newest). */
  files: (q: string) => ["files", q] as const,
  /** A run card's computer job, and its run's steps; both keyed by the job. */
  job: (jobId: string) => ["job", jobId] as const,
  runSteps: (jobId: string) => ["run-steps", jobId] as const,
  /** An agent session: what runs now and its queue. */
  session: (sessionId: string) => ["session", sessionId] as const,
  /** My sessions (`GET /api/node/sessions`), by what was searched. */
  sessions: (q: string) => ["sessions", q] as const,
  /** The owner's routines, and one routine's runs. */
  routines: ["routines"] as const,
  routineRuns: (routineId: string) => ["routine-runs", routineId] as const,
  /** A plan card with its steps' run cards (`GET /api/node/plans/:id`). */
  plan: (planId: string) => ["plan", planId] as const,
  /** A room with other people: status cards, my trust settings, my shareable items, its peer requests. */
  roomStatus: (roomId: string) => ["room-status", roomId] as const,
  trust: (roomId: string) => ["trust", roomId] as const,
  shareable: (roomId: string) => ["shareable", roomId] as const,
  requests: (roomId: string) => ["requests", roomId] as const,
  /** The latest picture of a run's browser tab (owner only). */
  live: (jobId: string) => ["live", jobId] as const,
  /** A node's own captures on my computers. */
  nodeCaptures: (nodeId: string) => ["node-captures", nodeId] as const,
};

/** How often an active run on screen is read again. */
export const RUN_POLL_MS = 2500;
const confirmedReads = new Map<string, number>();

/** Messages per page of a room. */
export const PAGE = 100;

export const DEFAULT_LIMITS: Limits = { roomPeople: 10, nodesPerPerson: 3, crewNodes: 24, pins: 25, reactions: ["👍", "❤️", "😂", "🎉", "👀", "✅", "🙏", "🔥"], declineBlockDays: 30 };

export const limitsOf = (boot: Bootstrap | undefined): Limits => ({ ...DEFAULT_LIMITS, ...(boot?.limits ?? {}) });

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: () => api<Me>("/api/auth/me"),
    retry: (count, error) => !(error instanceof ApiError && error.status === 401) && count < 2,
    staleTime: 60_000,
  });
}

export function useAuthStatus() {
  return useQuery({ queryKey: keys.status, queryFn: () => api<AuthStatus>("/api/auth/status"), staleTime: 5 * 60_000 });
}

export function useBootstrap(enabled = true) {
  const client = useQueryClient();
  return useQuery({ queryKey: keys.bootstrap, queryFn: async () => {
    const fresh = await api<Bootstrap>("/api/node/bootstrap");
    for (const room of fresh.rooms) {
      const key = `${fresh.me.id}:${room.id}`;
      confirmedReads.set(key, Math.max(confirmedReads.get(key) ?? 0, room.readSeq ?? 0));
    }
    const current = client.getQueryData<Bootstrap>(keys.bootstrap);
    return current?.me.id === fresh.me.id ? { ...fresh, rooms: mergeConversationSnapshot(current.rooms, fresh.rooms) } : fresh;
  }, enabled });
}

export function useActivity() {
  return useQuery({ queryKey: keys.activity, queryFn: () => api<Activity>("/api/node/activity"), refetchInterval: 30_000 });
}

const messagesPath = (roomId: string, author: Author, extra = "") => `/api/node/rooms/${roomId}/messages?limit=${PAGE}${author === "all" ? "" : `&author=${author}`}${extra}`;

async function fetchMessages(client: QueryClient, roomId: string, author: Author): Promise<Message[]> {
  const fresh = (await api<{ messages: Message[] }>(messagesPath(roomId, author))).messages;
  return keepOlder(client.getQueryData<Message[]>(keys.messages(roomId, author)) ?? [], fresh, PAGE);
}

/** A room's newest messages; earlier pages loaded with `loadOlder` stay through refetches. */
export function useMessages(roomId: string, author: Author = "all", enabled = true) {
  const client = useQueryClient();
  return useQuery({ queryKey: keys.messages(roomId, author), queryFn: () => fetchMessages(client, roomId, author), enabled: enabled && Boolean(roomId) });
}

/** The room's loaded messages, fetching the newest page first when nothing is loaded yet. */
export function ensureMessages(client: QueryClient, roomId: string, author: Author): Promise<Message[]> {
  return client.ensureQueryData({ queryKey: keys.messages(roomId, author), queryFn: () => fetchMessages(client, roomId, author) });
}

/** Loads the page before the oldest loaded message; returns how many came back. */
export async function loadOlder(client: QueryClient, roomId: string, author: Author): Promise<number> {
  const list = client.getQueryData<Message[]>(keys.messages(roomId, author)) ?? [];
  const oldest = list.find((row) => !row.id.startsWith("local-"))?.seq;
  if (!oldest || oldest <= 1) return 0;
  const { messages } = await api<{ messages: Message[] }>(messagesPath(roomId, author, `&before=${oldest}`));
  client.setQueryData<Message[]>(keys.messages(roomId, author), (current) => messages.reduce((acc, row) => mergeMessage(acc, row), current ?? []));
  return messages.length;
}

/** Applies a change to every loaded list of a room's messages. */
export function updateMessages(client: QueryClient, roomId: string, change: (list: Message[], author: Author) => Message[]) {
  for (const [key, list] of client.getQueriesData<Message[]>({ queryKey: keys.roomMessages(roomId) })) {
    if (!list) continue;
    client.setQueryData<Message[]>(key, change(list, (key[2] as Author | undefined) ?? "all"));
  }
}

/** Puts a message (new or changed) into every loaded list it belongs in. */
export function putMessage(client: QueryClient, message: Message) {
  updateMessages(client, message.roomId, (list, author) => (matchesAuthor(message, author) ? mergeMessage(list, message) : list));
  client.setQueryData<Bootstrap>(keys.bootstrap, current => current ? {
    ...current, rooms: current.rooms.map(room => room.id === message.roomId ? roomWithMessage(room, message, current.me.id) : room),
  } : current);
}

export function useRoom(roomId: string): Room | undefined {
  const boot = useBootstrap();
  return boot.data?.rooms.find((room) => room.id === roomId);
}

/** Replaces a room in the bootstrap with a fresh room view, keeping its list fields (unread, last). */
export function putRoom(client: QueryClient, room: Room) {
  client.setQueryData<Bootstrap>(keys.bootstrap, (current) =>
    current
      ? {
          ...current,
          rooms: current.rooms.some((row) => row.id === room.id)
            ? current.rooms.map((row) => (row.id === room.id ? { ...row, ...room, unread: row.unread, readSeq: row.readSeq, last: row.last } : row))
            : [room, ...current.rooms],
        }
      : current,
  );
}

export function nodesById(boot: Bootstrap | undefined, room?: Room): Map<string, NodePublic> {
  const map = new Map<string, NodePublic>();
  for (const node of boot?.nodes ?? []) map.set(node.id, node);
  for (const source of [room, ...(boot?.rooms ?? [])]) {
    for (const member of source?.members ?? []) if (member.kind === "node" && !map.has(member.node.id)) map.set(member.node.id, member.node);
  }
  return map;
}

/**
 * Sends a message: it shows at once, and stays with "Not sent" when the server refuses. Its files are
 * already in Files, so a retry (same clientId) only sends their ids again.
 */
export function useSend(roomId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SendInput) => api<{ message: Message }>(`/api/node/rooms/${roomId}/messages`, { body: sendBody(input) }).then((result) => result.message),
    onMutate: (input) => {
      const boot = client.getQueryData<Bootstrap>(keys.bootstrap);
      putMessage(client, optimisticMessage(roomId, boot?.me.id ?? "", input));
    },
    onSuccess: (message) => {
      putMessage(client, message);
      void client.invalidateQueries({ queryKey: keys.bootstrap });
    },
    onError: (error, input) => {
      const failed = { ...optimisticMessage(roomId, client.getQueryData<Bootstrap>(keys.bootstrap)?.me.id ?? "", input), sending: false, failed: error instanceof Error ? error.message : String(error) };
      putMessage(client, failed);
    },
  });
}

type FilesAnswer = { files: FileRecord[]; usage?: FileUsage };

const filesQuery = (q: string) => ({
  queryKey: keys.files(q),
  queryFn: () => api<FilesAnswer>(`/api/documents${q ? `?q=${encodeURIComponent(q.slice(0, 200))}` : ""}`),
  staleTime: 30_000,
});

/** The person's Ensemble Files, newest first; `q` matches names. */
export function useFiles(q: string, enabled: boolean) {
  return useQuery({ ...filesQuery(q), enabled, placeholderData: keepPreviousData });
}

let maxFileBytes: number | null = null;

/** The largest file this server keeps, from the Files list (read once); null when unknown. */
export async function fileLimit(client: QueryClient): Promise<number | null> {
  if (maxFileBytes) return maxFileBytes;
  const result = await client.fetchQuery({ ...filesQuery(""), staleTime: 5 * 60_000 }).catch(() => null);
  maxFileBytes = result?.usage?.maxFileBytes ?? null;
  return maxFileBytes;
}

export function useSettle() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { messageId: string; decision: "approve" | "discard"; callIds?: string[]; body?: string }) =>
      api<{ message: Message }>(`/api/node/approvals/${input.messageId}`, { body: { decision: input.decision, callIds: input.callIds, body: input.body } }).then((result) => result.message),
    onSuccess: (message) => {
      putMessage(client, message);
      void client.invalidateQueries({ queryKey: keys.activity });
    },
  });
}

/** Adds or takes back my reaction; the change shows at once and is undone if the server refuses. */
export function useReact() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { message: Message; emoji: string }) => api<{ message: Message }>(`/api/node/messages/${input.message.id}/reactions`, { body: { emoji: input.emoji } }).then((result) => result.message),
    onMutate: ({ message, emoji }) => {
      const meId = client.getQueryData<Bootstrap>(keys.bootstrap)?.me.id ?? "";
      putMessage(client, { ...message, data: { ...message.data, reactions: toggleReaction(reactionsOf(message), emoji, meId) } });
    },
    onSuccess: (message) => putMessage(client, message),
    onError: (error, { message }) => {
      putMessage(client, message);
      toastError(error);
    },
  });
}

export function useDeleteMessage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (message: Message) => api<void>(`/api/node/messages/${message.id}`, { method: "DELETE" }),
    onMutate: (message) => putMessage(client, { ...message, body: "", mentions: [], data: { ...message.data, deleted: true, reactions: undefined } }),
    onError: (error, message) => {
      putMessage(client, message);
      toastError(error);
    },
  });
}

export function usePin(roomId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { messageId: string; pinned: boolean }) => api<{ room: Room }>(`/api/node/rooms/${roomId}/pins`, { body: input }).then((result) => result.room),
    onSuccess: (room) => {
      putRoom(client, room);
      void client.invalidateQueries({ queryKey: keys.pins(roomId) });
    },
    onError: toastError,
  });
}

export function usePins(roomId: string, enabled: boolean) {
  return useQuery({ queryKey: keys.pins(roomId), queryFn: () => api<{ messages: Message[] }>(`/api/node/rooms/${roomId}/pins`).then((result) => result.messages), enabled });
}

/** Every model a node can use. Own keys and AI plans take a moment, so this is asked for only when a picker opens. */
export function useModels(enabled: boolean) {
  return useQuery({ queryKey: keys.models, queryFn: () => api<ModelList>("/api/node/models"), enabled, staleTime: 60_000 });
}

export function useInvites() {
  return useQuery({ queryKey: keys.invites, queryFn: () => api<{ invites: IncomingInvite[] }>("/api/node/invites").then((result) => result.invites) });
}

export function useSearch(q: string, roomId: string | null, author: Author) {
  const query = q.trim();
  return useQuery({
    queryKey: keys.search(query, roomId, author),
    queryFn: () => {
      const params = new URLSearchParams({ q: query, author });
      if (roomId) params.set("roomId", roomId);
      return api<{ results: SearchResult[] }>(`/api/node/search?${params}`).then((result) => result.results);
    },
    enabled: query.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

/** Ensemble's paired computers, with the folders each shares. */
export function useDevices() {
  return useQuery({ queryKey: keys.devices, queryFn: () => api<{ devices: Device[] }>("/api/devices").then((result) => result.devices), refetchInterval: 30_000 });
}

/** Ensemble's Needs me: run approvals and questions from agents. The stream's `node.needs` re-reads it at once; the poll is the fallback. */
export function useApprovals() {
  return useQuery({ queryKey: keys.approvals, queryFn: () => api<{ approvals: ApprovalRecord[] }>("/api/approvals").then((result) => result.approvals), refetchInterval: 60_000 });
}

export function useDecisions() {
  return useQuery({ queryKey: keys.decisions, queryFn: () => api<{ decisions: AgentDecision[] }>("/api/decisions?status=pending").then((result) => result.decisions), refetchInterval: 60_000 });
}

/** A run card's computer job: status, engine, model, progress, summary, events. Read again every few seconds while `poll` and the job has not ended; an ended job does not change. */
export function useJob(jobId: string, options: { enabled: boolean; poll: boolean }) {
  return useQuery({
    queryKey: keys.job(jobId),
    queryFn: () => api<JobDetail>(`/api/agent/jobs/${jobId}`),
    enabled: options.enabled,
    staleTime: (query) => (runEnded(query.state.data?.job.status) ? Number.POSITIVE_INFINITY : 0),
    refetchInterval: (query) => (options.poll && !runEnded(query.state.data?.job.status) ? RUN_POLL_MS : false),
    retry: (count, error) => !(error instanceof ApiError && (error.status === 404 || error.status === 403)) && count < 2,
  });
}

/** What the stream last said about each run's live view (`node.live`): when, and why it is paused. */
const liveHeard = new Map<string, { when: number; at: string | null; paused: string | null }>();

/**
 * A working run's live view, while its card is on screen: read again when the stream says it changed,
 * with a gentle poll as the fallback (every 3 s once the computer sends pictures; rarely before, or
 * while the stream keeps up). Paused, the stream's reason shows when the API's headers cannot be read.
 */
export function useLiveView(jobId: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.live(jobId),
    queryFn: async ({ signal }): Promise<LiveFrame | null> => {
      const frame = await liveFrame(jobId, signal);
      const heard = liveHeard.get(jobId);
      // Where the API's headers cannot be read, the stream's reason keeps a paused view paused.
      if (!frame && heard?.paused && Date.now() - heard.when < 15_000) return { image: null, at: heard.at, url: null, title: null, width: null, height: null, paused: heard.paused };
      return frame;
    },
    enabled: Boolean(jobId) && enabled,
    staleTime: 0,
    gcTime: 60_000,
    retry: false,
    refetchInterval: (query) => {
      const heard = liveHeard.get(jobId);
      if (heard && Date.now() - heard.when < 10_000) return 12_000;
      return query.state.data ? 3_000 : 15_000;
    },
  });
}

/** A node's own captures on my computers, newest first. */
export function useNodeCaptures(nodeId: string, enabled = true) {
  return useQuery({ queryKey: keys.nodeCaptures(nodeId), queryFn: () => evidence.ofNode(nodeId).then((rows) => [...rows].reverse()), enabled: Boolean(nodeId) && enabled, staleTime: 30_000 });
}

/** Sends or discards one held capture; its card settles when all of its files are answered. */
export function useReleaseHeld() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; decision: "approve" | "discard" }) => evidence.release(input.id, input.decision),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["node-captures"] }),
  });
}

/** The engine trace of a job's run: every tool call, thinking, message and the result. Read only while the work log is open. */
export function useRunSteps(jobId: string, runId: string | null | undefined, enabled: boolean, poll: boolean) {
  return useQuery({
    queryKey: keys.runSteps(jobId),
    queryFn: () => api<{ run: { steps: RunStep[] } }>(`/api/runs/${runId}`).then((result) => result.run.steps ?? []),
    enabled: enabled && Boolean(runId),
    refetchInterval: poll ? RUN_POLL_MS : false,
    placeholderData: keepPreviousData,
    retry: (count, error) => !(error instanceof ApiError && (error.status === 404 || error.status === 403)) && count < 2,
  });
}

/** Stops a computer job (only the person whose computer runs it may). */
export function useStopJob() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => api<void>(`/api/agent/jobs/${jobId}/stop`, { method: "POST" }),
    onSettled: (_data, _error, jobId) => void client.invalidateQueries({ queryKey: keys.job(jobId) }),
  });
}

/** An agent session: its status, what runs now and its queue. Read again every few seconds while `poll`. */
export function useSession(sessionId: string | null | undefined, options: { enabled: boolean; poll: boolean }) {
  return useQuery({
    queryKey: keys.session(sessionId ?? ""),
    queryFn: () => sessions.get(sessionId!),
    enabled: Boolean(sessionId) && options.enabled,
    refetchInterval: options.poll ? RUN_POLL_MS : false,
    retry: (count, error) => !(error instanceof ApiError && (error.status === 404 || error.status === 403)) && count < 2,
  });
}

/** My sessions, most recently active first: read again on a session card's change and, gently, every 20 seconds while shown. */
export function useSessionList(q: string) {
  return useQuery({ queryKey: keys.sessions(q), queryFn: () => sessions.list(q), refetchInterval: 20_000, placeholderData: keepPreviousData });
}

/** Tells an agent session to queue, steer, replace or stop; the session and the run are read again after. */
export function useSessionControl(sessionId: string, jobId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: SessionAction) => sessions.control(sessionId, body),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: keys.session(sessionId) });
      void client.invalidateQueries({ queryKey: ["sessions"] });
      if (jobId) void client.invalidateQueries({ queryKey: keys.job(jobId) });
    },
  });
}

/** Hands a session to another node: the session and its card are read again, so the card says who manages it now. */
export function useHandOver(sessionId: string, cardId?: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (nodeId: string) => sessions.handOver(sessionId, nodeId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.session(sessionId) });
      void client.invalidateQueries({ queryKey: ["sessions"] });
      rereadCards(client, [cardId]);
    },
  });
}

const sameOrder = (a: readonly QueuedRun[], b: readonly QueuedRun[]) => a.length === b.length && a.every((row, at) => row.jobId === b[at]!.jobId);

/**
 * A session's queue with its edits: a move or a cancel shows at once, goes back with the server's
 * words when Ensemble refuses it, and gives way to Ensemble's queue once that shows the change (or
 * after a few seconds). One edit at a time.
 */
export function useSessionQueue(sessionId: string, base: QueuedRun[]) {
  const client = useQueryClient();
  const [pending, setPending] = useState<{ queue: QueuedRun[]; settled: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const baseKey = base.map((row) => row.jobId).join(",");
  const baseRef = useRef(base);
  baseRef.current = base;
  useEffect(() => {
    if (!pending?.settled) return;
    if (sameOrder(baseRef.current, pending.queue)) {
      setPending(null);
      return;
    }
    const timer = setTimeout(() => setPending(null), 8000);
    return () => clearTimeout(timer);
  }, [baseKey, pending]);
  const queue = pending?.queue ?? base;
  const busy = Boolean(pending && !pending.settled);
  const apply = async (next: QueuedRun[], call: () => Promise<unknown>) => {
    setError(null);
    setPending({ queue: next, settled: false });
    try {
      await call();
      setPending({ queue: next, settled: true });
      void client.invalidateQueries({ queryKey: keys.session(sessionId) });
    } catch (failure) {
      setPending(null);
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };
  return {
    queue,
    busy,
    error,
    move(jobId: string, delta: -1 | 1) {
      const next = busy ? null : moveQueued(queue, jobId, delta);
      if (next) void apply(next, () => sessions.reorder(sessionId, next.map((row) => row.jobId)));
    },
    cancel(jobId: string) {
      if (busy) return;
      void apply(withoutQueued(queue, jobId), () => sessions.cancel(sessionId, jobId));
    },
  };
}

/** After an answer: Needs me, and the run that waited on it. */
function refreshNeedsMe(client: QueryClient, jobId: string | undefined) {
  void client.invalidateQueries({ queryKey: keys.decisions });
  void client.invalidateQueries({ queryKey: keys.approvals });
  if (jobId) void client.invalidateQueries({ queryKey: keys.job(jobId) });
}

/** Answers a question from Needs me. Once answered, the card leaves the list and `note` is shown. */
export function useDecide() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; body: DecisionBody; jobId?: string; note: string }) => api<unknown>(`/api/decisions/${input.id}/decide`, { body: input.body }),
    onSuccess: (_data, input) => {
      client.setQueryData<AgentDecision[]>(keys.decisions, (rows) => rows?.filter((row) => row.id !== input.id));
      toast(input.note, "ok");
    },
    onSettled: (_data, _error, input) => refreshNeedsMe(client, input.jobId),
  });
}

/** Approves or rejects a run approval from Needs me. */
export function useDecideApproval() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; decision: "approved" | "rejected"; jobId?: string }) => api<unknown>(`/api/approvals/${input.id}/decide`, { body: { decision: input.decision } }),
    onSuccess: (_data, input) => {
      client.setQueryData<ApprovalRecord[]>(keys.approvals, (rows) => rows?.filter((row) => row.id !== input.id));
      toast(input.decision === "approved" ? "Approved." : "Rejected.", "ok");
    },
    onSettled: (_data, _error, input) => refreshNeedsMe(client, input.jobId),
  });
}

export function useConnectors() {
  return useQuery({ queryKey: keys.connectors, queryFn: () => api<{ entries: ConnectorEntry[] }>("/api/connectors/catalog").then((result) => result.entries), staleTime: 60_000 });
}

/** The owner's routines, with when each runs next and its newest runs. The event stream (`node.routine`) reads them again when one changes or starts a run; the slow poll only catches up. */
export function useRoutines(enabled = true) {
  return useQuery({ queryKey: keys.routines, queryFn: routines.list, enabled, refetchInterval: 5 * 60_000 });
}

/** A routine's runs, newest first, while its history is open. */
export function useRoutineRuns(routineId: string, enabled: boolean) {
  return useQuery({ queryKey: keys.routineRuns(routineId), queryFn: () => routines.runs(routineId), enabled, refetchInterval: enabled ? 5 * 60_000 : false });
}

/** A plan card with its steps' run cards, which are not in the timeline; the event stream keeps both current once read. */
export function usePlan(planId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: keys.plan(planId ?? ""),
    queryFn: () => planById(planId!),
    enabled: Boolean(planId) && enabled,
    retry: (count, error) => !(error instanceof ApiError && (error.status === 404 || error.status === 403)) && count < 2,
  });
}

/** Every person's status card in a room with other people (presence, away, their work at the detail they chose). Read again each minute while shown. */
export function useRoomStatus(roomId: string, enabled: boolean) {
  return useQuery({ queryKey: keys.roomStatus(roomId), queryFn: () => peopleRooms.status(roomId), enabled, refetchInterval: enabled ? 60_000 : false });
}

export function useTrust(roomId: string, enabled: boolean) {
  return useQuery({ queryKey: keys.trust(roomId), queryFn: () => peopleRooms.trust(roomId), enabled });
}

export function useShareable(roomId: string, enabled: boolean) {
  return useQuery({ queryKey: keys.shareable(roomId), queryFn: () => peopleRooms.shareable(roomId), enabled });
}

/** A room's peer requests as I may see them; `node.request` reads them again when one changes. */
export function useRoomRequests(roomId: string, enabled: boolean) {
  return useQuery({ queryKey: keys.requests(roomId), queryFn: () => peopleRooms.requests(roomId), enabled });
}

/** Cards that changed after a decision: read again at once, so the page does not wait for the event stream. */
function rereadCards(client: QueryClient, ids: ReadonlyArray<string | null | undefined>) {
  for (const id of new Set(ids.filter((row): row is string => Boolean(row)))) void messageById(id).then((message) => putMessage(client, message), () => undefined);
}

/** Accepts (optionally edited, optionally always), declines (with a note) or cancels a peer request. */
export function usePeerDecision(roomId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { requestId: string; action: "accept" | "decline" | "cancel"; text?: string; always?: boolean; note?: string; cardId?: string }) =>
      input.action === "accept"
        ? peerRequests.accept(input.requestId, { ...(input.text ? { text: input.text } : {}), ...(input.always ? { always: true } : {}) })
        : input.action === "decline"
          ? peerRequests.decline(input.requestId, input.note ? { note: input.note } : {})
          : peerRequests.cancel(input.requestId),
    onSuccess: (request, input) => {
      client.setQueryData<PeerRequest[]>(keys.requests(roomId), (current) => current?.map((row) => (row.id === request.id ? { ...row, ...request } : row)));
      void client.invalidateQueries({ queryKey: keys.requests(roomId) });
      rereadCards(client, [request.cardId, request.ownerCardId, input.cardId]);
    },
  });
}

/** Asks another person here something, through their lead: its public card comes back at once. */
export function useCreateRequest(roomId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof peopleRooms.request>[1]) => peopleRooms.request(roomId, body),
    onSuccess: (request) => {
      client.setQueryData<PeerRequest[]>(keys.requests(roomId), (current) => (current ? [request, ...current.filter((row) => row.id !== request.id)] : current));
      void client.invalidateQueries({ queryKey: keys.requests(roomId) });
      rereadCards(client, [request.cardId]);
    },
  });
}

/** Share to room: the copy lands in the Room at once. */
export function useShareToRoom() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { messageId: string; as: "me" | "lead" }) => shareToRoom(input.messageId, input.as),
    onSuccess: (message) => putMessage(client, message),
  });
}

/** I am away (until a time, with a note) or back: my card changes at once. */
export function useSetAway(roomId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof peopleRooms.setAway>[1]) => peopleRooms.setAway(roomId, body),
    onSuccess: (card) => client.setQueryData<StatusCard[]>(keys.roomStatus(roomId), (current) => (current ? current.map((row) => (row.accountId === card.accountId ? card : row)) : [card])),
  });
}

export function useSetTrust(roomId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof peopleRooms.setTrust>[1]) => peopleRooms.setTrust(roomId, body),
    onSuccess: (trust) => client.setQueryData<TrustView>(keys.trust(roomId), trust),
  });
}

export function useSetShareable(roomId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof peopleRooms.setShareable>[1]) => peopleRooms.setShareable(roomId, body),
    onSuccess: (items) => client.setQueryData(keys.shareable(roomId), items),
  });
}

/** My pages and tasks in Ensemble, newest first; `q` matches their titles and text (`GET /api/pages?all=true`). */
export function usePageDirectory(q: string, enabled: boolean) {
  return useQuery({
    queryKey: ["page-directory", q] as const,
    queryFn: () => api<{ pages: Array<{ id: string; kind: "page" | "task"; title: string; updatedAt: string }> }>(`/api/pages?all=true${q ? `&q=${encodeURIComponent(q.slice(0, 200))}` : ""}`).then((result) => result.pages),
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

function putRoutine(client: QueryClient, routine: Routine) {
  client.setQueryData<Routine[]>(keys.routines, (list) => (list ? (list.some((row) => row.id === routine.id) ? list.map((row) => (row.id === routine.id ? routine : row)) : [...list, routine]) : list));
}

/**
 * What the routines list does to a routine: pause or resume it (at once, put back when Ensemble
 * refuses), run it now, delete it and give its webhook a new token. Each reads the list again after.
 */
export function useRoutineActions() {
  const client = useQueryClient();
  const refresh = (id: string) => {
    void client.invalidateQueries({ queryKey: keys.routines });
    void client.invalidateQueries({ queryKey: keys.routineRuns(id) });
  };
  return {
    /** The saved routine, in the list at once; for a form that made or changed it. */
    saved(routine: Routine) {
      putRoutine(client, routine);
      refresh(routine.id);
    },
    async setStatus(routine: Routine, status: Routine["status"]) {
      const before = client.getQueryData<Routine[]>(keys.routines);
      putRoutine(client, { ...routine, status, ...(status === "paused" ? { nextRunAt: null } : {}) });
      try {
        putRoutine(client, await routines.update(routine.id, { status }));
      } catch (error) {
        if (before) client.setQueryData(keys.routines, before);
        throw error;
      } finally {
        refresh(routine.id);
      }
    },
    async runNow(routine: Routine): Promise<RoutineRun> {
      const run = await routines.run(routine.id);
      client.setQueryData<RoutineRun[]>(keys.routineRuns(routine.id), (list) => (list ? [run, ...list.filter((row) => row.id !== run.id)] : list));
      putRoutine(client, { ...routine, runs: [run, ...routine.runs.filter((row) => row.id !== run.id)].slice(0, 5) });
      refresh(routine.id);
      return run;
    },
    async remove(routine: Routine) {
      await routines.remove(routine.id);
      client.setQueryData<Routine[]>(keys.routines, (list) => list?.filter((row) => row.id !== routine.id));
      client.removeQueries({ queryKey: keys.routineRuns(routine.id) });
    },
    async newToken(routine: Routine): Promise<string> {
      const token = await routines.token(routine.id);
      putRoutine(client, { ...routine, webhook: routine.webhook ? { ...routine.webhook, hasToken: true } : routine.webhook });
      refresh(routine.id);
      return token;
    },
  };
}

export function useMcpConnections() {
  return useQuery({ queryKey: keys.mcp, queryFn: () => api<{ connections: McpConnection[] }>("/api/mcp-connections").then((result) => result.connections), staleTime: 60_000 });
}

const readTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Marks a room read up to seq, at most once a second. `left`: what stays unread after it (a room's other tab). */
export function markRead(client: QueryClient, roomId: string, seq: number, left = 0) {
  const boot = client.getQueryData<Bootstrap>(keys.bootstrap);
  const room = boot?.rooms.find((row) => row.id === roomId);
  if (!room || (room.readSeq ?? 0) >= seq) return;
  const key = `${boot?.me.id}:${roomId}`;
  if (!confirmedReads.has(key)) confirmedReads.set(key, room.readSeq ?? 0);
  client.setQueryData<Bootstrap>(keys.bootstrap, (current) =>
    current ? { ...current, rooms: current.rooms.map((row) => (row.id === roomId ? { ...row, readSeq: seq, unread: left } : row)) } : current,
  );
  clearTimeout(readTimers.get(key));
  readTimers.set(key, setTimeout(() => {
    readTimers.delete(key);
    void api(`/api/node/rooms/${roomId}/read`, { body: { seq } }).then(() => {
      confirmedReads.set(key, Math.max(confirmedReads.get(key) ?? 0, seq));
    }).catch(error => {
      client.setQueryData<Bootstrap>(keys.bootstrap, current => current ? {
        ...current, rooms: current.rooms.map(row => row.id === roomId && row.readSeq === seq ? { ...row, readSeq: confirmedReads.get(key) ?? 0, unread: room.unread } : row),
      } : current);
      void client.invalidateQueries({ queryKey: keys.bootstrap });
      toastError(error);
    });
  }, 800));
}

/** The account's live stream: messages, card updates, who is thinking, room changes, requests to join. Reconnects by itself. */
export function useNodeEvents(enabled: boolean) {
  const client = useQueryClient();
  const refresh = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;
    const later = () => {
      if (refresh.current) return;
      refresh.current = setTimeout(() => {
        refresh.current = null;
        void client.invalidateQueries({ queryKey: keys.bootstrap });
      }, 600);
    };
    // A routine run's card changed: its routine's next and last runs, and its history, read again (once per burst).
    const changedRoutines = new Set<string>();
    let routineTimer: ReturnType<typeof setTimeout> | null = null;
    const laterRoutine = (routineId: string) => {
      changedRoutines.add(routineId);
      if (routineTimer) return;
      routineTimer = setTimeout(() => {
        routineTimer = null;
        void client.invalidateQueries({ queryKey: keys.routines });
        for (const id of changedRoutines) void client.invalidateQueries({ queryKey: keys.routineRuns(id) });
        changedRoutines.clear();
      }, 800);
    };
    // A session's card changed: the session list is read again (once per burst; only while it is shown).
    let sessionsTimer: ReturnType<typeof setTimeout> | null = null;
    const laterSessions = () => {
      if (sessionsTimer) return;
      sessionsTimer = setTimeout(() => {
        sessionsTimer = null;
        void client.invalidateQueries({ queryKey: ["sessions"] });
      }, 800);
    };
    const source = new EventSource(eventsUrl(), { withCredentials: true });
    const onMessage = (event: MessageEvent<string>) => {
      const message = JSON.parse(event.data) as Message;
      putMessage(client, message);
      // A plan read with its run cards follows their changes too.
      if (message.kind === "plan") client.setQueryData<{ message: Message; runs: Message[] }>(keys.plan(message.id), (current) => (current ? { ...current, message } : current));
      if (message.planId) client.setQueryData<{ message: Message; runs: Message[] }>(keys.plan(message.planId), (current) => (current ? { ...current, runs: mergeMessage(current.runs, message) } : current));
      if (message.kind === "plan" && typeof message.data?.routine?.id === "string") laterRoutine(message.data.routine.id);
      if (message.authorNodeId) live.posted(message.roomId, message.authorNodeId);
      if (message.kind === "approval" || message.kind === "run") void client.invalidateQueries({ queryKey: keys.activity });
      // A run card changed: its open view reads the job (and the work log, when open) again.
      if (message.kind === "run" && typeof message.data?.jobId === "string") {
        void client.invalidateQueries({ queryKey: keys.job(message.data.jobId) });
        void client.invalidateQueries({ queryKey: keys.runSteps(message.data.jobId) });
      }
      if (message.kind === "run" && typeof message.data?.session?.id === "string") {
        void client.invalidateQueries({ queryKey: keys.session(message.data.session.id) });
        laterSessions();
      }
      later();
    };
    source.addEventListener("node.message", onMessage as EventListener);
    source.addEventListener("node.message.updated", onMessage as EventListener);
    source.addEventListener("node.status", ((event: MessageEvent<string>) => {
      const data = JSON.parse(event.data) as { roomId: string; nodeId: string; state: string };
      live.status(data.roomId, data.nodeId, data.state === "thinking");
      if (data.state !== "thinking") void client.invalidateQueries({ queryKey: keys.activity });
    }) as EventListener);
    source.addEventListener("node.frame", ((event: MessageEvent<string>) => {
      const data = JSON.parse(event.data) as { roomId: string; nodeId: string; showIds?: boolean; frame: { type: string; text?: string; refs?: unknown; call?: LiveCall } };
      if (data.frame.type === "delta" && data.frame.text) live.delta(data.roomId, data.nodeId, data.frame.text);
      else if (data.frame.type === "refs") live.refs(data.roomId, data.nodeId, refsOf(data.frame.refs), data.showIds === true);
      else if (data.frame.call) live.tool(data.roomId, data.nodeId, data.frame.call);
    }) as EventListener);
    source.addEventListener("node.room", ((event: MessageEvent<string>) => {
      const data = JSON.parse(event.data || "{}") as { roomId?: string };
      if (data.roomId) void client.invalidateQueries({ queryKey: keys.pins(data.roomId) });
      later();
    }) as EventListener);
    // A routine changed or started a run: its list and history are read again (no content in the event).
    source.addEventListener("node.routine", ((event: MessageEvent<string>) => {
      const data = JSON.parse(event.data || "{}") as { id?: string };
      if (typeof data.id === "string") laterRoutine(data.id);
      else void client.invalidateQueries({ queryKey: keys.routines });
    }) as EventListener);
    // A peer request changed in a room: its list is read again; its card comes as a message update.
    source.addEventListener("node.request", ((event: MessageEvent<string>) => {
      const data = JSON.parse(event.data || "{}") as { roomId?: string };
      if (typeof data.roomId === "string") void client.invalidateQueries({ queryKey: keys.requests(data.roomId) });
    }) as EventListener);
    // A run's live view changed (owner only): its picture is read again, or it shows why it paused.
    source.addEventListener("node.live", ((event: MessageEvent<string>) => {
      const data = JSON.parse(event.data || "{}") as { jobId?: unknown; at?: unknown; paused?: unknown };
      if (typeof data.jobId !== "string") return;
      const paused = typeof data.paused === "string" && data.paused ? data.paused : null;
      const at = typeof data.at === "string" ? data.at : null;
      liveHeard.set(data.jobId, { when: Date.now(), at, paused });
      if (paused) client.setQueryData<LiveFrame | null>(keys.live(data.jobId), (current) => ({ image: null, at, url: current?.url ?? null, title: current?.title ?? null, width: null, height: null, paused }));
      else void client.invalidateQueries({ queryKey: keys.live(data.jobId) });
    }) as EventListener);
    // Needs me changed (a run asks, or a card was answered somewhere): re-read it now, not at the next poll.
    source.addEventListener("node.needs", () => {
      void client.invalidateQueries({ queryKey: keys.approvals });
      void client.invalidateQueries({ queryKey: keys.decisions });
    });
    source.addEventListener("node.invite", () => {
      void client.invalidateQueries({ queryKey: keys.invites });
      later();
    });
    // After a reconnect, fetch what was said while the stream was down.
    let opened = false;
    source.onopen = () => {
      if (opened) {
        void client.invalidateQueries({ queryKey: ["messages"] });
        void client.invalidateQueries({ queryKey: ["plan"] });
        void client.invalidateQueries({ queryKey: ["requests"] });
        void client.invalidateQueries({ queryKey: ["sessions"] });
        void client.invalidateQueries({ queryKey: ["live"] });
        void client.invalidateQueries({ queryKey: keys.routines });
        void client.invalidateQueries({ queryKey: keys.invites });
        void client.invalidateQueries({ queryKey: keys.approvals });
        void client.invalidateQueries({ queryKey: keys.decisions });
        later();
      }
      opened = true;
    };
    return () => {
      source.close();
      if (refresh.current) clearTimeout(refresh.current);
      if (routineTimer) clearTimeout(routineTimer);
      if (sessionsTimer) clearTimeout(sessionsTimer);
    };
  }, [client, enabled]);
}
