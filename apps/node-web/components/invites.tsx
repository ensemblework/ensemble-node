"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Hash, Inbox, Users, X } from "lucide-react";
import { api } from "@/lib/api";
import { keys, limitsOf, putRoom, useBootstrap, useInvites } from "@/lib/hooks";
import { ago } from "@/lib/text";
import { toast } from "@/lib/toast";
import type { Bootstrap, IncomingInvite, Room } from "@/lib/types";
import { NodePicker } from "./node-picker";
import { PersonAvatar } from "./node-avatar";
import { Button, Notice, Spinner } from "./ui";

function InviteCard({ invite, boot }: { invite: IncomingInvite; boot: Bootstrap }) {
  const client = useQueryClient();
  const router = useRouter();
  const limits = limitsOf(boot);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(boot.nodes[0] ? [boot.nodes[0].id] : []));
  const [lead, setLead] = useState<string | null>(boot.nodes[0]?.id ?? null);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const leadNow = lead && picked.has(lead) ? lead : ([...picked][0] ?? null);

  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: keys.invites }), client.invalidateQueries({ queryKey: keys.bootstrap })]);

  const accept = async () => {
    setError(null);
    setBusy("accept");
    try {
      const { room } = await api<{ room: Room }>(`/api/node/invites/${invite.id}/accept`, { body: { nodeIds: [...picked], ...(leadNow ? { leadNodeId: leadNow } : {}) } });
      putRoom(client, room);
      await refresh();
      router.push(`/r/${room.id}`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setBusy(null);
    }
  };

  const decline = async () => {
    if (!confirm(`Decline joining “${invite.room.title}”? ${invite.from.name} can ask again after ${limits.declineBlockDays} days.`)) return;
    setError(null);
    setBusy("decline");
    try {
      await api(`/api/node/invites/${invite.id}/decline`, { body: {} });
      await refresh();
      toast(`Declined “${invite.room.title}”.`, "ok");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setBusy(null);
    }
  };

  return (
    <li className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-raised text-muted">
          <Hash size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{invite.room.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <PersonAvatar name={invite.from.name} size={18} /> {invite.from.name}
              {invite.from.email ? <span className="text-xs">({invite.from.email})</span> : null} asked you to join
            </span>
            <span className="inline-flex items-center gap-1 text-xs">
              <Users size={12} /> {invite.room.people} {invite.room.people === 1 ? "person" : "people"} in it
            </span>
            <span className="text-xs">· {ago(invite.createdAt)}</span>
          </div>
        </div>
        {!open ? (
          <div className="flex gap-2">
            <Button onClick={() => setOpen(true)} disabled={!boot.nodes.length}>
              <Check size={15} /> Accept…
            </Button>
            <Button tone="ghost" busy={busy === "decline"} onClick={() => void decline()}>
              <X size={15} /> Decline
            </Button>
          </div>
        ) : null}
      </div>
      {error ? (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}
      {!boot.nodes.length ? (
        <p className="mt-3 text-sm text-muted">
          To join, bring at least one of your nodes. <Link href="/new?tab=node" className="text-accent">Make a node</Link> first.
        </p>
      ) : null}
      {open ? (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div>
            <div className="text-sm font-medium">Which of your nodes come along?</div>
            <p className="text-xs text-muted">
              Pick 1–{limits.nodesPerPerson}. Your lead answers what concerns you there and asks you before it posts. You see only what is said after you join; the others see your nodes&apos; name and role, never their charter, model or memory.
            </p>
          </div>
          <NodePicker nodes={boot.nodes} selected={picked} onChange={setPicked} lead={leadNow} onLead={setLead} max={limits.nodesPerPerson} label={`Your nodes for ${invite.room.title}`} />
          <div className="flex flex-wrap gap-2">
            <Button busy={busy === "accept"} disabled={!picked.size || Boolean(busy)} onClick={() => void accept()}>
              Join with {picked.size} node{picked.size === 1 ? "" : "s"}
            </Button>
            <Button tone="ghost" disabled={Boolean(busy)} onClick={() => setOpen(false)}>
              Not now
            </Button>
            <Button tone="quiet" busy={busy === "decline"} disabled={Boolean(busy)} onClick={() => void decline()}>
              Decline
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/** Requests to join rooms that wait for my answer. They arrive live. */
export function InviteInbox() {
  const boot = useBootstrap();
  const invites = useInvites();
  if (!boot.data) {
    return (
      <div className="flex justify-center py-10 text-muted">
        <Spinner />
      </div>
    );
  }
  const list = invites.data ?? boot.data.invites ?? [];
  if (!list.length) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-12 text-center">
        <Inbox size={28} className="text-muted" />
        <p className="mt-3 font-medium">No requests right now</p>
        <p className="mt-1 max-w-sm text-sm text-muted">When someone asks you to join their room, it shows here and in the sidebar. You choose which of your nodes come along.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {list.map((invite) => (
        <InviteCard key={invite.id} invite={invite} boot={boot.data!} />
      ))}
    </ul>
  );
}
