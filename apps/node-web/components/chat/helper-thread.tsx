"use client";

/**
 * A helper's conversation shown inline (build block B18): a chip under the message that asked for the
 * work ("@scout, helper of @lead · working · 4 messages") that opens in place to the helper's thread,
 * read only, read from its task room's messages: the brief its parent wrote and the report it gave.
 * Its header says what the helper may do and offers to keep it as a lasting node; a link opens the
 * task room itself.
 */
import Link from "next/link";
import { ChevronDown, Lock, MessagesSquare, UserPlus } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { messageRefs } from "@/lib/entity-text";
import { keys, markRead, useBootstrap, useMessages } from "@/lib/hooks";
import { outcomeBadge } from "@/lib/plan";
import { useBusyNodes, useLiveRoom } from "@/lib/live";
import { clock } from "@/lib/text";
import { grantLabel, threadLabel, type HelperThread } from "@/lib/threads";
import { toast, toastError } from "@/lib/toast";
import type { NodeFull, NodePublic } from "@/lib/types";
import { NodeAvatar, PersonAvatar } from "../node-avatar";
import { Pill, Spinner } from "../ui";
import { RichText } from "./rich-text";

/**
 * Keeps a helper as a lasting node (`POST /api/node/nodes/:id/promote`), after a confirm: it leaves its
 * parent, keeps what it knows and gets its own chat in the sidebar. Its room stays as history.
 */
export function useKeepHelper(helper: NodePublic | null) {
  const client = useQueryClient();
  const [keeping, setKeeping] = useState(false);
  const keep = async () => {
    if (!helper || !confirm(`Keep @${helper.slug} as a lasting node? It gets its own chat.`)) return;
    setKeeping(true);
    try {
      const { node } = await api<{ node: NodeFull }>(`/api/node/nodes/${encodeURIComponent(helper.id)}/promote`, { body: {} });
      await client.invalidateQueries({ queryKey: keys.bootstrap });
      toast(`${node.name} is one of your nodes now. Its chat is in your list.`, "ok");
    } catch (error) {
      toastError(error);
    } finally {
      setKeeping(false);
    }
  };
  return { keep, keeping };
}

