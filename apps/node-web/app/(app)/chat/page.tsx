"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowUp, ArrowUpRight, Inbox, Plus, ShieldQuestion } from "lucide-react";
import { api } from "@/lib/api";
import { useActivity, useBootstrap } from "@/lib/hooks";
import { useBusyNodes } from "@/lib/live";
import { messagePreview, sendBody } from "@/lib/chat";
import { recentConversations, waitingRooms } from "@/lib/conversations";
import { requestJump } from "@/lib/jump";
import { ago } from "@/lib/text";
import { toastError } from "@/lib/toast";
import { AttachButton, AttachmentShelf, DropHint, pasteFiles, useAttachments, useFileDrop } from "@/components/chat/attachments";
import { dmRoomOf } from "@/components/shell";
import { NodeAvatar } from "@/components/node-avatar";
import { NodeCompanion } from "@/components/node-companion";
import { RoomAvatar } from "@/components/room-avatar";
import { Mark } from "@/components/brand";
import { Spinner } from "@/components/ui";

export default function Home() {
  const boot = useBootstrap();
  const activity = useActivity();
  const busy = useBusyNodes();
  const router = useRouter();
  const [text, setText] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const attachments = useAttachments();
  const verified = Boolean(boot.data?.me.verified);
  const drop = useFileDrop(attachments.addFiles, verified);
  const blockerId = useId();
  // One clientId per draft: sending the same draft again after a failure cannot post it twice.
  const clientId = useRef<string | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    clientId.current = null;
  }, [text, attachments.files.length]);
  if (!boot.data) return <div className="flex h-full items-center justify-center text-muted"><Spinner /></div>;
  const { nodes, me } = boot.data;
  const chosen = nodes.find((node) => node.id === target) ?? nodes.find((node) => node.role === "manager") ?? nodes[0];
  // What waits for me, by the chat it waits in: each opens there, at the oldest.
  const waits = waitingRooms(activity.data?.approvals, activity.data?.runs);
  const waitingIn = boot.data.rooms.flatMap((room) => {
    const row = waits.get(room.id);
    return row ? [{ room, ...row }] : [];
  });
  const waiting = waitingIn.reduce((sum, row) => sum + row.count, 0);
  const recent = recentConversations(boot.data.rooms).filter(room => room.lastMessageAt).slice(0, 5);

  const files = attachments.files;
  const blocker = attachments.blocker;
  const canAsk = Boolean(text.trim() || files.length) && !blocker && !sending && me.verified;

  const ask = async () => {
    const dm = chosen ? dmRoomOf(boot.data, chosen.id) : undefined;
    if (!canAsk || !dm) return;
    setSending(true);
    clientId.current ??= crypto.randomUUID();
    try {
      await api(`/api/node/rooms/${dm.id}/messages`, { body: sendBody({ body: text.trim(), private: false, clientId: clientId.current, files }) });
      router.push(`/r/${dm.id}`);
    } catch (error) {
      toastError(error);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="scroll-thin relative h-full overflow-y-auto">
      <div className="home-surface relative mx-auto max-w-3xl space-y-9 px-4 py-8 md:px-8 md:py-12">
        <div className="space-y-6 text-center">
          <div className="flex items-center justify-center gap-2 text-xs text-muted"><Mark size={18} /><span>Your space, your teammates.</span></div>
          {chosen ? <div className="flex justify-center"><NodeCompanion key={chosen.id} node={chosen} size={56} visit /></div> : null}
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            What are we working on?
          </h1>
          <p className="!mt-2 text-sm text-muted">A thought, a question, or the next thing to build.</p>
          {chosen ? (
            <div {...drop.bind} className="chat-composer relative mx-auto max-w-2xl rounded-[22px] border border-line bg-panel p-2 text-left focus-within:border-accent/60">
              {drop.over ? <DropHint /> : null}
              <AttachmentShelf attachments={attachments} />
              <textarea
                ref={composer}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onPaste={me.verified ? (event) => pasteFiles(event, attachments.addFiles) : undefined}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void ask();
                  }
                }}
                rows={2}
                disabled={!me.verified}
                placeholder={`Ask ${chosen.name}…`}
                aria-label={`Ask ${chosen.name}`}
                className="min-h-24 w-full resize-none bg-transparent px-3 py-3 text-[15px] leading-6 outline-none placeholder:text-muted"
              />
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex min-w-0 items-center gap-2">
                  <AttachButton attachments={attachments} hint={`${chosen.name} reads what you attach: the text of documents and code, and pictures when its model can see images. Ask it to save a file on your computer.`} disabled={!me.verified} />
                  <NodeAvatar node={chosen} size={24} />
                  <select aria-label="Chat with" value={chosen.id} onChange={event => setTarget(event.target.value)} className="min-w-0 max-w-[12rem] rounded-lg bg-panel py-1 pr-1 text-sm text-ink outline-none">{nodes.map(node => <option key={node.id} value={node.id}>{node.name}</option>)}</select>
                </div>
                {blocker ? (
                  <span id={blockerId} role="status" className="min-w-0 flex-1 truncate text-right text-xs text-warn" title={blocker}>
                    {blocker}
                  </span>
                ) : null}
                <button onClick={() => void ask()} disabled={!canAsk} title={blocker ?? undefined} aria-describedby={blocker ? blockerId : undefined} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition-colors hover:brightness-110 disabled:opacity-40" aria-label="Send">
                  {sending ? <Spinner /> : <ArrowUp size={18} />}
                </button>
              </div>
            </div>
          ) : null}
          {chosen && !text && !files.length ? <div className="mx-auto flex max-w-2xl flex-wrap justify-center gap-2" aria-label="Conversation starters">{["Plan my day", "Explore an idea", "Build something"].map((label, index) => <button key={label} type="button" disabled={!me.verified} onClick={() => { setText(["Help me plan my day.", "I'd like to explore an idea: ", "I'd like to build "][index]!); composer.current?.focus(); }} className="min-h-9 rounded-full border border-line px-3.5 text-xs text-muted transition-colors hover:border-accent/40 hover:bg-panel hover:text-ink disabled:opacity-50">{label}</button>)}</div> : null}
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

        {waitingIn.length ? (
          <section aria-labelledby="waiting-title" className="mx-auto max-w-2xl rounded-2xl border border-warn/40 bg-warn/5 px-4 py-3 text-sm">
            <p id="waiting-title" className="flex items-center gap-2 font-medium">
              <ShieldQuestion className="shrink-0 text-warn" size={18} aria-hidden />
              {waiting === 1 ? "Something waits for you" : `${waiting} things wait for you`} in {waitingIn.length === 1 ? "a chat" : `${waitingIn.length} chats`}
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {waitingIn.map(({ room, count, first }) => (
                <li key={room.id} className="max-w-full">
                  <Link
                    href={`/r/${room.id}${first ? `#m-${first}` : ""}`}
                    onClick={() => (first ? requestJump(room.id, first) : undefined)}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-warn/40 bg-panel px-2.5 py-1 text-xs hover:border-warn/70"
                  >
                    <span className="size-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
                    <span className="truncate">{room.title}</span>
                    {count > 1 ? <span className="shrink-0 tabular-nums text-muted">· {count}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="your-nodes">
          <div className="mb-3 flex items-center justify-between"><h2 id="your-nodes" className="text-sm font-medium">Your nodes</h2><Link href="/new?tab=node" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-1 text-xs text-muted hover:text-ink"><Plus size={14} aria-hidden />Add a node</Link></div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {nodes.map((node) => {
              const dm = dmRoomOf(boot.data, node.id);
              return (
                <Link key={node.id} href={dm ? `/r/${dm.id}` : `/n/${node.id}`} title={`@${node.slug}`} className="node-link group flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-panel/60 p-3.5 transition-colors hover:border-accent/40 hover:bg-panel">
                  <NodeAvatar node={node} size={42} dim={node.status === "paused"} />
                  <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{node.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted">{node.status === "paused" ? "Paused" : busy.has(node.id) ? "Working…" : node.role}</span>
                  </span>
                  <ArrowUpRight size={14} className="shrink-0 text-muted opacity-40 transition-opacity group-hover:opacity-100" aria-hidden />
                </Link>
              );
            })}
            {!nodes.length ? <Link href="/new?tab=node" className="flex min-h-24 items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-sm text-muted hover:border-accent/40 hover:text-ink"><Plus size={18} aria-hidden />Create your first node</Link> : null}
          </div>
        </section>

        {recent.length ? (
          <section aria-labelledby="recent-chats">
            <h2 id="recent-chats" className="mb-3 text-sm font-medium">Pick up where you left off</h2>
            <ul className="space-y-1">
              {recent.map((room) => (
                <li key={room.id}>
                  <Link href={`/r/${room.id}`} className="flex items-center justify-between gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-raised/60">
                    <RoomAvatar room={room} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{room.title}</span>
                      <span className="block truncate text-xs text-muted">{room.last ? messagePreview(room.last) : ""}</span>
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
