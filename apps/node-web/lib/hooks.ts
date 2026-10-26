"use client";

import { useEffect, useRef } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, ApiError, eventsUrl } from "./api";
import { keepOlder, matchesAuthor, optimisticMessage, reactionsOf, sendBody, toggleReaction, type SendInput } from "./chat";
import { live, type LiveCall } from "./live";
import { refsOf } from "./entity-text";
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
  Limits,
  McpConnection,
  Me,
  Message,
  ModelList,
  NodePublic,
  Room,
  RunStep,
  SearchResult,
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
export function useMessages(roomId: string, author: Author = "all") {
  const client = useQueryClient();
  return useQuery({ queryKey: keys.messages(roomId, author), queryFn: () => fetchMessages(client, roomId, author) });
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

export function useMcpConnections() {
  return useQuery({ queryKey: keys.mcp, queryFn: () => api<{ connections: McpConnection[] }>("/api/mcp-connections").then((result) => result.connections), staleTime: 60_000 });
}

const readTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Marks a room read up to seq, at most once a second. */
export function markRead(client: QueryClient, roomId: string, seq: number) {
  const boot = client.getQueryData<Bootstrap>(keys.bootstrap);
  const room = boot?.rooms.find((row) => row.id === roomId);
  if (!room || (room.readSeq ?? 0) >= seq) return;
  const key = `${boot?.me.id}:${roomId}`;
  if (!confirmedReads.has(key)) confirmedReads.set(key, room.readSeq ?? 0);
  client.setQueryData<Bootstrap>(keys.bootstrap, (current) =>
    current ? { ...current, rooms: current.rooms.map((row) => (row.id === roomId ? { ...row, readSeq: seq, unread: 0 } : row)) } : current,
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
    const source = new EventSource(eventsUrl(), { withCredentials: true });
    const onMessage = (event: MessageEvent<string>) => {
      const message = JSON.parse(event.data) as Message;
      putMessage(client, message);
      if (message.authorNodeId) live.posted(message.roomId, message.authorNodeId);
      if (message.kind === "approval" || message.kind === "run") void client.invalidateQueries({ queryKey: keys.activity });
      // A run card changed: its open view reads the job (and the work log, when open) again.
      if (message.kind === "run" && typeof message.data?.jobId === "string") {
        void client.invalidateQueries({ queryKey: keys.job(message.data.jobId) });
        void client.invalidateQueries({ queryKey: keys.runSteps(message.data.jobId) });
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
    };
  }, [client, enabled]);
}
