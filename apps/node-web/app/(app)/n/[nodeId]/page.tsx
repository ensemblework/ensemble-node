"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { keys, useBootstrap } from "@/lib/hooks";
import type { Avatar, NodeFull } from "@/lib/types";
import { dmRoomOf } from "@/components/shell";
import { AVATAR_COLORS, AVATAR_SHAPES, NodeAvatar } from "@/components/node-avatar";
import { Button, Field, Input, Notice, Spinner, Textarea } from "@/components/ui";

type Memory = { id: string; content: string; createdAt: string };

export default function NodePage() {
  const { nodeId } = useParams<{ nodeId: string }>();
  const boot = useBootstrap();
  const node = boot.data?.nodes.find((row) => row.id === nodeId);
  if (!boot.data) return <div className="flex h-full items-center justify-center text-muted"><Spinner /></div>;
  if (!node) return <div className="p-8 text-sm text-muted">That node is not available. <Link href="/chat" className="text-accent">Back</Link></div>;
  return <NodeEditor key={node.id} node={node} />;
}

function NodeEditor({ node }: { node: NodeFull }) {
  const client = useQueryClient();
  const router = useRouter();
  const boot = useBootstrap();
  const [name, setName] = useState(node.name);
  const [role, setRole] = useState(node.role);
  const [charter, setCharter] = useState(node.charter);
  const [avatar, setAvatar] = useState<Avatar>(node.avatar);
  const [model, setModel] = useState(node.model ?? "");
  const [sharedRooms, setSharedRooms] = useState(node.autonomy.sharedRooms ?? "ask");
  const [memoryText, setMemoryText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const memory = useQuery({ queryKey: keys.memory(node.id), queryFn: () => api<{ memories: Memory[] }>(`/api/node/nodes/${node.id}/memory`).then((result) => result.memories) });
  const dm = dmRoomOf(boot.data, node.id);
  const options = boot.data?.models.options ?? [];
  useEffect(() => setSaved(false), [name, role, charter, avatar, model, sharedRooms]);

  const save = async (patch?: Partial<NodeFull>) => {
    setError(null);
    setBusy(true);
    try {
      await api(`/api/node/nodes/${node.id}`, {
        method: "PATCH",
        body: patch ?? { name: name.trim(), role: role.trim(), charter, avatar, model: model || null, autonomy: { sharedRooms } },
      });
      await client.invalidateQueries({ queryKey: keys.bootstrap });
      setSaved(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-8 px-4 py-8 md:px-8">
        <div className="flex items-center gap-3">
          {dm ? (
            <Link href={`/r/${dm.id}`} className="rounded-lg p-1.5 text-muted hover:bg-raised hover:text-ink" aria-label="Back to chat">
              <ArrowLeft size={18} />
            </Link>
          ) : null}
          <NodeAvatar avatar={avatar} size={56} dim={node.status === "paused"} />
          <div>
            <h1 className="text-xl font-semibold">{node.name}</h1>
            <p className="font-mono text-sm text-muted">@{node.slug}</p>
          </div>
        </div>
        {error ? <Notice tone="error">{error}</Notice> : null}
        {saved ? <Notice tone="ok">Saved.</Notice> : null}

        <section className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} />
            </Field>
            <Field label="Role">
              <Input value={role} onChange={(event) => setRole(event.target.value)} maxLength={40} />
            </Field>
          </div>
          <Field label="Look" group>
            <div className="flex flex-wrap items-center gap-2">
              {AVATAR_SHAPES.map((shape) => (
                <button key={shape} onClick={() => setAvatar({ ...avatar, shape })} className={`rounded-xl p-1 ${avatar.shape === shape ? "ring-2 ring-accent" : "hover:bg-raised"}`} aria-label={shape}>
                  <NodeAvatar avatar={{ ...avatar, shape }} size={32} />
                </button>
              ))}
              <span className="mx-1 h-6 w-px bg-line" />
              {AVATAR_COLORS.map((color) => (
                <button key={color} onClick={() => setAvatar({ ...avatar, color })} className={`h-7 w-7 rounded-full ${avatar.color === color ? "ring-2 ring-accent ring-offset-2 ring-offset-bg" : ""}`} style={{ background: color }} aria-label={color} />
              ))}
              <span className="mx-1 h-6 w-px bg-line" />
              {(["dot", "line", "wide"] as const).map((eyes) => (
                <button key={eyes} onClick={() => setAvatar({ ...avatar, eyes })} className={`rounded-xl p-1 ${avatar.eyes === eyes ? "ring-2 ring-accent" : "hover:bg-raised"}`} aria-label={`${eyes} eyes`}>
                  <NodeAvatar avatar={{ ...avatar, eyes }} size={28} />
                </button>
              ))}
            </div>
          </Field>
          <Field label="Charter" hint="How this node works: what it owns, your conventions, your style. Only you see it.">
            <Textarea value={charter} onChange={(event) => setCharter(event.target.value)} rows={9} maxLength={8000} />
          </Field>
          <Field label="Chat model" hint="The model the node talks and plans with, paid from your Ensemble credits. Work on your computer uses your run profile's agent and model.">
            <select value={model} onChange={(event) => setModel(event.target.value)} className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm">
              <option value="">Default ({options.find((row) => row.default)?.label ?? boot.data?.models.default ?? "GPT-5 mini"})</option>
              {options.map((row) => (
                <option key={row.model} value={row.model}>
                  {row.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="In rooms with other people" group>
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-start gap-2">
                <input type="radio" checked={sharedRooms === "ask"} onChange={() => setSharedRooms("ask")} className="mt-1" />
                <span>
                  <strong>Ask me before posting</strong> <span className="text-muted">— recommended. You approve every message it sends for you.</span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input type="radio" checked={sharedRooms === "auto"} onChange={() => setSharedRooms("auto")} className="mt-1" />
                <span>
                  <strong>Post on its own</strong> <span className="text-muted">— changes to your workspace and computer work still wait for you.</span>
                </span>
              </label>
            </div>
          </Field>
          <Button onClick={() => void save()} busy={busy} disabled={!name.trim() || !role.trim()}>
            Save
          </Button>
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">Memory</h2>
          <p className="text-sm text-muted">What {node.name} keeps between conversations. It adds to this when you ask it to remember something.</p>
          <div className="flex gap-2">
            <Input value={memoryText} onChange={(event) => setMemoryText(event.target.value)} placeholder="Our docs use British spelling" maxLength={500} />
            <Button
              tone="ghost"
              disabled={!memoryText.trim()}
              onClick={() =>
                void api(`/api/node/nodes/${node.id}/memory`, { body: { content: memoryText } }).then(() => {
                  setMemoryText("");
                  void client.invalidateQueries({ queryKey: keys.memory(node.id) });
                })
              }
            >
              Add
            </Button>
          </div>
          <ul className="space-y-1.5">
            {(memory.data ?? []).map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-2 rounded-xl border border-line bg-bg px-3 py-2 text-sm">
                <span>{row.content}</span>
                <button className="text-muted hover:text-danger" aria-label="Forget" onClick={() => void api(`/api/node/nodes/${node.id}/memory/${row.id}`, { method: "DELETE" }).then(() => client.invalidateQueries({ queryKey: keys.memory(node.id) }))}>
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
            {memory.data && !memory.data.length ? <li className="text-sm text-muted">Nothing yet.</li> : null}
          </ul>
        </section>

        <section className="flex flex-wrap gap-2 border-t border-line pt-6">
          <Button tone="ghost" onClick={() => void save({ status: node.status === "paused" ? "active" : "paused" })}>
            {node.status === "paused" ? "Resume" : "Pause"} {node.name}
          </Button>
          <Button
            tone="danger"
            onClick={() => {
              if (!confirm(`Delete ${node.name}? Its direct chat and memory go too.`)) return;
              void api(`/api/node/nodes/${node.id}`, { method: "DELETE" }).then(async () => {
                await client.invalidateQueries({ queryKey: keys.bootstrap });
                router.replace("/chat");
              });
            }}
          >
            <Trash2 size={15} /> Delete
          </Button>
        </section>
      </div>
    </div>
  );
}
