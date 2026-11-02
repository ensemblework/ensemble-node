"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Activity as ActivityIcon, Ellipsis, Inbox, Lock, Menu, Palette, PanelLeftClose, PanelLeftOpen, Plug, Repeat, Search, Settings, SquarePen, SquareTerminal } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { requestJump } from "@/lib/jump";
import { loginPath, rememberNext } from "@/lib/next-path";
import { useBusyNodes } from "@/lib/live";
import { keys, useActivity, useBootstrap, useMe, useNodeEvents } from "@/lib/hooks";
import { messagePreview } from "@/lib/chat";
import { recentConversations, roomKindName, waitingRooms, type ConversationFilter } from "@/lib/conversations";
import { toastError } from "@/lib/toast";
import { ago } from "@/lib/text";
import { nodeIsResting } from "@/lib/node-life";
import { SIDEBAR_MAX, SIDEBAR_MIN } from "@/lib/sidebar";
import type { Bootstrap, Room } from "@/lib/types";
import { Mark } from "./brand";
import { SearchPanel } from "./chat/search";
import { NodeAvatar, PersonAvatar } from "./node-avatar";
import { NodeLifeProvider, useNodeVisits } from "./node-life";
import { RoomAvatar } from "./room-avatar";
import { SidebarFrame, useSidebarWidth } from "./sidebar-frame";
import { Drawer, IconButton, Spinner, Toaster, useDismiss } from "./ui";

export function dmRoomOf(boot: Bootstrap | undefined, nodeId: string): Room | undefined {
  return boot?.rooms.find((room) => room.kind === "dm" && room.members.some((member) => member.kind === "node" && member.node.id === nodeId));
}

/** A conversation in the list. `waiting`: how many things wait for me there (its cards, runs that wait on my answer): a "needs you" dot. */
function RoomRow({ room, boot, busy, active, waiting = 0, compact = false, onNavigate }: { room: Room; boot: Bootstrap; busy: Set<string>; active: boolean; waiting?: number; compact?: boolean; onNavigate?: () => void }) {
  const life = useNodeVisits();
  const thinking = room.members.some(member => member.kind === "node" && busy.has(member.node.id));
  const preview = thinking ? "Thinking…" : room.last ? `${room.last.failed ? "Not sent · " : room.last.sending ? "Sending · " : ""}${messagePreview(room.last)}` : "Start a conversation";
  let icon: ReactNode;
  let title = room.title;
  if (room.kind === "dm") {
    const member = room.members.find((row) => row.kind === "node");
    const node = boot.nodes.find((row) => member?.kind === "node" && row.id === member.node.id);
    icon = <NodeAvatar node={node} size={38} resting={life.ready && !active && !thinking && node?.status !== "paused" && nodeIsResting(room.lastMessageAt, node ? life.visits[node.id] : undefined, Date.now())} dim={node?.status === "paused"} />;
    if (node) title = `${node.name} (@${node.slug})${node.status === "paused" ? " · paused" : ""}`;
  } else {
    icon = <RoomAvatar room={room} size={38} busy={busy} />;
  }
  const needs = waiting ? `${waiting === 1 ? "Something waits" : `${waiting} things wait`} for you here` : null;
  return (
    <Link href={`/r/${room.id}`} onClick={onNavigate} title={needs ? `${title} · ${needs}` : title} aria-label={`${room.title}${room.unread ? `, ${room.unread} unread` : ""}${waiting ? ", needs you" : ""}`} aria-current={active ? "page" : undefined}
      data-conversation={room.id} data-needs-you={waiting || undefined} className={`chat-room-row relative flex items-center gap-3 rounded-xl ${compact ? "justify-center px-1 py-2" : "px-3 py-3"} ${active ? "bg-raised" : "hover:bg-raised/60"}`}>
      {icon}
      {compact && waiting ? <span className="absolute bottom-1.5 right-1 size-2.5 rounded-full bg-warn ring-2 ring-panel" aria-hidden /> : null}
      {!compact ? <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className={`truncate text-sm ${room.unread ? "font-semibold" : "font-medium"}`}>{room.title}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            {waiting ? <span className="inline-flex items-center gap-1 text-[10px] font-medium text-warn" aria-hidden><span className="size-2 rounded-full bg-warn" />needs you</span> : null}
            <span className="text-[11px] text-muted">{ago(room.lastMessageAt)}</span>
          </span>
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className={`flex min-w-0 items-center gap-1.5 truncate text-xs ${room.last?.failed ? "text-danger" : thinking ? "text-accent" : "text-muted"}`}>
            {room.last?.private && !thinking ? <Lock size={10} className="shrink-0" /> : null}
            {room.kind !== "dm" ? <span className="shrink-0 text-[10px] text-muted">{roomKindName(room.kind)} ·</span> : null}
            <span className="truncate">{preview}</span>
          </span>
          {room.unread ? <span className="shrink-0 rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-ink">{room.unread}</span> : null}
        </span>
      </span> : room.unread ? <span className="absolute right-1 top-1 size-2 rounded-full bg-accent ring-2 ring-panel" /> : null}
    </Link>
  );
}

