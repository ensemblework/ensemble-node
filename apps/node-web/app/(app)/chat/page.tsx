"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUp, Inbox, Plus, ShieldQuestion } from "lucide-react";
import { api } from "@/lib/api";
import { useActivity, useBootstrap } from "@/lib/hooks";
import { useBusyNodes } from "@/lib/live";
import { plainPreview } from "@/lib/chat";
import { readableBody } from "@/lib/entity-text";
import { ago } from "@/lib/text";
import { dmRoomOf, shortModel } from "@/components/shell";
import { NodeAvatar } from "@/components/node-avatar";
import { Spinner } from "@/components/ui";

export default function Home() {
  const boot = useBootstrap();
  const activity = useActivity();
  const busy = useBusyNodes();
  const router = useRouter();
  const [text, setText] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  if (!boot.data) return <div className="flex h-full items-center justify-center text-muted"><Spinner /></div>;
  const { nodes, me } = boot.data;
  const chosen = nodes.find((node) => node.id === target) ?? nodes.find((node) => node.role === "manager") ?? nodes[0];
  const waiting = activity.data?.approvals.length ?? 0;
  const recent = boot.data.rooms.filter((room) => room.lastMessageAt).slice(0, 5);

  const ask = async () => {
    const body = text.trim();
    const dm = chosen ? dmRoomOf(boot.data, chosen.id) : undefined;
    if (!body || !dm) return;
    setSending(true);
    try {
      await api(`/api/node/rooms/${dm.id}/messages`, { body: { body, clientId: crypto.randomUUID() } });
      router.push(`/r/${dm.id}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="scroll-thin relative h-full overflow-y-auto">
      <div className="glow pointer-events-none absolute inset-x-0 top-0 h-72" />
      <div className="relative mx-auto max-w-4xl space-y-10 px-4 py-10 md:px-8 md:py-16">
        <div className="space-y-5 text-center">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            {me.name ? `Hi ${me.name.split(" ")[0]}.` : "Hi."} What should your nodes do?
          </h1>
          {chosen ? (
            <div className="mx-auto max-w-2xl rounded-3xl border border-line bg-panel p-2 text-left shadow-lg focus-within:border-accent/60">
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void ask();
                  }
                }}
                rows={2}
                disabled={!me.verified}
                placeholder={`Ask ${chosen.name}…`}
                className="w-full resize-none bg-transparent px-3 py-2 text-[15px] outline-none placeholder:text-muted"
              />
              <div className="flex items-center justify-between px-1">
                <div className="flex flex-wrap gap-1">
                  {nodes.map((node) => (
                    <button key={node.id} onClick={() => setTarget(node.id)} title={node.name} className={`rounded-full p-0.5 ${node.id === chosen.id ? "ring-2 ring-accent" : "opacity-60 hover:opacity-100"}`}>
                      <NodeAvatar avatar={node.avatar} size={24} thinking={busy.has(node.id)} />
                    </button>
                  ))}
                </div>
                <button onClick={() => void ask()} disabled={!text.trim() || sending || !me.verified} className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-ink disabled:opacity-40" aria-label="Send">
                  {sending ? <Spinner /> : <ArrowUp size={18} />}
                </button>
              </div>
            </div>
          ) : null}
          {!me.verified ? (
            <p className="text-sm text-muted">
              Verify your email to talk to nodes. <Link href="/welcome" className="text-accent">Verify now</Link>
            </p>
          ) : null}
        </div>

        {boot.data.invites?.length ? (
          <Link href="/requests" className="mx-auto flex max-w-2xl items-center gap-3 rounded-2xl border border-accent/40 bg-accent/5 px-4 py-3 text-sm hover:border-accent/70">
            <Inbox className="text-accent" size={18} />
            {boot.data.invites.length === 1
              ? `${boot.data.invites[0]!.from.name} asked you to join “${boot.data.invites[0]!.room.title}”`
              : `${boot.data.invites.length} requests to join a room`}
          </Link>
        ) : null}

        {waiting ? (
          <Link href="/activity" className="mx-auto flex max-w-2xl items-center gap-3 rounded-2xl border border-warn/40 bg-warn/5 px-4 py-3 text-sm hover:border-warn/70">
            <ShieldQuestion className="text-warn" size={18} />
            {waiting} thing{waiting === 1 ? "" : "s"} waiting for your approval
          </Link>
        ) : null}

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Your nodes</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {nodes.map((node) => {
              const dm = dmRoomOf(boot.data, node.id);
              return (
                <Link key={node.id} href={dm ? `/r/${dm.id}` : `/n/${node.id}`} className="group flex flex-col items-center rounded-2xl border border-line bg-panel/70 p-5 text-center transition hover:-translate-y-0.5 hover:border-accent/50">
                  <NodeAvatar avatar={node.avatar} size={64} thinking={busy.has(node.id)} dim={node.status === "paused"} />
                  <span className="mt-3 font-medium">{node.name}</span>
                  <span className="font-mono text-xs text-muted">@{node.slug}</span>
                  <span className="mt-1 text-xs text-muted">{node.status === "paused" ? "paused" : busy.has(node.id) ? "working…" : node.role}</span>
                  <span className="mt-0.5 max-w-full truncate text-[11px] text-muted" title="Chat model">
                    {shortModel(boot.data, node)}
                  </span>
                </Link>
              );
            })}
            <Link href="/new?tab=node" className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line p-5 text-muted hover:border-accent hover:text-ink">
              <Plus size={28} />
              <span className="mt-2 text-sm">New node or crew</span>
            </Link>
          </div>
        </section>

        {recent.length ? (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Recent</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel/70">
              {recent.map((room) => (
                <li key={room.id}>
                  <Link href={`/r/${room.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-raised/60">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{room.title}</span>
                      <span className="block truncate text-xs text-muted">{room.last ? (room.last.data?.deleted ? "Message deleted" : plainPreview(readableBody(room.last))) : ""}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted">{ago(room.lastMessageAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
