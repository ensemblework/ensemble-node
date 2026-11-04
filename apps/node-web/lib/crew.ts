/** Making nodes and crews: proposed new nodes from a template or blank, unique names and handles, and who leads. */
import type { Avatar, CrewTemplate, NodeTemplate } from "./types";

/**
 * A node the create forms will make. Its handle follows its name until the owner edits it
 * (`slugEdited`). `createdId` is set once it exists, so a retry does not make it twice.
 */
export type DraftNode = {
  key: string;
  templateId: string | null;
  name: string;
  slug: string;
  slugEdited?: boolean;
  role: string;
  charter: string;
  avatar: Avatar;
  provider: string | null;
  model: string | null;
  createdId?: string;
};

const SHAPES: Avatar["shape"][] = ["orb", "square", "spark", "hex", "leaf", "compass", "pebble", "bloom"];
const COLORS = ["#D7B56F", "#7FB3D5", "#E07A5F", "#81B29A", "#B39DDB", "#F2CC8F", "#5FB4A2", "#E8A3B5"];

const norm = (name: string) => name.trim().toLowerCase();

/** Handles that mention every node in a room, so no node may have them (Ensemble refuses them too). */
export const SPECIAL_HANDLES: readonly string[] = ["all", "everyone", "nodes"];
export const HANDLE_MAX = 24;

/** A handle from a name, as Ensemble makes one: lowercase letters, digits and dashes, at most 24 characters; "" when nothing is left. */
export function handleFrom(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, HANDLE_MAX)
    .replace(/-+$/g, "");
}

/** `base`, or `base-2`, `base-3`… when that handle is taken or special (as Ensemble numbers handles). */
export function uniqueHandle(base: string, taken: ReadonlySet<string>): string {
  const clean = handleFrom(base) || "node";
  const free = (handle: string) => !taken.has(handle) && !SPECIAL_HANDLES.includes(handle);
  if (free(clean)) return clean;
  for (let n = 2; ; n += 1) {
    const next = `${clean.slice(0, HANDLE_MAX - String(n).length - 1).replace(/-+$/g, "")}-${n}`;
    if (free(next)) return next;
  }
}

/** The handle a node gets from its name: its template's handle while it keeps the template's name, made unique. */
export function handleForName(name: string, template: Pick<NodeTemplate, "name" | "slug"> | null | undefined, taken: ReadonlySet<string>): string {
  if (!name.trim()) return "";
  return uniqueHandle(template && norm(name) === norm(template.name) ? template.slug : name, taken);
}

/** What the owner types in a handle box: no leading @, lowercase, spaces as dashes. */
export const handleInput = (value: string): string => value.replace(/^\s*@/, "").toLowerCase().replace(/\s+/g, "-");

/** Why a handle cannot be used, in Ensemble's words, or null. `taken` holds the owner's other nodes' handles. */
export function handleProblem(handle: string, taken: ReadonlySet<string>): string | null {
  const value = handle.trim();
  if (!value) return "Give it a handle.";
  if (value.length > HANDLE_MAX) return `Up to ${HANDLE_MAX} characters.`;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) return "Use lowercase letters, digits and dashes, starting with a letter or a digit.";
  if (SPECIAL_HANDLES.includes(value)) return `@${value} mentions every node. Pick another handle.`;
  if (taken.has(value)) return `Another of your nodes is already @${value}. Pick another handle.`;
  return null;
}

/** `base`, or `base 2`, `base 3`… when that name is taken (as the server numbers a template's name). */
export function uniqueName(base: string, taken: ReadonlySet<string>, max = 60): string {
  const clean = base.trim().slice(0, max) || "Node";
  if (!taken.has(norm(clean))) return clean;
  for (let n = 2; ; n += 1) {
    const candidate = `${clean.slice(0, max - String(n).length - 1)} ${n}`;
    if (!taken.has(norm(candidate))) return candidate;
  }
}

let counter = 0;
const nextKey = () => `draft-${Date.now().toString(36)}-${(counter += 1)}`;

/** A look for a node made from scratch, different for each `index`. */
export const blankAvatar = (index: number): Avatar => ({ shape: SHAPES[index % SHAPES.length]!, color: COLORS[index % COLORS.length]!, eyes: (["dot", "line", "wide"] as const)[Math.floor(index / SHAPES.length) % 3]! });

/**
 * A new node row, from a node template (its name, handle, role, look and instructions) or blank (its
 * instructions empty); its name clashes with nothing in `taken` and its handle with nothing in `handles`.
 */
