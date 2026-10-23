"use client";

import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, ShieldQuestion, X } from "lucide-react";
import { api } from "@/lib/api";
import { ENSEMBLE_LINKS } from "@/lib/config";
import { decisionMode, previewText, SOURCE_LABEL } from "@/lib/ensemble";
import { keys, nodesById, useActivity, useApprovals, useBootstrap, useDecisions } from "@/lib/hooks";
import { requestJump } from "@/lib/jump";
import { ago } from "@/lib/text";
import { toast } from "@/lib/toast";
import type { AgentDecision, ApprovalRecord } from "@/lib/types";
import { NodeAvatar } from "./node-avatar";
import { Button, External, Notice, Pill, Spinner } from "./ui";

function Card({ children, tone = "warn" }: { children: React.ReactNode; tone?: "warn" | "line" }) {
  return <li className={`rounded-2xl border p-4 ${tone === "warn" ? "border-warn/30 bg-warn/5" : "border-line bg-panel"}`}>{children}</li>;
}

function ApprovalItem({ approval }: { approval: ApprovalRecord }) {
  const client = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preview = previewText(approval.preview);
  const decide = async (decision: "approved" | "rejected") => {
    setError(null);
    setBusy(decision);
    try {
      await api(`/api/approvals/${approval.id}/decide`, { body: { decision } });
      await client.invalidateQueries({ queryKey: keys.approvals });
      toast(decision === "approved" ? "Approved." : "Rejected.", "ok");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setBusy(null);
    }
  };
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{approval.title}</span>
        <span className="flex items-center gap-2 text-xs text-muted">
          <Pill tone="warn">{approval.kind.replace(/_/g, " ")}</Pill> {ago(approval.requestedAt)}
        </span>
      </div>
      {preview ? <pre className="scroll-thin mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-bg p-2.5 font-mono text-xs">{preview}</pre> : null}
      {error ? (
        <div className="mt-2">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button busy={busy === "approved"} disabled={Boolean(busy)} onClick={() => void decide("approved")}>
          <Check size={15} /> Approve
        </Button>
        <Button tone="ghost" busy={busy === "rejected"} disabled={Boolean(busy)} onClick={() => void decide("rejected")}>
          <X size={15} /> Reject
        </Button>
        {approval.taskId ? (
          <External href={ENSEMBLE_LINKS.task(approval.taskId)} icon className="text-xs text-accent hover:underline">
            Open the task in Ensemble
          </External>
        ) : null}
      </div>
    </Card>
  );
}

function DecisionItem({ decision }: { decision: AgentDecision }) {
  const client = useQueryClient();
  const mode = decisionMode(decision);
  const detail = decision.detail ?? {};
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const answer = async (choice: "allow" | "deny", confirmed = false) => {
    setError(null);
    setBusy(choice);
    try {
      await api(`/api/decisions/${decision.id}/decide`, { body: { decision: choice, scope: "once", ...(confirmed ? { confirmed: true } : {}) } });
      await client.invalidateQueries({ queryKey: keys.decisions });
      toast(choice === "allow" ? "Allowed once." : "Denied.", "ok");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setBusy(null);
    }
  };
  const where = [SOURCE_LABEL[decision.source] ?? decision.source, detail.deviceName ? `on ${detail.deviceName}` : null, detail.taskTitle ? `for “${detail.taskTitle}”` : null].filter(Boolean).join(" ");
  const inEnsemble = (
    <External href={ENSEMBLE_LINKS.needsMe} icon className="text-sm text-accent hover:underline">
      Answer in Ensemble
    </External>
  );
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
      {error ? (
        <div className="mt-2">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}

      {mode === "options" ? (
        <div className="mt-3 space-y-2">
          <ul className="flex flex-wrap gap-1.5">
            {(detail.options ?? []).map((option) => (
              <li key={option} className={`rounded-lg border px-2 py-1 text-sm ${option === detail.recommended ? "border-accent/60 text-accent" : "border-line"}`}>
                {option}
                {option === detail.recommended ? " · suggested" : ""}
              </li>
            ))}
          </ul>
          {inEnsemble}
        </div>
      ) : mode === "elsewhere" ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted">
          Only the person whose computer runs it can answer this. {inEnsemble}
        </div>
      ) : mode === "device" ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-muted">Approve this on {detail.deviceName || "that computer"}: it takes this kind of approval only on itself. You can deny it from here.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button tone="ghost" busy={busy === "deny"} disabled={Boolean(busy)} onClick={() => void answer("deny")}>
              <X size={15} /> Deny
            </Button>
            {inEnsemble}
          </div>
        </div>
      ) : confirming ? (
        <div className="mt-3 space-y-2 rounded-xl border border-danger/40 bg-danger/5 p-3">
          <p className="flex items-start gap-2 text-sm">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" /> This one is risky (a push, a path outside the folder, or trusting a folder). Allow it once?
          </p>
          <div className="flex gap-2">
            <Button tone="danger" busy={busy === "allow"} disabled={Boolean(busy)} onClick={() => void answer("allow", true)}>
              Yes, allow once
            </Button>
            <Button tone="ghost" disabled={Boolean(busy)} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button busy={busy === "allow"} disabled={Boolean(busy)} onClick={() => (mode === "confirm" ? setConfirming(true) : void answer("allow"))}>
            <Check size={15} /> Allow once{mode === "confirm" ? "…" : ""}
          </Button>
          <Button tone="ghost" busy={busy === "deny"} disabled={Boolean(busy)} onClick={() => void answer("deny")}>
            <X size={15} /> Deny
          </Button>
        </div>
      )}
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
                    <NodeAvatar avatar={node?.avatar} size={28} />
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
