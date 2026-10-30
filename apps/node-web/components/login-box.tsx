"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleSlash, KeyRound, Lock, LogIn, Monitor, MonitorSmartphone, ShieldAlert, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { CLI_COMMAND } from "@/lib/config";
import { keys, putMessage } from "@/lib/hooks";
import { loginFingerprint, loginOutcomeText, loginReasonText, loginRouteText, typedLoginAnswer, type LoginAnswer, type LoginCardData, type LoginTarget } from "@/lib/login";
import { toast } from "@/lib/toast";
import type { Message } from "@/lib/types";
import { TakeoverView } from "./takeover-view";
import { Button, Spinner } from "./ui";

type Answered = { message: Message; result: { status: string; message?: string } };

/**
 * A tab on the owner's computer waits for them to sign in to a site (Ensemble's node/logins.ts, docs/35
 * §8.16.1). The saved login there, signing in on the computer itself, or a login typed here: encrypted
 * in this browser for that computer (lib/login.ts) and filled into the page by the computer. What is
 * typed is cleared from this page once sent; the node only hears whether it is signed in.
 */
export function LoginBox({ message, nodeName }: { message: Message; nodeName: string }) {
  const client = useQueryClient();
  const data = message.data as LoginCardData;
  const open = data.status === "pending" || data.status === "working";
  const [typing, setTyping] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [save, setSave] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [controlling, setControlling] = useState(false);
  const target = useQuery({ queryKey: ["node-login", message.id], queryFn: () => api<LoginTarget>(`/api/node/logins/${message.id}`), enabled: open && typing, retry: false, staleTime: 30_000 });
  const fingerprint = useQuery({
    queryKey: ["node-login-key", message.id, target.data?.route.mode === "sealed" ? target.data.route.sealKey.kid : null],
    queryFn: () => loginFingerprint(target.data!),
    enabled: Boolean(target.data),
  });
  const computer = data.computer ?? "your computer";
  const site = data.origin ?? "the site";

  if (!open) {
    const signedIn = data.status === "signed_in";
    return (
      <p className={`flex items-start gap-2 text-sm ${signedIn ? "text-ok" : "text-muted"}`}>
        {signedIn ? <ShieldCheck size={15} className="mt-0.5 shrink-0" /> : null}
        <span>{loginOutcomeText(data)}</span>
      </p>
    );
  }

  const send = async (action: string, answer: () => Promise<LoginAnswer> | LoginAnswer) => {
    setBusy(action);
    setError(null);
    try {
      const done = await api<Answered>(`/api/node/logins/${message.id}`, { body: await answer() });
      putMessage(client, done.message);
      void client.invalidateQueries({ queryKey: keys.activity });
      if (done.result.status === "signed_in") {
        setPassword("");
        setCode("");
        setTyping(false);
        toast(`Signed in to ${site}. ${nodeName} goes on.`, "ok");
      } else if (done.result.status === "declined") {
        toast("Not now. The work goes on without it.", "ok");
      } else if (done.result.status !== "shown") {
        setPassword("");
        setCode("");
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(null);
    }
  };

  const working = data.status === "working" || Boolean(busy);
  const shown = Boolean((message.data as { shownAt?: unknown }).shownAt);
  const RouteIcon = target.data?.route.mode === "sealed" ? Lock : ShieldAlert;
  return (
    <div className="space-y-2" data-login-card={data.status}>
      {loginReasonText(data.reasons) ? <p className="text-xs text-muted">{loginReasonText(data.reasons)}</p> : null}
      <div className="flex flex-wrap gap-2">
        {data.saved ? (
          <Button size="sm" busy={busy === "saved"} disabled={working} onClick={() => void send("saved", () => ({ action: "saved" }))}>
            <KeyRound size={14} /> Use saved login
          </Button>
        ) : null}
        {data.display ? (
          <Button size="sm" tone={data.saved ? "ghost" : "primary"} busy={busy === "local"} disabled={working} onClick={() => void send("local", () => ({ action: "local" }))}>
            <Monitor size={14} /> Sign in on {computer}
          </Button>
        ) : null}
        {data.display || shown ? (
          <Button size="sm" tone="ghost" busy={busy === "done"} disabled={working} onClick={() => void send("done", () => ({ action: "done" }))}>
            <Check size={14} /> I&apos;m done
          </Button>
        ) : null}
        {data.takeover ? (
          <Button size="sm" tone={data.saved || data.display ? "ghost" : "primary"} disabled={working || controlling} onClick={() => setControlling(true)}>
            <MonitorSmartphone size={14} /> Open the browser
          </Button>
        ) : null}
        <Button size="sm" tone="ghost" disabled={working} onClick={() => setTyping((value) => !value)} aria-expanded={typing}>
          <LogIn size={14} /> Type it here
        </Button>
        <Button size="sm" tone="ghost" busy={busy === "decline"} disabled={working} onClick={() => void send("decline", () => ({ action: "decline" }))}>
          <CircleSlash size={14} /> Not now
        </Button>
      </div>
      {!data.display ? <p className="text-xs text-muted">{computer} has no screen to sign in on{data.takeover ? ": open its browser here instead, or type it." : "."}</p> : null}
      {controlling ? (
        <TakeoverView
          source={{ loginCardId: message.id }}
          site={site}
          computer={computer}
          onClose={(result) => {
            setControlling(false);
            if (result.card) putMessage(client, result.card);
            void client.invalidateQueries({ queryKey: keys.activity });
            if (result.signedIn) toast(`Signed in to ${site}. ${nodeName} goes on.`, "ok");
            else if (result.signedIn === false) setError("Still not signed in. Open the browser again, or answer another way.");
          }}
        />
      ) : null}
      {typing ? (
        <form
          className="space-y-2 rounded-xl border border-line bg-bg/70 p-3"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            if (!target.data || !password) return;
            const current = target.data;
            void send("typed", () => typedLoginAnswer(current, message, { username, password, code, save }, window.location.origin));
          }}
        >
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-label={`User name or email for ${site}`}
            placeholder="User name or email"
            disabled={working}
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            spellCheck={false}
            aria-label={`Password for ${site}`}
            placeholder="Password"
            disabled={working}
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-sm outline-none placeholder:font-sans focus:border-accent"
          />
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\s/g, ""))}
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="One-time code (optional)"
            placeholder="One-time code (optional)"
            disabled={working}
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-sm outline-none placeholder:font-sans focus:border-accent"
          />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" className="accent-[rgb(var(--accent))]" checked={save} onChange={(event) => setSave(event.target.checked)} disabled={working} /> Save on {computer} for next time
          </label>
          <p className="flex gap-1.5 text-xs text-muted" data-login-route={target.data?.route.mode ?? "loading"}>
            <RouteIcon size={13} className={`mt-0.5 shrink-0 ${target.data?.route.mode === "sealed" ? "text-ok" : "text-warn"}`} />
            <span>
              {target.data ? loginRouteText(target.data, fingerprint.data ?? null, CLI_COMMAND) : target.error ? (target.error as Error).message : "Checking how this goes to the computer…"} {computer} fills the page itself; {nodeName} and its models never see it.
            </span>
          </p>
          <Button type="submit" size="sm" busy={busy === "typed"} disabled={!password || working || target.data?.route.mode !== "sealed"}>
            <LogIn size={14} /> Sign in on {computer}
          </Button>
        </form>
      ) : null}
      {working && !busy ? (
        <p className="flex items-center gap-2 text-xs text-muted">
          <Spinner className="h-3 w-3" /> Working on {computer}…
        </p>
      ) : null}
      {typeof data.note === "string" && data.note ? <p className="text-xs text-muted">{data.note}</p> : null}
      {error ?? data.error ? <p className="text-sm text-danger">{error ?? data.error}</p> : null}
    </div>
  );
}
