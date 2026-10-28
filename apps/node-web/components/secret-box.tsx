"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { keys, putMessage, useSettle } from "@/lib/hooks";
import { toast } from "@/lib/toast";
import type { Message } from "@/lib/types";
import { Button } from "./ui";

/**
 * A node's request for a secret (Ensemble's node/node-secrets.ts). The value is typed here and sent
 * once, straight on to the computer named on the card; it is never shown, kept in this page's state
 * after sending, or put in a message. Nodes and models only ever see the name.
 */
export function SecretBox({ message, nodeName }: { message: Message; nodeName: string }) {
  const client = useQueryClient();
  const settle = useSettle();
  const data = message.data as { status?: string; name?: string; computer?: string | null; error?: string | null; savingAt?: string };
  // A save the server lost (it restarted) can be tried again after half a minute.
  const busyElsewhere = data.status === "saving" && !(data.savingAt && Date.now() - Date.parse(data.savingAt) > 30_000);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = data.name ?? "SECRET";
  const computer = data.computer ?? "your computer";

  if (data.status === "saved") {
    return (
      <p className="flex items-center gap-2 text-sm text-ok">
        <ShieldCheck size={15} /> Saved on {computer}. Runs there get it as <code className="rounded bg-raised px-1">${name}</code>.
      </p>
    );
  }
  if (data.status === "discarded") return <p className="text-sm text-muted">You declined.</p>;

  const save = async () => {
    if (!value) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api<{ message: Message }>(`/api/node/secrets/${message.id}`, { body: { value } });
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
          disabled={saving || busyElsewhere}
          className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:font-sans placeholder:text-muted"
        />
      </label>
      <p className="text-xs text-muted">
        Goes straight to {computer}, kept there encrypted, and given to agent runs there as <code className="rounded bg-raised px-1">${name}</code>. {nodeName} and its models never see it.
      </p>
      {error || data.error ? <p className="text-sm text-danger">{error ?? data.error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" busy={saving} disabled={!value || saving}>
          <ShieldCheck size={15} /> Save to {computer}
        </Button>
        <Button type="button" tone="ghost" disabled={saving || settle.isPending} onClick={() => settle.mutate({ messageId: message.id, decision: "discard" })}>
          Decline
        </Button>
      </div>
    </form>
  );
}
