"use client";

/**
 * A helper's conversation shown inline (build block B18): a chip under the message that brought the
 * helper in ("@scout, helper of @lead · working · 4 messages") that opens in place to the helper's
 * thread, read only, read from its task room's messages. A link opens the task room itself.
 */
import Link from "next/link";
import { ChevronDown, Lock, MessagesSquare } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { messageRefs } from "@/lib/entity-text";
import { markRead, useBootstrap, useMessages } from "@/lib/hooks";
import { useBusyNodes, useLiveRoom } from "@/lib/live";
import { clock } from "@/lib/text";
import { threadLabel, type HelperThread } from "@/lib/threads";
import type { NodePublic } from "@/lib/types";
import { NodeAvatar, PersonAvatar } from "../node-avatar";
import { Spinner } from "../ui";
import { RichText } from "./rich-text";

/** The helper's conversation, read only, newest at the bottom, with what is being written now. */
export function HelperThreadView({ thread, id }: { thread: HelperThread; id?: string }) {
  const client = useQueryClient();
  const boot = useBootstrap();
  const messages = useMessages(thread.roomId);
  const live = useLiveRoom(thread.roomId);
  const room = boot.data?.rooms.find((row) => row.id === thread.roomId);
  const nodes = useMemo(() => new Map((room?.members ?? []).flatMap((member) => (member.kind === "node" ? [[member.node.id, member.node] as const] : []))), [room]);
  const handles = useMemo(() => new Set((room?.members ?? []).map((member) => member.handle)), [room]);
  const list = (messages.data ?? []).filter((row) => !row.planId);
  const lastSeq = list.reduce((max, row) => (row.id.startsWith("local-") ? max : Math.max(max, row.seq)), 0);
  // Reading it here reads the task room, so it does not wait unread.
  useEffect(() => {
    if (lastSeq) markRead(client, thread.roomId, lastSeq);
  }, [client, thread.roomId, lastSeq]);
  const author = (nodeId: string | null): NodePublic | undefined => (nodeId ? nodes.get(nodeId) : undefined);
  return (
    <div id={id} className="mt-1.5 overflow-hidden rounded-xl border border-line bg-bg/50">
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
              return (
                <li key={row.id} className="flex gap-2">
                  <span className="mt-0.5 shrink-0">{node ? <NodeAvatar node={node} size={20} /> : <PersonAvatar name={row.authorKind === "system" ? "Ensemble" : "You"} size={20} />}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 text-xs">
                      <span className="font-medium">{node ? node.name : row.authorKind === "system" ? "Ensemble" : "You"}</span>
                      <span className="text-[10px] text-muted">{clock(row.createdAt)}</span>
                    </div>
                    {row.kind === "status" || row.kind === "error" ? (
                      <p className="text-xs text-muted">{row.body}</p>
                    ) : row.data?.deleted ? (
                      <p className="text-xs italic text-muted">Message deleted</p>
                    ) : (
                      <RichText text={row.body} handles={handles} small {...(row.authorKind === "node" ? { refs: messageRefs(row.data), showIds: row.data.showIds === true } : {})} />
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
          <Lock size={11} aria-hidden /> Read only.{thread.parent ? ` The helper reports to @${thread.parent.slug}.` : ""}
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
        className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line bg-bg px-2 py-1 text-xs text-muted transition hover:border-muted hover:text-ink"
      >
        {thread.helper ? <NodeAvatar node={thread.helper} size={16} thinking={working} /> : <MessagesSquare size={13} aria-hidden />}
        <span className="min-w-0 truncate">{threadLabel(thread, working)}</span>
        <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open ? <HelperThreadView thread={thread} id={id} /> : null}
    </div>
  );
}
