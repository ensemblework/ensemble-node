"use client";

/**
 * A run's work log: consecutive tool calls in a group with a one-line summary; each call with its
 * icon, command or target, output and duration; thinking collapsed; the engine's messages and the
 * run's milestones between groups. Only the newest items render until "Show earlier" is pressed.
 *
 * Adapted from T3 Code's TimelineWorkGroupRows, TimelineWorkEntryRow, WorkLog,
 * TimelineToolActivityIcon, ShellCommandBlock and CommandOutputPanel (MIT License, Copyright (c) 2026 T3 Tools Inc.).
 */
import { memo, useState, type ReactNode } from "react";
import { Bot, Brain, ChevronRight, Eye, Globe, Hammer, Info, MessageCircle, Plug, Search, SquarePen, SquareTerminal, TriangleAlert, Wrench, X, type LucideIcon } from "lucide-react";
import { formatDuration, groupKind, shortPath, stripAnsi, type WorkEntry, type WorkGroup, type WorkItem, type WorkKind } from "@/lib/work-log";
import { Spinner } from "../ui";
import { CopyButton } from "./code-block";
import { RichText } from "./rich-text";

const ICON: Record<WorkKind | "mixed", LucideIcon> = {
  command: SquareTerminal,
  edit: SquarePen,
  read: Eye,
  search: Search,
  web: Globe,
  fetch: Globe,
  mcp: Plug,
  question: MessageCircle,
  agent: Bot,
  thinking: Brain,
  tool: Wrench,
  mixed: Hammer,
};

/** Items shown at first, and how many more each "Show earlier" adds. */
const FIRST = 12;
const MORE = 30;
const NO_HANDLES: ReadonlySet<string> = new Set();

const rowClass = "flex min-h-7 w-full min-w-0 items-center gap-2 rounded-md px-1 text-left text-[13px] leading-snug";
const focusClass = "hover:bg-raised/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60";

function Trailing({ status, ms }: { status: WorkEntry["status"] | "group"; ms: number | null }) {
  if (status === "running") return <Spinner className="h-3 w-3 shrink-0 text-accent" />;
  return ms !== null ? <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">{formatDuration(ms)}</span> : null;
}

function Block({ label, children, copy }: { label: string; children: ReactNode; copy?: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
        {label}
        {copy ? <CopyButton text={copy} label={`Copy the ${label.toLowerCase()}`} className="h-6 w-6" /> : null}
      </div>
      {children}
    </div>
  );
}

const preClass = "scroll-thin max-h-60 overflow-auto rounded-md bg-bg p-2 font-mono text-[11px] leading-relaxed";

function clip(text: string, lines = 40): string {
  const rows = text.split("\n");
  return rows.length > lines ? `${rows.slice(0, lines).join("\n")}\n…` : text;
}

function EntryDetails({ entry }: { entry: WorkEntry }) {
  if (entry.kind === "thinking") {
    return <p className="ml-7 whitespace-pre-wrap break-words pb-1.5 pr-1 text-[13px] italic leading-relaxed text-muted">{entry.output}</p>;
  }
  const output = entry.output ? stripAnsi(entry.output).trimEnd() : "";
  return (
    <div className="ml-7 space-y-2 pb-2 pr-1">
      {entry.command ? (
        <Block label="Command" copy={entry.command}>
          <pre className={`${preClass} whitespace-pre-wrap break-all text-ink`}>
            <span className="select-none text-muted">$ </span>
            {entry.command}
          </pre>
        </Block>
      ) : null}
      {entry.files.length > 1 ? (
        <Block label="Files">
          <ul className="font-mono text-[11px] text-ink">
            {entry.files.map((file) => (
              <li key={file} className="truncate" title={file}>
                {shortPath(file, 80)}
              </li>
            ))}
          </ul>
        </Block>
      ) : null}
      {entry.diff ? (
        <Block label="Change">
          <pre className={`${preClass} whitespace-pre-wrap break-all`} aria-label="Lines removed and added">
            {entry.diff.removed
              ? clip(entry.diff.removed)
                  .split("\n")
                  .map((line, at) => (
                    <span key={`r${at}`} className="block bg-danger/10 text-danger">
                      - {line}
                    </span>
                  ))
              : null}
            {entry.diff.added
              ? clip(entry.diff.added)
                  .split("\n")
                  .map((line, at) => (
                    <span key={`a${at}`} className="block bg-ok/10 text-ok">
                      + {line}
                    </span>
                  ))
              : null}
          </pre>
        </Block>
      ) : null}
      {entry.detail ? (
        <Block label="Input">
          <pre className={`${preClass} whitespace-pre-wrap break-all text-muted`}>{entry.detail}</pre>
        </Block>
      ) : null}
      {entry.error && entry.error !== output ? <p className="break-words text-xs text-danger">{entry.error}</p> : null}
      {output ? (
        <Block label="Output">
          <pre className={`${preClass} whitespace-pre text-muted`}>{output}</pre>
        </Block>
      ) : entry.kind === "command" && entry.status === "done" ? (
        <p className="text-xs italic text-muted">No output.</p>
      ) : null}
    </div>
  );
}

