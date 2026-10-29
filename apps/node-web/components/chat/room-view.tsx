"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, ArrowDown, ArrowLeft, AtSign, Bot, CircleStop, Download, Ellipsis, Handshake, Lock, MessagesSquare, Pause, Pin, Search, Settings2, ShieldCheck, UserRound, Users, X } from "lucide-react";
import { api, download } from "@/lib/api";
import { messageFiles } from "@/lib/attachments";
import { dayKey, dayLabel, firstUnread, matchesAuthor, mentionsMe, messagePreview, resendInput, serverAuthor, type ViewFilter } from "@/lib/chat";
import { ensureMessages, keys, limitsOf, loadOlder, markRead, nodesById, PAGE, updateMessages, useBootstrap, useMessages, usePlan, useRoomRequests, useSend, useShareToRoom, type Author } from "@/lib/hooks";
import { clearJump, useJump } from "@/lib/jump";
import { useLiveRoom } from "@/lib/live";
import { isPeopleRoom, liveTab, mergeSeen, readMarker, sharedCopy, tabOf, tabUnread, unreadAfter, type RoomTab, type TabSeen } from "@/lib/rooms";
import { TOOL_LABEL } from "@/lib/text";
import { helperThread, helperThreads, looseThreads, placeThreads, threadLabel, type HelperThread } from "@/lib/threads";
import { toast, toastError } from "@/lib/toast";
import type { Bootstrap, Member, Message, NodeFull, Room } from "@/lib/types";
import { workBoard } from "@/lib/work";
import { NodeAvatar } from "../node-avatar";
import { ToolIcon } from "../tool-icon";
import { Drawer, IconButton, MenuItem, Spinner, useDismiss } from "../ui";
import { Composer, type ComposerDraft, type MentionOption } from "./composer";
import { HelperThreadView } from "./helper-thread";
import { authorLabel, MessageItem, replyOf, type MessageContext } from "./message";
import { PinnedBar, PinsDrawer } from "./pins";
import { PlanCard } from "./plan-card";
import { RichText } from "./rich-text";
import { readableBody } from "@/lib/entity-text";
import { RequestForm, TrustSheet } from "./room-people";
import { RoomSettings } from "./room-settings";
import { SearchPanel } from "./search";
import { WorkStrip } from "./work-strip";

const SUGGESTIONS: Record<Room["kind"], string[]> = {
  dm: ["What's on my plate today?", "Add a task to review the onboarding flow next Monday", "Make a page with notes from what I tell you next", "Fix the failing tests in my repo on my laptop"],
  crew: ["Plan the login page and hand out the work", "@tester check the signup flow and file bugs", "@docs update the README for the new release"],
  room: ["Who can take the API changes this week?", "Here's what the client asked for: …"],
  task: [],
};

const FILTERS: Array<{ id: ViewFilter; label: string; icon: typeof Users; empty: string }> = [
  { id: "all", label: "Everything", icon: MessagesSquare, empty: "" },
  { id: "people", label: "People only", icon: UserRound, empty: "Nobody has written here yet." },
  { id: "nodes", label: "Nodes only", icon: Bot, empty: "No node has written here yet." },
  { id: "mentions", label: "Mentions of me", icon: AtSign, empty: "Nobody has mentioned you in what is loaded." },
];

type NodeMember = Extract<Member, { kind: "node" }>;
type PersonMember = Extract<Member, { kind: "person" }>;

/**
 * What each tab of a room with other people last showed, kept in this browser (the server keeps one
 * read marker per person). `mark` moves a tab on and returns what is seen now.
 */
function useTabSeen(key: string | null, base: number): { seen: TabSeen; mark: (tab: RoomTab, seq: number) => TabSeen } {
  const [, bump] = useState(0);
  const state = useRef<{ key: string | null; seen: TabSeen }>({ key: null, seen: { room: base, crew: base } });
  if (key && state.current.key !== key) {
    let stored: unknown = null;
    try {
      stored = typeof window === "undefined" ? null : JSON.parse(window.localStorage.getItem(key) ?? "null");
    } catch {
      stored = null;
    }
    state.current = { key, seen: mergeSeen(stored, base) };
  }
  const mark = useCallback((tab: RoomTab, seq: number) => {
    const current = state.current;
    if (current.seen[tab] >= seq) return current.seen;
    const seen = { ...current.seen, [tab]: seq };
    state.current = { ...current, seen };
    try {
      if (current.key) window.localStorage.setItem(current.key, JSON.stringify(seen));
    } catch {
      // Storage off or full: the tabs still count for this visit.
    }
    bump((count) => count + 1);
    return seen;
  }, []);
  return { seen: state.current.seen, mark };
}

const TABS: ReadonlyArray<{ id: RoomTab; label: string; title: string }> = [
  { id: "room", label: "Room", title: "Everyone here reads the Room" },
  { id: "crew", label: "My crew", title: "Only you and your nodes read My crew" },
];