export function draftNode(template: NodeTemplate | undefined, taken: ReadonlySet<string>, index = 0, handles: ReadonlySet<string> = new Set()): DraftNode {
  const name = uniqueName(template?.name ?? "New node", taken);
  return {
    key: nextKey(),
    templateId: template?.id ?? null,
    name,
    slug: handleForName(name, template, handles),
    role: template?.role ?? "assistant",
    charter: template?.charter ?? "",
    avatar: template?.avatar ?? blankAvatar(index),
    provider: null,
    model: null,
  };
}

/** The rows a crew suggestion proposes, named and handled so they clash neither with my nodes nor with each other. */
export function crewDraft(crew: CrewTemplate, templates: readonly NodeTemplate[], existingNames: readonly string[], existingHandles: readonly string[] = []): { rows: DraftNode[]; leadKey: string | null } {
  const taken = new Set(existingNames.map(norm));
  const handles = new Set(existingHandles);
  const rows: DraftNode[] = [];
  let leadKey: string | null = null;
  crew.nodes.forEach((id, index) => {
    const template = templates.find((row) => row.id === id);
    if (!template) return;
    const row = draftNode(template, taken, index, handles);
    taken.add(norm(row.name));
    handles.add(row.slug);
    rows.push(row);
    if (id === crew.lead && !leadKey) leadKey = row.key;
  });
  return { rows, leadKey: leadKey ?? rows[0]?.key ?? null };
}

/** A row's name changed: its handle follows unless the owner edited it, unique among my nodes and the other rows. */
export function renameDraft(rows: readonly DraftNode[], key: string, name: string, existingHandles: readonly string[], templates: readonly NodeTemplate[]): DraftNode[] {
  return rows.map((row) => {
    if (row.key !== key) return row;
    if (row.slugEdited) return { ...row, name };
    const taken = new Set([...existingHandles, ...rows.filter((other) => other.key !== key).map((other) => other.slug)]);
    return { ...row, name, slug: handleForName(name, templates.find((item) => item.id === row.templateId), taken) };
  });
}

/** Why each new row's handle cannot be used, by row key: as `handleProblem`, or two new nodes with one handle. */
export function handleProblems(rows: readonly DraftNode[], existingHandles: readonly string[]): Record<string, string> {
  const problems: Record<string, string> = {};
  const existing = new Set(existingHandles);
  const counts = new Map<string, number>();
  for (const row of rows) if (!row.createdId) counts.set(row.slug, (counts.get(row.slug) ?? 0) + 1);
  for (const row of rows) {
    if (row.createdId) continue;
    const problem = handleProblem(row.slug, existing) ?? ((counts.get(row.slug) ?? 0) > 1 ? `Two new nodes are @${row.slug}.` : null);
    if (problem) problems[row.key] = problem;
  }
  return problems;
}

/** Why each new row cannot be created as it is, by row key. */
export function nameProblems(rows: readonly DraftNode[], existingNames: readonly string[]): Record<string, string> {
  const problems: Record<string, string> = {};
  const existing = new Set(existingNames.map(norm));
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(norm(row.name), (counts.get(norm(row.name)) ?? 0) + 1);
  for (const row of rows) {
    if (row.createdId) continue;
    const name = row.name.trim();
    if (!name) problems[row.key] = "Give it a name.";
    else if (existing.has(norm(name))) problems[row.key] = `You already have a node called “${name}”.`;
    else if ((counts.get(norm(name)) ?? 0) > 1) problems[row.key] = `Two new nodes are called “${name}”.`;
  }
  return problems;
}

/** A lead is `new:<row key>` or `node:<node id>`; when it is gone, the first one left leads. */
export function pickLead(lead: string | null, rows: readonly DraftNode[], nodeIds: readonly string[]): string | null {
  const options = [...rows.map((row) => `new:${row.key}`), ...nodeIds.map((id) => `node:${id}`)];
  return lead && options.includes(lead) ? lead : (options[0] ?? null);
}

export const titleTaken = (title: string, titles: readonly string[]): boolean => titles.some((row) => norm(row) === norm(title));

/** Which field a refusal from Ensemble belongs to when making or renaming a node: its name, its handle, or neither. */
export function refusedField(status: number, message: string): "name" | "slug" | null {
  if (status !== 409 && status !== 400) return null;
  if (/node called/i.test(message)) return "name";
  if (/handle|mentions every node|lowercase letters, digits and dashes/i.test(message)) return "slug";
  return null;
}
