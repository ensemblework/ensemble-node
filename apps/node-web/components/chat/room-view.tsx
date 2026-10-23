"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, Settings2, Users } from "lucide-react";
import { api } from "@/lib/api";
import { keys, markRead, nodesById, useBootstrap, useMessages, useSend } from "@/lib/hooks";
import { useLiveRoom } from "@/lib/live";
import { TOOL_LABEL } from "@/lib/text";
import type { Member, Message, Room } from "@/lib/types";
import { NodeAvatar } from "../node-avatar";
import { IconButton, Pill, Spinner } from "../ui";
import { Composer, type MentionOption } from "./composer";
import { MessageItem, type MessageContext } from "./message";
import { RichText } from "./rich-text";
import { RoomSettings } from "./room-settings";

const SUGGESTIONS: Record<Room["kind"], string[]> = {
  dm: ["What's on my plate today?", "Add a task to review the onboarding flow next Monday", "Make a page with notes from what I tell you next", "Fix the failing tests in my repo on my laptop"],
  crew: ["Plan the login page and hand out the work", "@tester check the signup flow and file bugs", "@docs update the README for the new release"],
  group: ["Who can take the API changes this week?", "Here's what the client asked for: …"],
};

export function RoomView({ roomId }: { roomId: string }) {
  const client = useQueryClient();
  const boot = useBootstrap();
  const room = boot.data?.rooms.find((row) => row.id === roomId);
  const messages = useMessages(roomId);
  const send = useSend(roomId);
  const live = useLiveRoom(roomId);
  const [settings, setSettings] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const missingChecked = useRef(false);

  useEffect(() => {
    if (boot.data && !room && !missingChecked.current) {
      missingChecked.current = true;
      void client.invalidateQueries({ queryKey: keys.bootstrap });
    }
  }, [boot.data, room, client]);

  const list = messages.data ?? [];
  const lastSeq = list.reduce((max, row) => (row.sending ? max : Math.max(max, row.seq)), 0);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    if (stuck.current) element.scrollTop = element.scrollHeight;
  }, [list.length, live.map((row) => row.text.length + row.tools.length).join(",")]);
  useEffect(() => {
    stuck.current = true;
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (hash.startsWith("#m-")) setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: "center" }), 300);
  }, [roomId]);
  useEffect(() => {
    if (lastSeq && stuck.current && document.visibilityState === "visible") markRead(client, roomId, lastSeq);
  }, [client, roomId, lastSeq]);

  const ctx: MessageContext | null = useMemo(() => {
    if (!boot.data || !room) return null;
    const people = new Map(room.members.flatMap((row) => (row.kind === "person" ? [[row.accountId, row] as const] : [])));
    return { meId: boot.data.me.id, roomTitle: room.title, handles: new Set(room.members.map((row) => row.handle)), nodes: nodesById(boot.data, room), people };
  }, [boot.data, room]);

  if (!boot.data || !ctx) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        {boot.data && missingChecked.current && !boot.isFetching ? (
          <div className="text-center text-sm">
            This room is not available. <Link href="/chat" className="text-accent">Go back</Link>
          </div>
        ) : (
          <Spinner />
        )}
      </div>
    );
  }
  const theRoom = room!;
  const me = boot.data.me;
  const nodeMembers = theRoom.members.filter((row): row is Extract<Member, { kind: "node" }> => row.kind === "node");
  const people = theRoom.members.filter((row): row is Extract<Member, { kind: "person" }> => row.kind === "person");
  const others = people.filter((row) => row.accountId !== me.id);
  const dmNode = theRoom.kind === "dm" ? nodeMembers[0]?.node : undefined;
  const lead = nodeMembers.find((row) => theRoom.leadNodeIds.includes(row.node.id))?.node;
  const myBusy = live.some((row) => ctx.nodes.get(row.nodeId)?.ownerId === me.id);
  const options: MentionOption[] = [
    ...nodeMembers.map((row) => ({
      handle: row.handle,
      label: row.node.name,
      detail: `${row.node.role}${row.accountId === me.id ? "" : ` · ${people.find((person) => person.accountId === row.accountId)?.name ?? "someone"}'s node`}`,
      avatar: row.node.avatar,
    })),
    ...others.map((row) => ({ handle: row.handle, label: row.name, detail: row.responsibility ?? "person", person: true })),
    ...(nodeMembers.length > 1 ? [{ handle: "everyone", label: "Everyone", detail: "Every node in this room" }] : []),
  ];
  const placeholder = dmNode ? `Message ${dmNode.name}` : theRoom.kind === "crew" ? `Message your crew${lead ? ` — @${lead.slug} takes it unless you @mention someone` : ""}` : `Message ${theRoom.title}`;

  const grouped = (message: Message, previous: Message | undefined) =>
    Boolean(
      previous &&
        previous.kind !== "status" &&
        message.kind === "text" &&
        previous.authorKind === message.authorKind &&
        previous.authorNodeId === message.authorNodeId &&
        previous.authorAccountId === message.authorAccountId &&
        Date.parse(message.createdAt) - Date.parse(previous.createdAt) < 5 * 60_000,
    );

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-2.5 pr-14 md:px-6">
        {dmNode ? <NodeAvatar avatar={dmNode.avatar} size={34} thinking={live.some((row) => row.nodeId === dmNode.id)} /> : (
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-raised text-muted">
            <Users size={17} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-semibold">{theRoom.title}</h1>
            {dmNode ? <span className="font-mono text-xs text-muted">@{dmNode.slug}</span> : <Pill>{theRoom.kind}</Pill>}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted">
            {dmNode ? (
              <Link href={`/n/${dmNode.id}`} className="hover:text-ink">
                {dmNode.role} · settings
              </Link>
            ) : (
              <>
                <span className="flex -space-x-1.5">
                  {nodeMembers.slice(0, 6).map((row) => (
                    <NodeAvatar key={row.id} avatar={row.node.avatar} size={18} />
                  ))}
                </span>
                <span className="ml-1 truncate">
                  {nodeMembers.length} node{nodeMembers.length === 1 ? "" : "s"}
                  {others.length ? ` · ${people.map((row) => (row.accountId === me.id ? "you" : row.name)).join(", ")}` : ""}
                </span>
              </>
            )}
          </div>
        </div>
        <IconButton label="Room settings" onClick={() => setSettings(true)}>
          <Settings2 size={18} />
        </IconButton>
      </header>

      <div
        ref={scroller}
        onScroll={(event) => {
          const element = event.currentTarget;
          stuck.current = element.scrollHeight - element.scrollTop - element.clientHeight < 160;
          if (stuck.current && lastSeq) markRead(client, roomId, lastSeq);
        }}
        className="scroll-thin min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto w-full max-w-3xl px-3 pb-6 pt-4 md:px-6">
          {messages.isLoading ? (
            <div className="flex justify-center py-10 text-muted">
              <Spinner />
            </div>
          ) : !list.length ? (
            <div className="flex flex-col items-center py-16 text-center">
              {dmNode ? <NodeAvatar avatar={dmNode.avatar} size={84} /> : (
                <span className="flex -space-x-3">
                  {nodeMembers.slice(0, 5).map((row) => (
                    <NodeAvatar key={row.id} avatar={row.node.avatar} size={56} />
                  ))}
                </span>
              )}
              <h2 className="mt-4 text-xl font-semibold">{dmNode ? `Say hi to ${dmNode.name}` : `Welcome to ${theRoom.title}`}</h2>
              <p className="mt-1 max-w-md text-sm text-muted">
                {dmNode
                  ? `${dmNode.name} works in your Ensemble workspace, and asks before starting anything on your computer.`
                  : theRoom.kind === "crew"
                    ? "Your nodes, together. The lead plans and hands out work; @mention a node to ask it directly."
                    : "People and their nodes. Each node answers for its own person and asks them before it posts."}
              </p>
              <div className="mt-5 flex max-w-xl flex-wrap justify-center gap-2">
                {SUGGESTIONS[theRoom.kind].map((text) => (
                  <button key={text} onClick={() => send.mutate({ body: text, private: false, clientId: crypto.randomUUID() })} disabled={!me.verified} className="rounded-full border border-line bg-panel px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-ink disabled:opacity-50">
                    {text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            list.map((message, index) => <MessageItem key={message.id} message={message} ctx={ctx} grouped={grouped(message, list[index - 1])} />)
          )}

          {live.map((row) => {
            const node = ctx.nodes.get(row.nodeId);
            return (
              <div key={row.nodeId} className="mt-4 flex gap-3">
                <NodeAvatar avatar={node?.avatar} size={36} thinking />
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 text-sm">
                    <span className="font-semibold">{node?.name ?? "A node"}</span> <span className="text-xs text-muted">{row.text ? "is writing…" : "is thinking…"}</span>
                  </div>
                  {row.tools.length ? (
                    <div className="mb-1 flex flex-wrap gap-1.5">
                      {row.tools.map((tool, at) => (
                        <span key={at} className="inline-flex items-center gap-1 rounded-lg border border-line bg-bg px-2 py-0.5 text-xs text-muted">
                          {TOOL_LABEL(tool.name)}
                          {tool.state === "awaiting_approval" ? " · needs you" : ""}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {row.text ? (
                    <div className="opacity-80">
                      <RichText text={row.text} handles={ctx.handles} />
                    </div>
                  ) : (
                    <span className="inline-flex gap-1 py-2">
                      {[0, 1, 2].map((dot) => (
                        <span key={dot} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${dot * 150}ms` }} />
                      ))}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Composer
        options={options}
        placeholder={placeholder}
        canBePrivate={others.length > 0}
        busy={myBusy}
        disabled={!me.verified}
        disabledReason={
          <span>
            <Lock size={12} className="mr-1 inline" />
            Verify your email to talk to nodes. <Link href="/welcome" className="text-accent">Verify now</Link>
          </span>
        }
        onSend={(body, isPrivate) => {
          stuck.current = true;
          send.mutate({ body, private: isPrivate, clientId: crypto.randomUUID() });
        }}
        onStop={() => void api(`/api/node/rooms/${roomId}/stop`, { body: {} }).catch(() => undefined)}
      />
      <RoomSettings key={theRoom.id + theRoom.title} room={theRoom} boot={boot.data} open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}
