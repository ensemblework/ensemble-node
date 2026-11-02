"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Crown, Hash, Plus, Sparkles, Users, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { isEmail } from "@/lib/chat";
import { blankAvatar, crewDraft, draftNode, handleForName, handleProblem, handleProblems, nameProblems, pickLead, refusedField, renameDraft, titleTaken, uniqueName, type DraftNode } from "@/lib/crew";
import { keys, limitsOf, useBootstrap } from "@/lib/hooks";
import type { Avatar, Bootstrap, NodeFull, Room } from "@/lib/types";
import { EmailChips } from "@/components/email-chips";
import { ModelPicker } from "@/components/model-picker";
import { HandleInput } from "@/components/handle-input";
import { AppearancePicker, NodeAvatar } from "@/components/node-avatar";
import { NodePicker } from "@/components/node-picker";
import { Button, Field, Input, Notice, Segmented, Spinner, Textarea } from "@/components/ui";

type Tab = "node" | "crew" | "room";

const isTab = (value: string | null): value is Tab => value === "node" || value === "crew" || value === "room";

/** Titles of the crews and rooms I made: they must be unique (ignoring case). */
const myTitles = (boot: Bootstrap) => boot.rooms.filter((room) => room.kind !== "dm" && room.createdBy === boot.me.id).map((room) => room.title);

type NodeField = "name" | "slug" | "role" | "charter" | "avatar";

const SCRATCH = "scratch";

const INSTRUCTIONS_HINT = "It reads these with every message. You can change them later in its settings.";
const SCRATCH_PLACEHOLDER = [
  "What it is for, what it does itself and how it reports. For example:",
  "You keep our website's content current.",
  "- Small edits you make yourself; bigger changes go to a coding agent session.",
  "- Check pages against our house style and fix what is off.",
  "- Report in a few lines: what changed, what is left.",
].join("\n");

/** The templates a person can pick from (Ensemble may keep older ones resolvable but hidden). */
const listedTemplates = (boot: Bootstrap) => boot.templates.nodes.filter((row) => !row.hidden);

