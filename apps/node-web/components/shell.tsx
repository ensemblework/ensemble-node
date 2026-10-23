"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Activity as ActivityIcon, Hash, Inbox, Laptop, Lock, Menu, PanelRightClose, PanelRightOpen, Plug, Plus, Search, Settings, Users, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { requestJump } from "@/lib/jump";
import { useBusyNodes } from "@/lib/live";
import { keys, useActivity, useApprovals, useBootstrap, useDecisions, useMe, useNodeEvents } from "@/lib/hooks";
import { modelName, shortModelName } from "@/lib/models";
import { plainPreview } from "@/lib/chat";
import { ago } from "@/lib/text";
import type { Bootstrap, Room } from "@/lib/types";
import { ActivityPanel } from "./activity";
import { Mark } from "./brand";
import { SearchPanel } from "./chat/search";
import { CreditsMeter } from "./credits";
import { NodeAvatar, PersonAvatar } from "./node-avatar";
import { Drawer, IconButton, Spinner, Toaster } from "./ui";

export function dmRoomOf(boot: Bootstrap | undefined, nodeId: string): Room | undefined {
  return boot?.rooms.find((room) => room.kind === "dm" && room.members.some((member) => member.kind === "node" && member.node.id === nodeId));
}

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function RoomRow({ room, boot, busy, active, onNavigate }: { room: Room; boot: Bootstrap; busy: Set<string>; active: boolean; onNavigate?: () => void }) {
  const preview = room.last ? `${room.last.private ? "🔒 " : ""}${room.last.data?.deleted ? "Message deleted" : plainPreview(room.last.body)}` : "No messages yet";
  let icon: ReactNode;
  let title = room.title;
  if (room.kind === "dm") {
    const member = room.members.find((row) => row.kind === "node");
    const node = boot.nodes.find((row) => member?.kind === "node" && row.id === member.node.id);
    icon = <NodeAvatar avatar={node?.avatar} size={30} thinking={node ? busy.has(node.id) : false} dim={node?.status === "paused"} />;
    if (node) title = `${node.name} (@${node.slug}) · ${modelName(boot.models.options, node.provider, node.model, boot.models.default)}`;
  } else {
    icon = <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-xl bg-raised text-muted">{room.kind === "crew" ? <Users size={15} /> : <Hash size={15} />}</span>;
  }
  return (
    <Link href={`/r/${room.id}`} onClick={onNavigate} title={title} aria-current={active ? "page" : undefined} className={`flex items-center gap-2.5 rounded-xl px-2 py-2 ${active ? "bg-raised" : "hover:bg-raised/60"}`}>
      {icon}
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className={`truncate text-sm ${room.unread ? "font-semibold" : "font-medium"}`}>{room.title}</span>
          <span className="shrink-0 text-[11px] text-muted">{ago(room.lastMessageAt)}</span>
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-muted">{preview}</span>
          {room.unread ? <span className="shrink-0 rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-ink">{room.unread}</span> : null}
        </span>
      </span>
    </Link>
  );
}

