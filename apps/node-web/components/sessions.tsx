"use client";

import Link from "next/link";
import { ArrowUpRight, FileCode2, Search, SquareTerminal } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { useSessionList } from "@/lib/hooks";
import { requestJump } from "@/lib/jump";
import { fileName, originalKey } from "@/lib/original-files";
import { cardLink, runsCount, sessionPlace, sessionStatus } from "@/lib/session";
import { ago } from "@/lib/text";
import type { SessionSummary } from "@/lib/types";
import { useFileWorkspace } from "./files/workspace";
import { ModelLogo } from "./model-logo";
import { Button, Notice, Spinner } from "./ui";

function SessionRow({ row }: { row: SessionSummary }) {
  const titleId = useId();
  const workspace = useFileWorkspace();
  const [expanded, setExpanded] = useState(false);
  const badge = sessionStatus(row.status);
  const card = cardLink(row.card);
  const files = row.files ?? [];
  const shown = expanded ? files : files.slice(0, 2);
  return <li>
    <article aria-labelledby={titleId} className="session-card rounded-2xl border border-line bg-panel p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-raised"><ModelLogo provider={row.agent} size={22} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h2 id={titleId} className="min-w-0 break-words text-sm font-semibold">{row.title}</h2>
            <time dateTime={row.lastActiveAt} title={`Last interaction: ${new Date(row.lastActiveAt).toLocaleString()}`} aria-label={`Last interaction: ${new Date(row.lastActiveAt).toLocaleString()}`} className="shrink-0 text-xs tabular-nums text-muted">{ago(row.lastActiveAt)}</time>
          </div>
          <p className="mt-1 break-words text-xs leading-5 text-muted">{[row.agentName, row.model, sessionPlace(row), runsCount(row.runs)].filter(Boolean).join(" · ")}</p>
          {row.usedBy?.length ? <ul aria-label="Used by" className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            {row.usedBy.map(({ node, room }) => <li key={`${node.id}:${room?.id ?? ""}`}><span className="font-medium text-ink">@{node.slug}</span>{room ? <> <span className="px-0.5">in</span> <Link href={`/r/${room.id}`} className="hover:text-ink hover:underline">{room.title}</Link></> : null}</li>)}
          </ul> : null}
        </div>
      </div>
      {files.length ? <div className="mt-4">
        <ul aria-label={`Files from ${row.title}`} className="grid gap-2 sm:grid-cols-2">
          {shown.map(file => <li key={originalKey(file)} className="min-w-0">
            <button type="button" disabled={file.deleted} onClick={() => workspace.open(file)} aria-label={`Open ${file.source.path}`} title={file.deleted ? `${file.source.path} · deleted on computer` : file.source.path} className="group flex min-h-14 w-full min-w-0 items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-left transition-colors hover:border-accent/50 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50">
              <FileCode2 size={17} className="shrink-0 text-accent" aria-hidden />
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{fileName(file.source.path)}</span><span className="block truncate text-[11px] text-muted">{file.deleted ? "Deleted on computer" : file.source.path}</span></span>
              <ArrowUpRight size={13} className="shrink-0 text-muted group-hover:text-accent" aria-hidden />
            </button>
          </li>)}
        </ul>
        {files.length > 2 ? <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} className="mt-1 min-h-9 rounded-lg px-1 text-xs text-muted hover:text-ink">{expanded ? "Show fewer files" : `Show ${files.length - 2} more ${files.length === 3 ? "file" : "files"}`}</button> : null}
      </div> : null}
      <div className="mt-3 flex items-center justify-between gap-3 text-xs">
        <span className={`inline-flex items-center gap-1.5 ${badge.tone === "warn" ? "text-warn" : badge.tone === "accent" ? "text-accent" : "text-muted"}`}><span aria-hidden className="size-1.5 rounded-full bg-current" />{badge.label}</span>
        {card ? <Link href={card.href} onClick={() => requestJump(card.roomId, card.messageId)} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-1 text-muted hover:text-ink">Open in conversation <ArrowUpRight size={13} aria-hidden /></Link> : null}
      </div>
    </article>
  </li>;
}

export function SessionsView() {
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  const [expandedQuery, setExpandedQuery] = useState<string | null>(null);
  const list = useSessionList(q);
  useEffect(() => {
    const timer = setTimeout(() => setQ(typed.trim()), 250);
    return () => clearTimeout(timer);
  }, [typed]);
  const rows = useMemo(() => [...(list.data ?? [])].sort((a, b) => (Date.parse(b.lastActiveAt) || 0) - (Date.parse(a.lastActiveAt) || 0)), [list.data]);
  const expanded = expandedQuery === q;
  return <div className="scroll-thin h-full overflow-y-auto">
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:px-8 md:py-12">
      <header><p className="mb-2 text-xs text-muted">Your workspace</p><h1 className="text-2xl font-semibold tracking-tight">Sessions</h1><p className="mt-2 text-sm text-muted">A place for every piece of work.</p></header>
      <label className="search-field flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2.5 text-muted">
        <Search size={16} className="shrink-0" aria-hidden />
        <input name="session-search" autoComplete="off" spellCheck={false} aria-label="Search sessions" placeholder="Find a session, node, crew or file…" value={typed} onChange={event => setTyped(event.target.value)} className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted sm:text-sm" />
        {list.isFetching && !list.isLoading ? <Spinner className="h-3.5 w-3.5" /> : null}
      </label>
      {list.isLoading ? <div className="flex justify-center py-10 text-muted" role="status" aria-label="Loading sessions"><Spinner /></div>
        : list.error ? <Notice tone="error">{list.error.message}</Notice>
          : rows.length ? <div className="space-y-4">
            <ul className="space-y-3" aria-label="Sessions">{(expanded ? rows : rows.slice(0, 5)).map(row => <SessionRow key={row.id} row={row} />)}</ul>
            {rows.length > 5 ? <div className="flex items-center justify-between gap-3 text-xs text-muted"><span>{expanded ? rows.length : 5} of {rows.length} sessions</span><Button tone="quiet" size="sm" aria-expanded={expanded} onClick={() => setExpandedQuery(expanded ? null : q)}>{expanded ? "Show less" : `Show more (${rows.length - 5})`}</Button></div> : null}
          </div> : <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-8 text-sm text-muted"><SquareTerminal size={22} className="shrink-0" aria-hidden />{q ? "No session matches that." : "Your coding sessions will appear here, together with the files they change."}</div>}
    </div>
  </div>;
}