function expandable(entry: WorkEntry): boolean {
  return Boolean(entry.output?.trim() || entry.detail || entry.diff || entry.error || entry.command || entry.files.length > 1);
}

const EntryRow = memo(function EntryRow({ entry }: { entry: WorkEntry }) {
  const [open, setOpen] = useState(false);
  const Icon = ICON[entry.kind];
  const failed = entry.status === "failed";
  const label =
    entry.kind === "command" ? (
      <code className="truncate font-mono text-[12px] text-ink">{entry.label}</code>
    ) : entry.kind === "thinking" ? (
      <span className="truncate italic text-muted">{entry.label || "Thought"}</span>
    ) : (
      <span className="truncate text-ink/90">{entry.label}</span>
    );
  const content = (
    <>
      <Icon size={14} className={`shrink-0 ${failed ? "text-danger" : "text-muted"}`} aria-hidden />
      <span className={`min-w-0 flex-1 truncate ${entry.status === "running" ? "live-shine" : ""}`}>{label}</span>
      {failed ? <X size={12} className="shrink-0 text-danger" aria-label="Failed" /> : null}
      {entry.status === "skipped" ? <span className="shrink-0 text-[11px] text-muted">stopped</span> : null}
      <Trailing status={entry.status} ms={entry.ms} />
    </>
  );
  if (!expandable(entry)) {
    return (
      <div className={rowClass} title={entry.label}>
        {content}
      </div>
    );
  }
  return (
    <div>
      <button
        type="button"
        className={`${rowClass} ${focusClass}`}
        aria-expanded={open}
        aria-label={`${entry.kind === "thinking" ? "Thought" : entry.label}${failed ? ", failed" : ""}`}
        title={entry.kind === "command" ? entry.command ?? entry.label : entry.label}
        onClick={() => setOpen(!open)}
      >
        {content}
      </button>
      {open ? <EntryDetails entry={entry} /> : null}
    </div>
  );
});

const GroupRow = memo(function GroupRow({ group, live }: { group: WorkGroup; live: boolean }) {
  const [choice, setChoice] = useState<boolean | null>(null);
  if (group.entries.length === 1) return <EntryRow entry={group.entries[0]!} />;
  // The group the run is working in stays open until it is closed; finished ones fold away.
  const open = choice ?? live;
  const Icon = ICON[groupKind(group.entries)];
  return (
    <div>
      <button
        type="button"
        className={`${rowClass} ${focusClass}`}
        aria-expanded={open}
        aria-label={`${group.summary}${group.failed ? `, ${group.failed} failed` : ""}`}
        onClick={() => setChoice(!open)}
      >
        <ChevronRight size={13} className={`shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
        <Icon size={14} className="shrink-0 text-muted" aria-hidden />
        <span className={`min-w-0 flex-1 truncate ${group.running ? "live-shine" : "text-ink/90"}`}>{group.summary}</span>
        {group.failed ? <span className="shrink-0 text-[11px] text-danger">{group.failed} failed</span> : null}
        <Trailing status={group.running ? "running" : "group"} ms={group.ms} />
      </button>
      {open ? (
        <div className="ml-[13px] border-l border-line pl-1.5">
          {group.entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} />
          ))}
        </div>
      ) : null}
    </div>
  );
});

function NoteRow({ tone, text }: { tone: "info" | "warn"; text: string }) {
  const Icon = tone === "warn" ? TriangleAlert : Info;
  return (
    <div className={`flex items-start gap-2 px-1 py-1 text-xs ${tone === "warn" ? "text-warn" : "text-muted"}`}>
      <Icon size={13} className="mt-0.5 shrink-0" aria-hidden />
      <span className="min-w-0 break-words">{text}</span>
    </div>
  );
}

/** The work log of one run. `active` keeps the newest group open while the run works in it. */
export function WorkLogView({ items, active }: { items: readonly WorkItem[]; active: boolean }) {
  const [shown, setShown] = useState(FIRST);
  const hidden = Math.max(0, items.length - shown);
  const visible = hidden ? items.slice(hidden) : items;
  const lastGroup = [...items].reverse().find((item) => item.kind === "group")?.id;
  if (!items.length) return <p className="px-1 py-1 text-xs text-muted">{active ? "Nothing yet. The steps appear here as the agent works." : "This run kept no steps."}</p>;
  return (
    <div className="min-w-0" role="list" aria-label="Work log">
      {hidden ? (
        <button type="button" onClick={() => setShown(shown + MORE)} className={`${rowClass} ${focusClass} text-xs text-accent`}>
          Show {Math.min(MORE, hidden)} earlier {Math.min(MORE, hidden) === 1 ? "step" : "steps"}
          {hidden > MORE ? <span className="text-muted">({hidden} hidden)</span> : null}
        </button>
      ) : null}
      {visible.map((item) => (
        <div role="listitem" key={item.id}>
          {item.kind === "group" ? (
            <GroupRow group={item} live={active && item.id === lastGroup} />
          ) : item.kind === "message" ? (
            <div className="px-1 py-1.5 text-ink/90">
              <RichText text={item.text} handles={NO_HANDLES} small />
            </div>
          ) : (
            <NoteRow tone={item.tone} text={item.text} />
          )}
        </div>
      ))}
    </div>
  );
}