function NavLink({ href, icon: Icon, label, badge, active, onNavigate }: { href: string; icon: typeof Inbox; label: string; badge?: number; active: boolean; onNavigate?: () => void }) {
  return (
    <Link href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-sm ${active ? "bg-raised font-medium" : "text-muted hover:bg-raised/60 hover:text-ink"}`}>
      <Icon size={16} className="shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {badge ? <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-ink">{badge}</span> : null}
    </Link>
  );
}

function Sidebar({ boot, onNavigate, onSearch, needsMe }: { boot: Bootstrap; onNavigate?: () => void; onSearch: () => void; needsMe: number }) {
  const pathname = usePathname();
  const busy = useBusyNodes();
  const sections: Array<{ id: Room["kind"]; label: string; rooms: Room[]; make: string; empty: string }> = [
    { id: "dm", label: "Direct chats", rooms: boot.rooms.filter((room) => room.kind === "dm"), make: "/new?tab=node", empty: "Make your first node" },
    { id: "crew", label: "Crews", rooms: boot.rooms.filter((room) => room.kind === "crew"), make: "/new?tab=crew", empty: "Make a crew of your nodes" },
    { id: "room", label: "Rooms", rooms: boot.rooms.filter((room) => room.kind === "room"), make: "/new?tab=room", empty: "Make a room with other people" },
  ];
  const online = boot.computers.some((row) => row.online);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <Link href="/chat" onClick={onNavigate} className="flex items-center gap-2 font-semibold">
          <Mark size={24} /> Node
        </Link>
        <Link href="/new" onClick={onNavigate} className="inline-flex h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-xs font-medium hover:bg-raised">
          <Plus size={14} /> New
        </Link>
      </div>
      <div className="px-3 pb-2">
        <button type="button" onClick={onSearch} className="flex w-full items-center gap-2 rounded-xl border border-line bg-bg/60 px-3 py-1.5 text-sm text-muted hover:border-muted hover:text-ink">
          <Search size={15} /> <span className="flex-1 text-left">Search</span>
          <kbd className="rounded border border-line px-1.5 font-sans text-[10px]">{isMac() ? "⌘" : "Ctrl"} K</kbd>
        </button>
      </div>

      <nav className="scroll-thin flex-1 space-y-4 overflow-y-auto px-2 pb-4" aria-label="Conversations">
        {sections.map((section) => (
          <div key={section.id}>
            <div className="flex items-center justify-between px-2 pb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{section.label}</span>
              <Link href={section.make} onClick={onNavigate} className="rounded-md p-0.5 text-muted hover:bg-raised hover:text-ink" aria-label={`New: ${section.empty.toLowerCase()}`} title={section.empty}>
                <Plus size={14} />
              </Link>
            </div>
            {section.rooms.length ? (
              section.rooms.map((room) => <RoomRow key={room.id} room={room} boot={boot} busy={busy} active={pathname === `/r/${room.id}`} onNavigate={onNavigate} />)
            ) : (
              <Link href={section.make} onClick={onNavigate} className="block px-2 py-1 text-xs text-muted hover:text-ink">
                {section.empty}
              </Link>
            )}
          </div>
        ))}
      </nav>

      <div className="space-y-0.5 border-t border-line px-2 pb-2 pt-2" role="navigation" aria-label="More">
        <NavLink href="/requests" icon={Inbox} label="Requests to join" badge={boot.invites?.length ?? 0} active={pathname === "/requests"} onNavigate={onNavigate} />
        <NavLink href="/computers" icon={Laptop} label="Computers & Needs me" badge={needsMe} active={pathname === "/computers"} onNavigate={onNavigate} />
        <NavLink href="/connections" icon={Plug} label="Connections" active={pathname === "/connections"} onNavigate={onNavigate} />
        <NavLink href="/settings" icon={Settings} label="Settings" active={pathname === "/settings"} onNavigate={onNavigate} />
      </div>

      <div className="space-y-3 border-t border-line p-3">
        <CreditsMeter credits={boot.credits} compact />
        <Link href="/settings" onClick={onNavigate} className="flex min-w-0 items-center gap-2 rounded-xl px-1 py-1 hover:bg-raised">
          <PersonAvatar name={boot.me.name || boot.me.email} size={28} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{boot.me.name || boot.me.email}</span>
            <span className="flex items-center gap-1 text-[11px] text-muted">
              <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-ok" : "bg-muted"}`} />
              {online ? "Computer online" : boot.computers.length ? "Computer offline" : "No computer"}
            </span>
          </span>
        </Link>
      </div>
    </div>
  );
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
  const [panel, setPanel] = useState(true);
  const [search, setSearch] = useState(false);
  useNodeEvents(signedIn);

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
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearch((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
  const needsMe = (approvals.data?.length ?? 0) + (decisions.data?.length ?? 0);
  const openSearch = () => {
    setMenu(false);
    setSearch(true);
  };

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      <aside className="hidden w-72 shrink-0 border-r border-line bg-panel md:block">
        <Sidebar boot={boot.data} onSearch={openSearch} needsMe={needsMe} />
      </aside>
      {menu ? (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="w-[84vw] max-w-xs border-r border-line bg-panel">
            <Sidebar boot={boot.data} onNavigate={() => setMenu(false)} onSearch={openSearch} needsMe={needsMe} />
          </div>
          <button className="flex-1 bg-black/50" aria-label="Close menu" onClick={() => setMenu(false)} />
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-line px-2 py-1.5 md:hidden">
          <IconButton label="Menu" onClick={() => setMenu(true)} className="relative">
            {menu ? <X size={18} /> : <Menu size={18} />}
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
          <main className="min-w-0 flex-1">{children}</main>
          <div className="absolute right-2 top-2 z-10 hidden lg:block">
            <IconButton label={panel ? "Hide activity" : "Show activity"} onClick={() => setPanel(!panel)} className="relative bg-panel/80">
              {panel ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
              {!panel && waiting ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-warn" /> : null}
            </IconButton>
          </div>
          {panel ? (
            <aside className="scroll-thin hidden w-80 shrink-0 overflow-y-auto border-l border-line bg-panel/60 pt-10 lg:block">
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
        <p className="mt-3 text-xs text-muted">
          Every word must be in the message. Open the full page at{" "}
          <Link href="/search" onClick={() => setSearch(false)} className="text-accent hover:underline">
            Search
          </Link>
          .
        </p>
      </Drawer>
      <Toaster />
    </div>
  );
}

export function PrivateBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-private">
      <Lock size={11} /> only you
    </span>
  );
}

export const shortModel = (boot: Bootstrap, node: { provider: string | null; model: string | null }) => shortModelName(modelName(boot.models.options, node.provider, node.model, boot.models.default));
