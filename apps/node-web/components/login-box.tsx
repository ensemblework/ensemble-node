"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleSlash, Copy, KeyRound, Lock, LogIn, Monitor, MonitorSmartphone, QrCode as QrIcon, ShieldAlert, ShieldCheck, Smartphone } from "lucide-react";
import { api, messageById } from "@/lib/api";
import { CLI_COMMAND } from "@/lib/config";
import { keys, putMessage } from "@/lib/hooks";
import {
  cardLink,
  CODE_ASK,
  codeAnswer,
  codeHintText,
  codeInputMode,
  loginFingerprint,
  loginOpen,
  loginOutcomeText,
  loginPurpose,
  loginReasonText,
  loginRouteText,
  loginSite,
  remoteDoneText,
  typedLoginAnswer,
  type LoginAnswer,
  type LoginCardData,
  type LoginTarget,
} from "@/lib/login";
import { toast } from "@/lib/toast";
import type { Message } from "@/lib/types";
import { TakeoverView, type RemoteSettled } from "./takeover-view";
import { Button, Spinner } from "./ui";

const QrCode = dynamic(() => import("./qr-code"), { ssr: false, loading: () => <span className="block h-[168px] w-[168px] shrink-0 animate-pulse rounded-lg bg-raised" aria-hidden /> });

type Answered = { message: Message; result: { status: string; message?: string } };

/** A phone: no "Open on your phone" there. */
function usePhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const query = window.matchMedia?.("(pointer: coarse) and (max-width: 767px)");
    if (!query) return;
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return phone;
}

/**
 * A node's tab on the owner's computer waits for them to sign in to a site, or to pass a human check
 * there (Ensemble's node/logins.ts, docs/35 §8.16.1). The first answer is the remote view, "Sign in
 * here" ("Open it here" for a check): the page from the computer, on this phone or laptop, where Google
 * sign-in, codes and approvals all work, and which the computer sees through by itself. "Open on your
 * phone" shows this card's link as a QR code. Or the window on the computer, the login saved there, or a
 * login typed here: encrypted in this browser for that computer (lib/login.ts) and filled in by it; a
 * code the site then asks for is sealed the same way. What is typed is cleared from this page once sent;
 * the node only hears whether it is signed in.
 */
