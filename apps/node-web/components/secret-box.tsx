"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Lock, ShieldAlert, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { CLI_COMMAND } from "@/lib/config";
import { keys, putMessage, useSettle } from "@/lib/hooks";
import { keptText, parseAllow, routeText, savedText, secretAnswer, targetFingerprint, type SecretTarget } from "@/lib/secret";
import { toast } from "@/lib/toast";
import type { Message } from "@/lib/types";
import { Button } from "./ui";

/**
 * A node's request for a secret (Ensemble's node/node-secrets.ts, docs/35 §8.7). The value is typed
 * here, encrypted in this browser for the computer named on the card (lib/secret.ts), and sent once;
 * it is never shown, kept in this page's state after sending, or put in a message. A computer too old
 * for a key gets it over HTTPS through Ensemble's server instead, and the card says so. Nodes and models
 * only ever see the name.
 */
export function SecretBox({ message, nodeName }: { message: Message; nodeName: string }) {
  const client = useQueryClient();
  const settle = useSettle();
  const data = message.data as { status?: string; name?: string; computer?: string | null; error?: string | null; savingAt?: string; sealed?: boolean; allow?: string[] };
  // A save the server lost (it restarted) can be tried again after half a minute.
  const busyElsewhere = data.status === "saving" && !(data.savingAt && Date.now() - Date.parse(data.savingAt) > 30_000);
  const open = data.status !== "saved" && data.status !== "discarded";
  const [value, setValue] = useState("");
  const [allowText, setAllowText] = useState((data.allow ?? []).join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = useQuery({ queryKey: ["node-secret", message.id], queryFn: () => api<SecretTarget>(`/api/node/secrets/${message.id}`), enabled: open, retry: false, staleTime: 30_000 });
  const fingerprint = useQuery({
    queryKey: ["node-secret-key", message.id, target.data?.route.mode === "sealed" ? target.data.route.sealKey.kid : null],
    queryFn: () => targetFingerprint(target.data!),
    enabled: Boolean(target.data),
  });
  const name = data.name ?? "SECRET";
  const computer = target.data?.computer.name ?? data.computer ?? "your computer";
  const allow = parseAllow(allowText);
  const blocked = target.data?.route.mode === "pair_again";

  if (data.status === "saved") {
    return (
      <p className="flex items-center gap-2 text-sm text-ok">
        <ShieldCheck size={15} className="shrink-0" /> {savedText(data)}
      </p>
    );
  }
  if (data.status === "discarded") return <p className="text-sm text-muted">You declined.</p>;

  const save = async () => {
    if (!value || !target.data) return;
    setSaving(true);
    setError(null);
    try {
      const answer = await secretAnswer(target.data, message, value, allow, window.location.origin);
      const result = await api<{ message: Message }>(`/api/node/secrets/${message.id}`, { body: answer });
      setValue("");
      putMessage(client, result.message);
      void client.invalidateQueries({ queryKey: keys.activity });
      toast(`Saved ${name} on ${computer}.`, "ok");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setSaving(false);
    }
  };

  const RouteIcon = target.data?.route.mode === "sealed" ? Lock : ShieldAlert;
  return (
    <form
      className="space-y-2"
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label className="flex items-center gap-2 rounded-xl border border-line bg-bg px-3 py-2 focus-within:border-accent">
        <KeyRound size={15} className="shrink-0 text-accent" />
        <input
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="new-password"
          spellCheck={false}
          aria-label={`Value for ${name}`}
          placeholder={`Paste ${name}`}
          disabled={saving || busyElsewhere || blocked}
          className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:font-sans placeholder:text-muted"
        />
      </label>
      <label className="block text-xs text-muted">
        Only send it to (optional)
        <input
          value={allowText}
          onChange={(event) => setAllowText(event.target.value)}
          spellCheck={false}
          aria-label={`Where ${name} may be sent`}
          placeholder="https://api.example.com"
          disabled={saving || busyElsewhere || blocked}
          className="mt-1 w-full rounded-lg border border-line bg-bg px-2 py-1.5 font-mono text-xs text-ink outline-none focus:border-accent"
        />
      </label>
      <p className="flex gap-1.5 text-xs text-muted" data-secret-route={target.data?.route.mode ?? "loading"}>
        <RouteIcon size={13} className={`mt-0.5 shrink-0 ${target.data?.route.mode === "sealed" ? "text-ok" : "text-warn"}`} />
        <span>
          {target.data ? routeText(target.data, fingerprint.data ?? null, CLI_COMMAND) : target.error ? (target.error as Error).message : "Checking how this goes to the computer…"} {keptText(name, computer, allow)} {nodeName} and its models never see it.
        </span>
      </p>
      {error || data.error ? <p className="text-sm text-danger">{error ?? data.error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" busy={saving} disabled={!value || saving || !target.data || blocked}>
          <ShieldCheck size={15} /> Save to {computer}
        </Button>
        <Button type="button" tone="ghost" disabled={saving || settle.isPending} onClick={() => settle.mutate({ messageId: message.id, decision: "discard" })}>
          Decline
        </Button>
      </div>
    </form>
  );
}
