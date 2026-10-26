"use client";

import Link from "next/link";
import { ShieldQuestion } from "lucide-react";
import { ENSEMBLE_LINKS } from "@/lib/config";
import { previewText, SOURCE_LABEL } from "@/lib/ensemble";
import { nodesById, useActivity, useApprovals, useBootstrap, useDecisions } from "@/lib/hooks";
import { requestJump } from "@/lib/jump";
import { ago } from "@/lib/text";
import type { AgentDecision, ApprovalRecord } from "@/lib/types";
import { ApprovalActions, DecisionActions } from "./decision-answer";
import { NodeAvatar } from "./node-avatar";
import { External, Notice, Pill, Spinner } from "./ui";

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

/** What waits for me in Ensemble's Needs me, plus my nodes' approval cards, answerable here. */
export function NeedsMe() {
  const boot = useBootstrap();
  const activity = useActivity();
  const approvals = useApprovals();
  const decisions = useDecisions();
  const nodes = nodesById(boot.data);
  const rooms = new Map((boot.data?.rooms ?? []).map((room) => [room.id, room]));
  const cards = activity.data?.approvals ?? [];
  const loading = approvals.isLoading || decisions.isLoading;
  const empty = !loading && !cards.length && !(approvals.data ?? []).length && !(decisions.data ?? []).length;
  return (
    <div className="space-y-6">
      {cards.length ? (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">From your nodes ({cards.length})</h3>
          <ul className="space-y-2">
            {cards.map((card) => {
              const node = card.authorNodeId ? nodes.get(card.authorNodeId) : undefined;
              return (
                <li key={card.id}>
                  <Link href={`/r/${card.roomId}#m-${card.id}`} onClick={() => requestJump(card.roomId, card.id)} className="flex gap-3 rounded-2xl border border-warn/30 bg-warn/5 p-3 text-sm hover:border-warn/60">
                    <NodeAvatar node={node} size={28} />
                    <span className="min-w-0">
                      <span className="block font-medium">{card.data.type === "post" ? `@${node?.slug ?? "node"} wants to post for you` : `@${node?.slug ?? "node"} wants to act for you`}</span>
                      <span className="line-clamp-2 text-muted">{card.body}</span>
                      <span className="text-xs text-muted">in {rooms.get(card.roomId)?.title ?? "a conversation"} · answer it there</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-6 text-muted">
          <Spinner />
        </div>
      ) : null}
      {approvals.error ? <Notice tone="error">Run approvals: {approvals.error.message}</Notice> : null}
      {(approvals.data ?? []).length ? (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Run approvals ({approvals.data!.length})</h3>
          <ul className="space-y-2">
            {approvals.data!.map((row) => (
              <ApprovalItem key={row.id} approval={row} />
            ))}
          </ul>
        </section>
      ) : null}
      {decisions.error ? <Notice tone="error">Questions from agents: {decisions.error.message}</Notice> : null}
      {(decisions.data ?? []).length ? (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Questions from agents ({decisions.data!.length})</h3>
          <ul className="space-y-2">
            {decisions.data!.map((row) => (
              <DecisionItem key={row.id} decision={row} />
            ))}
          </ul>
        </section>
      ) : null}
      {empty ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-6 text-sm text-muted">
          <ShieldQuestion size={20} className="shrink-0" /> Nothing needs you right now. Questions from runs on your computers show up here, in Ensemble and on your phone.
        </div>
      ) : null}
    </div>
  );
}
