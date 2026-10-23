"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, ApiError, eventsUrl } from "./api";
import { live } from "./live";
import { mergeMessage } from "./text";
import type { Activity, AuthStatus, Bootstrap, Me, Message, NodePublic, Room } from "./types";

export const keys = {
  me: ["me"] as const,
  status: ["auth-status"] as const,
  bootstrap: ["bootstrap"] as const,
  activity: ["activity"] as const,
  messages: (roomId: string) => ["messages", roomId] as const,
  memory: (nodeId: string) => ["memory", nodeId] as const,
};

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
  return useQuery({ queryKey: keys.bootstrap, queryFn: () => api<Bootstrap>("/api/node/bootstrap"), enabled });
}

export function useActivity() {
  return useQuery({ queryKey: keys.activity, queryFn: () => api<Activity>("/api/node/activity"), refetchInterval: 30_000 });
}

export function useMessages(roomId: string) {
  return useQuery({
    queryKey: keys.messages(roomId),
    queryFn: () => api<{ messages: Message[] }>(`/api/node/rooms/${roomId}/messages?limit=150`).then((result) => result.messages),
  });
}

export function useRoom(roomId: string): Room | undefined {
  const boot = useBootstrap();
  return boot.data?.rooms.find((room) => room.id === roomId);
}

export function nodesById(boot: Bootstrap | undefined, room?: Room): Map<string, NodePublic> {
  const map = new Map<string, NodePublic>();
  for (const node of boot?.nodes ?? []) map.set(node.id, node);
  for (const source of [room, ...(boot?.rooms ?? [])]) {
    for (const member of source?.members ?? []) if (member.kind === "node" && !map.has(member.node.id)) map.set(member.node.id, member.node);
  }
  return map;
}

export function useSend(roomId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; private: boolean; clientId: string }) =>
      api<{ message: Message }>(`/api/node/rooms/${roomId}/messages`, { body: input }).then((result) => result.message),
    onMutate: (input) => {
      const boot = client.getQueryData<Bootstrap>(keys.bootstrap);
      const optimistic: Message = {
        id: `local-${input.clientId}`,
        roomId,
        seq: Number.MAX_SAFE_INTEGER,
        authorKind: "human",
        authorAccountId: boot?.me.id ?? "",
        authorNodeId: null,
        kind: "text",
        body: input.body,
        data: {},
        private: input.private,
        mentions: [],
        rootMessageId: null,
        clientId: input.clientId,
        createdAt: new Date().toISOString(),
        sending: true,
      };
      client.setQueryData<Message[]>(keys.messages(roomId), (list) => mergeMessage(list ?? [], optimistic));
    },
    onSuccess: (message) => {
      client.setQueryData<Message[]>(keys.messages(roomId), (list) => mergeMessage(list ?? [], message));
      void client.invalidateQueries({ queryKey: keys.bootstrap });
    },
    onError: (error, input) => {
      client.setQueryData<Message[]>(keys.messages(roomId), (list) =>
        (list ?? []).map((row) => (row.clientId === input.clientId ? { ...row, sending: false, failed: error instanceof Error ? error.message : String(error) } : row)),
      );
    },
  });
}

export function useSettle() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { messageId: string; decision: "approve" | "discard"; callIds?: string[]; body?: string }) =>
      api<{ message: Message }>(`/api/node/approvals/${input.messageId}`, { body: { decision: input.decision, callIds: input.callIds, body: input.body } }).then((result) => result.message),
    onSuccess: (message) => {
      client.setQueryData<Message[]>(keys.messages(message.roomId), (list) => mergeMessage(list ?? [], message));
      void client.invalidateQueries({ queryKey: keys.activity });
    },
  });
}

let readTimer: ReturnType<typeof setTimeout> | null = null;

/** Marks a room read up to seq, at most once a second. */
export function markRead(client: QueryClient, roomId: string, seq: number) {
  const boot = client.getQueryData<Bootstrap>(keys.bootstrap);
  const room = boot?.rooms.find((row) => row.id === roomId);
  if (!room || (room.readSeq ?? 0) >= seq) return;
  client.setQueryData<Bootstrap>(keys.bootstrap, (current) =>
    current ? { ...current, rooms: current.rooms.map((row) => (row.id === roomId ? { ...row, readSeq: seq, unread: 0 } : row)) } : current,
  );
  if (readTimer) clearTimeout(readTimer);
  readTimer = setTimeout(() => void api(`/api/node/rooms/${roomId}/read`, { body: { seq } }).catch(() => undefined), 800);
}

/** The account's live stream: messages, card updates, who is thinking, room changes. Reconnects by itself. */
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
      client.setQueryData<Message[]>(keys.messages(message.roomId), (list) => (list ? mergeMessage(list, message) : list));
      if (message.authorNodeId) live.posted(message.roomId, message.authorNodeId);
      if (message.kind === "approval" || message.kind === "run") void client.invalidateQueries({ queryKey: keys.activity });
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
      const data = JSON.parse(event.data) as { roomId: string; nodeId: string; frame: { type: string; text?: string; call?: { name: string; state?: string; summary?: string } } };
      if (data.frame.type === "delta" && data.frame.text) live.delta(data.roomId, data.nodeId, data.frame.text);
      else if (data.frame.call) live.tool(data.roomId, data.nodeId, data.frame.call);
    }) as EventListener);
    source.addEventListener("node.room", later as EventListener);
    // After a reconnect, fetch what was said while the stream was down.
    let opened = false;
    source.onopen = () => {
      if (opened) {
        void client.invalidateQueries({ queryKey: ["messages"] });
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
