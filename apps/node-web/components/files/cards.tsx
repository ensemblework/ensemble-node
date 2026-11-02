"use client";

import { useState } from "react";
import { ArrowUpRight, FileCode2, Quote } from "lucide-react";
import { fileName, type FileQuote } from "@/lib/original-files";
import type { Message } from "@/lib/types";
import { useFileWorkspace } from "./workspace";

type Changed = { path: string; fileId: string; folder: string; deleted?: boolean };
export function OriginalFilesCard({ message }: { message: Message }) {
  const workspace = useFileWorkspace();
  const [all, setAll] = useState(false);
  const sources = Array.isArray(message.data.sources) ? message.data.sources.filter((file: unknown): file is Changed => Boolean(file && typeof file === "object" && "path" in file && typeof file.path === "string" && "fileId" in file && typeof file.fileId === "string")) : [];
  if (!sources.length) return null;
  return <section className="mt-2 overflow-hidden rounded-2xl border border-line bg-panel" aria-label="Original files">
    <header className="border-b border-line px-3.5 py-2.5 text-xs font-medium">{sources.length} {sources.length === 1 ? "file" : "files"} <span className="ml-1 font-normal text-muted">· originals on your computer</span></header>
    <div className="p-1">{(all ? sources : sources.slice(0, 6)).map(file => <button key={file.fileId} type="button" onClick={() => workspace.open({ source: { kind: "node", id: message.id, fileId: file.fileId, path: file.path }, deviceId: message.data.deviceId, folder: file.folder, roomId: message.roomId, nodeId: message.authorNodeId ?? undefined, deleted: file.deleted })} className="group flex min-h-14 w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-raised" title={file.path}>
      <FileCode2 size={20} strokeWidth={1.5} className="shrink-0 text-accent/80" />
      <span className="min-w-0 flex-1"><span className={`block truncate text-sm font-medium ${file.deleted ? "line-through" : ""}`}>{fileName(file.path)}</span><span className="block truncate text-[11px] text-muted">{file.path === fileName(file.path) ? file.folder : file.path}{file.deleted ? " · deleted" : ""}</span></span>
      <ArrowUpRight size={14} className="shrink-0 text-muted group-hover:text-ink" />
    </button>)}</div>
    {!all && sources.length > 6 ? <button type="button" className="w-full border-t border-line px-3 py-2 text-xs text-muted hover:bg-raised hover:text-ink" onClick={() => setAll(true)}>Show all {sources.length} files</button> : null}
  </section>;
}

export function SentFileQuotes({ quotes, own }: { quotes?: FileQuote[]; own: boolean }) {
  const workspace = useFileWorkspace();
  if (!quotes?.length) return null;
  return <div className="mb-1.5 space-y-1.5" aria-label="Quoted file selections">{quotes.map((quote, index) => <div key={index} className="overflow-hidden rounded-xl border border-line bg-panel text-left">
    <div className="flex items-center gap-2 px-3 py-2 text-xs"><Quote size={13} className="shrink-0 text-accent" /><span className="min-w-0 flex-1 truncate font-medium">{fileName(quote.source.path)} <span className="font-normal text-muted">· {quote.from === quote.to ? `line ${quote.from}` : `lines ${quote.from}–${quote.to}`}{quote.draft ? " · unsaved selection" : ""}</span></span>{own ? <button type="button" className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-ink" aria-label={`Open ${fileName(quote.source.path)}`} onClick={() => workspace.open({ source: quote.source })}><ArrowUpRight size={13} /></button> : null}</div>
    <details className="border-t border-line px-3 py-2"><summary className="cursor-pointer text-[11px] text-muted">Selected lines</summary><pre className="scroll-thin mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words pb-1 font-mono text-[11px] leading-5 text-muted">{quote.text}</pre></details>
  </div>)}</div>;
}
