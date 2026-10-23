"use client";

import { AlertTriangle, Check, CircleSlash, Cpu, ExternalLink, Lock, Wrench, X } from "lucide-react";
import { useState } from "react";
import { ENSEMBLE_APP } from "@/lib/config";
import { useSettle } from "@/lib/hooks";
import { clock, RUN_LABEL, TOOL_LABEL } from "@/lib/text";
import type { HeldCall, Member, Message, NodePublic, ToolChip } from "@/lib/types";
import { NodeAvatar, PersonAvatar } from "../node-avatar";
import { Button, Pill, Textarea } from "../ui";
import { RichText } from "./rich-text";

export type MessageContext = {
  meId: string;
  roomTitle: string;
  handles: ReadonlySet<string>;
  nodes: Map<string, NodePublic>;
  people: Map<string, Extract<Member, { kind: "person" }>>;
};

const appLink = (href: string | null | undefined) => (href ? (href.startsWith("http") ? href : `${ENSEMBLE_APP}${href}`) : null);

function ToolChips({ tools }: { tools: ToolChip[] }) {
  if (!tools?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {tools.map((tool) => {
        const link = appLink(tool.href);
        const failed = tool.state === "failed";
        const content = (
          <>
            {failed ? <X size={12} className="text-danger" /> : <Wrench size={12} className="text-accent" />}
            <span className="font-medium">{TOOL_LABEL(tool.name)}</span>
            {tool.summary ? <span className="max-w-[280px] truncate text-muted">· {tool.summary}</span> : null}
            {link ? <ExternalLink size={11} className="text-muted" /> : null}
          </>
        );
        const style = `inline-flex max-w-full items-center gap-1 rounded-lg border px-2 py-1 text-xs ${failed ? "border-danger/30 bg-danger/5" : "border-line bg-bg"}`;
        return link ? (
          <a key={tool.id} href={link} target="_blank" rel="noreferrer" className={`${style} hover:border-accent`} title={tool.summary ?? undefined}>
            {content}
          </a>
        ) : (
          <span key={tool.id} className={style} title={tool.summary ?? undefined}>
            {content}
          </span>
        );
      })}
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
          {data.type === "post" ? `Post this in “${ctx.roomTitle}” for you?` : `@${node?.slug ?? "node"} wants to do this for you`}
        </span>
        <span className="flex items-center gap-2">
          <Pill tone="private">
            <Lock size={10} /> only you
          </Pill>
          <Pill tone={pill.tone}>{pill.label}</Pill>
        </span>
      </div>
      {data.type === "post" && data.status === "posted" ? null : data.type === "post" ? (
        pending ? (
          <Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={Math.min(10, Math.max(3, body.split("\n").length + 1))} />
        ) : (
          <RichText text={message.body} handles={ctx.handles} />
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
                ) : call.name === "hub_assign_to_agent" ? (
                  <Cpu size={15} className="mt-0.5 text-accent" />
                ) : (
                  <Wrench size={15} className="mt-0.5 text-accent" />
                )}
                <span>
                  <span className="block text-xs font-medium text-muted">{TOOL_LABEL(call.name)}</span>
                  <span>{call.summary}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {data.result?.summary ? <p className="mt-2 text-sm text-ok">{data.result.summary}</p> : null}
      {data.result?.failed?.length ? <p className="mt-1 text-sm text-danger">{data.result.failed.map((row: { name: string; error: string }) => `${TOOL_LABEL(row.name)}: ${row.error}`).join(" · ")}</p> : null}
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      {pending ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            busy={settle.isPending && settle.variables?.decision === "approve"}
            disabled={settle.isPending || (data.type !== "post" && !chosen.size) || (data.type === "post" && !body.trim())}
            onClick={() => settle.mutate({ messageId: message.id, decision: "approve", ...(data.type === "post" ? { body } : { callIds: [...chosen] }) })}
          >
            <Check size={16} /> {data.type === "post" ? "Post" : chosen.size < calls.length ? `Approve ${chosen.size}` : "Approve"}
          </Button>
          <Button tone="ghost" disabled={settle.isPending} busy={settle.isPending && settle.variables?.decision === "discard"} onClick={() => settle.mutate({ messageId: message.id, decision: "discard" })}>
            <CircleSlash size={16} /> Discard
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const RUN_TONE: Record<string, "ok" | "warn" | "danger" | "accent" | "muted"> = {
  succeeded: "ok",
  failed: "danger",
  interrupted: "warn",
  waiting_approval: "warn",
  blocked: "warn",
  running: "accent",
  claimed: "accent",
  queued: "muted",
};

function RunCard({ message }: { message: Message }) {
  const data = message.data;
  const live = ["queued", "claimed", "running", "stopping"].includes(data.status);
  return (
    <div className="mt-1 rounded-2xl border border-line bg-panel p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Cpu size={16} className={live ? "animate-pulse text-accent" : "text-muted"} /> {message.body}
        </span>
        <Pill tone={RUN_TONE[data.status] ?? "muted"}>{RUN_LABEL[data.status] ?? data.status}</Pill>
      </div>
      <p className="mt-1 text-xs text-muted">{data.computer ? `On ${data.computer}` : "On your computer"}</p>
      {data.progress && live ? <p className="mt-2 text-sm">{data.progress}</p> : null}
      {data.summary ? <p className="mt-2 text-sm">{data.summary}</p> : null}
      {data.error ? <p className="mt-2 text-sm text-danger">{data.error}</p> : null}
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        <a href={`${ENSEMBLE_APP}/tasks/${data.taskId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
          Open the task in Ensemble <ExternalLink size={11} />
        </a>
        {data.status === "waiting_approval" ? (
          <a href={`${ENSEMBLE_APP}/needs-me`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-warn hover:underline">
            Answer it in Needs me <ExternalLink size={11} />
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function MessageItem({ message, ctx, grouped }: { message: Message; ctx: MessageContext; grouped: boolean }) {
  if (message.kind === "status") {
    return <div className="py-2 text-center text-xs text-muted">{message.body}</div>;
  }
  const mine = message.authorKind === "human" && message.authorAccountId === ctx.meId;
  const node = message.authorNodeId ? ctx.nodes.get(message.authorNodeId) : undefined;
  const person = message.authorKind === "human" ? ctx.people.get(message.authorAccountId) : undefined;
  const ownerName = node && node.ownerId !== ctx.meId ? ctx.people.get(node.ownerId)?.name : null;

  if (mine && message.kind === "text") {
    return (
      <div id={`m-${message.id}`} className={`flex justify-end ${grouped ? "mt-1" : "mt-4"}`}>
        <div className="max-w-[85%] md:max-w-[70%]">
          <div className={`rounded-2xl rounded-br-md px-4 py-2.5 ${message.private ? "border border-private/40 bg-private/10" : "bg-accent/15"}`}>
            <RichText text={message.body} handles={ctx.handles} />
          </div>
          <div className="mt-1 flex justify-end gap-2 text-[11px] text-muted">
            {message.private ? (
              <span className="inline-flex items-center gap-1 text-private">
                <Lock size={10} /> only you and your nodes
              </span>
            ) : null}
            {message.failed ? <span className="text-danger">Not sent: {message.failed}</span> : message.sending ? "Sending…" : clock(message.createdAt)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id={`m-${message.id}`} className={`flex gap-3 ${grouped ? "mt-1" : "mt-4"}`}>
      <div className="w-9 shrink-0">
        {grouped ? null : node ? <NodeAvatar avatar={node.avatar} size={36} title={node.name} /> : <PersonAvatar name={person?.name ?? "?"} size={34} />}
      </div>
      <div className="min-w-0 max-w-[92%] flex-1 md:max-w-[80%]">
        {grouped ? null : (
          <div className="mb-0.5 flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-semibold">{node ? node.name : (person?.name ?? "Someone")}</span>
            {node ? <span className="font-mono text-xs text-muted">@{node.slug}</span> : null}
            {ownerName ? <span className="text-xs text-muted">{ownerName}&apos;s node</span> : null}
            <span className="text-[11px] text-muted">{clock(message.createdAt)}</span>
            {message.private && message.kind === "text" ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-private">
                <Lock size={10} /> only you
              </span>
            ) : null}
          </div>
        )}
        {message.kind === "approval" ? (
          <ApprovalCard message={message} ctx={ctx} node={node} />
        ) : message.kind === "run" ? (
          <RunCard message={message} />
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
        ) : (
          <div className={message.private ? "rounded-2xl border border-private/30 bg-private/5 px-3 py-2" : ""}>
            <RichText text={message.body} handles={ctx.handles} />
            <ToolChips tools={Array.isArray(message.data.tools) ? message.data.tools : []} />
          </div>
        )}
      </div>
    </div>
  );
}