export function LoginBox({ message, nodeName, handle }: { message: Message; nodeName: string; handle: string }) {
  const client = useQueryClient();
  const data = message.data as LoginCardData;
  const status = data.status ?? "pending";
  const open = loginOpen(data);
  const check = loginPurpose(data) === "human_check";
  const phone = usePhone();
  const [typing, setTyping] = useState(false);
  const [qr, setQr] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [save, setSave] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [controlling, setControlling] = useState(false);
  const needsCode = status === "needs_code";
  const target = useQuery({ queryKey: ["node-login", message.id], queryFn: () => api<LoginTarget>(`/api/node/logins/${message.id}`), enabled: open && (typing || needsCode), retry: false, staleTime: 30_000 });
  const fingerprint = useQuery({
    queryKey: ["node-login-key", message.id, target.data?.route.mode === "sealed" ? target.data.route.sealKey.kid : null],
    queryFn: () => loginFingerprint(target.data!),
    enabled: Boolean(target.data),
  });
  const computer = data.computer ?? "your computer";
  const site = loginSite(data.origin);
  const link = typeof window === "undefined" ? "" : cardLink(window.location.origin, message.roomId, message.id);
  // Once the card is settled, an open remote view says so and closes itself when it worked.
  const doneText = remoteDoneText(data, handle);
  const settledText = open ? null : (doneText ?? loginOutcomeText(data));
  const settled = useMemo<RemoteSettled | null>(() => (settledText === null ? null : { done: doneText !== null, text: settledText }), [settledText, doneText]);

  const remote = controlling ? (
    <TakeoverView
      source={{ loginCardId: message.id }}
      site={site}
      computer={computer}
      settled={settled}
      onEnded={() => void messageById(message.id).then((card) => putMessage(client, card), () => undefined)}
      onClose={(result) => {
        setControlling(false);
        if (result.card) putMessage(client, result.card);
        void client.invalidateQueries({ queryKey: keys.activity });
        if (result.signedIn) toast(check ? `Check passed on ${site}. ${nodeName} goes on.` : `Signed in to ${site}. ${nodeName} goes on.`, "ok");
        else if (result.signedIn === false) setError(check ? "The check is not done yet. Open it again, or answer another way." : "Still not signed in. Open it again, or answer another way.");
      }}
    />
  ) : null;

  if (!open) {
    const worked = status === "signed_in" || status === "passed";
    // The remote view keeps its place in the tree, so settling the card does not open it again.
    return (
      <>
        <p className={`flex items-start gap-2 text-sm ${worked ? "text-ok" : "text-muted"}`}>
          {worked ? <ShieldCheck size={15} className="mt-0.5 shrink-0" /> : null}
          <span>{loginOutcomeText(data)}</span>
        </p>
        {remote}
      </>
    );
  }

  const send = async (action: string, answer: () => Promise<LoginAnswer> | LoginAnswer) => {
    setBusy(action);
    setError(null);
    try {
      const done = await api<Answered>(`/api/node/logins/${message.id}`, { body: await answer() });
      putMessage(client, done.message);
      void client.invalidateQueries({ queryKey: keys.activity });
      if (done.result.status === "signed_in" || done.result.status === "passed") {
        setPassword("");
        setCode("");
        setTyping(false);
        toast(done.result.status === "passed" ? `Check passed on ${site}. ${nodeName} goes on.` : `Signed in to ${site}. ${nodeName} goes on.`, "ok");
      } else if (done.result.status === "declined") {
        toast("Not now. The work goes on without it.", "ok");
      } else if (done.result.status !== "shown") {
        setPassword("");
        setCode("");
      }
      // Asked for a code: the box for it replaces the login form.
      if (done.result.status === "needs_code") setTyping(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(null);
    }
  };

  const working = status === "working" || Boolean(busy);
  const shown = Boolean(data.shownAt);
  const sealed = target.data?.route.mode === "sealed";
  const RouteIcon = sealed ? Lock : ShieldAlert;
  const route = (
    <p className="flex gap-1.5 text-xs text-muted" data-login-route={target.data?.route.mode ?? "loading"}>
      <RouteIcon size={13} className={`mt-0.5 shrink-0 ${sealed ? "text-ok" : "text-warn"}`} />
      <span>
        {target.data ? loginRouteText(target.data, fingerprint.data ?? null, CLI_COMMAND) : target.error ? (target.error as Error).message : "Checking how this goes to the computer…"} {computer} fills the page itself; {nodeName} and its models never see it.
      </span>
    </p>
  );
  const remoteLabel = check ? "Open it here" : "Sign in here";
  // The first answer the computer offers is the one that stands out.
  const primary = data.takeover ? "remote" : data.display ? "local" : !check && data.saved ? "saved" : !check ? "typed" : null;
  const reason = loginReasonText(data.reasons);

  return (
    <>
      <div className="space-y-2.5" data-login-card={status} data-login-purpose={check ? "human_check" : "sign_in"}>
        <p className="text-xs text-muted">
          On {computer}
          {reason ? ` · ${reason}` : ""}
        </p>
        {needsCode ? (
          <form
            className="space-y-2 rounded-xl border border-warn/40 bg-bg/70 p-3"
            autoComplete="off"
            data-login-code
            onSubmit={(event) => {
              event.preventDefault();
              if (!target.data || !code.trim()) return;
              const current = target.data;
              const typed = code;
              void send("code", () => codeAnswer(current, message, typed, window.location.origin));
            }}
          >
            <p className="text-sm font-medium">{CODE_ASK}</p>
            {codeHintText(data) ? <p className="text-xs text-muted">{codeHintText(data)}</p> : null}
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode={codeInputMode(data)}
              autoComplete="one-time-code"
              autoCapitalize="none"
              spellCheck={false}
              aria-label={`Code for ${site}`}
              placeholder="Code"
              disabled={working}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-base tracking-widest outline-none placeholder:font-sans placeholder:tracking-normal focus:border-accent sm:text-sm"
            />
            {route}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" busy={busy === "code"} disabled={!code.trim() || working || !sealed}>
                <KeyRound size={14} /> Send the code
              </Button>
              <Button type="button" size="sm" tone="quiet" busy={busy === "decline"} disabled={working} onClick={() => void send("decline", () => ({ action: "decline" }))}>
                <CircleSlash size={14} /> Not now
              </Button>
            </div>
          </form>
        ) : (
          <>
            {data.takeover ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <Button size="sm" disabled={working || controlling} onClick={() => setControlling(true)}>
                  <MonitorSmartphone size={14} /> {remoteLabel}
                </Button>
                {phone ? null : (
                  <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                    <Smartphone size={13} className="shrink-0" aria-hidden /> Works on your phone too ·
                    <button type="button" className="inline-flex items-center gap-1 text-accent hover:underline" aria-expanded={qr} onClick={() => setQr(!qr)}>
                      <QrIcon size={12} aria-hidden /> Open on your phone
                    </button>
                  </span>
                )}
              </div>
            ) : null}
            {qr && data.takeover && !phone ? (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-bg/70 p-3" data-login-qr>
                <QrCode text={link} label="QR code of this card's link" />
                <div className="min-w-0 flex-1 basis-48 space-y-1.5">
                  <p className="text-sm font-medium">Scan it with your phone&apos;s camera</p>
                  <p className="text-xs text-muted">
                    It opens this card on your phone (signed in to Ensemble Node). Tap {remoteLabel} there: the page comes from {computer}, and {nodeName} carries on by itself once you&apos;re through.
                  </p>
                  <p className="break-all font-mono text-[11px] text-muted">{link}</p>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                    onClick={() => void navigator.clipboard?.writeText(link).then(() => toast("Link copied.", "ok"), () => toast("This browser would not copy it.", "error"))}
                  >
                    <Copy size={12} aria-hidden /> Copy link
                  </button>
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {data.display ? (
                <Button size="sm" tone={primary === "local" ? "primary" : "ghost"} busy={busy === "local"} disabled={working} onClick={() => void send("local", () => ({ action: "local" }))}>
                  <Monitor size={14} /> Use the window on {computer}
                </Button>
              ) : null}
              {shown ? (
                <Button size="sm" tone="ghost" busy={busy === "done"} disabled={working} onClick={() => void send("done", () => ({ action: "done" }))}>
                  <Check size={14} /> I&apos;m done
                </Button>
              ) : null}
              {!check ? (
                <Button size="sm" tone={primary === "typed" ? "primary" : "ghost"} disabled={working} onClick={() => setTyping((value) => !value)} aria-expanded={typing}>
                  <LogIn size={14} /> Type my login
                </Button>
              ) : null}
              {!check && data.saved ? (
                <Button size="sm" tone={primary === "saved" ? "primary" : "ghost"} busy={busy === "saved"} disabled={working} onClick={() => void send("saved", () => ({ action: "saved" }))}>
                  <KeyRound size={14} /> Use saved login
                </Button>
              ) : null}
              <Button size="sm" tone="quiet" busy={busy === "decline"} disabled={working} onClick={() => void send("decline", () => ({ action: "decline" }))}>
                <CircleSlash size={14} /> Not now
              </Button>
            </div>
            {!data.takeover && !data.display ? (
              <p className="text-xs text-muted">
                {computer} has no screen{check ? "" : " to sign in on"}, and cannot show the page here yet: update Ensemble there to {check ? "do the check" : "sign in"} from here{check ? "." : ", or type your login."}
              </p>
            ) : null}
            {typing && !check ? (
              <form
                className="space-y-2 rounded-xl border border-line bg-bg/70 p-3"
                autoComplete="off"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!target.data || !password) return;
                  const current = target.data;
                  void send("typed", () => typedLoginAnswer(current, message, { username, password, save }, window.location.origin));
                }}
              >
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-label={`User name or email for ${data.origin ?? site}`}
                  placeholder="User name or email"
                  disabled={working}
                  className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-base outline-none focus:border-accent sm:text-sm"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  spellCheck={false}
                  aria-label={`Password for ${data.origin ?? site}`}
                  placeholder="Password"
                  disabled={working}
                  className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-base outline-none placeholder:font-sans focus:border-accent sm:text-sm"
                />
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" className="accent-[rgb(var(--accent))]" checked={save} onChange={(event) => setSave(event.target.checked)} disabled={working} /> Save on {computer} for next time
                </label>
                {route}
                <p className="text-xs text-muted">If {site} then asks for a code, this card asks you for it.</p>
                <Button type="submit" size="sm" busy={busy === "typed"} disabled={!password || working || !sealed}>
                  <LogIn size={14} /> Sign in on {computer}
                </Button>
              </form>
            ) : null}
          </>
        )}
        {working && !busy ? (
          <p className="flex items-center gap-2 text-xs text-muted" role="status">
            <Spinner className="h-3 w-3" /> Working on {computer}…
          </p>
        ) : null}
        {typeof data.note === "string" && data.note ? <p className="text-xs text-muted">{data.note}</p> : null}
        {error ?? data.error ? (
          <p className="text-sm text-danger" role="alert">
            {error ?? data.error}
          </p>
        ) : null}
      </div>
      {remote}
    </>
  );
}
