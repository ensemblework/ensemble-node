"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FolderOpen, Pause, Play, SquareTerminal, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { CLI_COMMAND, ENSEMBLE_LINKS } from "@/lib/config";
import { liveDevices } from "@/lib/ensemble";
import { evidenceItems } from "@/lib/evidence";
import { keys, useDevices, useNodeCaptures, useOwnerSettings } from "@/lib/hooks";
import { runProfileFor, runProfileLine } from "@/lib/owner-settings";
import { toast, toastError } from "@/lib/toast";
import type { Avatar, NodeFull } from "@/lib/types";
import { ModelPicker } from "./model-picker";
import { AVATAR_COLORS, AVATAR_SHAPES, NodeAvatar } from "./node-avatar";
import { EvidenceGallery } from "./chat/evidence";
import { NodeRoutines } from "./routines";
import { Button, External, Field, Input, Notice, Segmented, Spinner, Switch, Textarea } from "./ui";

type Memory = { id: string; content: string; createdAt: string };

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-line pt-5 first:border-t-0 first:pt-0">
      <div>
        <h3 className="font-semibold">{title}</h3>
        {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Choice({ name, checked, onChange, title, hint }: { name: string; checked: boolean; onChange: () => void; title: string; hint: string }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1 accent-[rgb(var(--accent))]" />
      <span>
        <strong>{title}</strong> <span className="text-muted">— {hint}</span>
      </span>
    </label>
  );
}

/** The node's own screenshots and videos on my computers, newest first; held ones wait on their card. */
function NodeCaptures({ node }: { node: NodeFull }) {
  const captures = useNodeCaptures(node.id);
  const [all, setAll] = useState(false);
  const items = useMemo(() => evidenceItems(captures.data), [captures.data]);
  if (captures.isLoading) return <Spinner className="h-4 w-4 text-muted" />;
  if (captures.error) return <p className="text-sm text-danger">{captures.error.message}</p>;
  if (!items.length) return <p className="text-sm text-muted">Nothing yet.</p>;
  const shown = all ? items : items.slice(0, 9);
  return (
    <div className="space-y-2">
      <EvidenceGallery items={shown} label={`${node.name}'s captures`} />
      {items.length > shown.length ? (
        <button type="button" onClick={() => setAll(true)} className="text-xs text-accent hover:underline">
          Show all {items.length}
        </button>
      ) : null}
    </div>
  );
}

/** Which run profile the node's agent sessions use when a message names none, and what that profile runs. */
function AgentSessions({ node }: { node: NodeFull }) {
  const settings = useOwnerSettings();
  if (!settings.data) return null;
  const profile = runProfileFor(settings.data, node.runProfileId);
  return (
    <p className="flex items-start gap-2 rounded-xl border border-line bg-bg px-3 py-2 text-xs text-muted" data-run-profile={profile.id}>
      <SquareTerminal size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
      <span className="min-w-0">
        Agent sessions use: <span className="font-medium text-ink">{profile.name}</span> ({runProfileLine(profile)}), unless your message names another agent or model.{" "}
        <External href={ENSEMBLE_LINKS.runProfiles} icon className="whitespace-nowrap text-accent hover:underline">
          Run profiles
        </External>
      </span>
    </p>
  );
}

const HANDLE = /^[a-z0-9][a-z0-9-]{0,23}$/;

/** Helpers a node may have working at once: 4 unless its owner changes it; 0 is no limit. */
const HELPER_COUNTS = [1, 2, 4, 6, 8, 12, 16];

/**
 * Everything about one node, in one place: name and handle, look, role, the chat model it thinks
 * with, its instructions, what it may do, its routines, what it captured on my computers, its memory,
 * pausing it, exporting its chat and deleting it.
 */
