"use client";

/**
 * Sessions (Ensemble docs/35 §8.9): every coding-agent session of mine, on any computer, most recently
 * active first, whether a node manages it or it was started in the Hub or the CLI. Each says what it
 * works on, where it runs, what it did last and who manages it, with Hand to… (or Give to…) another of
 * my nodes; opening one shows its queue, its controls when a node manages it, and its recent runs, and
 * "Open in conversation" goes to its newest run card.
 * Read again when a session's card changes on the event stream, and gently while the page is open.
 */
import Link from "next/link";
import { MessageSquare, Search, SquareTerminal } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { nodesById, useBootstrap, useSessionList } from "@/lib/hooks";
import { requestJump } from "@/lib/jump";
import { cardLink, runsCount, sessionLatest, sessionPlace, sessionStatus } from "@/lib/session";
import { ago } from "@/lib/text";
import type { NodePublic, SessionSummary } from "@/lib/types";
import { SessionDetailView, SessionManager } from "./chat/session";
import { ModelLogo } from "./model-logo";
import { Button, Drawer, Notice, Pill, Spinner } from "./ui";

function SessionRow({ row, nodes, onOpen }: { row: SessionSummary; nodes: ReadonlyMap<string, NodePublic>; onOpen: () => void }) {
  const titleId = useId();
  const badge = sessionStatus(row.status);
  const latest = sessionLatest(row);
  const where = sessionPlace(row);
  const card = cardLink(row.card);
  return (
    <li>
      <article aria-labelledby={titleId} className="rounded-2xl border border-line bg-panel p-3.5">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5">
            <ModelLogo provider={row.agent} size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 id={titleId} className="min-w-0 break-words text-sm font-semibold">
                {row.title}
              </h3>
              <Pill tone={badge.tone}>{badge.label}</Pill>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {[row.agentName, row.model, where, runsCount(row.runs)].filter(Boolean).join(" · ")}
              <span title={new Date(row.lastActiveAt).toLocaleString()}> · {ago(row.lastActiveAt)}</span>
            </p>
            {latest ? (
              <p className="mt-1.5 break-words text-[13px]">
                <span className="text-muted">Latest: </span>
                {latest}
              </p>
            ) : null}
            {row.summary ? <p className="mt-1 line-clamp-2 break-words text-[13px] text-muted">{row.summary}</p> : null}
            <SessionManager sessionId={row.id} managerId={row.nodeId} owner nodes={nodes} />
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <Button size="sm" tone="ghost" onClick={onOpen} aria-label={`Open “${row.title}”`}>
                Open
              </Button>
              {card ? (
                <Link href={card.href} onClick={() => requestJump(card.roomId, card.messageId)} className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                  <MessageSquare size={12} aria-hidden /> Open in conversation
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </article>
    </li>
  );
}

export function SessionsView() {
  const boot = useBootstrap();
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  const list = useSessionList(q);
  const [open, setOpen] = useState<SessionSummary | null>(null);
  const nodes = nodesById(boot.data);
  // Searching waits for a pause in typing.
  useEffect(() => {
    const timer = setTimeout(() => setQ(typed.trim()), 250);
    return () => clearTimeout(timer);
  }, [typed]);
  const rows = list.data ?? [];
  // The open session follows the list (who manages it, its state) while it is open.
  const opened = open ? (rows.find((row) => row.id === open.id) ?? open) : null;
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-8 md:px-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Sessions</h1>
          <p className="text-sm text-muted">Your coding agents&apos; sessions on your computers, the most recently active first: the ones your nodes manage, and the ones started in Ensemble or the CLI. Hand one to another node, or give one no node manages to a node, so it carries the work on.</p>
        </div>
        <label className="flex items-center gap-2 rounded-xl border border-line bg-bg/70 px-3 py-2 text-muted focus-within:border-accent">
          <Search size={15} className="shrink-0" aria-hidden />
          <input aria-label="Search sessions" placeholder="Search by task, folder, agent or computer" value={typed} onChange={(event) => setTyped(event.target.value)} className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted sm:text-sm" />
          {list.isFetching && !list.isLoading ? <Spinner className="h-3.5 w-3.5" /> : null}
        </label>
        {list.isLoading ? (
          <div className="flex justify-center py-8 text-muted">
            <Spinner />
          </div>
        ) : list.error ? (
          <Notice tone="error">{list.error.message}</Notice>
        ) : rows.length ? (
          <ul className="space-y-2" aria-label="Sessions">
            {rows.map((row) => (
              <SessionRow key={row.id} row={row} nodes={nodes} onOpen={() => setOpen(row)} />
            ))}
          </ul>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-6 text-sm text-muted">
            <SquareTerminal size={20} className="shrink-0" aria-hidden />
            {q ? "No session matches that." : "No sessions yet. When a node or you start work in a coding agent on your computer, its session shows here."}
          </div>
        )}
      </div>
      <Drawer open={Boolean(opened)} onClose={() => setOpen(null)} title={opened ? `${opened.agentName} in ${opened.folder}` : "Session"}>
        {opened ? (
          <div className="space-y-3">
            <p className="break-words text-sm font-medium">{opened.title}</p>
            <SessionDetailView key={opened.id} sessionId={opened.id} fallback={opened} nodes={nodes} />
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
