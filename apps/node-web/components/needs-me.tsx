"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, CircleSlash, ShieldQuestion } from "lucide-react";
import { cardWords } from "@/lib/cards";
import { ENSEMBLE_LINKS } from "@/lib/config";
import { previewText, SOURCE_LABEL } from "@/lib/ensemble";
import { nodesById, useActivity, useApprovals, useBootstrap, useDecisions, usePeerDecision, useSettle } from "@/lib/hooks";
import { requestJump } from "@/lib/jump";
import { ago } from "@/lib/text";
import type { AgentDecision, ApprovalRecord, Message, NodePublic, Room, WorkMode } from "@/lib/types";
import { HeldActions, HeldFiles } from "./chat/held-captures";
import { ModeChoice } from "./chat/room-work";
import { ApprovalActions, DecisionActions } from "./decision-answer";
import { NodeAvatar } from "./node-avatar";
import { SecretBox } from "./secret-box";
import { LoginBox } from "./login-box";
import { Button, External, Notice, Pill, Spinner } from "./ui";

function Card({ children, tone = "warn" }: { children: React.ReactNode; tone?: "warn" | "line" }) {
  return <li className={`rounded-2xl border p-4 ${tone === "warn" ? "border-warn/30 bg-warn/5" : "border-line bg-panel"}`}>{children}</li>;
}

function ApprovalItem({ approval }: { approval: ApprovalRecord }) {
  const preview = previewText(approval.preview);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{approval.title}</span>
        <span className="flex items-center gap-2 text-xs text-muted">
          <Pill tone="warn">{approval.kind.replace(/_/g, " ")}</Pill> {ago(approval.requestedAt)}
        </span>
      </div>
      {preview ? <pre className="scroll-thin mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-bg p-2.5 font-mono text-xs">{preview}</pre> : null}
      <div className="mt-3">
        <ApprovalActions approval={approval}>
          {approval.taskId ? (
            <External href={ENSEMBLE_LINKS.task(approval.taskId)} icon className="text-xs text-accent hover:underline">
              Open the task in Ensemble
            </External>
          ) : null}
        </ApprovalActions>
      </div>
    </Card>
  );
}

