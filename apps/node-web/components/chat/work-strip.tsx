"use client";

/**
 * A room's "Working on" strip (the extension's work board, E§3.3): my live plans, pieces of work and
 * agent sessions in this conversation, and its helpers, from what is already loaded. A chip opens its
 * card in the timeline; a helper whose message is not loaded opens its thread. Nothing here asks the
 * server for more.
 */
import { Hammer, ListChecks, Sparkles } from "lucide-react";
import { useBusyNodes } from "@/lib/live";
import type { HelperThread } from "@/lib/threads";
import type { BoardItem } from "@/lib/work";
import { NodeAvatar } from "../node-avatar";

const ICON = { plan: ListChecks, work: Sparkles, session: Hammer } as const;
const KIND = { plan: "Plan", work: "Work", session: "Agent run" } as const;
const chip = "inline-flex max-w-[18rem] items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 py-1 text-left transition hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";

/** `helpers`: this room's helper threads, with the loaded message each shows under (a chip jumps there) or null. */
export function WorkStrip({ items, helpers, onJump, onHelper }: { items: BoardItem[]; helpers: Array<{ thread: HelperThread; messageId: string | null }>; onJump: (messageId: string) => void; onHelper: (thread: HelperThread) => void }) {
  const busy = useBusyNodes();
  const working = helpers.filter(({ thread }) => thread.helper && busy.has(thread.helper.id));
  const quiet = helpers.filter((row) => row.messageId === null && !working.includes(row));
  if (!items.length && !working.length && !quiet.length) return null;
  const openHelper = (row: { thread: HelperThread; messageId: string | null }) => (row.messageId ? onJump(row.messageId) : onHelper(row.thread));
  return (
    <div role="region" aria-label="Working on" className="scroll-thin flex shrink-0 items-center gap-2 overflow-x-auto whitespace-nowrap border-b border-line bg-panel/60 px-3 py-1.5 text-xs md:px-6">
      {items.length || working.length ? (
        <>
          <span className="shrink-0 font-semibold uppercase tracking-wide text-muted">Working on</span>
          <ul className="flex shrink-0 items-center gap-1.5">
            {items.map((item) => {
              const Icon = ICON[item.kind];
              return (
                <li key={`${item.kind}-${item.id}`}>
                  <button type="button" onClick={() => onJump(item.messageId)} className={chip} title={`${KIND[item.kind]}: ${item.title} · ${item.detail}`}>
                    <Icon size={13} className="shrink-0 text-accent" aria-hidden />
                    <span className="sr-only">{KIND[item.kind]}: </span>
                    <span className="min-w-0 truncate font-medium text-ink">{item.title}</span>
                    <span className="shrink-0 text-muted">· {item.detail}</span>
                  </button>
                </li>
              );
            })}
            {working.map((row) => (
              <li key={row.thread.roomId}>
                <button type="button" onClick={() => openHelper(row)} className={chip} title={`${row.thread.title} · working`}>
                  {row.thread.helper ? <NodeAvatar node={row.thread.helper} size={14} thinking /> : null}
                  <span className="min-w-0 truncate font-medium text-ink">@{row.thread.helper?.slug ?? "helper"}</span>
                  <span className="shrink-0 text-muted">· helper · working</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {quiet.length ? (
        <>
          <span className="shrink-0 font-semibold uppercase tracking-wide text-muted">Helpers</span>
          <ul className="flex shrink-0 items-center gap-1.5">
            {quiet.map((row) => (
              <li key={row.thread.roomId}>
                <button type="button" onClick={() => onHelper(row.thread)} className={chip} title={row.thread.title}>
                  {row.thread.helper ? <NodeAvatar node={row.thread.helper} size={14} /> : null}
                  <span className="min-w-0 truncate font-medium text-ink">@{row.thread.helper?.slug ?? "helper"}</span>
                  <span className="shrink-0 text-muted">
                    · {row.thread.count} {row.thread.count === 1 ? "message" : "messages"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
