"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Hash, Sparkles, Users } from "lucide-react";
import { api } from "@/lib/api";
import { keys, useBootstrap } from "@/lib/hooks";
import type { Room } from "@/lib/types";
import { NodeAvatar } from "@/components/node-avatar";
import { Button, Field, Input, Notice, Spinner } from "@/components/ui";

type Tab = "node" | "crew" | "room";

export default function NewPage() {
  const boot = useBootstrap();
  const client = useQueryClient();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("node");
  const [template, setTemplate] = useState("assistant");
  const [name, setName] = useState("");
  const [crew, setCrew] = useState("software-team");
  const [kind, setKind] = useState<"group" | "crew">("group");
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!boot.data) return <div className="flex h-full items-center justify-center text-muted"><Spinner /></div>;
  const { templates, nodes } = boot.data;

  const go = async (work: () => Promise<{ room: Room }>) => {
    setError(null);
    setBusy(true);
    try {
      const { room } = await work();
      await client.invalidateQueries({ queryKey: keys.bootstrap });
      router.push(`/r/${room.id}`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setBusy(false);
    }
  };

  const tabs: Array<[Tab, string, typeof Sparkles]> = [
    ["node", "Node", Sparkles],
    ["crew", "Crew", Users],
    ["room", "Room", Hash],
  ];

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:px-8">
        <h1 className="text-2xl font-semibold">Create</h1>
        <div className="inline-flex rounded-2xl border border-line bg-panel p-1">
          {tabs.map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)} className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-sm ${tab === id ? "bg-raised font-medium" : "text-muted hover:text-ink"}`}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        {error ? <Notice tone="error">{error}</Notice> : null}

        {tab === "node" ? (
          <section className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {templates.nodes.map((row) => (
                <button key={row.id} onClick={() => setTemplate(row.id)} className={`flex gap-3 rounded-xl border p-3 text-left ${template === row.id ? "border-accent bg-accent/10" : "border-line bg-panel hover:border-muted"}`}>
                  <NodeAvatar avatar={row.avatar} size={40} />
                  <span>
                    <span className="block font-medium">{row.name}</span>
                    <span className="block text-xs text-muted">{row.summary}</span>
                  </span>
                </button>
              ))}
            </div>
            <Field label="Name">
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={templates.nodes.find((row) => row.id === template)?.name} maxLength={60} />
            </Field>
            <Button busy={busy} onClick={() => void go(() => api("/api/node/nodes", { body: { templateId: template, ...(name.trim() ? { name: name.trim() } : {}) } }))}>
              Create node
            </Button>
          </section>
        ) : null}

        {tab === "crew" ? (
          <section className="space-y-4">
            <p className="text-sm text-muted">A crew room with a lead and its specialists. Nodes you already made from the same templates join instead of new copies.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {templates.crews.map((row) => (
                <button key={row.id} onClick={() => setCrew(row.id)} className={`rounded-xl border p-4 text-left ${crew === row.id ? "border-accent bg-accent/10" : "border-line bg-panel hover:border-muted"}`}>
                  <span className="block font-medium">{row.title}</span>
                  <span className="block text-xs text-muted">{row.summary}</span>
                  <span className="mt-2 flex -space-x-2">
                    {row.nodes.map((id) => (
                      <NodeAvatar key={id} avatar={templates.nodes.find((node) => node.id === id)?.avatar} size={28} />
                    ))}
                  </span>
                </button>
              ))}
            </div>
            <Button busy={busy} onClick={() => void go(() => api("/api/node/crews", { body: { templateId: crew } }))}>
              Create crew
            </Button>
          </section>
        ) : null}

        {tab === "room" ? (
          <section className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["group", "Group room", "You, other people and one node each. Invite people by their Ensemble email."],
                  ["crew", "Crew room", "Just you and some of your nodes, with one lead."],
                ] as const
              ).map(([id, label, body]) => (
                <button key={id} onClick={() => setKind(id)} className={`rounded-xl border p-4 text-left ${kind === id ? "border-accent bg-accent/10" : "border-line bg-panel hover:border-muted"}`}>
                  <span className="block font-medium">{label}</span>
                  <span className="block text-xs text-muted">{body}</span>
                </button>
              ))}
            </div>
            <Field label="Name">
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={kind === "group" ? "Launch team" : "My crew"} maxLength={80} />
            </Field>
            <Field label={kind === "group" ? "Your node in this room (it represents you)" : "Nodes"} group>
              <div className="flex flex-wrap gap-2">
                {nodes.map((node) => (
                  <button
                    key={node.id}
                    onClick={() => {
                      const next = new Set(kind === "group" ? [] : picked);
                      if (picked.has(node.id) && kind !== "group") next.delete(node.id);
                      else next.add(node.id);
                      setPicked(next);
                    }}
                    className={`inline-flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-sm ${picked.has(node.id) ? "border-accent bg-accent/10" : "border-line bg-panel"}`}
                  >
                    <NodeAvatar avatar={node.avatar} size={20} /> {node.name}
                  </button>
                ))}
              </div>
            </Field>
            <Button
              busy={busy}
              disabled={!title.trim()}
              onClick={() => void go(() => api("/api/node/rooms", { body: { kind, title: title.trim(), nodeIds: [...picked], ...(kind === "group" && picked.size ? { representativeId: [...picked][0] } : {}) } }))}
            >
              Create room
            </Button>
          </section>
        ) : null}
      </div>
    </div>
  );
}
