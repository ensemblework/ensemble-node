"use client";

import { AlertTriangle, Check, ChevronDown, CircleSlash, Copy, CornerUpLeft, Cpu, ExternalLink, Lock, Pin, PinOff, Reply, SmilePlus, Trash2, Wrench, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { canDelete, canPin, canReact, isDeleted, messagePreview, reactionRows, reactionsOf } from "@/lib/chat";
import { ENSEMBLE_APP } from "@/lib/config";
import { useDeleteMessage, usePin, useReact, useSettle } from "@/lib/hooks";
import { clock, TOOL_LABEL } from "@/lib/text";
import { formatEntityText, messageRefs, readableBody } from "@/lib/entity-text";
import { toast, toastError } from "@/lib/toast";
import type { HeldCall, Member, Message, NodePublic, ReplyTo, RoomKind, ToolChip } from "@/lib/types";
import { toolChipSummary } from "@/lib/work-log";
import { NodeAvatar, PersonAvatar } from "../node-avatar";
import { ToolIcon } from "../tool-icon";
import { Button, External, Pill, Textarea } from "../ui";
import { MessageFiles } from "./file-chips";
import { RichText } from "./rich-text";
import { RunCard } from "./run-card";

export type MessageContext = {
  meId: string;
  roomId: string;
  roomTitle: string;
  roomKind: RoomKind;
  handles: ReadonlySet<string>;
  nodes: Map<string, NodePublic>;
  people: Map<string, Extract<Member, { kind: "person" }>>;
  /** The eight reactions this server offers. */
  reactions: readonly string[];
  pinned: ReadonlySet<string>;
  onReply: (message: Message) => void;
  onJump: (messageId: string) => void;
  /** A message that was not sent: send it again as it was, or put it back in the composer. */
  onRetry: (message: Message) => void;
  onEdit: (message: Message) => void;
};

const appLink = (href: string | null | undefined) => (href ? (href.startsWith("http") ? href : `${ENSEMBLE_APP}${href}`) : null);

function ToolRow({ tool }: { tool: ToolChip }) {
  const link = appLink(tool.href);
  const failed = tool.state === "failed";
  // Receipts name records by title; an older one may still carry an id beside its title.
  const summary = tool.summary ? formatEntityText(tool.summary, tool.refs, { plain: true }) : null;
  const content = (
    <>
      {failed ? <X size={12} className="shrink-0 text-danger" aria-label="Failed" role="img" /> : null}
      <ToolIcon name={tool.name} size={14} />
      <span className="shrink-0 font-medium">{TOOL_LABEL(tool.name)}</span>
      {summary ? <span className="min-w-0 truncate text-muted">· {summary}</span> : null}
      {link ? <ExternalLink size={11} className="shrink-0 text-muted" aria-hidden /> : null}
    </>
  );
  const style = `inline-flex max-w-full items-center gap-1 rounded-lg border px-2 py-1 text-xs ${failed ? "border-danger/30 bg-danger/5" : "border-line bg-bg"}`;
  return link ? (
    <External href={link} className={`${style} hover:border-accent`} title={summary ?? undefined}>
      {content}
    </External>
  ) : (
    <span className={style} title={summary ?? undefined}>
      {content}
    </span>
  );
}

/** What a reply used in Ensemble: one line ("Used 4 tools") that opens into the list, so ordinary chats stay clean. */
function ToolChips({ tools }: { tools: ToolChip[] }) {
  const [open, setOpen] = useState(false);
  if (!tools?.length) return null;
  if (tools.length === 1) {
    return (
      <div className="mt-2 flex">
        <ToolRow tool={tools[0]!} />
      </div>
    );
  }
  const summary = toolChipSummary(tools);
  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line bg-bg px-2 py-1 text-xs text-muted transition hover:border-muted hover:text-ink"
      >
        <Wrench size={12} className="shrink-0 text-accent" aria-hidden />
        <span className="shrink-0 font-medium text-ink">{summary.label}</span>
        {summary.names ? <span className="min-w-0 truncate">· {summary.names}</span> : null}
        {summary.failed ? <span className="shrink-0 text-danger">· {summary.failed} failed</span> : null}
        <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open ? (
        <ul className="mt-1.5 flex flex-col items-start gap-1" aria-label="Tools used">
          {tools.map((tool) => (
            <li key={tool.id} className="flex max-w-full">
              <ToolRow tool={tool} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const STATUS_PILL: Record<string, { label: string; tone: "warn" | "ok" | "muted" | "danger" | "accent" }> = {
  pending: { label: "Waiting for you", tone: "warn" },
  applying: { label: "Applying…", tone: "accent" },
  applied: { label: "Approved", tone: "ok" },
  partial: { label: "Partly applied", tone: "warn" },
  posted: { label: "Posted", tone: "ok" },
  discarded: { label: "Discarded", tone: "muted" },
};

function ApprovalCard({ message, ctx, node }: { message: Message; ctx: MessageContext; node?: NodePublic }) {
  const settle = useSettle();
  const data = message.data;
  const calls: HeldCall[] = Array.isArray(data.calls) ? data.calls : [];
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(calls.map((call) => call.callId)));
  const [body, setBody] = useState(message.body);
  const pending = data.status === "pending";
  const pill = STATUS_PILL[data.status] ?? { label: data.status, tone: "muted" as const };
  const error = settle.error?.message ?? (typeof data.error === "string" ? data.error : null);
  return (
    <div className="mt-1 rounded-2xl border border-warn/40 bg-warn/5 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {data.type === "post" ? `Post this in “${ctx.roomTitle}” for you?` : data.type === "session" ? `@${node?.slug ?? "node"} wants to start work on your computer` : `@${node?.slug ?? "node"} wants to do this for you`}
        </span>
        <span className="flex items-center gap-2">
          <Pill tone="private">
            <Lock size={10} /> only you
          </Pill>
          <Pill tone={pill.tone}>{pill.label}</Pill>
        </span>
      </div>
      {data.type === "session" ? (
        <p className="whitespace-pre-wrap rounded-lg bg-bg/70 p-2 text-sm">{message.body.replace(/^@\S+ wants to /, "")}</p>
      ) : data.type === "post" && data.status === "posted" ? null : data.type === "post" ? (
        pending ? (
          <Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={Math.min(10, Math.max(3, body.split("\n").length + 1))} />
        ) : (
          <RichText text={message.body} handles={ctx.handles} refs={messageRefs(data)} showIds={data.showIds === true} />
        )
      ) : (
        <ul className="space-y-1.5">
          {calls.map((call) => (
            <li key={call.callId}>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-bg/70 p-2 text-sm">
                {pending && calls.length > 1 ? (
                  <input
                    type="checkbox"
                    className="mt-1 accent-[rgb(var(--accent))]"
                    checked={chosen.has(call.callId)}
                    onChange={(event) => {
                      const next = new Set(chosen);
                      if (event.target.checked) next.add(call.callId);
                      else next.delete(call.callId);
                      setChosen(next);
                    }}
                  />
                ) : null}
                {call.name === "hub_assign_to_agent" ? (
                  <Cpu size={15} className="mt-0.5 text-accent" />
                ) : (
                  <ToolIcon name={call.name} className="mt-0.5" />
                )}
                <span>
                  <span className="block text-xs font-medium text-muted">{TOOL_LABEL(call.name)}</span>
                  <span className="whitespace-pre-wrap">{formatEntityText(call.summary, [], { plain: true })}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {data.result?.summary ? <p className="mt-2 text-sm text-ok">{formatEntityText(data.result.summary, [], { plain: true })}</p> : null}
      {data.result?.failed?.length ? <p className="mt-1 text-sm text-danger">{data.result.failed.map((row: { name: string; error: string }) => `${TOOL_LABEL(row.name)}: ${row.error}`).join(" · ")}</p> : null}
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      {pending ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            busy={settle.isPending && settle.variables?.decision === "approve"}
            disabled={settle.isPending || (data.type === "tools" && !chosen.size) || (data.type === "post" && !body.trim())}
            onClick={() => settle.mutate({ messageId: message.id, decision: "approve", ...(data.type === "post" ? { body } : data.type === "tools" ? { callIds: [...chosen] } : {}) })}
          >
            <Check size={16} /> {data.type === "post" ? "Post" : data.type === "session" ? "Start it" : chosen.size < calls.length ? `Approve ${chosen.size}` : "Approve"}
          </Button>
          <Button tone="ghost" disabled={settle.isPending} busy={settle.isPending && settle.variables?.decision === "discard"} onClick={() => settle.mutate({ messageId: message.id, decision: "discard" })}>
            <CircleSlash size={16} /> Discard
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Who wrote a message, as a short label for quotes and search results. */
export function authorLabel(message: Pick<Message, "authorKind" | "authorAccountId" | "authorNodeId">, ctx: Pick<MessageContext, "meId" | "nodes" | "people">): string {
  if (message.authorKind === "system") return "Ensemble";
  if (message.authorNodeId) return ctx.nodes.get(message.authorNodeId)?.name ?? "A node";
  if (message.authorAccountId === ctx.meId) return "You";
  return ctx.people.get(message.authorAccountId)?.name ?? "Someone";
}

/** What a reply quotes: shown above the reply, and above the composer while writing one. */
export function replyOf(message: Message, ctx: Pick<MessageContext, "meId" | "nodes" | "people">): ReplyTo {
  return {
    id: message.id,
    seq: message.seq,
    authorKind: message.authorKind,
    handle: message.authorNodeId ? (ctx.nodes.get(message.authorNodeId)?.slug ?? null) : (ctx.people.get(message.authorAccountId)?.handle ?? null),
    excerpt: messagePreview(message).slice(0, 160),
  };
}

function ReplyQuote({ reply, onJump, mine }: { reply: ReplyTo; onJump: (id: string) => void; mine: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onJump(reply.id)}
      className={`mb-1 flex max-w-full items-start gap-1.5 rounded-lg border-l-2 border-accent/60 bg-bg/60 px-2 py-1 text-left text-xs text-muted hover:text-ink ${mine ? "ml-auto" : ""}`}
      title="Go to the message"
    >
      <CornerUpLeft size={12} className="mt-0.5 shrink-0 text-accent" />
      <span className="min-w-0">
        <span className="font-medium text-ink">{reply.handle ? `@${reply.handle}` : reply.authorKind === "node" ? "A node" : "Someone"}</span>{" "}
        <span className="line-clamp-2 break-words">{reply.excerpt || "📎 Files"}</span>
      </span>
    </button>
  );
}

function Reactions({ message, ctx, mine }: { message: Message; ctx: MessageContext; mine: boolean }) {
  const react = useReact();
  const rows = reactionRows(reactionsOf(message), ctx.reactions, ctx.meId, (id) => ctx.people.get(id)?.name ?? "Someone");
  if (!rows.length) return null;
  return (
    <div className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : ""}`}>
      {rows.map((row) => (
        <button
          key={row.emoji}
          type="button"
          title={row.names}
          aria-label={`${row.emoji} ${row.count}: ${row.names}. ${row.mine ? "Take back yours" : "Add yours"}`}
          aria-pressed={row.mine}
          onClick={() => react.mutate({ message, emoji: row.emoji })}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${row.mine ? "border-accent/60 bg-accent/15 text-ink" : "border-line bg-panel text-muted hover:border-muted"}`}
        >
          <span className="text-sm leading-none">{row.emoji}</span>
          <span className="tabular-nums">{row.count}</span>
        </button>
      ))}
    </div>
  );
}

function ActionButton({ label, onClick, children, tone }: { label: string; onClick: () => void; children: ReactNode; tone?: "danger" }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted transition hover:bg-raised ${tone === "danger" ? "hover:text-danger" : "hover:text-ink"}`}>
      {children}
    </button>
  );
}

/** Reply, react, copy, pin and delete: on hover or focus on a computer, after a long press on a phone. */
function MessageActions({ message, ctx, mine, open, setOpen }: { message: Message; ctx: MessageContext; mine: boolean; open: boolean; setOpen: (open: boolean) => void }) {
  const react = useReact();
  const pin = usePin(ctx.roomId);
  const remove = useDeleteMessage();
  const [emoji, setEmoji] = useState(false);
  const pinned = ctx.pinned.has(message.id);
  const close = () => {
    setEmoji(false);
    setOpen(false);
  };
  if (!canReact(message)) return null;
  return (
    <div
      className={`absolute -top-4 z-20 flex items-center gap-0.5 rounded-xl border border-line bg-panel p-0.5 shadow-lg transition ${mine ? "right-1" : "right-1 md:right-4"} ${open || emoji ? "opacity-100" : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"}`}
      role="toolbar"
      aria-label="Message actions"
    >
      {emoji ? (
        ctx.reactions.map((value) => (
          <button
            key={value}
            type="button"
            aria-label={`React with ${value}`}
            onClick={() => {
              react.mutate({ message, emoji: value });
              close();
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-base transition hover:scale-110 hover:bg-raised"
          >
            {value}
          </button>
        ))
      ) : (
        <>
          <ActionButton label="Add a reaction" onClick={() => setEmoji(true)}>
            <SmilePlus size={15} />
          </ActionButton>
          <ActionButton label="Reply" onClick={() => (ctx.onReply(message), close())}>
            <Reply size={15} />
          </ActionButton>
          {message.body ? (
            <ActionButton label="Copy text" onClick={() => void navigator.clipboard.writeText(readableBody(message)).then(() => toast("Copied.", "ok"), toastError).finally(close)}>
              <Copy size={14} />
            </ActionButton>
          ) : null}
          {pinned || canPin(message) ? (
            <ActionButton label={pinned ? "Unpin" : "Pin for everyone here"} onClick={() => (pin.mutate({ messageId: message.id, pinned: !pinned }, { onSuccess: () => toast(pinned ? "Unpinned." : "Pinned.", "ok") }), close())}>
              {pinned ? <PinOff size={14} /> : <Pin size={14} />}
            </ActionButton>
          ) : null}
          {canDelete(message, ctx.meId) ? (
            <ActionButton
              label="Delete"
              tone="danger"
              onClick={() => {
                close();
                if (confirm("Delete this message? Its text goes for everyone; a “Message deleted” line stays.")) remove.mutate(message);
              }}
            >
              <Trash2 size={14} />
            </ActionButton>
          ) : null}
        </>
      )}
      {emoji ? (
        <ActionButton label="Close reactions" onClick={() => setEmoji(false)}>
          <X size={14} />
        </ActionButton>
      ) : null}
    </div>
  );
}

/** Opens the action bar after a long press (phones), and closes it on a tap elsewhere. */
function useLongPress(): { open: boolean; setOpen: (open: boolean) => void; bind: Record<string, unknown>; ref: React.RefObject<HTMLDivElement | null> } {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: Event) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);
  return {
    open,
    setOpen,
    ref,
    bind: {
      onTouchStart: () => {
        cancel();
        timer.current = setTimeout(() => setOpen(true), 450);
      },
      onTouchEnd: cancel,
      onTouchMove: cancel,
      onContextMenu: (event: React.MouseEvent) => {
        if (window.matchMedia("(pointer: coarse)").matches) event.preventDefault();
      },
    },
  };
}

function Deleted() {
  return <span className="text-sm italic text-muted">Message deleted</span>;
}

export function MessageItem({ message, ctx, grouped, highlighted, fresh }: { message: Message; ctx: MessageContext; grouped: boolean; highlighted?: boolean; fresh?: boolean }) {
  const press = useLongPress();
  if (message.kind === "status") {
    return (
      <div id={`m-${message.id}`} className={`py-2 text-center text-xs text-muted ${highlighted ? "rounded-lg bg-accent/10" : ""}`}>
        {message.body}
      </div>
    );
  }
  const mine = message.authorKind === "human" && message.authorAccountId === ctx.meId;
  const node = message.authorNodeId ? ctx.nodes.get(message.authorNodeId) : undefined;
  const person = message.authorKind === "human" ? ctx.people.get(message.authorAccountId) : undefined;
  const ownerName = node && node.ownerId !== ctx.meId ? ctx.people.get(node.ownerId)?.name : null;
  const deleted = isDeleted(message);
  const reply = message.data?.replyTo as ReplyTo | undefined;
  const pinned = ctx.pinned.has(message.id);
  const ring = highlighted ? "ring-2 ring-accent/70 ring-offset-2 ring-offset-bg" : "";

  if (mine && message.kind === "text") {
    return (
      <div id={`m-${message.id}`} ref={press.ref} {...press.bind} data-new-message={fresh || undefined} className={`chat-message group relative flex justify-end ${grouped ? "mt-1.5" : "mt-6"}`}>
        <MessageActions message={message} ctx={ctx} mine open={press.open} setOpen={press.setOpen} />
        <div className="min-w-0 max-w-[88%] md:max-w-[78%]">
          {reply ? <ReplyQuote reply={reply} onJump={ctx.onJump} mine /> : null}
          {deleted || message.body ? (
            <div className={`rounded-2xl rounded-br-md px-4 py-2.5 transition ${ring} ${deleted ? "border border-dashed border-line" : message.private ? "border border-private/40 bg-private/10" : "bg-accent/15"}`}>
              {deleted ? <Deleted /> : <RichText text={message.body} handles={ctx.handles} />}
            </div>
          ) : null}
          {deleted ? null : (
            <div className={`rounded-2xl transition ${message.body ? "" : ring}`}>
              <MessageFiles message={message} meId={ctx.meId} align="end" />
            </div>
          )}
          <Reactions message={message} ctx={ctx} mine />
          <div className="mt-1 flex justify-end gap-2 text-[11px] text-muted">
            {pinned ? (
              <span className="inline-flex items-center gap-1 text-accent">
                <Pin size={10} /> pinned
              </span>
            ) : null}
            {message.private ? (
              <span className="inline-flex items-center gap-1 text-private">
                <Lock size={10} /> only you and your nodes
              </span>
            ) : null}
            {message.failed ? (
              <span className="inline-flex flex-wrap items-center justify-end gap-x-2 text-danger">
                <span>Not sent: {message.failed}</span>
                <button type="button" onClick={() => ctx.onRetry(message)} className="font-medium text-ink underline-offset-2 hover:underline" title="Send it again, with the same files">
                  Retry
                </button>
                <button type="button" onClick={() => ctx.onEdit(message)} className="font-medium text-ink underline-offset-2 hover:underline" title="Put it back in the message box">
                  Edit
                </button>
              </span>
            ) : message.sending ? (
              "Sending…"
            ) : (
              clock(message.createdAt)
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id={`m-${message.id}`} ref={press.ref} {...press.bind} data-new-message={fresh || undefined} className={`chat-message group relative flex gap-2.5 md:gap-3 ${grouped ? "mt-1.5" : "mt-7"}`}>
      <MessageActions message={message} ctx={ctx} mine={false} open={press.open} setOpen={press.setOpen} />
      <div className="w-9 shrink-0">
        {grouped ? null : node ? <NodeAvatar node={node} size={32} title={node.name} /> : <PersonAvatar name={person?.name ?? "?"} size={32} />}
      </div>
      <div className="min-w-0 max-w-[92%] flex-1 md:max-w-[80%]">
        {grouped ? null : (
          <div className="mb-0.5 flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-semibold">{node ? node.name : (person?.name ?? "Someone")}</span>
            {ownerName ? <span className="text-xs text-muted">{ownerName}&apos;s node</span> : null}
            <span className="text-[10px] text-muted opacity-70">{clock(message.createdAt)}</span>
            {pinned ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-accent">
                <Pin size={10} /> pinned
              </span>
            ) : null}
            {message.private && message.kind === "text" ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-private">
                <Lock size={10} /> only you
              </span>
            ) : null}
          </div>
        )}
        {reply ? <ReplyQuote reply={reply} onJump={ctx.onJump} mine={false} /> : null}
        <div className={`rounded-2xl transition ${ring}`}>
          {message.kind === "approval" ? (
            <ApprovalCard message={message} ctx={ctx} node={node} />
          ) : message.kind === "run" ? (
            <RunCard message={message} ctx={ctx} node={node} />
          ) : message.kind === "error" ? (
            <div className="flex items-start gap-2 rounded-2xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
              <span>
                {message.body}
                <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-private">
                  <Lock size={10} /> only you
                </span>
              </span>
            </div>
          ) : deleted ? (
            <Deleted />
          ) : (
            <div className={message.private ? "rounded-2xl border border-private/30 bg-private/5 px-3 py-2" : ""}>
              {message.body ? <RichText text={message.body} handles={ctx.handles} {...(message.authorKind === "node" ? { refs: messageRefs(message.data), showIds: message.data.showIds === true } : {})} /> : null}
              <MessageFiles message={message} meId={ctx.meId} sender={person?.name} />
              <ToolChips tools={Array.isArray(message.data.tools) ? message.data.tools : []} />
            </div>
          )}
        </div>
        <Reactions message={message} ctx={ctx} mine={false} />
      </div>
    </div>
  );
}
