"use client";

/**
 * A command a node wants to run as administrator on its owner's computer (Ensemble's sudo cards,
 * `data.type: "sudo"`): the exact command, why, and where. The owner types the computer's password
 * here; it is encrypted in this browser for that computer's key and bound to this card and the exact
 * command (lib/sudo.ts), then cleared from the page. Ensemble's server only relays the box, and no model
 * ever sees the password. A computer where sudo needs no password runs it without one; Don't run ends it.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleSlash, FolderOpen, KeyRound, Lock, Monitor, ShieldAlert, ShieldCheck, TerminalSquare } from "lucide-react";
import { useState } from "react";
import { sudoCards } from "@/lib/api";
import { cardWords } from "@/lib/cards";
import { keys, putMessage } from "@/lib/hooks";
import { sealFingerprint } from "@/lib/seal";
import { sealedSudoRun, sudoOutcome, sudoRetryNote, sudoState, type SudoAnswer, type SudoCardData } from "@/lib/sudo";
import { clock } from "@/lib/text";
import type { Message, NodePublic } from "@/lib/types";
import { Button, Notice, Spinner } from "../ui";
import type { MessageContext } from "./message";
import { OwnerCard } from "./owner-card";

type Busy = "password" | "plain" | "deny";

export function SudoCard({ message, ctx, node }: { message: Message; ctx: MessageContext; node?: NodePublic }) {
  const client = useQueryClient();
  const data = message.data as SudoCardData & { plan?: { id?: string } | null };
  const status = data.status ?? "pending";
  const pending = status === "pending";
  const handle = node?.slug ?? "node";
  const words = cardWords(data, handle, ctx.roomTitle);
  const target = useQuery({ queryKey: ["node-sudo", message.id], queryFn: () => sudoCards.target(message.id), enabled: pending, retry: false, staleTime: 30_000 });
  const sealKey = target.data?.route.mode === "sealed" ? target.data.route.sealKey : null;
  const fingerprint = useQuery({ queryKey: ["node-sudo-key", message.id, sealKey?.kid ?? null], queryFn: () => sealFingerprint(sealKey!.spki), enabled: Boolean(sealKey) });
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<Busy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const computer = data.deviceName?.trim() || target.data?.deviceName || "your computer";
  const unavailable = target.data?.route.mode === "unavailable" ? target.data.route.reason || `${computer} cannot take a password from here.` : null;
  const command = data.command ?? target.data?.command ?? "";
  // The computer refused the password typed before: the card waits again, saying so.
  const retry = sudoRetryNote(data);

  const send = async (kind: Busy, answer: () => Promise<SudoAnswer>) => {
    setBusy(kind);
    setError(null);
    try {
      putMessage(client, await sudoCards.answer(message.id, await answer()));
      void client.invalidateQueries({ queryKey: keys.activity });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(null);
    }
  };
  const runWithPassword = () =>
    void send("password", async () => {
      if (!target.data) throw new Error("Still checking how the password reaches the computer. Try again in a moment.");
      const typed = password;
      // The password leaves this page only sealed, and is not kept here once it is.
      setPassword("");
      return sealedSudoRun(target.data, { id: message.id, data }, typed, window.location.origin);
    });

  return (
    <OwnerCard title={words.title} state={sudoState(data)}>
      <div className="space-y-2.5">
        <div className="rounded-lg border border-line bg-bg/80">
          <p className="flex items-center gap-1.5 border-b border-line/70 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted">
            <TerminalSquare size={12} aria-hidden /> Command
          </p>
          <pre className="scroll-thin max-h-48 overflow-auto whitespace-pre-wrap break-all px-2.5 py-2 font-mono text-xs" tabIndex={0} aria-label="The command">
            {command || "…"}
          </pre>
        </div>
        {data.reason ? (
          <p className="text-sm">
            <span className="text-muted">Why:</span> {data.reason}
          </p>
        ) : null}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="inline-flex min-w-0 items-center gap-1">
            <Monitor size={13} className="shrink-0" aria-hidden />
            <span className="sr-only">Computer:</span>
            <span className="break-words">{computer}</span>
          </span>
          {data.folder ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <FolderOpen size={13} className="shrink-0 text-accent" aria-hidden />
              <span className="sr-only">Folder:</span>
              <span className="break-all">{data.folder}</span>
            </span>
          ) : null}
          {data.plan?.id ? (
            <button type="button" onClick={() => ctx.onJump(data.plan!.id!)} className="text-accent hover:underline">
              For a step of the plan
            </button>
          ) : null}
        </p>

        {pending ? (
          <form
            className="space-y-2"
            autoComplete="off"
            onSubmit={(event) => {
              event.preventDefault();
              if (password && sealKey && !busy) runWithPassword();
            }}
          >
            {target.isLoading ? (
              <p className="flex items-center gap-2 text-xs text-muted" role="status">
                <Spinner className="h-3 w-3" /> Checking how the password reaches {computer}…
              </p>
            ) : target.error ? (
              <Notice tone="error">{target.error.message}</Notice>
            ) : unavailable ? (
              <Notice tone="warn">{unavailable}</Notice>
            ) : target.data?.online === false ? (
              <Notice tone="warn">{computer} is offline. Open Ensemble there, then answer.</Notice>
            ) : null}
            {sealKey ? (
              <>
                <label className="flex items-center gap-2 rounded-xl border border-line bg-bg px-3 py-2 focus-within:border-accent">
                  <KeyRound size={15} className="shrink-0 text-accent" aria-hidden />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label={`Password for ${computer}`}
                    placeholder={`Password for ${computer}`}
                    disabled={Boolean(busy)}
                    className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted sm:text-sm"
                  />
                </label>
                <p className="flex gap-1.5 text-xs text-muted">
                  <Lock size={13} className="mt-0.5 shrink-0 text-ok" aria-hidden />
                  <span>
                    Encrypted in this browser for {computer}: only {computer} can read it, and only to run this exact command. It is never stored, logged or shown to @{handle} or any model.
                    {fingerprint.data ? ` Key ${fingerprint.data}.` : ""}
                  </span>
                </p>
              </>
            ) : null}
            {error || retry ? (
              <p className="text-sm text-danger" role="alert">
                {error ?? retry}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {sealKey ? (
                <Button type="submit" size="sm" busy={busy === "password"} disabled={Boolean(busy) || !password}>
                  <ShieldCheck size={13} aria-hidden /> Run as administrator
                </Button>
              ) : null}
              <Button type="button" size="sm" tone="ghost" busy={busy === "plain"} disabled={Boolean(busy) || target.isLoading} onClick={() => void send("plain", async () => ({ action: "run" }))} title={`For a computer where sudo needs no password: ${computer} runs it with sudo -n`}>
                Run without a password
              </Button>
              <Button type="button" size="sm" tone="quiet" busy={busy === "deny"} disabled={Boolean(busy)} onClick={() => void send("deny", async () => ({ action: "deny" }))}>
                <CircleSlash size={13} aria-hidden /> {words.discard}
              </Button>
            </div>
          </form>
        ) : status === "running" ? (
          <p className="flex items-center gap-2 text-sm text-muted" role="status" aria-live="polite">
            <Spinner className="h-3.5 w-3.5 text-accent" /> {sudoOutcome(data)}
          </p>
        ) : (
          <p className={`flex items-start gap-2 text-sm ${sudoState(data).tone === "ok" ? "text-ok" : sudoState(data).tone === "muted" ? "text-muted" : "text-danger"}`} aria-live="polite">
            {sudoState(data).tone === "ok" ? <ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden /> : sudoState(data).tone === "muted" ? null : <ShieldAlert size={15} className="mt-0.5 shrink-0" aria-hidden />}
            <span>
              {sudoOutcome(data)}
              {data.answeredAt ? <span className="ml-1.5 text-xs text-muted">{clock(data.answeredAt)}</span> : null}
            </span>
          </p>
        )}
      </div>
    </OwnerCard>
  );
}