function NavLink({ href, icon: Icon, label, badge, active, compact, onNavigate }: { href: string; icon: typeof Inbox; label: string; badge?: number; active: boolean; compact?: boolean; onNavigate?: () => void }) {
  return (
    <Link href={href} onClick={onNavigate} aria-label={label} title={compact ? label : undefined} aria-current={active ? "page" : undefined} className={`relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm ${compact ? "justify-center" : ""} ${active ? "bg-raised font-medium" : "text-muted hover:bg-raised/60 hover:text-ink"}`}>
      <Icon size={16} className="shrink-0" />
      {!compact ? <span className="flex-1 truncate">{label}</span> : null}
      {badge ? <span className={compact ? "absolute right-1 top-1 size-2 rounded-full bg-accent" : "rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-ink"}>{compact ? null : badge}</span> : null}
    </Link>
  );
}

function SidebarWorkspace({ boot, compact, waiting, onNavigate, width, onWidth }: { boot: Bootstrap; compact: boolean; waiting: number; onNavigate?: () => void; width?: number; onWidth?: (value: number) => void }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, ref);
  useEffect(() => {
    if (open) ref.current?.querySelector<HTMLAnchorElement>("nav a")?.focus();
  }, [open]);
  const navigate = () => { setOpen(false); onNavigate?.(); };
  return (
    <div ref={ref} className="relative shrink-0 border-t border-line p-2" onKeyDown={event => { if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); trigger.current?.focus(); } }}>
      {open ? <nav id={id} aria-label="Workspace" className={`scroll-thin absolute bottom-full left-2 z-40 mb-2 max-h-[65dvh] overflow-y-auto rounded-2xl border border-line bg-panel p-1.5 shadow-xl ${compact ? "w-60" : "right-2"}`}>
        <div className="px-2.5 py-2 text-[11px] font-medium text-muted">Workspace</div>
        <NavLink href="/routines" icon={Repeat} label="Routines" active={pathname === "/routines"} onNavigate={navigate} />
        <NavLink href="/sessions" icon={SquareTerminal} label="Sessions" active={pathname === "/sessions"} onNavigate={navigate} />
        <NavLink href="/requests" icon={Inbox} label="Invites" badge={boot.invites?.length ?? 0} active={pathname === "/requests"} onNavigate={navigate} />
        <NavLink href="/connections" icon={Plug} label="Connections" active={pathname === "/connections"} onNavigate={navigate} />
        <NavLink href="/activity" icon={ActivityIcon} label="Activity" badge={waiting} active={pathname === "/activity"} onNavigate={navigate} />
        <div className="my-1 border-t border-line" />
        <NavLink href="/settings#appearance" icon={Palette} label="Appearance" active={false} onNavigate={navigate} />
        <NavLink href="/settings" icon={Settings} label="Settings" active={pathname === "/settings"} onNavigate={navigate} />
        {width !== undefined && onWidth ? <label className="mt-1 flex items-center justify-between gap-2 border-t border-line px-2.5 py-2 text-xs text-muted">
          Sidebar width
          <select aria-label="Sidebar width" value={width} onChange={event => onWidth(Number(event.target.value))} className="min-w-0 rounded-lg border border-line bg-bg p-1.5 text-xs text-ink">
            {![SIDEBAR_MIN, 288, 360, SIDEBAR_MAX].includes(width) ? <option value={width}>Custom</option> : null}
            <option value={SIDEBAR_MIN}>Compact</option><option value={288}>Comfortable</option><option value={360}>Wide</option><option value={SIDEBAR_MAX}>Extra wide</option>
          </select>
        </label> : null}
      </nav> : null}
      <button ref={trigger} type="button" aria-label="Workspace menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)} className={`relative flex min-h-12 w-full min-w-0 items-center gap-2.5 rounded-xl hover:bg-raised ${compact ? "justify-center" : "px-2"}`}>
        <PersonAvatar name={boot.me.name || boot.me.email} size={30} />
        {!compact ? <><span className="min-w-0 flex-1 truncate text-left text-sm font-medium">{boot.me.name || boot.me.email}</span><Ellipsis size={18} className="shrink-0 text-muted" aria-hidden /></> : null}
        {boot.invites?.length || waiting ? <span className="absolute right-2 top-1 size-2 rounded-full bg-accent" aria-hidden /> : null}
      </button>
    </div>
  );
}