/** A room's empty tab: who reads it and who answers there, with a few ways to start. */
function PeopleEmpty({ tab, title, onSuggest, disabled }: { tab: RoomTab; title: string; onSuggest: (text: string) => void; disabled: boolean }) {
  const room = tab === "room";
  const suggestions = room ? ["@leads status", "Who can take the API changes this week?"] : ["What did I miss here?", "Draft a short update on my work for the room"];
  return (
    <div className="flex flex-col items-center py-14 text-center">
      <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${room ? "bg-raised text-muted" : "bg-private/10 text-private"}`}>{room ? <Users size={26} strokeWidth={1.6} /> : <Lock size={24} strokeWidth={1.6} />}</span>
      <h2 className="mt-4 text-xl font-semibold">{room ? `Welcome to ${title}` : "Your crew, here"}</h2>
      <p className="mt-2 max-w-md text-sm text-muted">
        {room
          ? "Everyone here reads the Room. Only a lead you name answers here, and a message that names no node wakes nobody. Your own nodes answer you privately, in My crew."
          : "Only you and your nodes read this. Your lead answers what you ask here, or the node you name. Nothing reaches the Room unless you share it."}
      </p>
      <div className="mt-5 flex max-w-xl flex-wrap justify-center gap-2">
        {suggestions.map((text) => (
          <button key={text} onClick={() => onSuggest(text)} disabled={disabled} className="rounded-full border border-line bg-panel px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-ink disabled:opacity-50">
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export function RoomView({ roomId }: { roomId: string }) {
  const client = useQueryClient();
  const boot = useBootstrap();
  const room = boot.data?.rooms.find((row) => row.id === roomId);
  const [filter, setFilter] = useState<ViewFilter>("all");
  const author: Author = serverAuthor(filter);
  const messages = useMessages(roomId, author);
  // The whole conversation, whatever the filter shows: what runs here and which message brought in a helper.
  const everything = useMessages(roomId, "all");
  const send = useSend(roomId);
  const sendMessage = send.mutate;
  const live = useLiveRoom(roomId);
  const [panel, setPanel] = useState<null | "settings" | "pins" | "trust" | "request">(null);
  // A room with other people has two tabs: the shared Room and my own My crew (rooms v2).
  const isPeople = Boolean(room && isPeopleRoom(room));
  const [tab, setTab] = useState<RoomTab>("room");
  const meId = boot.data?.me.id ?? "";
  const { seen: tabsSeen, mark: markTab } = useTabSeen(isPeople && meId ? `node:tabs-seen:${meId}:${roomId}` : null, room ? (room.readSeq ?? room.lastSeq) : 0);
  const requests = useRoomRequests(roomId, isPeople);
  const { mutate: shareMessage } = useShareToRoom();
  const [menu, setMenu] = useState(false);
  const [searching, setSearching] = useState(false);
  const [helper, setHelper] = useState<HelperThread | null>(null);
  // A routine run's card, opened from the strip: it is not in the timeline.
  const [cardId, setCardId] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [reply, setReply] = useState<Message | null>(null);
  const [draft, setDraft] = useState<ComposerDraft | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [olderDone, setOlderDone] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const menuBox = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const positioned = useRef(false);
  const anchor = useRef<number | null>(null);
  const pendingJump = useRef<string | null>(null);
  const seenSeq = useRef(0);
  const missingChecked = useRef(false);
  const opened = useRef<{ read: number; last: number } | null>(null);
  if (room && !opened.current) {
    opened.current = { read: isPeople ? tabsSeen[tab] : (room.readSeq ?? room.lastSeq), last: room.lastSeq };
    seenSeq.current = opened.current.read;
  }
  const hashUsed = useRef(false);
  const jump = useJump(roomId);
  const handledJump = useRef<number | null>(null);
  const lastFilter = useRef(filter);
  const closeMenu = useCallback(() => setMenu(false), []);
  useDismiss(menu, closeMenu, menuBox);

  // `?settings=1` (a node's settings address, /n/:id) opens the settings here once.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("settings") !== "1") return;
    setPanel("settings");
    params.delete("settings");
    const rest = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
  }, [roomId]);

  useEffect(() => {
    if (boot.data && !room && !missingChecked.current) {
      missingChecked.current = true;
      void client.invalidateQueries({ queryKey: keys.bootstrap });
    }
  }, [boot.data, room, client]);

  const all = messages.data ?? [];
  // Cards of plan steps show inside their plan's card, not in the timeline; a room with other people shows one tab at a time.
  const loaded = useMemo(() => all.filter((row) => !row.planId && (!isPeople || tabOf(row) === tab)), [all, isPeople, tab]);
  const inPlan = useMemo(() => {
    const byPlan = new Map<string, Message[]>();
    for (const row of all) if (row.planId) byPlan.set(row.planId, [...(byPlan.get(row.planId) ?? []), row]);
    return byPlan;
  }, [all]);
  const list = filter === "mentions" ? loaded.filter((row) => mentionsMe(row, meId)) : loaded;
  const nodes = useMemo(() => nodesById(boot.data, room), [boot.data, room]);
  const whole = everything.data ?? all;
  const timeline = useMemo(() => whole.filter((row) => !row.planId), [whole]);
  // Each tab's unread, and the newest message the shown tab has.
  const tabCounts = useMemo(() => (isPeople ? tabUnread(timeline, tabsSeen, meId) : { room: 0, crew: 0 }), [isPeople, timeline, tabsSeen, meId]);
  const tabNewest = useMemo(() => timeline.reduce((max, row) => (row.sending || row.id.startsWith("local-") || (isPeople && tabOf(row) !== tab) ? max : Math.max(max, row.seq)), 0), [timeline, isPeople, tab]);
  // What runs here, from what is loaded: Stop asks first when it is more than a reply being written.
  const board = useMemo(() => workBoard(whole, meId, (id) => (id ? (nodes.get(id)?.ownerId ?? null) : null)), [whole, meId, nodes]);
  const working = board.length > 0;
  // Helpers' rooms show as threads under the message that brought them in, or in the strip.
  const rooms = boot.data?.rooms;
  const threads = useMemo(() => helperThreads(rooms ?? []), [rooms]);
  const attached = useMemo(() => placeThreads(timeline, threads), [timeline, threads]);
  const helperRows = useMemo(() => {
    if (!room) return [];
    const under = new Map<string, string>();
    for (const [messageId, found] of attached) for (const thread of found) under.set(thread.roomId, messageId);
    return [
      ...threads.filter((thread) => under.has(thread.roomId)).map((thread) => ({ thread, messageId: under.get(thread.roomId) ?? null })),
      ...looseThreads(threads, new Set(under.keys()), room).map((thread) => ({ thread, messageId: null })),
    ];
  }, [attached, threads, room]);
  const stopRoom = useCallback(async () => {
    if (working && !confirm("Stop this conversation's work? Its plans, agent runs and the replies being written stop. What was changed so far stays.")) return;
    setStopping(true);
    try {
      const result = await api<{ stopped?: number } | undefined>(`/api/node/rooms/${roomId}/stop`, { body: {} });
      toast(result?.stopped ? "Stopped. What was changed so far stays." : "Nothing was running here.", result?.stopped ? "ok" : "info");
    } catch (error) {
      toastError(error);
    } finally {
      setStopping(false);
    }
  }, [roomId, working]);
  // Paging counts every message loaded, the ones shown inside plan cards too.
  const lastSeq = all.reduce((max, row) => (row.sending || row.id.startsWith("local-") ? max : Math.max(max, row.seq)), 0);
  const firstReal = all.find((row) => !row.id.startsWith("local-"));
  const hasOlder = !olderDone && all.length >= PAGE && (firstReal?.seq ?? 0) > 1;
  // Opening a tab sets where its divider goes (`opened`), and its list changes with it.
  const unreadId = useMemo(
    () => (filter === "all" && opened.current ? firstUnread(loaded.filter((row) => row.seq <= opened.current!.last), opened.current.read, meId) : null),
    [filter, loaded, meId],
  );
  /** What is shown is read: the room's marker moves (in a room with other people, only past what both tabs have seen). */
  const markSeen = useCallback(() => {
    if (!isPeople) {
      if (lastSeq) markRead(client, roomId, lastSeq);
      return;
    }
    if (!tabNewest) return;
    const seen = markTab(tab, tabNewest);
    const current = client.getQueryData<Bootstrap>(keys.bootstrap)?.rooms.find((row) => row.id === roomId)?.readSeq ?? 0;
    const marker = readMarker(timeline, seen, meId, current);
    markRead(client, roomId, marker, unreadAfter(timeline, marker, meId));
  }, [isPeople, lastSeq, client, roomId, tabNewest, markTab, tab, timeline, meId]);
  /** Shows a tab: at its first unread (or the newest), at the newest when `bottom`, or where a jump goes. */
  const showTab = (next: RoomTab, how: "open" | "bottom" | "jump" = "open") => {
    if (next === tab) return;
    opened.current = { read: tabsSeen[next], last: lastSeq };
    seenSeq.current = tabsSeen[next];
    setReply(null);
    setTab(next);
    if (how === "jump") return;
    positioned.current = how === "bottom";
    stuck.current = true;
    setAtBottom(true);
  };
  const showTabRef = useRef(showTab);
  showTabRef.current = showTab;
  const tabRef = useRef(tab);
  tabRef.current = tab;
  if (atBottom && lastSeq > seenSeq.current) seenSeq.current = lastSeq;
  const newBelow = atBottom ? 0 : loaded.filter((row) => row.seq > seenSeq.current && !row.sending && row.kind !== "status" && !(row.authorKind === "human" && row.authorAccountId === meId)).length;
  const liveKey = live.map((row) => row.text.length + row.tools.length).join(",");
  const days = useMemo(() => {
    const out: Array<{ key: string; label: string; items: Message[] }> = [];
    for (const message of list) {
      const key = dayKey(message.createdAt);
      if (out[out.length - 1]?.key !== key) out.push({ key, label: dayLabel(message.createdAt), items: [] });
      out[out.length - 1]!.items.push(message);
    }
    return out;
  }, [list]);

  const reveal = useCallback((messageId: string) => {
    const element = document.getElementById(`m-${messageId}`);
    if (!element) return false;
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    stuck.current = false;
    setAtBottom(false);
    setHighlight(messageId);
    setTimeout(() => setHighlight((current) => (current === messageId ? null : current)), 2600);
    return true;
  }, []);

  /** Scrolls to a message, loading earlier pages first when it is not loaded yet. */
  const jumpTo = useCallback(
    async (messageId: string) => {
      if (reveal(messageId)) return;
      pendingJump.current = messageId;
      try {
        const { message } = await api<{ message: Message }>(`/api/node/messages/${messageId}`);
        if (message.roomId !== roomId) return;
        if (isPeople && tabOf(message) !== tabRef.current) showTabRef.current(tabOf(message), "jump");
        let target: Author = author;
        if (!(filter === "mentions" ? mentionsMe(message, meId) : matchesAuthor(message, author))) {
          target = "all";
          setFilter("all");
        }
        let current = await ensureMessages(client, roomId, target);
        for (let page = 0; page < 40 && !current.some((row) => row.id === messageId); page += 1) {
          const oldest = current.find((row) => !row.id.startsWith("local-"))?.seq ?? 0;
          if (oldest <= message.seq || !(await loadOlder(client, roomId, target))) break;
          current = client.getQueryData<Message[]>(keys.messages(roomId, target)) ?? [];
        }
        if (!current.some((row) => row.id === messageId)) {
          pendingJump.current = null;
          toast("That message is not in this conversation any more.");
        }
      } catch (error) {
        pendingJump.current = null;
        toastError(error);
      }
    },
    [author, client, filter, meId, reveal, roomId, isPeople],
  );

  // Once a pending jump's message is on screen, go to it.
  useEffect(() => {
    if (pendingJump.current && reveal(pendingJump.current)) pendingJump.current = null;
  });

  /** The message a search result, pin or link asked for, once. */
  const takeJump = useCallback((): string | null => {
    if (!jump || handledJump.current === jump.nonce) return null;
    handledJump.current = jump.nonce;
    clearJump(jump.nonce);
    return jump.messageId;
  }, [jump]);

  useEffect(() => {
    if (!positioned.current || messages.isLoading || !room) return;
    const target = takeJump();
    if (target) void jumpTo(target);
  }, [takeJump, messages.isLoading, room, jumpTo]);

  // First view: a linked message, else the first unread one, else the newest.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (positioned.current || messages.isLoading || !element || !room) return;
    positioned.current = true;
    const hash = hashUsed.current ? "" : window.location.hash;
    hashUsed.current = true;
    const target = takeJump() ?? (hash.startsWith("#m-") ? hash.slice(3) : null);
    if (target) {
      void jumpTo(target);
      return;
    }
    const divider = unreadId ? document.getElementById("unread-divider") : null;
    if (divider) {
      divider.scrollIntoView({ block: "start" });
      stuck.current = element.scrollHeight - element.scrollTop - element.clientHeight < 160;
      setAtBottom(stuck.current);
    } else {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages.isLoading, room, unreadId, jumpTo, takeJump, tab]);

  // Keep the place when earlier messages are added above.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (anchor.current !== null && element) {
      element.scrollTop = element.scrollHeight - anchor.current;
      anchor.current = null;
    }
  }, [firstReal?.id]);

  useEffect(() => {
    const element = scroller.current;
    if (!element || !positioned.current) return;
    if (stuck.current) element.scrollTop = element.scrollHeight;
  }, [list.length, liveKey, filter, tab]);

  useEffect(() => {
    const viewport = scroller.current;
    const body = content.current;
    if (!viewport || !body || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (positioned.current && stuck.current) viewport.scrollTop = viewport.scrollHeight;
    });
    observer.observe(viewport);
    observer.observe(body);
    return () => observer.disconnect();
  }, [messages.isLoading, roomId, Boolean(room)]);

  useEffect(() => {
    if (lastSeq && stuck.current && document.visibilityState === "visible") markSeen();
  }, [lastSeq, tabNewest, markSeen]);

  useEffect(() => {
    if (lastFilter.current === filter) return;
    lastFilter.current = filter;
    setOlderDone(false);
    if (!pendingJump.current) {
      stuck.current = true;
      setAtBottom(true);
    }
  }, [filter]);

  const older = useCallback(async () => {
    if (loadingOlder) return;
    setLoadingOlder(true);
    const element = scroller.current;
    anchor.current = element ? element.scrollHeight - element.scrollTop : null;
    try {
      if ((await loadOlder(client, roomId, author)) < PAGE) setOlderDone(true);
    } catch (error) {
      anchor.current = null;
      toastError(error);
    } finally {
      setLoadingOlder(false);
    }
  }, [author, client, loadingOlder, roomId]);

  const ctx: MessageContext | null = useMemo(() => {
    if (!boot.data || !room) return null;
    const people = new Map(room.members.flatMap((row) => (row.kind === "person" ? [[row.accountId, row] as const] : [])));
    return {
      meId: boot.data.me.id,
      roomId: room.id,
      roomTitle: room.title,
      roomKind: room.kind,
      handles: new Set(room.members.map((row) => row.handle)),
      nodes,
      people,
      reactions: limitsOf(boot.data).reactions,
      pinned: new Set(room.pinned ?? []),
      onReply: (message: Message) => setReply(message),
      onJump: (messageId: string) => void jumpTo(messageId),
      onRetry: (message: Message) => sendMessage(resendInput(message)),
      onEdit: (message: Message) => {
        updateMessages(client, roomId, (list) => list.filter((row) => row.id !== message.id));
        setDraft({ nonce: Date.now(), body: message.body, private: message.private, files: messageFiles(message) });
        const quoted = message.data?.replyTo?.id;
        const target = quoted ? client.getQueryData<Message[]>(keys.messages(roomId, "all"))?.find((row) => row.id === quoted) : undefined;
        if (target) setReply(target);
      },
      inPlan,
      threadsOf: (message: Message) => attached.get(message.id) ?? [],
      helperOf: (nodeId: string) => threads.find((thread) => thread.helper?.id === nodeId),
      onHelper: (thread: HelperThread) => setHelper(thread),
      ...(isPeopleRoom(room)
        ? {
            tab,
            requestOf: (requestId: string) => requests.data?.find((row) => row.id === requestId),
            onShare: (message: Message, as: "me" | "lead") =>
              shareMessage(
                { messageId: message.id, as },
                {
                  onSuccess: () => toast(as === "lead" ? "Shared to the room through your lead." : "Shared to the room.", "ok"),
                  onError: toastError,
                },
              ),
            myLead: room.members.find((row): row is NodeMember => row.kind === "node" && row.accountId === boot.data!.me.id && row.lead)?.node ?? null,
            sharedCopyOf: (messageId: string) => sharedCopy(whole, messageId),
          }
        : {}),
    };
  }, [boot.data, room, jumpTo, sendMessage, client, roomId, inPlan, nodes, attached, threads, tab, requests.data, shareMessage, whole]);

  if (!boot.data || !ctx || !room) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        {boot.data && missingChecked.current && !boot.isFetching ? (
          <div className="text-center text-sm">
            This conversation is not available. <Link href="/chat" className="text-accent">Go back</Link>
          </div>
        ) : (
          <Spinner />
        )}
      </div>
    );
  }
  const me = boot.data.me;
  const limits = limitsOf(boot.data);
  const nodeMembers = room.members.filter((row): row is NodeMember => row.kind === "node");
  const people = room.members.filter((row): row is PersonMember => row.kind === "person");
  const others = people.filter((row) => row.accountId !== me.id);
  const dmNode: NodeFull | undefined = room.kind === "dm" ? boot.data.nodes.find((node) => node.id === nodeMembers[0]?.node.id) : undefined;
  const lead = nodeMembers.find((row) => row.lead)?.node;
  const myBusy = live.some((row) => ctx.nodes.get(row.nodeId)?.ownerId === me.id);
  const showLive = filter === "all" || filter === "nodes";
  // In a room with other people, my nodes' live replies show in the tab they answer in; others' only in the Room.
  const answeringIn = liveTab(timeline);
  const liveHere = isPeople ? live.filter((row) => (ctx.nodes.get(row.nodeId)?.ownerId === me.id ? answeringIn === tab : tab === "room")) : live;
  const whose = (accountId: string) => people.find((person) => person.accountId === accountId)?.name ?? "someone";
  // Who answers where, in a room with other people: said beside each node as it is mentioned.
  const nodeDetail = (row: NodeMember) =>
    !isPeople
      ? `${row.node.role}${row.accountId === me.id ? "" : ` · ${whose(row.accountId)}'s node`}`
      : row.accountId === me.id
        ? `${row.node.role} · ${row.lead ? "your lead: answers in the Room" : "yours: answers you in My crew"}`
        : `${row.node.role} · ${row.lead ? `${whose(row.accountId)}'s lead` : `${whose(row.accountId)}'s node: their lead answers`}`;
  const options: MentionOption[] = [
    ...nodeMembers
      .filter((row) => !isPeople || tab === "room" || row.accountId === me.id)
      .map((row) => ({ handle: row.handle, label: row.node.name, detail: nodeDetail(row), avatar: row.node.avatar, node: row.node })),
    ...(isPeople && tab === "crew" ? [] : others.map((row) => ({ handle: row.handle, label: row.name, detail: row.responsibility ?? "person", person: true }))),
    ...(isPeople ? (tab === "room" ? [{ handle: "leads", label: "Leads", detail: "@leads status: everyone's status card" }] : []) : nodeMembers.length > 1 ? [{ handle: "everyone", label: "Everyone", detail: "Every node in this conversation" }] : []),
  ];
  const attachHint =
    others.length > 0
      ? "Nodes read files only from their owner's messages. Others here see a file's name but cannot open it."
      : `${dmNode ? dmNode.name : "Your nodes"} read${dmNode ? "s" : ""} what you attach: the text of documents, and pictures when ${dmNode ? "its" : "their"} model can see images.`;
  const placeholder = dmNode ? `Message ${dmNode.name}` : room.kind === "crew" ? "Message your crew" : `Message ${room.title}`;
  const suggest = (text: string) => send.mutate({ body: text, private: isPeople && tab === "crew", clientId: crypto.randomUUID() });
  const filterInfo = FILTERS.find((row) => row.id === filter)!;

  const grouped = (message: Message, previous: Message | undefined) =>
    Boolean(
      previous &&
        previous.kind !== "status" &&
        message.kind === "text" &&
        !message.data?.replyTo &&
        previous.authorKind === message.authorKind &&
        previous.authorNodeId === message.authorNodeId &&
        previous.authorAccountId === message.authorAccountId &&
        Date.parse(message.createdAt) - Date.parse(previous.createdAt) < 5 * 60_000,
    );

  const resume = async () => {
    if (!dmNode) return;
    try {
      await api(`/api/node/nodes/${dmNode.id}`, { method: "PATCH", body: { status: "active" } });
      await client.invalidateQueries({ queryKey: keys.bootstrap });
      toast(`${dmNode.name} is back.`, "ok");
    } catch (error) {
      toastError(error);
    }
  };

  const exportRoom = () => {
    setMenu(false);
    void download(`/api/node/rooms/${room.id}/export`, `${room.title.replace(/[^\w.-]+/g, "-") || "conversation"}.md`).then(() => toast("Exported as Markdown.", "ok"), toastError);
  };

  return (
    <div className="chat-conversation relative flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-line bg-bg/95 px-3 py-3 md:gap-3 md:px-6 lg:pr-14">
        <IconButton label="Open conversations" className="chat-open-conversations relative md:hidden" onClick={() => window.dispatchEvent(new Event("node:open-chats"))}><ArrowLeft size={19} /></IconButton>
        {dmNode ? (
          <button type="button" className="shrink-0 rounded-full" title={`${dmNode.name}'s settings`} aria-label={`${dmNode.name}'s settings`} onClick={() => setPanel("settings")}>
            <NodeAvatar node={dmNode} size={36} thinking={live.some((row) => row.nodeId === dmNode.id)} dim={dmNode.status === "paused"} />
          </button>
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-raised text-muted"><Users size={18} strokeWidth={1.7} /></span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="min-w-0 truncate font-semibold"><button type="button" className="block max-w-full truncate text-left hover:text-accent" title={dmNode ? `${dmNode.name}'s settings` : "Conversation details"} onClick={() => setPanel("settings")}>{room.title}</button></h1>
          </div>
          <div className="flex min-w-0 items-center gap-1 text-xs text-muted">
            {dmNode ? (
              <button type="button" className="flex min-w-0 items-center gap-1 truncate text-left hover:text-ink" onClick={() => setPanel("settings")}>
                <span className="truncate">@{dmNode.slug} · {dmNode.role}</span>
                {dmNode.status === "paused" ? <span className="shrink-0 text-warn">· Paused</span> : null}
              </button>
            ) : (
              <>
                <button type="button" className="truncate text-left hover:text-ink" onClick={() => setPanel("settings")}>
                  {room.kind === "task"
                    ? "Helper room · read only"
                    : room.kind === "room"
                    ? `${people.length} ${people.length === 1 ? "person" : "people"} · ${nodeMembers.length} ${nodeMembers.length === 1 ? "node" : "nodes"}`
                    : `${nodeMembers.length} ${nodeMembers.length === 1 ? "node" : "nodes"}${lead ? ` · ${lead.name} leads` : ""}`}
                </button>
              </>
            )}
          </div>
        </div>
        {working || myBusy ? (
          <button
            type="button"
            onClick={() => void stopRoom()}
            disabled={stopping}
            aria-label="Stop this conversation's work"
            title="Stop this conversation's work"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-danger/40 px-2.5 text-xs font-medium text-danger transition hover:bg-danger/10 disabled:opacity-50"
          >
            {stopping ? <Spinner className="h-3.5 w-3.5" /> : <CircleStop size={16} aria-hidden />}
            <span className="hidden sm:inline">Stop</span>
          </button>
        ) : null}
        <IconButton label="Search this conversation" onClick={() => setSearching(!searching)} className={searching ? "bg-raised text-ink" : ""}>
          <Search size={18} />
        </IconButton>
        <div ref={menuBox} className="relative">
          <IconButton label="More" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)} className={`relative ${menu ? "bg-raised text-ink" : ""}`}>
            <Ellipsis size={18} />
            {filter !== "all" ? <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" /> : null}
          </IconButton>
          {menu ? (
            <div role="menu" className="absolute right-0 z-40 mt-1 w-60 rounded-2xl border border-line bg-panel p-1.5 shadow-2xl">
              <div className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Show</div>
              {FILTERS.map((row) => (
                <MenuItem key={row.id} checked={filter === row.id} onClick={() => (setFilter(row.id), setMenu(false))}>
                  <row.icon size={15} /> {row.label}
                </MenuItem>
              ))}
              <div className="my-1 border-t border-line" />
              <MenuItem onClick={() => (setPanel("pins"), setMenu(false))}>
                <Pin size={15} /> Pinned messages{room.pinned.length ? ` (${room.pinned.length})` : ""}
              </MenuItem>
              {isPeople ? (
                <>
                  <MenuItem onClick={() => (setPanel("request"), setMenu(false))}>
                    <Handshake size={15} /> Ask someone here…
                  </MenuItem>
                  <MenuItem onClick={() => (setPanel("trust"), setMenu(false))}>
                    <ShieldCheck size={15} /> What your lead may share
                  </MenuItem>
                </>
              ) : null}
              <Link href="/activity" role="menuitem" onClick={() => setMenu(false)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-raised"><Activity size={15} />Activity</Link>
              <MenuItem onClick={exportRoom}>
                <Download size={15} /> Export as Markdown
              </MenuItem>
              <MenuItem onClick={() => (setPanel("settings"), setMenu(false))}>
                <Settings2 size={15} /> {room.kind === "dm" ? "Node settings" : room.kind === "crew" ? "Crew settings" : room.kind === "task" ? "About this helper" : "Room settings"}
              </MenuItem>
              <div className="my-1 border-t border-line" />
              <MenuItem tone="danger" onClick={() => (setMenu(false), void stopRoom())}>
                <CircleStop size={15} /> Stop this conversation&apos;s work
              </MenuItem>
            </div>
          ) : null}
        </div>
      </header>
      {isPeople ? (
        <div role="tablist" aria-label="Room or My crew" className="flex shrink-0 items-end gap-1 border-b border-line bg-bg/95 px-3 md:px-6">
          {TABS.map((row) => {
            const count = row.id === tab ? 0 : tabCounts[row.id];
            return (
              <button
                key={row.id}
                id={`tab-${row.id}`}
                type="button"
                role="tab"
                aria-selected={tab === row.id}
                aria-controls="room-timeline"
                title={row.title}
                onClick={() => showTab(row.id)}
                className={`relative inline-flex items-center gap-1.5 px-3 pb-2 pt-2.5 text-sm transition ${tab === row.id ? "font-medium text-ink" : "text-muted hover:text-ink"}`}
              >
                {row.id === "room" ? <Users size={14} aria-hidden /> : <Lock size={14} className={tab === row.id ? "text-private" : ""} aria-hidden />}
                {row.label}
                {count ? (
                  <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold leading-4 text-accent-ink" aria-label={`${count} unread`}>
                    {count}
                  </span>
                ) : null}
                {tab === row.id ? <span className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full ${row.id === "crew" ? "bg-private" : "bg-accent"}`} aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {searching ? (
        <div className="scroll-thin max-h-[55vh] overflow-y-auto border-b border-line bg-panel/80 px-3 py-3 md:px-5">
          <SearchPanel
            roomId={room.id}
            onClose={() => setSearching(false)}
            onPick={(result) => {
              setSearching(false);
              void jumpTo(result.message.id);
            }}
          />
        </div>
      ) : null}
      <PinnedBar room={room} ctx={ctx} onAll={() => setPanel("pins")} />
      <WorkStrip items={board} helpers={helperRows} onJump={(messageId) => void jumpTo(messageId)} onCard={setCardId} onHelper={setHelper} />
      {filter !== "all" ? (
        <div className="flex items-center justify-center gap-2 border-b border-line bg-accent/5 px-3 py-1.5 text-xs">
          <filterInfo.icon size={13} className="text-accent" /> Showing {filterInfo.label.toLowerCase()}
          <button type="button" className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-muted hover:bg-raised hover:text-ink" onClick={() => setFilter("all")}>
            <X size={12} /> Show everything
          </button>
        </div>
      ) : null}

      <div
        ref={scroller}
        onScroll={(event) => {
          const element = event.currentTarget;
          const near = element.scrollHeight - element.scrollTop - element.clientHeight < 160;
          stuck.current = near;
          if (near !== atBottom) setAtBottom(near);
          if (near && lastSeq) markSeen();
          if (element.scrollTop < 40 && hasOlder && positioned.current && !pendingJump.current) void older();
        }}
        className="chat-timeline scroll-thin min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain"
        aria-live="polite"
        aria-relevant="additions"
        {...(isPeople ? { id: "room-timeline", role: "tabpanel", "aria-labelledby": `tab-${tab}` } : {})}
      >
        <div ref={content} className="mx-auto w-full max-w-[840px] px-4 pb-8 pt-5 md:px-8">
          {hasOlder ? (
            <div className="flex justify-center pb-2">
              <button type="button" onClick={() => void older()} disabled={loadingOlder} className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-xs text-muted hover:text-ink disabled:opacity-60">
                {loadingOlder ? <Spinner className="h-3 w-3" /> : null} Load earlier messages
              </button>
            </div>
          ) : null}
          {messages.isLoading ? (
            <div className="flex justify-center py-10 text-muted">
              <Spinner />
            </div>
          ) : messages.error && !loaded.length ? (
            <div className="py-10 text-center text-sm text-muted">
              {messages.error.message}{" "}
              <button className="text-accent" onClick={() => void messages.refetch()}>
                Try again
              </button>
            </div>
          ) : !list.length && filter !== "all" ? (
            <p className="py-16 text-center text-sm text-muted">{filterInfo.empty}</p>
          ) : !list.length && isPeople ? (
            <PeopleEmpty tab={tab} title={room.title} onSuggest={suggest} disabled={!me.verified} />
          ) : !list.length ? (
            <div className="flex flex-col items-center py-16 text-center">
              {dmNode ? (
                <NodeAvatar node={dmNode} size={64} />
              ) : (
                <span className="flex -space-x-3">
                  {nodeMembers.slice(0, 5).map((row) => (
                    <NodeAvatar key={row.id} node={row.node} size={48} />
                  ))}
                </span>
              )}
              <h2 className="mt-4 text-xl font-semibold">{dmNode ? `Say hi to ${dmNode.name}` : `Welcome to ${room.title}`}</h2>
              <p className="mt-2 max-w-md text-sm text-muted">
                {dmNode
                  ? dmNode.role
                  : room.kind === "crew"
                    ? "Your team, in one conversation."
                    : room.kind === "task"
                      ? "A node and the helper it brought in for one task."
                      : "People and their nodes, together."}
              </p>
              <div className="mt-5 flex max-w-xl flex-wrap justify-center gap-2">
                {SUGGESTIONS[room.kind].map((text) => (
                  <button key={text} onClick={() => send.mutate({ body: text, private: false, clientId: crypto.randomUUID() })} disabled={!me.verified} className="rounded-full border border-line bg-panel px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-ink disabled:opacity-50">
                    {text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            days.map((day) => (
              <section key={day.key} aria-label={day.label}>
                <div className="sticky top-1 z-10 my-3 flex justify-center" role="separator">
                  <span className="rounded-full border border-line bg-panel/90 px-3 py-0.5 text-[11px] font-medium text-muted shadow-sm backdrop-blur">{day.label}</span>
                </div>
                {day.items.map((message, index) => {
                  const previous = day.items[index - 1];
                  const divider = message.id === unreadId;
                  return (
                    <Fragment key={message.clientId ?? message.id}>
                      {divider ? (
                        <div id="unread-divider" className="my-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-accent" role="separator">
                          <span className="h-px flex-1 bg-accent/40" /> New messages <span className="h-px flex-1 bg-accent/40" />
                        </div>
                      ) : null}
                      <MessageItem message={message} ctx={ctx} grouped={!divider && grouped(message, previous)} highlighted={highlight === message.id} fresh={message.sending || message.seq > (opened.current?.last ?? lastSeq)} />
                    </Fragment>
                  );
                })}
              </section>
            ))
          )}

          {showLive
            ? liveHere.map((row) => {
                const node = ctx.nodes.get(row.nodeId);
                return (
                  <div key={row.nodeId} className="mt-4 flex gap-3">
                    <NodeAvatar node={node} size={32} thinking />
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 text-sm">
                        <span className="font-semibold">{node?.name ?? "A node"}</span> <span className="ml-1 text-xs text-muted">{row.text ? "Writing…" : "Thinking…"}</span>
                      </div>
                      {row.tools.length ? (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {row.tools.slice(-2).map((tool, at) => (
                            <span key={at} className="inline-flex items-center gap-1 rounded-lg border border-line bg-bg px-2 py-0.5 text-xs text-muted">
                              <ToolIcon name={tool.name} />
                              {TOOL_LABEL(tool.name)}
                              {tool.state === "awaiting_approval" ? " · needs you" : ""}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {row.text ? (
                        <div className="opacity-80">
                          <RichText text={row.text} handles={ctx.handles} refs={row.refs ?? []} showIds={row.showIds === true} streaming />
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
              })
            : null}
        </div>
      </div>

      <div className="relative">
      {dmNode?.status === "paused" ? (
        <div className="mx-auto flex w-full max-w-[840px] items-center gap-2 px-4 pb-1 text-xs text-muted md:px-8" role="status">
          <Pause size={13} className="shrink-0 text-warn" />
          <span className="min-w-0 flex-1">{dmNode.name} is paused. Your next message wakes it.</span>
          <button type="button" className="shrink-0 rounded-lg px-2 py-1 text-accent hover:bg-raised" onClick={() => void resume()}>
            Resume
          </button>
        </div>
      ) : null}
      {!atBottom ? (
        <button
          type="button"
          onClick={() => {
            stuck.current = true;
            setAtBottom(true);
            scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
          }}
          className="absolute -top-12 right-5 z-20 inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-panel px-3 text-sm shadow-xl hover:bg-raised md:right-8"
          aria-label={newBelow ? `Jump to the latest: ${newBelow} new` : "Jump to the latest"}
        >
          <ArrowDown size={16} />
          {newBelow ? <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-ink">{newBelow}</span> : null}
        </button>
      ) : null}

      {room.kind === "task" ? (
        <HelperRoomNote room={room} boot={boot.data} />
      ) : (
      <Composer
        key={`${me.id}:${roomId}${isPeople ? `:${tab}` : ""}`}
        draftKey={`${me.id}:${roomId}${isPeople ? `:${tab}` : ""}`}
        options={options}
        placeholder={placeholder}
        privatePlaceholder={isPeople ? (tab === "crew" ? "Ask your nodes" : "Ask your nodes privately") : undefined}
        privacy={isPeople ? (tab === "crew" ? "private" : "choice") : "none"}
        extra={
          isPeople && tab === "room" && others.length ? (
            <button type="button" aria-label="Ask someone here…" title="Ask someone here: a question, a share, a review or work, through their lead" onClick={() => setPanel("request")} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-raised hover:text-ink">
              <Handshake size={17} />
            </button>
          ) : null
        }
        busy={myBusy}
        disabled={!me.verified}
        disabledReason={
          <span>
            <Lock size={12} className="mr-1 inline" />
            Verify your email to talk to nodes. <Link href="/welcome" className="text-accent">Verify now</Link>
          </span>
        }
        reply={reply ? { id: reply.id, author: authorLabel(reply, ctx), excerpt: messagePreview(reply).slice(0, 160), private: reply.private } : null}
        onCancelReply={() => setReply(null)}
        attachHint={attachHint}
        draft={draft}
        onSend={(body, isPrivate, files) => {
          stuck.current = true;
          setAtBottom(true);
          if (filter !== "all" && filter !== "people") setFilter("all");
          const privately = isPrivate || (isPeople && tab === "crew");
          send.mutate({ body, private: privately, clientId: crypto.randomUUID(), ...(reply ? { replyTo: replyOf(reply, ctx) } : {}), ...(files.length ? { files } : {}) });
          setReply(null);
          // Asking my nodes from the Room: the question and its answer are in My crew.
          if (isPeople && tab === "room" && privately) showTab("crew", "bottom");
        }}
        onStop={() => void stopRoom()}
      />
      )}
      </div>
      <RoomSettings
        key={room.id + room.title}
        room={room}
        boot={boot.data}
        open={panel === "settings"}
        onClose={() => setPanel(null)}
        onExport={exportRoom}
        onPanel={(next) => setPanel(next)}
        onJump={(messageId) => {
          setPanel(null);
          void jumpTo(messageId);
        }}
      />
      {isPeople ? (
        <>
          <TrustSheet room={room} meId={me.id} open={panel === "trust"} onClose={() => setPanel(null)} />
          <RequestForm key={room.id} room={room} meId={me.id} open={panel === "request"} onClose={() => setPanel(null)} onMade={(request) => (request.cardId ? setTimeout(() => void jumpTo(request.cardId!), 300) : undefined)} />
        </>
      ) : null}
      <PinsDrawer room={room} ctx={ctx} open={panel === "pins"} onClose={() => setPanel(null)} max={limits.pins} />
      <Drawer open={Boolean(helper)} onClose={() => setHelper(null)} title={helper ? threadLabel(helper, false).split(" · ")[0]! : "Helper"}>
        {helper ? <HelperThreadView thread={helper} /> : null}
      </Drawer>
      <Drawer open={Boolean(cardId)} onClose={() => setCardId(null)} title="Routine run">
        {cardId ? <DetachedCard planId={cardId} ctx={ctx} /> : null}
      </Drawer>
    </div>
  );
}

/** A card that is not in the timeline (a routine run's), read with its step cards and shown on its own. */
function DetachedCard({ planId, ctx }: { planId: string; ctx: MessageContext }) {
  const plan = usePlan(planId);
  if (plan.isLoading) {
    return (
      <div className="flex justify-center py-6 text-muted">
        <Spinner />
      </div>
    );
  }
  if (!plan.data) return <p className="text-sm text-muted">{plan.error?.message ?? "This run's card is not available."} Its routine lists it under Routines.</p>;
  return <PlanCard message={plan.data.message} ctx={{ ...ctx, inPlan: new Map([[planId, plan.data.runs]]) }} detached />;
}

/** A helper's room is read-only: the owner talks to the node that made the helper, in its chat (or to the helper's own chat once kept). */
function HelperRoomNote({ room, boot }: { room: Room; boot: Bootstrap }) {
  const thread = helperThread(room);
  const helper = thread?.helper;
  const parent = boot.nodes.find((node) => node.id === thread?.parent?.id);
  const keptNode = helper ? boot.nodes.find((node) => node.id === helper.id) : undefined;
  const dmOf = (nodeId: string) => boot.rooms.find((row) => row.kind === "dm" && row.members.some((member) => member.kind === "node" && member.node.id === nodeId));
  if (keptNode) {
    const chat = dmOf(keptNode.id);
    return (
      <div className="border-t border-line bg-panel/80 px-4 py-3 text-sm text-muted md:px-6">
        <Lock size={13} className="mr-1.5 inline" />
        You kept @{keptNode.slug} as a node; this room is its history.{" "}
        {chat ? <Link href={`/r/${chat.id}`} className="text-accent">Talk to {keptNode.name}</Link> : null}
      </div>
    );
  }
  const dm = parent ? dmOf(parent.id) : undefined;
  return (
    <div className="border-t border-line bg-panel/80 px-4 py-3 text-sm text-muted md:px-6">
      <Lock size={13} className="mr-1.5 inline" />
      {parent ? <>@{parent.slug} brought in {helper ? `@${helper.slug}` : "a helper"} for one task and tells you what it finds. You read along here; to steer it, </> : "You read along here. "}
      {dm ? <Link href={`/r/${dm.id}`} className="text-accent">talk to {parent!.name}</Link> : "talk to its node"}.
      {" "}It goes after 3 quiet days.
    </div>
  );
}
