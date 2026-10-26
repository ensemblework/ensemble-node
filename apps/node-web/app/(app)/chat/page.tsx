"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowUp, Inbox, Plus, ShieldQuestion } from "lucide-react";
import { api } from "@/lib/api";
import { useActivity, useBootstrap } from "@/lib/hooks";
import { useBusyNodes } from "@/lib/live";
import { messagePreview, sendBody } from "@/lib/chat";
import { recentConversations } from "@/lib/conversations";
import { ago } from "@/lib/text";
import { toastError } from "@/lib/toast";
import { AttachButton, AttachmentShelf, DropHint, pasteFiles, useAttachments, useFileDrop } from "@/components/chat/attachments";
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
  const attachments = useAttachments();
  const verified = Boolean(boot.data?.me.verified);
  const drop = useFileDrop(attachments.addFiles, verified);
  const blockerId = useId();
  // One clientId per draft: sending the same draft again after a failure cannot post it twice.
  const clientId = useRef<string | null>(null);
  useEffect(() => {
    clientId.current = null;
  }, [text, attachments.files.length]);
  if (!boot.data) return <div className="flex h-full items-center justify-center text-muted"><Spinner /></div>;
  const { nodes, me } = boot.data;
  const chosen = nodes.find((node) => node.id === target) ?? nodes.find((node) => node.role === "manager") ?? nodes[0];
  const waiting = activity.data?.approvals.length ?? 0;
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
      <div className="glow pointer-events-none absolute inset-x-0 top-0 h-72" />
      <div className="relative mx-auto max-w-4xl space-y-10 px-4 py-10 md:px-8 md:py-16">
        <div className="space-y-5 text-center">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            What are we working on?
          </h1>
          {chosen ? (
            <div {...drop.bind} className="relative mx-auto max-w-2xl rounded-3xl border border-line bg-panel p-2 text-left shadow-lg focus-within:border-accent/60">
              {drop.over ? <DropHint /> : null}
              <AttachmentShelf attachments={attachments} />
              <textarea
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
                className="w-full resize-none bg-transparent px-3 py-2 text-[15px] outline-none placeholder:text-muted"
              />
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex min-w-0 items-center gap-2">
                  <AttachButton attachments={attachments} hint={`${chosen.name} reads what you attach: the text of documents, and pictures when its model can see images.`} disabled={!me.verified} />
                  <NodeAvatar node={chosen} size={26} thinking={busy.has(chosen.id)} />
                  <select aria-label="Chat with" value={chosen.id} onChange={event => setTarget(event.target.value)} className="min-w-0 max-w-[12rem] rounded-lg bg-panel py-1 pr-1 text-sm text-ink outline-none">{nodes.map(node => <option key={node.id} value={node.id}>{node.name}</option>)}</select>
                </div>
                {blocker ? (
                  <span id={blockerId} role="status" className="min-w-0 flex-1 truncate text-right text-xs text-warn" title={blocker}>
                    {blocker}
                  </span>
                ) : null}
                <button onClick={() => void ask()} disabled={!canAsk} title={blocker ?? undefined} aria-describedby={blocker ? blockerId : undefined} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink disabled:opacity-40" aria-label="Send">
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {nodes.map((node) => {
              const dm = dmRoomOf(boot.data, node.id);
              return (
                <Link key={node.id} href={dm ? `/r/${dm.id}` : `/n/${node.id}`} className="group flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-panel/50 p-4 transition-colors hover:border-accent/40 hover:bg-panel">
                  <NodeAvatar node={node} size={42} thinking={busy.has(node.id)} dim={node.status === "paused"} />
                  <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{node.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted">{node.status === "paused" ? "Paused" : busy.has(node.id) ? "Working…" : node.role}</span>
                  <span className="mt-1 block truncate text-[11px] text-muted" title="Chat model">
                    {shortModel(boot.data, node)}
                  </span>
                  </span>
                </Link>
              );
            })}
            <Link href="/new?tab=node" className="flex min-h-24 items-center justify-center gap-2 rounded-2xl border border-dashed border-line p-4 text-muted hover:border-accent hover:text-ink">
              <Plus size={18} />
              <span className="text-sm">New node or group</span>
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