function Sidebar({ boot, onNavigate, onSearch, waiting, compact = false, onCollapse, width, onWidth }: { boot: Bootstrap; onNavigate?: () => void; onSearch: () => void; waiting: ReadonlyMap<string, { count: number }>; compact?: boolean; onCollapse?: () => void; width?: number; onWidth?: (value: number) => void }) {
  const pathname = usePathname();
  const busy = useBusyNodes();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const rooms = recentConversations(boot.rooms, compact ? "all" : filter, compact ? "" : query);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`flex shrink-0 items-center gap-1 pb-3 pt-4 ${compact ? "flex-col px-2" : "px-4"}`}>
        {!compact && onCollapse ? <Link href="/chat" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2 text-lg font-semibold"><Mark size={23} />Chats</Link> : null}
        {onCollapse ? <IconButton label={compact ? "Expand conversations" : "Collapse conversations"} onClick={onCollapse}>{compact ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}</IconButton> : null}
        <Link href="/new" onClick={onNavigate} title="New conversation" aria-label="New conversation" className={`inline-flex shrink-0 items-center rounded-xl text-muted hover:bg-raised hover:text-ink ${compact || onCollapse ? "size-9 justify-center" : "flex-1 gap-2 px-3 py-2 text-sm"}`}><SquarePen size={18} />{!compact && !onCollapse ? "New conversation" : null}</Link>
        <IconButton label="Search messages" onClick={onSearch}><Search size={18} /></IconButton>
      </div>
      {!compact ? <div className="space-y-3 px-4 pb-3">
        <label className="flex items-center gap-2 rounded-xl border border-line bg-bg/70 px-3 py-2 text-muted"><Search size={15} className="shrink-0" /><input aria-label="Filter conversations" placeholder="Search chats" value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted" /></label>
        <div className="flex gap-1.5" role="group" aria-label="Conversation filters">{([["all", "All"], ["unread", "Unread"], ["groups", "Groups"]] as const).map(([id, title]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={`min-h-8 rounded-lg px-3 py-1 text-xs font-medium transition-colors ${filter === id ? "bg-raised text-ink" : "text-muted hover:bg-raised"}`}>{title}</button>)}</div>
      </div> : null}
      <nav className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-4" aria-label="Conversations">
        {rooms.map(room => <RoomRow key={room.id} room={room} boot={boot} busy={busy} compact={compact} waiting={waiting.get(room.id)?.count ?? 0} active={pathname === `/r/${room.id}`} onNavigate={onNavigate} />)}
        {!rooms.length && !compact ? <p className="px-3 py-6 text-center text-xs text-muted">{query ? "No matching chats." : filter === "unread" ? "All caught up." : filter === "groups" ? "No groups yet." : "Your conversations will appear here."}</p> : null}
      </nav>

      <SidebarWorkspace boot={boot} compact={compact} waiting={waiting.size} onNavigate={onNavigate} width={width} onWidth={onWidth} />
    </div>
  );
}

function useNavigationPreference(key: string, initial: boolean) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) setValue(stored === "true");
    } catch (error) { toastError(error); }
  }, [key]);
  const toggle = () => {
    const next = !value;
    setValue(next);
    try { localStorage.setItem(key, String(next)); } catch (error) { toastError(error); }
  };
  return [value, toggle] as const;
}

