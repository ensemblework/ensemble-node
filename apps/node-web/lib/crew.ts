/** Building a crew: proposed new nodes from a template suggestion, unique names, and who leads. */
import type { Avatar, CrewTemplate, NodeTemplate } from "./types";

/** A node the crew builder will create. `createdId` is set once it exists, so a retry does not make it twice. */
export type DraftNode = { key: string; templateId: string | null; name: string; role: string; avatar: Avatar; provider: string | null; model: string | null; createdId?: string };

const SHAPES: Avatar["shape"][] = ["orb", "square", "spark", "hex", "leaf", "compass"];
const COLORS = ["#D7B56F", "#7FB3D5", "#E07A5F", "#81B29A", "#B39DDB", "#F2CC8F", "#5FB4A2", "#E8A3B5"];

const norm = (name: string) => name.trim().toLowerCase();

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

/** A new node row, from a node template or blank; its name does not clash with `taken`. */
export function draftNode(template: NodeTemplate | undefined, taken: ReadonlySet<string>, index = 0): DraftNode {
  return {
    key: nextKey(),
    templateId: template?.id ?? null,
    name: uniqueName(template?.name ?? "New node", taken),
    role: template?.role ?? "assistant",
    avatar: template?.avatar ?? { shape: SHAPES[index % SHAPES.length]!, color: COLORS[index % COLORS.length]!, eyes: "dot" },
    provider: null,
    model: null,
  };
}

/** The rows a crew suggestion proposes, named so they clash neither with my nodes nor with each other. */
export function crewDraft(crew: CrewTemplate, templates: readonly NodeTemplate[], existingNames: readonly string[]): { rows: DraftNode[]; leadKey: string | null } {
  const taken = new Set(existingNames.map(norm));
  const rows: DraftNode[] = [];
  let leadKey: string | null = null;
  crew.nodes.forEach((id, index) => {
    const template = templates.find((row) => row.id === id);
    if (!template) return;
    const row = draftNode(template, taken, index);
    taken.add(norm(row.name));
    rows.push(row);
    if (id === crew.lead && !leadKey) leadKey = row.key;
  });
  return { rows, leadKey: leadKey ?? rows[0]?.key ?? null };
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
