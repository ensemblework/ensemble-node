"use client";

/**
 * Answering Ensemble's Needs me from Node: a question or permission from an agent, or a run approval.
 * The Needs me page and a run card's inline panel both use these. The choices (allow once, for this
 * run, deny; options with the recommended one marked, and a typed answer) are adapted from T3 Code's
 * ComposerPendingApprovalActions and ComposerPendingUserInputPanel (MIT License, Copyright (c) 2026 T3 Tools Inc.).
 */
import { useState, type ReactNode } from "react";
import { AlertTriangle, Check, Send, X } from "lucide-react";
import { ENSEMBLE_LINKS } from "@/lib/config";
import { answeredNote, decisionBody, decisionView } from "@/lib/decisions";
import { useDecide, useDecideApproval } from "@/lib/hooks";
import type { AgentDecision, ApprovalRecord } from "@/lib/types";
import { Button, External, Input, Notice } from "./ui";

type Size = "sm" | "md";

function InEnsemble({ size }: { size: Size }) {
  return (
    <External href={ENSEMBLE_LINKS.needsMe} icon className={`${size === "sm" ? "text-xs" : "text-sm"} text-accent hover:underline`}>
      Answer in Ensemble
    </External>
  );
}

/** What can be answered here for one question from Needs me, and the request it sends. */
export function DecisionActions({ decision, size = "md" }: { decision: AgentDecision; size?: Size }) {
  const decide = useDecide();
  const view = decisionView(decision);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ forRun: boolean; answer: string | null } | null>(null);
  const text = size === "sm" ? "text-xs" : "text-sm";

  const send = (key: string, choice: { allow: boolean; forRun?: boolean; answer?: string | null; confirmed?: boolean }) => {
    const body = decisionBody(choice);
    setError(null);
    setBusy(key);
    decide.mutate(
      { id: decision.id, body, jobId: decision.detail?.jobId, note: answeredNote(view, body) },
      {
        onError: (failure) => {
          setError(failure.message);
          setConfirming(null);
        },
        onSettled: () => setBusy(null),
      },
    );
  };
  const allow = (key: string, forRun: boolean, answer: string | null = null) => {
    if ((view.kind === "question" || view.kind === "permission") && view.confirm) setConfirming({ forRun, answer });
    else send(key, { allow: true, forRun, answer });
  };
  const deny = (label: ReactNode) => (
    <Button size={size} tone="ghost" busy={busy === "deny"} disabled={Boolean(busy)} onClick={() => send("deny", { allow: false })}>
      <X size={size === "sm" ? 13 : 15} /> {label}
    </Button>
  );

  let body: ReactNode;
  if (view.kind === "elsewhere") {
    body = (
      <p className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${text} text-muted`}>
        Only the person whose computer runs it can answer this. <InEnsemble size={size} />
      </p>
    );
  } else if (view.kind === "in-ensemble") {
    body = (
      <div className="space-y-2">
        <ul className="flex flex-wrap gap-1.5">
          {(decision.detail?.options ?? []).map((option) => (
            <li key={option} className={`rounded-lg border px-2 py-1 ${text} ${option === decision.detail?.recommended ? "border-accent/60 text-accent" : "border-line"}`}>
              {option}
              {option === decision.detail?.recommended ? " · suggested" : ""}
            </li>
          ))}
        </ul>
        <InEnsemble size={size} />
      </div>
    );
  } else if (view.kind === "on-computer") {
    body = (
      <div className="space-y-2">
        <p className={`${text} text-muted`}>Approve this on {view.computer}: it takes this kind of approval only on itself. You can deny it from here.</p>
        <div className="flex flex-wrap items-center gap-2">
          {deny("Deny")}
          <InEnsemble size={size} />
        </div>
      </div>
    );
  } else if (confirming) {
    body = (
      <div className="space-y-2 rounded-xl border border-danger/40 bg-danger/5 p-3" role="alertdialog" aria-label="Confirm">
        <p className={`flex items-start gap-2 ${text}`}>
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
          <span>
            This one is risky (a push, a path outside the folder, or trusting a folder). {confirming.answer ? `Answer “${confirming.answer}”?` : confirming.forRun ? "Allow it for this run?" : "Allow it once?"}
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size={size} tone="danger" busy={busy === "confirm"} disabled={Boolean(busy)} onClick={() => send("confirm", { allow: true, forRun: confirming.forRun, answer: confirming.answer, confirmed: true })}>
            {confirming.answer ? "Yes, send it" : confirming.forRun ? "Yes, allow for this run" : "Yes, allow once"}
          </Button>
          <Button size={size} tone="ghost" disabled={Boolean(busy)} onClick={() => setConfirming(null)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  } else if (view.kind === "question") {
    const submit = () => typed.trim() && allow("typed", false, typed.trim());
    body = (
      <div className="space-y-2">
        {view.options.length ? (
          <ul className="grid gap-1.5" aria-label="Answers">
            {view.options.map((option, index) => (
              <li key={option}>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => allow(`option:${option}`, false, option)}
                  className={`grid w-full grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-2 gap-y-1 rounded-lg border px-2.5 py-1.5 text-left ${text} transition hover:bg-raised disabled:opacity-50 ${option === view.recommended ? "border-accent/60" : "border-line"}`}
                >
                  <span className="mt-px w-4 shrink-0 font-mono text-[11px] text-muted" aria-hidden>
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className="min-w-0 flex-1 break-words">{option}</span>
                  {option === view.recommended ? <span className="col-start-2 justify-self-start rounded-full bg-accent/15 px-1.5 text-[10px] font-medium text-accent">Recommended</span> : null}
                  {busy === `option:${option}` ? <span className="col-start-2 h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {view.custom ? (
          <div className="flex gap-2">
            <Input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder={view.options.length ? "Or type your own answer" : "Type your answer"}
              aria-label="Your answer"
              className={`min-w-0 flex-1 ${size === "sm" ? "py-1.5 text-xs" : ""}`}
            />
            <Button size={size} busy={busy === "typed"} disabled={Boolean(busy) || !typed.trim()} onClick={submit} aria-label="Send the answer">
              <Send size={size === "sm" ? 13 : 15} />
            </Button>
          </div>
        ) : !view.options.length ? (
          <Button size={size} busy={busy === "continue"} disabled={Boolean(busy)} onClick={() => allow("continue", false)}>
            <Check size={size === "sm" ? 13 : 15} /> Continue
          </Button>
        ) : null}
        <Button size={size} tone="quiet" busy={busy === "deny"} disabled={Boolean(busy)} onClick={() => send("deny", { allow: false })}>
          Skip, let the agent decide
        </Button>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-wrap gap-2">
        <Button size={size} busy={busy === "once"} disabled={Boolean(busy)} onClick={() => allow("once", false)}>
          <Check size={size === "sm" ? 13 : 15} /> Allow once{view.confirm ? "…" : ""}
        </Button>
        {view.forRun ? (
          <Button size={size} tone="ghost" busy={busy === "run"} disabled={Boolean(busy)} onClick={() => allow("run", true)}>
            Allow for this run{view.confirm ? "…" : ""}
          </Button>
        ) : null}
        {deny("Deny")}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {error ? <Notice tone="error">{error}</Notice> : null}
      {body}
    </div>
  );
}

/** Approve or Reject for a run approval; `children` sit next to the buttons. */
export function ApprovalActions({ approval, jobId, size = "md", children }: { approval: ApprovalRecord; jobId?: string; size?: Size; children?: ReactNode }) {
  const decide = useDecideApproval();
  const [error, setError] = useState<string | null>(null);
  const busy = decide.isPending ? decide.variables?.decision : null;
  const answer = (decision: "approved" | "rejected") => {
    setError(null);
    decide.mutate({ id: approval.id, decision, jobId }, { onError: (failure) => setError(failure.message) });
  };
  return (
    <div className="space-y-2">
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button size={size} busy={busy === "approved"} disabled={Boolean(busy)} onClick={() => answer("approved")}>
          <Check size={size === "sm" ? 13 : 15} /> Approve
        </Button>
        <Button size={size} tone="ghost" busy={busy === "rejected"} disabled={Boolean(busy)} onClick={() => answer("rejected")}>
          <X size={size === "sm" ? 13 : 15} /> Reject
        </Button>
        {children}
      </div>
    </div>
  );
}