function DecisionItem({ decision }: { decision: AgentDecision }) {
  const detail = decision.detail ?? {};
  const where = [SOURCE_LABEL[decision.source] ?? decision.source, detail.deviceName ? `on ${detail.deviceName}` : null, detail.taskTitle ? `for “${detail.taskTitle}”` : null].filter(Boolean).join(" ");
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted">{where}</span>
        <span className="text-xs text-muted">
          {ago(decision.requestedAt)} · stops waiting {new Date(decision.expiresAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
        </span>
      </div>
      <div className="mt-1 font-medium">{detail.header ? `${detail.header}: ` : ""}{decision.title}</div>
      {detail.command ? <pre className="scroll-thin mt-2 overflow-x-auto rounded-lg bg-bg p-2.5 font-mono text-xs">{detail.command}</pre> : null}
      {decision.cwd ? <p className="mt-1 truncate font-mono text-[11px] text-muted">in {decision.cwd}</p> : null}
      <div className="mt-3">
        <DecisionActions decision={decision} />
      </div>
    </Card>
  );
}

/** One of my nodes' approval cards: answered right here, or opened in its conversation (My crew, for a room with other people). */
function NodeCardItem({ card, node, roomTitle, where }: { card: Message; node?: NodePublic; roomTitle: string; where: string }) {
  const settle = useSettle();
  const decide = usePeerDecision(card.roomId);
  const type = typeof card.data.type === "string" ? card.data.type : "tools";
  const words = cardWords(card.data, node?.slug ?? "node", roomTitle);
  // A proposed task on a room's board asks one question when accepting: how it runs.
  const modes = type === "peer_request" && Array.isArray(card.data.modes) && card.data.modes.length > 1 && typeof card.data.requestId === "string";
  const [mode, setMode] = useState<WorkMode>(card.data.defaultMode === "shared" ? "shared" : "private");
  const busy = settle.isPending || decide.isPending;
  const approve = () => (modes ? decide.mutate({ requestId: card.data.requestId, action: "accept", mode, cardId: card.id }) : settle.mutate({ messageId: card.id, decision: "approve" }));
  const error = decide.error?.message ?? settle.error?.message ?? (typeof card.data.error === "string" ? card.data.error : null);
  return (
    <Card>
      <div className="flex gap-3">
        <NodeAvatar node={node} size={30} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 font-medium">
              @{node?.slug ?? "node"} {words.wants}
            </span>
            <span className="mt-0.5 shrink-0 text-xs text-muted">{ago(card.createdAt)}</span>
          </div>
          {type === "media_preview" ? (
            <div className="mt-2">
              <HeldFiles card={card} />
            </div>
          ) : type === "login" ? null : (
            <p className="mt-1 line-clamp-6 whitespace-pre-wrap text-sm text-muted">{type === "secret" ? `${String(card.data.name ?? "")}: ${card.body}` : card.body}</p>
          )}
          {type === "secret" ? (
            <div className="mt-3">
              <SecretBox message={card} nodeName={node?.name ?? "The node"} />
            </div>
          ) : null}
          {type === "login" ? (
            <div className="mt-3">
              <LoginBox message={card} nodeName={node?.name ?? "The node"} />
            </div>
          ) : null}
          {modes ? (
            <div className="mt-2.5">
              <ModeChoice value={mode} onChange={setMode} name={`needs-mode-${card.id}`} />
            </div>
          ) : null}
          {error && type !== "secret" && type !== "login" ? <p className="mt-1 text-sm text-danger">{error}</p> : null}
          <div className={`mt-3 flex flex-wrap items-center gap-2 ${type === "secret" ? "hidden" : ""}`}>
            {type === "media_preview" ? <HeldActions card={card} settle={settle} approve={words.approve} discard={words.discard} size="sm" /> : null}
            {/* A sign-in card is answered in its own box; held captures and drafts have their own answers. */}
            {type === "post" || type === "media_preview" || type === "login" ? null : (
              <Button size="sm" busy={(settle.isPending && settle.variables?.decision === "approve") || decide.isPending} disabled={busy} onClick={approve}>
                <Check size={14} /> {words.approve}
              </Button>
            )}
            {type === "post" || type === "media_preview" || type === "login" ? null : (
              <Button size="sm" tone="ghost" busy={settle.isPending && settle.variables?.decision === "discard"} disabled={busy} onClick={() => settle.mutate({ messageId: card.id, decision: "discard" })}>
                <CircleSlash size={14} /> {words.discard}
              </Button>
            )}
            <Link href={`/r/${card.roomId}#m-${card.id}`} onClick={() => requestJump(card.roomId, card.id)} className="text-xs text-accent hover:underline">
              {type === "post" ? (card.data.request ? "Review the request in" : "Review the draft in") : "Open in"} {where}
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}

const TASK_STATUS: Record<string, string> = { blocked: "Blocked", waiting_approval: "Awaiting approval" };

/** Where a card is, for its link: "Lead's chat", "“Release crew”", "“Launch” (My crew)" for a private card in a room with other people. */
function cardPlace(room: Pick<Room, "kind" | "title"> | undefined, isPrivate: boolean): string {
  if (!room) return "its conversation";
  if (room.kind === "dm") return `${room.title}'s chat`;
  return `“${room.title}”${room.kind === "room" && isPrivate ? " (My crew)" : ""}`;
}

/**
 * Needs me, the same list as Ensemble's (the Hub and the CLI show it too): agents' questions, my
 * nodes' requests, run approvals and board tasks waiting on me. Everything is answerable here.
 */
export function NeedsMe() {
  const boot = useBootstrap();
  const activity = useActivity();
  const approvals = useApprovals();
  const decisions = useDecisions();
  const nodes = nodesById(boot.data);
  const rooms = new Map((boot.data?.rooms ?? []).map((room) => [room.id, room]));
  const cards = activity.data?.approvals ?? [];
  const tasks = activity.data?.waitingTasks ?? [];
  const loading = approvals.isLoading || decisions.isLoading || activity.isLoading;
  const empty = !loading && !cards.length && !tasks.length && !(approvals.data ?? []).length && !(decisions.data ?? []).length;
  return (
    <div className="space-y-6">
      {loading ? (
        <div className="flex justify-center py-6 text-muted">
          <Spinner />
        </div>
      ) : null}
      {decisions.error ? <Notice tone="error">Questions from agents: {decisions.error.message}</Notice> : null}
      {(decisions.data ?? []).length ? (
        <section className="space-y-2" aria-labelledby="needs-decisions">
          <h3 id="needs-decisions" className="text-xs font-semibold uppercase tracking-wide text-muted">Questions from agents ({decisions.data!.length})</h3>
          <ul className="space-y-2">
            {decisions.data!.map((row) => (
              <DecisionItem key={row.id} decision={row} />
            ))}
          </ul>
        </section>
      ) : null}

      {cards.length ? (
        <section className="space-y-2" aria-labelledby="needs-nodes">
          <h3 id="needs-nodes" className="text-xs font-semibold uppercase tracking-wide text-muted">From your nodes ({cards.length})</h3>
          <ul className="space-y-2">
            {cards.map((card) => (
              <NodeCardItem
                key={card.id}
                card={card}
                node={card.authorNodeId ? nodes.get(card.authorNodeId) : undefined}
                roomTitle={rooms.get(card.roomId)?.title ?? "the conversation"}
                where={cardPlace(rooms.get(card.roomId), card.private)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {approvals.error ? <Notice tone="error">Run approvals: {approvals.error.message}</Notice> : null}
      {(approvals.data ?? []).length ? (
        <section className="space-y-2" aria-labelledby="needs-runs">
          <h3 id="needs-runs" className="text-xs font-semibold uppercase tracking-wide text-muted">Run approvals ({approvals.data!.length})</h3>
          <ul className="space-y-2">
            {approvals.data!.map((row) => (
              <ApprovalItem key={row.id} approval={row} />
            ))}
          </ul>
        </section>
      ) : null}

      {tasks.length ? (
        <section className="space-y-2" aria-labelledby="needs-tasks">
          <h3 id="needs-tasks" className="text-xs font-semibold uppercase tracking-wide text-muted">Waiting tasks ({tasks.length})</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {tasks.map((task) => (
              <li key={task.id}>
                <External href={ENSEMBLE_LINKS.task(task.id)} className="flex h-full flex-col gap-1 rounded-2xl border border-line bg-panel p-3 text-sm hover:border-warn/50">
                  <Pill tone="warn">{TASK_STATUS[task.status] ?? task.status}</Pill>
                  <span className="font-medium">{task.title}</span>
                  <span className="text-xs text-muted">{ago(task.updatedAt)} · open in Ensemble</span>
                </External>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {empty ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-6 text-sm text-muted">
          <ShieldQuestion size={20} className="shrink-0" /> All caught up. What your nodes and the agents on your computers ask you shows up here, in Ensemble and in the CLI.
        </div>
      ) : null}
    </div>
  );
}
