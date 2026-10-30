"use client";

import Link from "next/link";
import { Cpu, ShieldQuestion } from "lucide-react";
import { cardWords } from "@/lib/cards";
import { useActivity, useBootstrap, nodesById } from "@/lib/hooks";
import { requestJump } from "@/lib/jump";
import { ago, RUN_LABEL } from "@/lib/text";
import { CreditsMeter } from "./credits";
import { ComputerList } from "./connect-computer";
import { NodeAvatar } from "./node-avatar";
import { External, Pill, Spinner } from "./ui";
import { ENSEMBLE_LINKS } from "@/lib/config";

const RUN_TONE: Record<string, "ok" | "warn" | "danger" | "accent" | "muted"> = {
  succeeded: "ok",
  failed: "danger",
  interrupted: "warn",
  waiting_approval: "warn",
  blocked: "warn",
  running: "accent",
  claimed: "accent",
};

/** Everything waiting on you and everything your nodes started: approvals, computer runs, recent turns. */
export function ActivityPanel() {
  const activity = useActivity();
  const boot = useBootstrap();
  const nodes = nodesById(boot.data);
  const rooms = new Map((boot.data?.rooms ?? []).map((room) => [room.id, room]));
  if (!activity.data) return <div className="flex justify-center p-6 text-muted">{activity.error ? <span className="text-sm">{activity.error.message}</span> : <Spinner />}</div>;
  const { approvals, runs, turns, computers, credits } = activity.data;
  return (
    <div className="space-y-6 p-4">
      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
          <ShieldQuestion size={14} /> Waiting for you {approvals.length ? <Pill tone="warn">{approvals.length}</Pill> : null}
        </h3>
        {approvals.length ? (
          approvals.map((card) => {
            const node = card.authorNodeId ? nodes.get(card.authorNodeId) : undefined;
            return (
              <Link key={card.id} href={`/r/${card.roomId}#m-${card.id}`} onClick={() => requestJump(card.roomId, card.id)} className="flex gap-2 rounded-xl border border-warn/30 bg-warn/5 p-2.5 text-sm hover:border-warn/60">
                <NodeAvatar node={node} size={24} />
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    @{node?.slug ?? "node"} {cardWords(card.data, node?.slug ?? "node", rooms.get(card.roomId)?.title ?? "the conversation").wants}
                  </span>
                  <span className="line-clamp-2 text-xs text-muted">{card.body}</span>
                  <span className="text-[11px] text-muted">{rooms.get(card.roomId)?.title ?? ""}</span>
                </span>
              </Link>
            );
          })
        ) : (
          <p className="text-sm text-muted">Nothing right now.</p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
          <Cpu size={14} /> Computer runs
        </h3>
        {runs.length ? (
          runs.slice(0, 8).map((run) => (
            <External key={run.id} href={ENSEMBLE_LINKS.task(run.taskId)} className="block rounded-xl border border-line bg-bg p-2.5 text-sm hover:border-muted">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{run.title}</span>
                <Pill tone={RUN_TONE[run.status] ?? "muted"}>{RUN_LABEL[run.status] ?? run.status}</Pill>
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted">
                {run.computer ? `${run.computer} · ` : ""}
                {run.progress ?? run.summary ?? ago(run.createdAt)}
              </span>
            </External>
          ))
        ) : (
          <p className="text-sm text-muted">No runs yet. Ask a node to do something on your computer.</p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Recent turns</h3>
        {turns.slice(0, 8).map((turn) => {
          const node = nodes.get(turn.nodeId);
          return (
            <div key={turn.id} className="flex items-center gap-2 text-xs">
              <NodeAvatar node={node} size={18} thinking={turn.status === "running"} />
              <span className="truncate">@{node?.slug ?? "node"}</span>
              <span className="text-muted">{turn.reason}</span>
              <span className={`ml-auto ${turn.status === "failed" ? "text-danger" : "text-muted"}`}>{turn.status === "done" ? (turn.credits != null ? `${Math.round(turn.credits)} cr` : "done") : turn.status}</span>
            </div>
          );
        })}
        {!turns.length ? <p className="text-sm text-muted">None yet.</p> : null}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Computers</h3>
        <ComputerList computers={computers} />
        <Link href="/settings#computers" className="text-sm text-accent hover:underline">
          {computers.length ? "Computers" : "Connect one"}
        </Link>
      </section>

      <section>
        <CreditsMeter credits={credits} />
      </section>
    </div>
  );
}