export function NodeSettings({ node, onExport }: { node: NodeFull; onExport?: () => void }) {
  const client = useQueryClient();
  const router = useRouter();
  const [name, setName] = useState(node.name);
  const [slug, setSlug] = useState(node.slug);
  const [role, setRole] = useState(node.role);
  const [charter, setCharter] = useState(node.charter);
  const [avatar, setAvatar] = useState<Avatar>(node.avatar);
  const [memoryText, setMemoryText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ name?: string; slug?: string }>({});
  const [busy, setBusy] = useState<string | null>(null);
  const memory = useQuery({ queryKey: keys.memory(node.id), queryFn: () => api<{ memories: Memory[] }>(`/api/node/nodes/${node.id}/memory`).then((result) => result.memories) });
  const devices = useDevices();
  const sharedRooms = node.autonomy?.sharedRooms ?? "ask";
  const computerFiles = node.autonomy?.computerFiles === true;
  const computerWork = node.autonomy?.computerWork ?? "auto";
  const createNodes = node.autonomy?.createNodes ?? "ask";
  const helpers = typeof node.autonomy?.helpers === "number" ? node.autonomy.helpers : 4;
  const helperCounts = [...new Set([...HELPER_COUNTS, ...(helpers > 0 ? [helpers] : [])])].sort((a, b) => a - b);
  const paused = node.status === "paused";
  const folders = liveDevices(devices.data ?? []).flatMap((device) => device.folders.map((folder) => `${folder} (${device.name})`));
  const handle = slug.trim().replace(/^@/, "").toLowerCase();
  const dirty = name.trim() !== node.name || handle !== node.slug || role.trim() !== node.role || charter !== node.charter || JSON.stringify(avatar) !== JSON.stringify(node.avatar);
  useEffect(() => setFieldError({}), [name, slug]);

  const refresh = () => client.invalidateQueries({ queryKey: keys.bootstrap });

  const save = async () => {
    setError(null);
    if (!HANDLE.test(handle)) return setFieldError({ slug: "Lowercase letters, digits and dashes, up to 24." });
    setBusy("save");
    try {
      await api(`/api/node/nodes/${node.id}`, {
        method: "PATCH",
        body: { name: name.trim(), role: role.trim(), charter, avatar, ...(handle !== node.slug ? { slug: handle } : {}) },
      });
      await refresh();
      toast("Saved.", "ok");
    } catch (failure) {
      if (failure instanceof ApiError && (failure.status === 409 || failure.status === 400)) setFieldError(/handle|mention/i.test(failure.message) ? { slug: failure.message } : { name: failure.message });
      else setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(null);
    }
  };

  /** The model and what the node may do save as soon as they change. */
  const change = async (body: Record<string, unknown>, done: string) => {
    try {
      await api(`/api/node/nodes/${node.id}`, { method: "PATCH", body });
      await refresh();
      toast(done, "ok");
    } catch (failure) {
      toastError(failure);
    }
  };

  const togglePause = async () => {
    setBusy("pause");
    await change({ status: paused ? "active" : "paused" }, paused ? `${node.name} is back.` : `${node.name} is paused and stopped what it was doing.`);
    setBusy(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <NodeAvatar node={node} avatar={avatar} size={52} dim={paused} />
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold">{node.name}</div>
          <div className="truncate font-mono text-sm text-muted">
            @{node.slug}
            {paused ? <span className="ml-2 font-sans text-warn">Paused</span> : null}
          </div>
        </div>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}

      <Section title="Activity" hint={paused ? "Paused: it is not doing anything. A message from you, here or anywhere you mention it, wakes it again." : "Pause stops everything it is doing, including its work on your computer, and it tells you what it stopped."}>
        <Button tone={paused ? "primary" : "ghost"} busy={busy === "pause"} onClick={() => void togglePause()}>
          {paused ? <Play size={15} /> : <Pause size={15} />} {paused ? `Resume ${node.name}` : `Pause ${node.name}`}
        </Button>
      </Section>

      <Section title="Name and look">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" error={fieldError.name}>
            <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} />
          </Field>
          <Field label="Handle" error={fieldError.slug} hint="How you @mention it.">
            <Input value={slug} onChange={(event) => setSlug(event.target.value)} maxLength={25} className="font-mono" aria-label="Handle" />
          </Field>
        </div>
        <Field label="Role">
          <Input value={role} onChange={(event) => setRole(event.target.value)} maxLength={40} />
        </Field>
        <Field label="Appearance" group>
          <div className="flex flex-wrap items-center gap-2">
            {AVATAR_SHAPES.map((shape) => (
              <button key={shape} type="button" onClick={() => setAvatar({ ...avatar, shape })} className={`rounded-xl p-1 ${avatar.shape === shape ? "ring-2 ring-accent" : "hover:bg-raised"}`} aria-label={shape} aria-pressed={avatar.shape === shape}>
                <NodeAvatar avatar={{ ...avatar, shape }} size={30} />
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {AVATAR_COLORS.map((color) => (
              <button key={color} type="button" onClick={() => setAvatar({ ...avatar, color })} className={`h-7 w-7 rounded-full ${avatar.color === color ? "ring-2 ring-accent ring-offset-2 ring-offset-bg" : ""}`} style={{ background: color }} aria-label={color} aria-pressed={avatar.color === color} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {(["dot", "line", "wide"] as const).map((eyes) => (
              <button key={eyes} type="button" onClick={() => setAvatar({ ...avatar, eyes })} className={`rounded-xl p-1 ${avatar.eyes === eyes ? "ring-2 ring-accent" : "hover:bg-raised"}`} aria-label={`${eyes} eyes`} aria-pressed={avatar.eyes === eyes}>
                <NodeAvatar avatar={{ ...avatar, eyes }} size={26} />
              </button>
            ))}
          </div>
        </Field>
        <Field label="Instructions" hint="Private guidelines for this node: how it works, what it should care about.">
          <Textarea value={charter} onChange={(event) => setCharter(event.target.value)} rows={7} maxLength={8000} />
        </Field>
        <Button onClick={() => void save()} busy={busy === "save"} disabled={!dirty || !name.trim() || !role.trim()}>
          Save
        </Button>
      </Section>

      <Section title="Model" hint="The model this node thinks and talks with. The coding agents it runs on your computer use their own models, from your run profile unless you name one.">
        <ModelPicker value={{ provider: node.provider, model: node.model }} onChange={(next) => void change({ provider: next.provider, model: next.model }, "Model saved.")} />
        <Field label="Thinking" group hint="Low answers fastest and is enough for most of what a node does: the hard work runs in your coding agents. Models without a thinking setting ignore it.">
          <Segmented
            label="Thinking"
            value={node.effort ?? "low"}
            onChange={(effort) => void change({ effort }, "Thinking saved.")}
            options={[{ id: "low", label: "Low · fast" }, { id: "medium", label: "Medium" }, { id: "high", label: "High" }]}
          />
        </Field>
        <AgentSessions node={node} />
      </Section>

      <Section title="Permissions" hint="These save as soon as you change them.">
        <Field label="Work on your computer" group>
          <div className="flex flex-col gap-2">
            <Choice name={`work-${node.id}`} checked={computerWork === "auto"} onChange={() => void change({ autonomy: { computerWork: "auto" } }, "Saved: it starts work when you ask.")} title="When I ask" hint="it runs your coding agents (Claude Code, Codex, Copilot…) on your computer right away, and you can stop it any time." />
            <Choice name={`work-${node.id}`} checked={computerWork === "ask"} onChange={() => void change({ autonomy: { computerWork: "ask" } }, "Saved: it asks you before starting work.")} title="Ask me first" hint="each new piece of work waits for your approval card." />
          </div>
          <p className="mt-1 text-xs text-muted">Requests from other people in a room always wait for you.</p>
        </Field>
        <Switch
          label="Read files on my computer"
          hint="Read-only, in shared folders and private chats only."
          checked={computerFiles}
          onChange={(next) => void change({ autonomy: { computerFiles: next } }, next ? `${node.name} may read your shared folders now.` : `${node.name} no longer reads files on your computer.`)}
          info={
            <>
              Off by default. When on, {node.name} may look at files on your paired computer: read-only, and only inside the folders that computer shares with Ensemble, in chats with just you. It never reads keys, secrets or <code className="rounded bg-raised px-1">.git</code>. The computer must allow it: run <code className="rounded bg-raised px-1">{CLI_COMMAND} browse on</code> there.
            </>
          }
        />
        {computerFiles ? (
          <p className="flex items-start gap-2 rounded-xl border border-line bg-bg px-3 py-2 text-xs text-muted">
            <FolderOpen size={14} className="mt-0.5 shrink-0 text-accent" />
            <span>
              {folders.length ? `Shared now: ${folders.join(", ")}.` : devices.isLoading ? "Looking for your computers…" : "No paired computer shares a folder yet."}{" "}
              <Link href="/settings#computers" className="text-accent hover:underline">
                Computers
              </Link>
            </span>
          </p>
        ) : null}
        <Field label="In rooms with other people" group>
          <div className="flex flex-col gap-2">
            <Choice name={`rooms-${node.id}`} checked={sharedRooms === "ask"} onChange={() => void change({ autonomy: { sharedRooms: "ask" } }, "Saved: it asks you before posting.")} title="Ask me before posting" hint="you approve every message it sends for you." />
            <Choice name={`rooms-${node.id}`} checked={sharedRooms === "auto"} onChange={() => void change({ autonomy: { sharedRooms: "auto" } }, "Saved: it posts on its own.")} title="Post on its own" hint="changes to your workspace and computer still wait for you." />
          </div>
        </Field>
        <Field label="New nodes and crews" group>
          <div className="flex flex-col gap-2">
            <Choice name={`create-${node.id}`} checked={createNodes === "ask"} onChange={() => void change({ autonomy: { createNodes: "ask" } }, "Saved: it proposes new nodes and crews on a card.")} title="Ask me first" hint="it proposes a node or a crew on a card, and you make it or discard it." />
            <Choice name={`create-${node.id}`} checked={createNodes === "auto"} onChange={() => void change({ autonomy: { createNodes: "auto" } }, "Saved: it makes nodes and crews on its own.")} title="Make them on its own" hint="it makes the nodes and crews it needs, and tells you." />
          </div>
        </Field>
        <Field label="Helpers at once" hint="Temporary helpers it may have working at the same time. Your account allows twice this in all.">
          <select
            value={helpers}
            onChange={(event) => {
              const next = Number(event.target.value);
              void change({ autonomy: { helpers: next } }, next ? `Saved: up to ${next} helper${next === 1 ? "" : "s"} at once.` : "Saved: no limit on helpers.");
            }}
            className="w-full rounded-xl border border-line bg-bg px-2.5 py-2 text-sm text-ink outline-none transition focus:border-accent sm:w-48"
          >
            {helperCounts.map((count) => (
              <option key={count} value={count}>
                {count === 4 ? "4 (the default)" : String(count)}
              </option>
            ))}
            <option value={0}>No limit</option>
          </select>
        </Field>
      </Section>

      <Section title="Routines" hint={`Work ${node.name} does on its own: on a schedule, when something changes in Ensemble, or when a webhook calls.`}>
        <NodeRoutines node={node} />
      </Section>

      <Section title="Captures" hint={`Screenshots and videos ${node.name} took on your computers. One that may show something private waits on a card in its chat until you check it.`}>
        <NodeCaptures node={node} />
      </Section>

      <Section title="Memory" hint={`What ${node.name} remembers between chats.`}>
        <div className="flex gap-2">
          <Input value={memoryText} onChange={(event) => setMemoryText(event.target.value)} placeholder="Our docs use British spelling" maxLength={500} aria-label="Something to remember" />
          <Button
            tone="ghost"
            disabled={!memoryText.trim()}
            onClick={() =>
              void api(`/api/node/nodes/${node.id}/memory`, { body: { content: memoryText } })
                .then(() => {
                  setMemoryText("");
                  void client.invalidateQueries({ queryKey: keys.memory(node.id) });
                })
                .catch(toastError)
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
      </Section>

      <section className="flex flex-wrap gap-2 border-t border-line pt-5">
        {onExport ? (
          <Button tone="ghost" onClick={onExport}>
            <Download size={15} /> Export chat
          </Button>
        ) : null}
        <Button
          tone="danger"
          onClick={() => {
            if (!confirm(`Delete ${node.name}? Its direct chat and memory go too.`)) return;
            void api(`/api/node/nodes/${node.id}`, { method: "DELETE" })
              .then(async () => {
                await refresh();
                router.replace("/chat");
              })
              .catch(toastError);
          }}
        >
          <Trash2 size={15} /> Delete {node.name}
        </Button>
      </section>
    </div>
  );
}