/** The helper's conversation, read only, newest at the bottom, with what is being written now. */
export function HelperThreadView({ thread, id }: { thread: HelperThread; id?: string }) {
  const client = useQueryClient();
  const boot = useBootstrap();
  const messages = useMessages(thread.roomId);
  const live = useLiveRoom(thread.roomId);
  const { keep, keeping } = useKeepHelper(thread.helper);
  const room = boot.data?.rooms.find((row) => row.id === thread.roomId);
  const nodes = useMemo(() => new Map((room?.members ?? []).flatMap((member) => (member.kind === "node" ? [[member.node.id, member.node] as const] : []))), [room]);
  const handles = useMemo(() => new Set((room?.members ?? []).map((member) => member.handle)), [room]);
  const list = (messages.data ?? []).filter((row) => !row.planId);
  const lastSeq = list.reduce((max, row) => (row.id.startsWith("local-") ? max : Math.max(max, row.seq)), 0);
  // A helper kept as a lasting node is one of the owner's nodes now, with its own chat.
  const kept = thread.kept || Boolean(thread.helper && boot.data?.nodes.some((node) => node.id === thread.helper!.id));
  const chat = kept && thread.helper ? boot.data?.rooms.find((row) => row.kind === "dm" && row.members.some((member) => member.kind === "node" && member.node.id === thread.helper!.id)) : undefined;
  // Reading it here reads the task room, so it does not wait unread.
  useEffect(() => {
    if (lastSeq) markRead(client, thread.roomId, lastSeq);
  }, [client, thread.roomId, lastSeq]);
  const author = (nodeId: string | null): NodePublic | undefined => (nodeId ? nodes.get(nodeId) : undefined);
  return (
    <div id={id} className="mt-1.5 overflow-hidden rounded-xl border border-line bg-bg/50">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line px-2.5 py-1.5 text-xs text-muted">
        <span className="min-w-0">
          {kept ? "Kept as a node" : grantLabel(thread.grant).replace(/^./, (first) => first.toUpperCase())}
          {thread.parent && !kept ? ` · reports to @${thread.parent.slug}` : ""}
        </span>
        {kept ? (
          chat ? (
            <Link href={`/r/${chat.id}`} className="text-accent hover:underline">
              Open its chat
            </Link>
          ) : null
        ) : thread.helper ? (
          <button type="button" onClick={() => void keep()} disabled={keeping} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-accent hover:bg-raised disabled:opacity-50">
            {keeping ? <Spinner className="h-3 w-3" /> : <UserPlus size={12} aria-hidden />} Keep as a node
          </button>
        ) : null}
      </div>
      <div className="scroll-thin max-h-80 overflow-y-auto px-2.5 py-2">
        {messages.isLoading ? (
          <div className="flex justify-center py-3 text-muted">
            <Spinner className="h-4 w-4" />
          </div>
        ) : messages.error ? (
          <p className="py-1 text-xs text-danger">{messages.error.message}</p>
        ) : !list.length ? (
          <p className="py-1 text-xs text-muted">Nothing has been said in it yet.</p>
        ) : (
          <ol className="space-y-2.5" aria-label={`${thread.title}, read only`}>
            {list.map((row) => {
              const node = author(row.authorNodeId);
              // The parent's brief opens the thread; the helper's report closes its step.
              const brief = Boolean(row.data?.brief);
              const report = row.data?.report && typeof row.data.report === "object" ? (row.data.report as { outcome?: string }) : null;
              const verdict = report ? outcomeBadge(report.outcome) : null;
              return (
                <li key={row.id} className="flex gap-2">
                  <span className="mt-0.5 shrink-0">{node ? <NodeAvatar node={node} size={20} /> : <PersonAvatar name={row.authorKind === "system" ? "Ensemble" : "You"} size={20} />}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 text-xs">
                      <span className="font-medium">{node ? node.name : row.authorKind === "system" ? "Ensemble" : "You"}</span>
                      {brief ? <Pill>Brief</Pill> : null}
                      {report ? <Pill tone={verdict?.tone ?? "muted"}>{verdict ? `Report · ${verdict.label}` : "Report"}</Pill> : null}
                      <span className="text-[10px] text-muted">{clock(row.createdAt)}</span>
                    </div>
                    {row.kind === "status" || row.kind === "error" ? (
                      <p className="text-xs text-muted">{row.body}</p>
                    ) : row.data?.deleted ? (
                      <p className="text-xs italic text-muted">Message deleted</p>
                    ) : (
                      <RichText text={row.body} handles={handles} small {...(row.authorKind === "node" ? { refs: messageRefs(row.data), showIds: row.data.showIds === true, kindLinks: true } : {})} />
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {live.length ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted" aria-live="polite">
            <Spinner className="h-3 w-3" /> {live.map((row) => author(row.nodeId)?.name ?? "A node").join(", ")} {live.some((row) => row.text) ? "writing…" : "thinking…"}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line px-2.5 py-1.5 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <Lock size={11} aria-hidden /> Read only.
          {thread.originPrivate ? <span className="text-private">Asked for privately: only you see it.</span> : null}
        </span>
        <Link href={`/r/${thread.roomId}`} className="text-accent hover:underline">
          Open the helper&apos;s room
        </Link>
      </div>
    </div>
  );
}

/** A collapsible chip under the message that brought a helper in; it opens to the helper's thread. */
export function HelperThreadChip({ thread }: { thread: HelperThread }) {
  const [open, setOpen] = useState(false);
  const busy = useBusyNodes();
  const id = useId();
  const working = Boolean(thread.helper && busy.has(thread.helper.id));
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={id}
        className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-xs text-muted transition hover:border-muted hover:text-ink ${thread.originPrivate ? "border-private/30 bg-private/5" : "border-line bg-bg"}`}
      >
        {thread.helper ? <NodeAvatar node={thread.helper} size={16} thinking={working} /> : <MessagesSquare size={13} aria-hidden />}
        <span className="min-w-0 truncate">{threadLabel(thread, working)}</span>
        {thread.originPrivate ? <Lock size={11} className="shrink-0 text-private" role="img" aria-label="Only you" /> : null}
        <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open ? <HelperThreadView thread={thread} id={id} /> : null}
    </div>
  );
}
