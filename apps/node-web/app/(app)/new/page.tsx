"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Crown, Hash, Plus, Sparkles, Users, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { isEmail } from "@/lib/chat";
import { crewDraft, draftNode, nameProblems, pickLead, titleTaken, uniqueName, type DraftNode } from "@/lib/crew";
import { keys, limitsOf, useBootstrap } from "@/lib/hooks";
import type { Bootstrap, NodeFull, Room } from "@/lib/types";
import { EmailChips } from "@/components/email-chips";
import { ModelPicker } from "@/components/model-picker";
import { NodeAvatar } from "@/components/node-avatar";
import { NodePicker } from "@/components/node-picker";
import { Button, Field, Input, Notice, Segmented, Spinner } from "@/components/ui";

type Tab = "node" | "crew" | "room";

const isTab = (value: string | null): value is Tab => value === "node" || value === "crew" || value === "room";

/** Titles of the crews and rooms I made: they must be unique (ignoring case). */
const myTitles = (boot: Bootstrap) => boot.rooms.filter((room) => room.kind !== "dm" && room.createdBy === boot.me.id).map((room) => room.title);

function NewNode({ boot }: { boot: Bootstrap }) {
  const client = useQueryClient();
  const router = useRouter();
  const { templates, nodes } = boot;
  const [template, setTemplate] = useState(templates.nodes[0]?.id ?? "assistant");
  const chosen = templates.nodes.find((row) => row.id === template);
  const taken = useMemo(() => new Set(nodes.map((node) => node.name.trim().toLowerCase())), [nodes]);
  const [name, setName] = useState(() => uniqueName(chosen?.name ?? "Assistant", taken));
  const [role, setRole] = useState(chosen?.role ?? "assistant");
  const [model, setModel] = useState<{ provider: string | null; model: string | null }>({ provider: null, model: null });
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clash = name.trim() && taken.has(name.trim().toLowerCase()) ? `You already have a node called “${name.trim()}”. Pick another name.` : null;

  const pick = (id: string) => {
    const next = templates.nodes.find((row) => row.id === id);
    setTemplate(id);
    setName(uniqueName(next?.name ?? "Assistant", taken));
    setRole(next?.role ?? "assistant");
    setNameError(null);
  };

  const create = async () => {
    setError(null);
    setNameError(null);
    setBusy(true);
    try {
      const { room } = await api<{ room: Room }>("/api/node/nodes", {
        body: { templateId: template, name: name.trim(), role: role.trim(), ...(model.model ? { provider: model.provider, model: model.model } : {}) },
      });
      await client.invalidateQueries({ queryKey: keys.bootstrap });
      router.push(`/r/${room.id}`);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409 && /node called/.test(failure.message)) setNameError(failure.message);
      else setError(failure instanceof Error ? failure.message : String(failure));
      setBusy(false);
    }
  };

  return (
    <section className="space-y-5">
      <p className="text-sm text-muted">A node is a teammate with a role and a charter. Start from a template; you can change everything later. Every node gets its own direct chat.</p>
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Template">
        {templates.nodes.map((row) => (
          <button key={row.id} role="radio" aria-checked={template === row.id} onClick={() => pick(row.id)} className={`flex gap-3 rounded-xl border p-3 text-left ${template === row.id ? "border-accent bg-accent/10" : "border-line bg-panel hover:border-muted"}`}>
            <NodeAvatar avatar={row.avatar} size={40} />
            <span>
              <span className="block font-medium">{row.name}</span>
              <span className="block text-xs text-muted">{row.summary}</span>
            </span>
          </button>
        ))}
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={nameError ?? clash} hint="Unique among your nodes.">
          <Input value={name} onChange={(event) => (setName(event.target.value), setNameError(null))} maxLength={60} />
        </Field>
        <Field label="Role">
          <Input value={role} onChange={(event) => setRole(event.target.value)} maxLength={40} />
        </Field>
      </div>
      <Field label="Chat model" group hint="Included models use your monthly Ensemble credits. Your own API keys and AI plans on a paired computer are listed too.">
        <ModelPicker value={model} onChange={setModel} />
      </Field>
      <Button busy={busy} disabled={!name.trim() || !role.trim() || Boolean(clash)} onClick={() => void create()}>
        Create {name.trim() || "node"}
      </Button>
    </section>
  );
}

