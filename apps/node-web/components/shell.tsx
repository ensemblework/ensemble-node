"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Activity as ActivityIcon, Hash, Lock, Menu, PanelRightClose, PanelRightOpen, Plus, Settings, Users, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { useBusyNodes } from "@/lib/live";
import { keys, useActivity, useBootstrap, useMe, useNodeEvents } from "@/lib/hooks";
import { ago } from "@/lib/text";
import type { Bootstrap, Room } from "@/lib/types";
import { ActivityPanel } from "./activity";
import { Mark } from "./brand";
import { CreditsMeter } from "./credits";
import { NodeAvatar, PersonAvatar } from "./node-avatar";
import { IconButton, Spinner } from "./ui";

export function dmRoomOf(boot: Bootstrap | undefined, nodeId: string): Room | undefined {
  return boot?.rooms.find((room) => room.kind === "dm" && room.members.some((member) => member.kind === "node" && member.node.id === nodeId));
}

function RoomIcon({ room, boot, busy }: { room: Room; boot: Bootstrap; busy: Set<string> }) {
  if (room.kind === "dm") {
    const member = room.members.find((row) => row.kind === "node");
    const node = member?.kind === "node" ? member.node : undefined;
    return <NodeAvatar avatar={node?.avatar} size={30} thinking={node ? busy.has(node.id) : false} />;
  }
  const others = room.members.filter((row) => row.kind === "person" && row.accountId !== boot.me.id).length;
  return (
    <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-xl bg-raised text-muted">
      {room.kind === "crew" ? <Users size={15} /> : others ? <Hash size={15} /> : <Users size={15} />}
    </span>
  );
}

function Sidebar({ boot, onNavigate }: { boot: Bootstrap; onNavigate?: () => void }) {
  const pathname = usePathname();
  const busy = useBusyNodes();
  const groups: Array<[string, Room[]]> = [
    ["Direct", boot.rooms.filter((room) => room.kind === "dm")],
    ["Crews", boot.rooms.filter((room) => room.kind === "crew")],
    ["Groups", boot.rooms.filter((room) => room.kind === "group")],
  ];
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <Link href="/chat" onClick={onNavigate} className="flex items-center gap-2 font-semibold">
          <Mark size={24} /> Node
        </Link>
        <Link href="/new" onClick={onNavigate} className="inline-flex h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-xs font-medium hover:bg-raised">
          <Plus size={14} /> New
        </Link>
      </div>

      <div className="px-3 pb-2">
        <div className="flex flex-wrap gap-1.5 rounded-2xl border border-line bg-bg/60 p-2">
          {boot.nodes.map((node) => {
            const dm = dmRoomOf(boot, node.id);
            return (
              <Link key={node.id} href={dm ? `/r/${dm.id}` : `/n/${node.id}`} onClick={onNavigate} title={`${node.name} (@${node.slug})`} className="rounded-xl p-0.5 hover:bg-raised">
                <NodeAvatar avatar={node.avatar} size={34} thinking={busy.has(node.id)} dim={node.status === "paused"} title={`${node.name} (@${node.slug})`} />
              </Link>
            );
          })}
          <Link href="/new" onClick={onNavigate} title="New node" className="flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-dashed border-line text-muted hover:text-ink">
            <Plus size={16} />
          </Link>
        </div>
      </div>

      <nav className="scroll-thin flex-1 space-y-4 overflow-y-auto px-2 pb-4">
        {groups.map(([label, rooms]) =>
          rooms.length ? (
            <div key={label}>
              <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
              {rooms.map((room) => {
                const active = pathname === `/r/${room.id}`;
                const preview = room.last ? `${room.last.private ? "🔒 " : ""}${room.last.body}` : "No messages yet";
                return (
                  <Link key={room.id} href={`/r/${room.id}`} onClick={onNavigate} className={`flex items-center gap-2.5 rounded-xl px-2 py-2 ${active ? "bg-raised" : "hover:bg-raised/60"}`}>
                    <RoomIcon room={room} boot={boot} busy={busy} />
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
              })}
            </div>
          ) : null,
        )}
      </nav>

      <div className="space-y-3 border-t border-line p-3">
        <CreditsMeter credits={boot.credits} compact />
        <div className="flex items-center justify-between">
          <Link href="/settings" onClick={onNavigate} className="flex min-w-0 items-center gap-2 rounded-xl px-1 py-1 hover:bg-raised">
            <PersonAvatar name={boot.me.name || boot.me.email} size={28} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{boot.me.name || boot.me.email}</span>
              <span className="flex items-center gap-1 text-[11px] text-muted">
                <span className={`h-1.5 w-1.5 rounded-full ${boot.computers.some((row) => row.online) ? "bg-ok" : "bg-muted"}`} />
                {boot.computers.some((row) => row.online) ? "Computer online" : boot.computers.length ? "Computer offline" : "No computer"}
              </span>
            </span>
          </Link>
          <Link href="/settings" onClick={onNavigate} className="rounded-lg p-1.5 text-muted hover:bg-raised hover:text-ink" aria-label="Settings">
            <Settings size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}

/** The signed-in app: rooms on the left, the conversation, and what needs you on the right. */
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const client = useQueryClient();
  const me = useMe();
  const signedIn = Boolean(me.data);
  const boot = useBootstrap(signedIn);
  const activity = useActivity();
  const [menu, setMenu] = useState(false);
  const [panel, setPanel] = useState(true);
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

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      <aside className="hidden w-72 shrink-0 border-r border-line bg-panel md:block">
        <Sidebar boot={boot.data} />
      </aside>
      {menu ? (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="w-[84vw] max-w-xs border-r border-line bg-panel">
            <Sidebar boot={boot.data} onNavigate={() => setMenu(false)} />
          </div>
          <button className="flex-1 bg-black/50" aria-label="Close menu" onClick={() => setMenu(false)} />
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-line px-2 py-1.5 md:hidden">
          <IconButton label="Menu" onClick={() => setMenu(true)}>
            {menu ? <X size={18} /> : <Menu size={18} />}
          </IconButton>
          <Link href="/chat" className="flex items-center gap-1.5 text-sm font-semibold">
            <Mark size={20} /> Node
          </Link>
          <Link href="/activity" className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-raised" aria-label="Activity">
            <ActivityIcon size={18} />
            {waiting ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-warn" /> : null}
          </Link>
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