/** Conversations and one focused surface. Questions stay in the chat; Activity has its own page. */
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const client = useQueryClient();
  const me = useMe();
  const signedIn = Boolean(me.data);
  const boot = useBootstrap(signedIn);
  const activity = useActivity();
  const [menu, setMenu] = useState(false);
  const [collapsed, toggleCollapsed] = useNavigationPreference("node.sidebar-collapsed", false);
  const [width, setWidth] = useSidebarWidth();
  const [search, setSearch] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const ready = Boolean(boot.data);
  useNodeEvents(signedIn);

  useEffect(() => {
    const element = frame.current;
    const viewport = window.visualViewport;
    if (!element || !viewport) return;
    const update = () => {
      // Mobile keyboards resize the visual viewport, not necessarily CSS dvh.
      if (window.innerWidth < 768 && viewport.scale === 1) element.style.setProperty("--node-viewport-height", `${viewport.height}px`);
      else element.style.removeProperty("--node-viewport-height");
    };
    update();
    viewport.addEventListener("resize", update);
    window.addEventListener("resize", update);
    return () => {
      viewport.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
    };
  }, [ready]);

  // Not signed in: sign in, then come back here (a card's link opened on a phone, with its hash).
  const toLogin = () => {
    const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    rememberNext(here);
    router.replace(loginPath(here));
  };
  const toLoginRef = useRef(toLogin);
  toLoginRef.current = toLogin;
  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) toLoginRef.current();
  }, [me.error, router]);
  useEffect(() => {
    if (boot.error instanceof ApiError && boot.error.status === 401) {
      void client.invalidateQueries({ queryKey: keys.me });
      toLoginRef.current();
    }
  }, [boot.error, client, router]);
  useEffect(() => {
    if (boot.data && !boot.data.nodes.length && !boot.data.rooms.length && pathname === "/chat") router.replace("/welcome");
  }, [boot.data, pathname, router]);
  useEffect(() => setMenu(false), [pathname]);
  useEffect(() => {
    const desktop = matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => { if (desktop.matches) setMenu(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearch((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    const openChats = () => setMenu(true);
    window.addEventListener("node:open-chats", openChats);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("node:open-chats", openChats); };
  }, []);

  if (!boot.data) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 text-muted">
        {boot.error && !(boot.error instanceof ApiError && boot.error.status === 401) ? (
          <>
            <p className="text-sm">{boot.error.message}</p>
            <button className="text-sm text-accent" onClick={() => void boot.refetch()}>
              Try again
            </button>
          </>
        ) : (
          <Spinner />
        )}
      </div>
    );
  }
  const waiting = activity.data?.approvals.length ?? 0;
  // Every question waits in its own conversation: the list marks those conversations.
  const waitingIn = waitingRooms(activity.data?.approvals, activity.data?.runs);
  const openSearch = () => {
    setMenu(false);
    setSearch(true);
  };

  return (
    <NodeLifeProvider key={boot.data.me.id} accountId={boot.data.me.id}>
    <div ref={frame} data-needs-you={waitingIn.size > 0} className="chat-shell flex overflow-hidden" style={{ height: "var(--node-viewport-height, 100dvh)" }}>
      <a href="#main-content" className="skip-link">Skip to conversation</a>
      <SidebarFrame collapsed={collapsed} width={width} onWidth={setWidth}>
        <Sidebar boot={boot.data} compact={collapsed} onCollapse={toggleCollapsed} onSearch={openSearch} waiting={waitingIn} width={width} onWidth={setWidth} />
      </SidebarFrame>
      <Drawer open={menu} onClose={() => setMenu(false)} title="Chats" side="left"><Sidebar boot={boot.data} onNavigate={() => setMenu(false)} onSearch={openSearch} waiting={waitingIn} /></Drawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className={`${pathname.startsWith("/r/") ? "hidden" : "flex"} shrink-0 items-center justify-between border-b border-line px-2 py-1.5 md:hidden`}>
          <IconButton label="Menu" onClick={() => setMenu(true)} className="relative">
            <Menu size={18} />
            {waitingIn.size ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-warn" /> : boot.data.invites?.length ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent" /> : null}
          </IconButton>
          <Link href="/chat" className="flex items-center gap-1.5 text-sm font-semibold">
            <Mark size={20} /> Node
          </Link>
          <span className="flex items-center">
            <IconButton label="Search" onClick={openSearch}>
              <Search size={18} />
            </IconButton>
            <Link href="/activity" className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-raised" aria-label="Activity">
              <ActivityIcon size={18} />
              {waiting ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-warn" /> : null}
            </Link>
          </span>
        </div>
        <div className="relative flex min-h-0 flex-1">
          <main id="main-content" tabIndex={-1} className="min-h-0 min-w-0 flex-1 overflow-hidden outline-none">{children}</main>
        </div>
      </div>

      <Drawer open={search} onClose={() => setSearch(false)} title="Search" side="top">
        <SearchPanel
          onClose={() => setSearch(false)}
          onPick={({ message, room }) => {
            setSearch(false);
            requestJump(room.id, message.id);
            router.push(`/r/${room.id}#m-${message.id}`);
          }}
        />
      </Drawer>
      <Toaster />
    </div>
    </NodeLifeProvider>
  );
}

export function PrivateBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-private">
      <Lock size={11} /> only you
    </span>
  );
}