function NewCrew({ boot }: { boot: Bootstrap }) {
  const client = useQueryClient();
  const router = useRouter();
  const limits = limitsOf(boot);
  const { templates, nodes } = boot;
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<DraftNode[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [lead, setLead] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [titleError, setTitleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const createdIds = new Set(rows.flatMap((row) => (row.createdId ? [row.createdId] : [])));
  const existing = nodes.filter((node) => !createdIds.has(node.id));
  const problems = nameProblems(rows, existing.map((node) => node.name));
  const total = rows.length + picked.size;
  const leadNow = pickLead(lead, rows, [...picked]);
  const titleClash = title.trim() && titleTaken(title, myTitles(boot)) ? `You already have a crew or room called “${title.trim()}”. Pick another name.` : null;
  const newCount = rows.filter((row) => !row.createdId).length;
  const roomForNodes = 24 - nodes.length;

  const suggest = (id: string | null) => {
    setSuggestion(id);
    setRowErrors({});
    const crew = templates.crews.find((row) => row.id === id);
    if (!crew) {
      setRows([]);
      setLead(null);
      return;
    }
    const draft = crewDraft(crew, templates.nodes, nodes.map((node) => node.name));
    setRows(draft.rows);
    setLead(draft.leadKey ? `new:${draft.leadKey}` : null);
    if (!title.trim() || templates.crews.some((row) => title.trim().startsWith(row.title))) setTitle(uniqueName(crew.title, new Set(myTitles(boot).map((row) => row.toLowerCase())), 80));
  };

  const update = (key: string, patch: Partial<DraftNode>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    setRowErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const addRow = (templateId: string | null) => {
    const taken = new Set([...nodes.map((node) => node.name), ...rows.map((row) => row.name)].map((name) => name.trim().toLowerCase()));
    setRows((current) => [...current, draftNode(templates.nodes.find((row) => row.id === templateId), taken, current.length)]);
  };

  const swapForExisting = (row: DraftNode, node: NodeFull) => {
    setRows((current) => current.filter((item) => item.key !== row.key));
    setPicked((current) => new Set([...current, node.id]));
    if (lead === `new:${row.key}`) setLead(`node:${node.id}`);
  };

  const create = async () => {
    setError(null);
    setTitleError(null);
    setBusy(true);
    const made = new Map(rows.flatMap((row) => (row.createdId ? [[row.key, row.createdId] as const] : [])));
    const stop = () => {
      setBusy(false);
      // Nodes made before the failure exist now: the lists show them.
      if (made.size) void client.invalidateQueries({ queryKey: keys.bootstrap });
    };
    for (const row of rows) {
      if (row.createdId) continue;
      try {
        const { node } = await api<{ node: NodeFull }>("/api/node/nodes", {
          body: { ...(row.templateId ? { templateId: row.templateId } : { avatar: row.avatar }), name: row.name.trim(), role: row.role.trim() || "assistant", ...(row.model ? { provider: row.provider, model: row.model } : {}) },
        });
        made.set(row.key, node.id);
        setRows((current) => current.map((item) => (item.key === row.key ? { ...item, createdId: node.id } : item)));
      } catch (failure) {
        setRowErrors((current) => ({ ...current, [row.key]: failure instanceof Error ? failure.message : String(failure) }));
        return stop();
      }
    }
    const nodeIds = [...picked, ...rows.map((row) => made.get(row.key)!)];
    const leadNodeId = leadNow?.startsWith("new:") ? made.get(leadNow.slice(4)) : leadNow?.slice(5);
    try {
      const { room } = await api<{ room: Room }>("/api/node/crews", { body: { title: title.trim(), nodeIds, ...(leadNodeId ? { leadNodeId } : {}) } });
      await client.invalidateQueries({ queryKey: keys.bootstrap });
      router.push(`/r/${room.id}`);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) setTitleError(failure.message);
      else setError(failure instanceof Error ? failure.message : String(failure));
      stop();
    }
  };

  const ready = title.trim() && total > 0 && !Object.keys(problems).length && !titleClash && total <= limits.crewNodes && newCount <= roomForNodes;

  return (
    <section className="space-y-6">
      <p className="text-sm text-muted">A crew is you and nodes you pick: one lead plans and hands out the work. Start from a suggestion or from scratch, rename anything, and bring nodes you already have.</p>
      <Field label="Crew name" error={titleError ?? titleClash}>
        <Input value={title} onChange={(event) => (setTitle(event.target.value), setTitleError(null))} placeholder="Software team" maxLength={80} />
      </Field>

      <div className="space-y-2">
        <div className="text-sm font-medium">Start from a suggestion</div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Suggestions">
          {templates.crews.map((crew) => (
            <button key={crew.id} role="radio" aria-checked={suggestion === crew.id} onClick={() => suggest(crew.id)} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm ${suggestion === crew.id ? "border-accent bg-accent/10" : "border-line bg-panel hover:border-muted"}`} title={crew.summary}>
              <span className="flex -space-x-2">
                {crew.nodes.map((id) => (
                  <NodeAvatar key={id} avatar={templates.nodes.find((node) => node.id === id)?.avatar} size={20} />
                ))}
              </span>
              {crew.title}
            </button>
          ))}
          <button role="radio" aria-checked={suggestion === null} onClick={() => suggest(null)} className={`rounded-xl border px-3 py-2 text-sm ${suggestion === null ? "border-accent bg-accent/10" : "border-line bg-panel hover:border-muted"}`}>
            Start empty
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">New nodes {rows.length ? `(${rows.length})` : ""}</span>
          <span className="text-xs text-muted">Each gets its own direct chat too.</span>
        </div>
        {rows.length ? (
          <ul className="space-y-2">
            {rows.map((row) => {
              const problem = rowErrors[row.key] ?? problems[row.key];
              const same = !row.createdId && row.templateId ? existing.find((node) => node.templateId === row.templateId && !picked.has(node.id)) : undefined;
              const isLead = leadNow === `new:${row.key}`;
              return (
                <li key={row.key} className={`rounded-xl border p-3 ${isLead ? "border-accent/60 bg-accent/5" : "border-line bg-bg"}`}>
                  <div className="flex flex-wrap items-start gap-2">
                    <NodeAvatar node={row} size={34} />
                    <label className="min-w-[9rem] flex-1">
                      <span className="sr-only">Name</span>
                      <Input value={row.name} disabled={Boolean(row.createdId)} onChange={(event) => update(row.key, { name: event.target.value })} maxLength={60} placeholder="Name" aria-invalid={Boolean(problem)} />
                    </label>
                    <label className="w-full min-w-[7rem] sm:w-36">
                      <span className="sr-only">Role</span>
                      <Input value={row.role} disabled={Boolean(row.createdId)} onChange={(event) => update(row.key, { role: event.target.value })} maxLength={40} placeholder="Role" />
                    </label>
                    <div className="flex items-center gap-1">
                      <label className={`inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-2 text-xs ${isLead ? "bg-accent/15 text-accent" : "text-muted hover:bg-raised"}`}>
                        <input type="radio" name="crew-lead" className="sr-only" checked={isLead} onChange={() => setLead(`new:${row.key}`)} />
                        <Crown size={13} /> {isLead ? "Lead" : "Make lead"}
                      </label>
                      {row.createdId ? (
                        <span className="inline-flex items-center gap-1 px-2 text-xs text-ok">
                          <Check size={13} /> made
                        </span>
                      ) : (
                        <button type="button" aria-label={`Remove ${row.name || "this node"}`} className="rounded-lg p-2 text-muted hover:bg-raised hover:text-danger" onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}>
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-11 text-xs text-muted">
                    {!row.createdId ? <ModelPicker variant="compact" label={`${row.name || "New node"}'s model`} value={{ provider: row.provider, model: row.model }} onChange={(next) => update(row.key, next)} /> : null}
                    {row.templateId ? <span>from the {templates.nodes.find((item) => item.id === row.templateId)?.name ?? row.templateId} template</span> : <span>blank node</span>}
                    {same ? (
                      <button type="button" className="text-accent hover:underline" onClick={() => swapForExisting(row, same)}>
                        Use your {same.name} (@{same.slug}) instead
                      </button>
                    ) : null}
                  </div>
                  {problem ? (
                    <p className="mt-1.5 pl-11 text-xs text-danger" role="alert">
                      {problem}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">None. Add one, pick a suggestion, or bring only nodes you already have.</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button tone="ghost" onClick={() => addRow(null)} disabled={total >= limits.crewNodes}>
            <Plus size={15} /> Add a node
          </Button>
          <label className="text-xs text-muted">
            <span className="sr-only">Add from a template</span>
            <select
              value=""
              disabled={total >= limits.crewNodes}
              onChange={(event) => event.target.value && addRow(event.target.value)}
              className="rounded-xl border border-line bg-bg px-2 py-2 text-sm text-ink"
            >
              <option value="">Add from a template…</option>
              {templates.nodes.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Your nodes</div>
        {existing.length ? (
          <NodePicker
            nodes={existing}
            selected={picked}
            onChange={setPicked}
            lead={leadNow?.startsWith("node:") ? leadNow.slice(5) : null}
            onLead={(id) => setLead(`node:${id}`)}
            max={Math.max(0, limits.crewNodes - rows.length)}
            label="Your nodes in the crew"
          />
        ) : (
          <p className="text-sm text-muted">You have no nodes yet: the new ones above are made first.</p>
        )}
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button busy={busy} disabled={!ready} onClick={() => void create()}>
          Create crew{total ? ` with ${total} node${total === 1 ? "" : "s"}` : ""}
        </Button>
        <span className="text-xs text-muted">
          A crew holds up to {limits.crewNodes} nodes; an account has up to 24 nodes ({Math.max(0, roomForNodes)} more).
          {newCount > roomForNodes ? " Remove some new nodes, or use ones you have." : ""}
        </span>
      </div>
    </section>
  );
}

function NewRoom({ boot }: { boot: Bootstrap }) {
  const client = useQueryClient();
  const router = useRouter();
  const limits = limitsOf(boot);
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(boot.nodes[0] ? [boot.nodes[0].id] : []));
  const [lead, setLead] = useState<string | null>(boot.nodes[0]?.id ?? null);
  const [emails, setEmails] = useState<string[]>([]);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ room: Room; invited: Array<{ email: string; ok: boolean; error?: string }> } | null>(null);
  const titleClash = title.trim() && titleTaken(title, myTitles(boot)) ? `You already have a crew or room called “${title.trim()}”. Pick another name.` : null;
  const leadNow = lead && picked.has(lead) ? lead : ([...picked][0] ?? null);

  const create = async () => {
    setError(null);
    setTitleError(null);
    setBusy(true);
    try {
      const made = await api<{ room: Room; invited: Array<{ email: string; ok: boolean; error?: string }> }>("/api/node/rooms", {
        body: { title: title.trim(), nodeIds: [...picked], ...(leadNow ? { leadNodeId: leadNow } : {}), invite: emails },
      });
      await client.invalidateQueries({ queryKey: keys.bootstrap });
      if (!made.invited?.length) router.push(`/r/${made.room.id}`);
      else setResult(made);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) setTitleError(failure.message);
      else setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const ok = result.invited.filter((row) => row.ok).length;
    return (
      <section className="space-y-4">
        <Notice tone="ok">“{result.room.title}” is ready.</Notice>
        <div className="space-y-2">
          <div className="text-sm font-medium">
            Requests to join: {ok} of {result.invited.length} sent
          </div>
          <ul className="space-y-1.5">
            {result.invited.map((row) => (
              <li key={row.email} className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${row.ok ? "border-ok/30 bg-ok/5" : "border-danger/30 bg-danger/5"}`}>
                {row.ok ? <Check size={15} className="mt-0.5 shrink-0 text-ok" /> : <X size={15} className="mt-0.5 shrink-0 text-danger" />}
                <span className="min-w-0">
                  <span className="block font-medium">{row.email}</span>
                  <span className="block text-xs text-muted">{row.ok ? "Asked. They answer in Node's Requests and bring their own nodes." : row.error}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">You can ask more people, or ask again, in the room&apos;s settings.</p>
        </div>
        <Button onClick={() => router.push(`/r/${result.room.id}`)}>Open the room</Button>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <p className="text-sm text-muted">
        A room is for you and other people. Each person brings 1–{limits.nodesPerPerson} of their own nodes, and one of them leads for that person: it answers what concerns them and asks them before it posts.
      </p>
      <Field label="Room name" error={titleError ?? titleClash}>
        <Input value={title} onChange={(event) => (setTitle(event.target.value), setTitleError(null))} placeholder="Launch" maxLength={80} />
      </Field>
      <div className="space-y-2">
        <div className="text-sm font-medium">Your nodes in this room</div>
        <p className="text-xs text-muted">Pick 1–{limits.nodesPerPerson}, and which one is your lead.</p>
        <NodePicker nodes={boot.nodes} selected={picked} onChange={setPicked} lead={leadNow} onLead={setLead} max={limits.nodesPerPerson} label="Your nodes in the room" />
      </div>
      <Field label="Invite people by email" group hint={`They need an Ensemble account (signing up on Node makes one). Up to ${limits.roomPeople} people in a room, counting open requests. Someone who declines can be asked again after ${limits.declineBlockDays} days.`}>
        <EmailChips emails={emails} onChange={setEmails} max={limits.roomPeople - 1} label="Invite people by email" />
      </Field>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button busy={busy} disabled={!title.trim() || !picked.size || Boolean(titleClash) || emails.some((email) => !isEmail(email))} onClick={() => void create()}>
        Create room{emails.length ? ` and ask ${emails.length} ${emails.length === 1 ? "person" : "people"}` : ""}
      </Button>
      {!boot.nodes.length ? (
        <p className="text-sm text-muted">
          You need a node to bring. <Link href="/new?tab=node" className="text-accent">Make one first</Link>.
        </p>
      ) : null}
    </section>
  );
}

function NewPage() {
  const boot = useBootstrap();
  const params = useSearchParams();
  const router = useRouter();
  const wanted = params.get("tab");
  const [tab, setTab] = useState<Tab>(isTab(wanted) ? wanted : "node");
  useEffect(() => {
    if (isTab(wanted)) setTab(wanted);
  }, [wanted]);
  if (!boot.data) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  }
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:px-8">
        <h1 className="text-2xl font-semibold">Create</h1>
        <Segmented
          label="What to create"
          value={tab}
          onChange={(next) => {
            setTab(next);
            router.replace(`/new?tab=${next}`);
          }}
          options={[
            { id: "node", label: <><Sparkles size={15} /> Node</> },
            { id: "crew", label: <><Users size={15} /> Crew</>, title: "You and nodes you pick" },
            { id: "room", label: <><Hash size={15} /> Room</>, title: "With other people and their nodes" },
          ]}
        />
        {tab === "node" ? <NewNode boot={boot.data} /> : tab === "crew" ? <NewCrew boot={boot.data} /> : <NewRoom boot={boot.data} />}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <NewPage />
    </Suspense>
  );
}
