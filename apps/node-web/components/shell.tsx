"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Activity as ActivityIcon, Inbox, Laptop, Lock, Menu, MessageCircle, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plug, Search, Settings, SquarePen, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { requestJump } from "@/lib/jump";
import { useBusyNodes } from "@/lib/live";
import { keys, useActivity, useApprovals, useBootstrap, useDecisions, useMe, useNodeEvents } from "@/lib/hooks";
import { modelName, shortModelName } from "@/lib/models";
import { messagePreview } from "@/lib/chat";
import { recentConversations, roomKindName, type ConversationFilter } from "@/lib/conversations";
import { toastError } from "@/lib/toast";
import { ago } from "@/lib/text";
import type { Bootstrap, Room } from "@/lib/types";
import { ActivityPanel } from "./activity";
import { Mark } from "./brand";
import { SearchPanel } from "./chat/search";
import { DefaultNodeModel, NodeAvatar, PersonAvatar } from "./node-avatar";
import { Drawer, IconButton, Spinner, Toaster } from "./ui";

export function dmRoomOf(boot: Bootstrap | undefined, nodeId: string): Room | undefined {
  return boot?.rooms.find((room) => room.kind === "dm" && room.members.some((member) => member.kind === "node" && member.node.id === nodeId));
}

function RoomRow({ room, boot, busy, active, compact = false, onNavigate }: { room: Room; boot: Bootstrap; busy: Set<string>; active: boolean; compact?: boolean; onNavigate?: () => void }) {
  const thinking = room.members.some(member => member.kind === "node" && busy.has(member.node.id));
  const preview = thinking ? "Thinking…" : room.last ? `${room.last.failed ? "Not sent · " : room.last.sending ? "Sending · " : ""}${messagePreview(room.last)}` : "Start a conversation";
  let icon: ReactNode;
  let title = room.title;
  if (room.kind === "dm") {
    const member = room.members.find((row) => row.kind === "node");
    const node = boot.nodes.find((row) => member?.kind === "node" && row.id === member.node.id);
    icon = <NodeAvatar node={node} size={38} thinking={thinking} dim={node?.status === "paused"} />;
    if (node) title = `${node.name} (@${node.slug}) · ${modelName(boot.models.options, node.provider, node.model, boot.models.default)}`;
  } else {
    icon = <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[13px] border border-line bg-raised text-muted"><Users size={18} strokeWidth={1.7} /></span>;
  }
  return (
    <Link href={`/r/${room.id}`} onClick={onNavigate} title={title} aria-label={`${room.title}${room.unread ? `, ${room.unread} unread` : ""}`} aria-current={active ? "page" : undefined}
      data-conversation={room.id} className={`chat-room-row relative flex items-center gap-3 rounded-2xl ${compact ? "justify-center px-1 py-2" : "px-3 py-3"} ${active ? "bg-accent/10" : "hover:bg-raised/70"}`}>
      {icon}
      {!compact ? <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className={`truncate text-sm ${room.unread ? "font-semibold" : "font-medium"}`}>{room.title}</span>
          <span className="shrink-0 text-[11px] text-muted">{ago(room.lastMessageAt)}</span>
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

function Sidebar({ boot, onNavigate, onSearch, needsMe, compact = false, onCollapse }: { boot: Bootstrap; onNavigate?: () => void; onSearch: () => void; needsMe: number; compact?: boolean; onCollapse?: () => void }) {
  const pathname = usePathname();
  const busy = useBusyNodes();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const rooms = recentConversations(boot.rooms, compact ? "all" : filter, compact ? "" : query);
  return (
    <div className="scroll-thin flex h-full min-h-0 flex-col overflow-y-auto">
      <div className={`flex shrink-0 items-center gap-1 pb-3 pt-4 ${compact ? "flex-col px-2" : "px-4"}`}>
        {!compact && onCollapse ? <Link href="/chat" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2 text-lg font-semibold"><Mark size={23} />Chats</Link> : null}
        {onCollapse ? <IconButton label={compact ? "Expand conversations" : "Collapse conversations"} onClick={onCollapse}>{compact ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}</IconButton> : null}
        <Link href="/new" onClick={onNavigate} title="New conversation" aria-label="New conversation" className={`inline-flex shrink-0 items-center rounded-xl text-muted hover:bg-raised hover:text-ink ${compact || onCollapse ? "size-9 justify-center" : "flex-1 gap-2 px-3 py-2 text-sm"}`}><SquarePen size={18} />{!compact && !onCollapse ? "New conversation" : null}</Link>
        <IconButton label="Search messages" onClick={onSearch}><Search size={18} /></IconButton>
      </div>
      {!compact ? <div className="space-y-3 px-4 pb-3">
        <label className="flex items-center gap-2 rounded-xl border border-line bg-bg/70 px-3 py-2 text-muted"><Search size={15} className="shrink-0" /><input aria-label="Filter conversations" placeholder="Search chats" value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted" /></label>
        <div className="flex gap-1.5" role="group" aria-label="Conversation filters">{([["all", "All"], ["unread", "Unread"], ["groups", "Groups"]] as const).map(([id, title]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filter === id ? "bg-accent/15 text-accent" : "text-muted hover:bg-raised"}`}>{title}</button>)}</div>
      </div> : null}
      <nav className="scroll-thin min-h-[120px] flex-1 overflow-y-auto px-2 pb-4" aria-label="Conversations">
        {rooms.map(room => <RoomRow key={room.id} room={room} boot={boot} busy={busy} compact={compact} active={pathname === `/r/${room.id}`} onNavigate={onNavigate} />)}
        {!rooms.length && !compact ? <p className="px-3 py-6 text-center text-xs text-muted">{query ? "No matching chats." : filter === "unread" ? "All caught up." : filter === "groups" ? "No groups yet." : "Your conversations will appear here."}</p> : null}
      </nav>

      <div className="space-y-0.5 border-t border-line px-2 pb-2 pt-2" role="navigation" aria-label="More">
        <NavLink compact={compact} href="/chat" icon={MessageCircle} label="Your nodes" active={pathname === "/chat"} onNavigate={onNavigate} />
        <NavLink compact={compact} href="/requests" icon={Inbox} label="Invites" badge={boot.invites?.length ?? 0} active={pathname === "/requests"} onNavigate={onNavigate} />
        <NavLink compact={compact} href="/computers" icon={Laptop} label="Computers & Needs me" badge={needsMe} active={pathname === "/computers"} onNavigate={onNavigate} />
        <NavLink compact={compact} href="/connections" icon={Plug} label="Connections" active={pathname === "/connections"} onNavigate={onNavigate} />
      </div>

      <div className="border-t border-line p-3">
        <Link href="/settings" onClick={onNavigate} aria-label="Settings" title={compact ? "Settings" : undefined} className={`flex min-w-0 items-center gap-2.5 rounded-xl py-1 hover:bg-raised ${compact ? "justify-center" : "px-1"}`}>
          <PersonAvatar name={boot.me.name || boot.me.email} size={28} />
          {!compact ? <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{boot.me.name || boot.me.email}</span>
          </span> : null}
          {!compact ? <Settings size={15} className="shrink-0 text-muted" /> : null}
        </Link>
      </div>
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

/** The signed-in app: conversations on the left, the conversation, and what needs you on the right. */
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const client = useQueryClient();
  const me = useMe();
  const signedIn = Boolean(me.data);
  const boot = useBootstrap(signedIn);
  const activity = useActivity();
  const approvals = useApprovals();
  const decisions = useDecisions();
  const [menu, setMenu] = useState(false);
  const [panel, togglePanel] = useNavigationPreference("node.activity-open", false);
  const [collapsed, toggleCollapsed] = useNavigationPreference("node.sidebar-collapsed", false);
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

  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) router.replace("/login");
  }, [me.error, router]);
  useEffect(() => {
    if (boot.error instanceof ApiError && boot.error.status === 401) {
      void client.invalidateQueries({ queryKey: keys.me });
      router.replace("/login");
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
  const needsMe = (approvals.data?.length ?? 0) + (decisions.data?.length ?? 0) + waiting;
  const openSearch = () => {
    setMenu(false);
    setSearch(true);
  };

  return (
    <DefaultNodeModel.Provider value={boot.data.models.default}>
    <div ref={frame} data-needs-me={needsMe > 0} className="chat-shell flex overflow-hidden" style={{ height: "var(--node-viewport-height, 100dvh)" }}>
      <aside className={`chat-sidebar hidden shrink-0 border-r border-line bg-panel/70 md:block ${collapsed ? "w-[68px]" : "w-[304px]"}`} data-sidebar-collapsed={collapsed} aria-label="Chat sidebar">
        <Sidebar boot={boot.data} compact={collapsed} onCollapse={toggleCollapsed} onSearch={openSearch} needsMe={needsMe} />
      </aside>
      <Drawer open={menu} onClose={() => setMenu(false)} title="Chats" side="left"><Sidebar boot={boot.data} onNavigate={() => setMenu(false)} onSearch={openSearch} needsMe={needsMe} /></Drawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className={`${pathname.startsWith("/r/") ? "hidden" : "flex"} shrink-0 items-center justify-between border-b border-line px-2 py-1.5 md:hidden`}>
          <IconButton label="Menu" onClick={() => setMenu(true)} className="relative">
            <Menu size={18} />
            {boot.data.invites?.length || needsMe ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent" /> : null}
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
          <main className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</main>
          <div className="absolute right-2 top-2 z-10 hidden lg:block">
            <IconButton label={panel ? "Hide activity" : "Show activity"} onClick={togglePanel} className="relative bg-panel/80">
              {panel ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
              {!panel && waiting ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-warn" /> : null}
            </IconButton>
          </div>
          {panel ? (
            <aside aria-label="Activity" className="scroll-thin hidden w-80 shrink-0 overflow-y-auto border-l border-line bg-panel/60 pt-10 lg:block">
              <ActivityPanel />
            </aside>
          ) : null}
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
    </DefaultNodeModel.Provider>
  );
}

export function PrivateBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-private">
      <Lock size={11} /> only you
    </span>
  );
}

export const shortModel = (boot: Bootstrap, node: { provider: string | null; model: string | null }) => shortModelName(node.model ? modelName(boot.models.options, node.provider, node.model, boot.models.default) : boot.models.options.find(row => row.default)?.label ?? boot.models.default);