function NewNode({ boot }: { boot: Bootstrap }) {
  const client = useQueryClient();
  const router = useRouter();
  const { nodes } = boot;
  const templates = listedTemplates(boot);
  const takenNames = useMemo(() => new Set(nodes.map((node) => node.name.trim().toLowerCase())), [nodes]);
  const handles = useMemo(() => new Set(nodes.map((node) => node.slug)), [nodes]);
  const [template, setTemplate] = useState<string>(SCRATCH);
  const chosen = templates.find((row) => row.id === template) ?? null;
  // Fields the owner changed: choosing another template leaves them as they are.
  const [edited, setEdited] = useState<ReadonlySet<NodeField>>(new Set());
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [role, setRole] = useState("");
  const [charter, setCharter] = useState("");
  const [avatar, setAvatar] = useState<Avatar>(() => blankAvatar(nodes.length));
  const [model, setModel] = useState<{ provider: string | null; model: string | null }>({ provider: null, model: null });
  const [refused, setRefused] = useState<{ name?: string; slug?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameClash = name.trim() && takenNames.has(name.trim().toLowerCase()) ? `You already have a node called “${name.trim()}”. Pick another name.` : null;
  const slugProblem = edited.has("slug") || name.trim() ? handleProblem(slug, handles) : null;

  const mark = (field: NodeField) => setEdited((current) => (current.has(field) ? current : new Set([...current, field])));

  const pick = (id: string) => {
    const next = templates.find((row) => row.id === id) ?? null;
    setTemplate(id);
    setRefused({});
    const nextName = edited.has("name") ? name : next ? uniqueName(next.name, takenNames) : "";
    if (!edited.has("name")) setName(nextName);
    if (!edited.has("slug")) setSlug(handleForName(nextName, next, handles));
    if (!edited.has("role")) setRole(next?.role ?? "");
    if (!edited.has("charter")) setCharter(next?.charter ?? "");
    if (!edited.has("avatar")) setAvatar(next?.avatar ?? blankAvatar(nodes.length));
  };

  const rename = (value: string) => {
    setName(value);
    mark("name");
    setRefused((current) => ({ ...current, name: undefined, ...(edited.has("slug") ? {} : { slug: undefined }) }));
    if (!edited.has("slug")) setSlug(handleForName(value, chosen, handles));
  };

  const create = async () => {
    setError(null);
    setRefused({});
    setBusy(true);
    try {
      const { room } = await api<{ room: Room }>("/api/node/nodes", {
        body: {
          ...(chosen ? { templateId: chosen.id } : {}),
          name: name.trim(),
          slug,
          role: role.trim(),
          charter,
          avatar,
          ...(model.model ? { provider: model.provider, model: model.model } : {}),
        },
      });
      await client.invalidateQueries({ queryKey: keys.bootstrap });
      router.push(`/r/${room.id}`);
    } catch (failure) {
      const field = failure instanceof ApiError ? refusedField(failure.status, failure.message) : null;
      if (field) setRefused({ [field]: (failure as Error).message });
      else setError(failure instanceof Error ? failure.message : String(failure));
      setBusy(false);
    }
  };

  // Phones show two compact cards a row, and the chosen one's summary under them.
  const card = (selected: boolean) => `flex min-w-0 items-center gap-2.5 rounded-xl border p-2.5 text-left transition sm:items-start sm:gap-3 sm:p-3 ${selected ? "border-accent bg-accent/10" : "border-line bg-panel hover:border-muted"}`;
  const scratchSummary = "Name it, give it a role and write its instructions yourself.";

  return (
    <section className="space-y-5">
      <p className="text-sm text-muted">A node is a teammate with a role and instructions. Start from scratch or from a template; you can change everything later. Every node gets its own direct chat.</p>
      <div className="grid grid-cols-2 gap-2 sm:gap-3" role="radiogroup" aria-label="Start from">
        <button role="radio" aria-checked={template === SCRATCH} onClick={() => pick(SCRATCH)} className={card(template === SCRATCH)}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-muted text-muted sm:h-10 sm:w-10" aria-hidden>
            <Plus size={16} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium leading-snug sm:text-base">Start from scratch</span>
            <span className="hidden text-xs text-muted sm:block">{scratchSummary}</span>
          </span>
        </button>
        {templates.map((row) => (
          <button key={row.id} role="radio" aria-checked={template === row.id} onClick={() => pick(row.id)} className={card(template === row.id)}>
            <span className="shrink-0 [&>svg]:h-8 [&>svg]:w-8 sm:[&>svg]:h-10 sm:[&>svg]:w-10" aria-hidden>
              <NodeAvatar avatar={row.avatar} size={40} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium leading-snug sm:text-base">{row.name}</span>
              <span className="hidden text-xs text-muted sm:block">{row.summary}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="-mt-2 text-xs text-muted sm:hidden" aria-live="polite">
        {chosen ? `${chosen.name}: ${chosen.summary}` : scratchSummary}
      </p>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={refused.name ?? nameClash} hint="Unique among your nodes.">
          <Input value={name} onChange={(event) => rename(event.target.value)} maxLength={60} placeholder={chosen?.name ?? "Scout"} />
        </Field>
        <Field label="Handle" error={refused.slug ?? slugProblem} hint={edited.has("slug") ? "How you @mention it." : "How you @mention it. It follows the name until you change it."}>
          <HandleInput
            value={slug}
            onValue={(next) => {
              setSlug(next);
              mark("slug");
              setRefused((current) => ({ ...current, slug: undefined }));
            }}
            invalid={Boolean(refused.slug ?? slugProblem)}
            placeholder="scout"
            aria-label="Handle"
          />
        </Field>
      </div>
      <Field label="Role" hint="One or two words: what it is in your team.">
        <Input value={role} onChange={(event) => (setRole(event.target.value), mark("role"))} maxLength={40} placeholder={chosen?.role ?? "researcher"} />
      </Field>
      <Field label="Appearance" group>
        <AppearancePicker value={avatar} onChange={(next) => (setAvatar(next), mark("avatar"))} />
      </Field>
      <Field label="Instructions" hint={chosen ? `From the ${chosen.name} template. ${INSTRUCTIONS_HINT}` : INSTRUCTIONS_HINT}>
        <Textarea value={charter} onChange={(event) => (setCharter(event.target.value), mark("charter"))} rows={chosen ? 8 : 6} maxLength={8000} placeholder={SCRATCH_PLACEHOLDER} />
      </Field>
      <Field label="Chat model" group hint="Included models use your monthly Ensemble credits. Your own API keys and AI plans on a paired computer are listed too.">
        <ModelPicker value={model} onChange={setModel} />
      </Field>
      <Button busy={busy} disabled={!name.trim() || !role.trim() || Boolean(nameClash) || Boolean(slugProblem)} onClick={() => void create()}>
        Create {name.trim() || "node"}
      </Button>
    </section>
  );
}

/** One new node of a crew: name, handle, role, model, lead, and its look and instructions (folded until opened). */
function CrewRow({
  row,
  templateName,
  isLead,
  nameProblem,
  slugProblem,
  same,
  onName,
  onChange,
  onLead,
  onRemove,
  onSwap,
}: {
  row: DraftNode;
  templateName: string | null;
  isLead: boolean;
  nameProblem: string | null;
  slugProblem: string | null;
  same: NodeFull | undefined;
  onName: (name: string) => void;
  onChange: (patch: Partial<DraftNode>) => void;
  onLead: () => void;
  onRemove: () => void;
  onSwap: (node: NodeFull) => void;
}) {
  const [open, setOpen] = useState(false);
  const made = Boolean(row.createdId);
  const label = row.name.trim() || "New node";
  const firstLine = row.charter.split("\n").find((line) => line.trim())?.trim() ?? "";
  return (
    <li className={`rounded-xl border p-3 ${isLead ? "border-accent/60 bg-accent/5" : "border-line bg-bg"}`} data-crew-row={row.key}>
      <div className="flex items-start gap-2">
        <button type="button" onClick={() => setOpen(!open)} disabled={made} className="mt-0.5 shrink-0 rounded-xl p-0.5 hover:bg-raised" aria-label={`${label}'s look and instructions`} aria-expanded={open}>
          <NodeAvatar node={row} size={34} />
        </button>
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,9rem)_minmax(0,8rem)]">
          <label className="min-w-0">
            <span className="sr-only">Name</span>
            <Input value={row.name} disabled={made} onChange={(event) => onName(event.target.value)} maxLength={60} placeholder="Name" aria-invalid={Boolean(nameProblem)} />
          </label>
          <label className="min-w-0">
            <span className="sr-only">Handle</span>
            <HandleInput value={row.slug} disabled={made} onValue={(slug) => onChange({ slug, slugEdited: true })} placeholder="handle" invalid={Boolean(slugProblem)} aria-label={`${label}'s handle`} />
          </label>
          <label className="min-w-0">
            <span className="sr-only">Role</span>
            <Input value={row.role} disabled={made} onChange={(event) => onChange({ role: event.target.value })} maxLength={40} placeholder="Role" />
          </label>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
          <label className={`inline-flex cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-lg px-2 py-2 text-xs sm:min-w-[5.75rem] ${isLead ? "bg-accent/15 text-accent" : "text-muted hover:bg-raised"}`}>
            <input type="radio" name="crew-lead" className="sr-only" checked={isLead} onChange={onLead} />
            <Crown size={13} /> {isLead ? "Lead" : "Make lead"}
          </label>
          {made ? (
            <span className="inline-flex items-center gap-1 px-2 text-xs text-ok">
              <Check size={13} /> made
            </span>
          ) : (
            <button type="button" aria-label={`Remove ${row.name || "this node"}`} className="rounded-lg p-2 text-muted hover:bg-raised hover:text-danger" onClick={onRemove}>
              <X size={15} />
            </button>
          )}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted sm:pl-11">
        {!made ? <ModelPicker variant="compact" label={`${label}'s model`} value={{ provider: row.provider, model: row.model }} onChange={(next) => onChange(next)} /> : null}
        <span>{templateName ? `from the ${templateName} template` : "blank node"}</span>
        {!made ? (
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex items-center gap-1 text-accent hover:underline">
            <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden /> {open ? "Hide look and instructions" : "Look and instructions"}
          </button>
        ) : null}
        {same ? (
          <button type="button" className="text-accent hover:underline" onClick={() => onSwap(same)}>
            Use your {same.name} (@{same.slug}) instead
          </button>
        ) : null}
      </div>
      {!open && !made ? <p className="mt-1 truncate text-xs text-muted sm:pl-11" title={row.charter || undefined}>{firstLine ? `Instructions: ${firstLine}` : "No instructions yet."}</p> : null}
      {open && !made ? (
        <div className="mt-3 space-y-3 sm:pl-11">
          <Field label="Appearance" group>
            <AppearancePicker value={row.avatar} onChange={(avatar) => onChange({ avatar })} compact label={`${label}'s appearance`} />
          </Field>
          <Field label="Instructions" hint={templateName ? `From the ${templateName} template. ${INSTRUCTIONS_HINT}` : INSTRUCTIONS_HINT}>
            <Textarea value={row.charter} onChange={(event) => onChange({ charter: event.target.value })} rows={templateName ? 7 : 5} maxLength={8000} placeholder={SCRATCH_PLACEHOLDER} />
          </Field>
        </div>
      ) : null}
      {nameProblem || slugProblem ? (
        <p className="mt-1.5 text-xs text-danger sm:pl-11" role="alert">
          {[nameProblem, slugProblem].filter(Boolean).join(" ")}
        </p>
      ) : null}
    </li>
  );
}

function NewCrew({ boot }: { boot: Bootstrap }) {
  const client = useQueryClient();
  const router = useRouter();
  const limits = limitsOf(boot);
  const { templates, nodes } = boot;
  const listed = listedTemplates(boot);
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
  const existingHandles = existing.map((node) => node.slug);
  const problems = nameProblems(rows, existing.map((node) => node.name));
  const slugProblems = handleProblems(rows, existingHandles);
  const total = rows.length + picked.size;
  const leadNow = pickLead(lead, rows, [...picked]);
  const titleClash = title.trim() && titleTaken(title, myTitles(boot)) ? `You already have a crew or room called “${title.trim()}”. Pick another name.` : null;
  const newCount = rows.filter((row) => !row.createdId).length;
  const roomForNodes = 24 - nodes.length;

  const clearError = (key: string) =>
    setRowErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });

  const suggest = (id: string | null) => {
    setSuggestion(id);
    setRowErrors({});
    const crew = templates.crews.find((row) => row.id === id);
    if (!crew) {
      setRows([]);
      setLead(null);
      return;
    }
    const draft = crewDraft(crew, templates.nodes, nodes.map((node) => node.name), nodes.map((node) => node.slug));
    setRows(draft.rows);
    setLead(draft.leadKey ? `new:${draft.leadKey}` : null);
    if (!title.trim() || templates.crews.some((row) => title.trim().startsWith(row.title))) setTitle(uniqueName(crew.title, new Set(myTitles(boot).map((row) => row.toLowerCase())), 80));
  };

  const update = (key: string, patch: Partial<DraftNode>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    clearError(key);
  };

  const rename = (key: string, name: string) => {
    setRows((current) => renameDraft(current, key, name, nodes.map((node) => node.slug), templates.nodes));
    clearError(key);
  };

  const addRow = (templateId: string | null) => {
    const taken = new Set([...nodes.map((node) => node.name), ...rows.map((row) => row.name)].map((name) => name.trim().toLowerCase()));
    const handles = new Set([...nodes.map((node) => node.slug), ...rows.map((row) => row.slug)]);
    setRows((current) => [...current, draftNode(templates.nodes.find((row) => row.id === templateId), taken, nodes.length + current.length, handles)]);
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
          body: {
            ...(row.templateId ? { templateId: row.templateId } : {}),
            name: row.name.trim(),
            slug: row.slug,
            role: row.role.trim() || "assistant",
            charter: row.charter,
            avatar: row.avatar,
            ...(row.model ? { provider: row.provider, model: row.model } : {}),
          },
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

  const ready = title.trim() && total > 0 && !Object.keys(problems).length && !Object.keys(slugProblems).length && !titleClash && total <= limits.crewNodes && newCount <= roomForNodes;

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
              <span className="flex -space-x-2" aria-hidden>
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
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          <span className="text-sm font-medium">New nodes {rows.length ? `(${rows.length})` : ""}</span>
          <span className="text-xs text-muted">Each gets its own direct chat too.</span>
        </div>
        {rows.length ? (
          <ul className="space-y-2">
            {rows.map((row) => (
              <CrewRow
                key={row.key}
                row={row}
                templateName={row.templateId ? (templates.nodes.find((item) => item.id === row.templateId)?.name ?? row.templateId) : null}
                isLead={leadNow === `new:${row.key}`}
                nameProblem={rowErrors[row.key] ?? problems[row.key] ?? null}
                slugProblem={rowErrors[row.key] ? null : (slugProblems[row.key] ?? null)}
                same={!row.createdId && row.templateId ? existing.find((node) => node.templateId === row.templateId && !picked.has(node.id)) : undefined}
                onName={(name) => rename(row.key, name)}
                onChange={(patch) => update(row.key, patch)}
                onLead={() => setLead(`new:${row.key}`)}
                onRemove={() => setRows((current) => current.filter((item) => item.key !== row.key))}
                onSwap={(node) => swapForExisting(row, node)}
              />
            ))}
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
              {listed.map((row) => (
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
  const myself = emails.some((email) => email === boot.me.email.trim().toLowerCase());

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
      <Field label="Invite people by email" group hint={`They need an Ensemble account (signing up on Node makes one). Up to ${limits.roomPeople} people in a room (your own limit, in Ensemble's Settings › Sharing), counting open requests. Someone who declines can be asked again after ${limits.declineBlockDays} days.`}>
        <EmailChips emails={emails} onChange={setEmails} max={limits.roomPeople - 1} label="Invite people by email" />
        {myself ? (
          <span className="block text-xs text-danger" role="alert">
            {boot.me.email} is you: you are in the room already. Remove it.
          </span>
        ) : null}
      </Field>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button busy={busy} disabled={!title.trim() || !picked.size || Boolean(titleClash) || myself || emails.some((email) => !isEmail(email))} onClick={() => void create()}>
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
