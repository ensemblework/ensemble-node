/** The model picker's pure parts: groups, names and the detail line under each model. */
import type { ModelOption } from "./types";

export const INCLUDED_PROVIDER = "ensemble";

/** One block of the picker: `title` heads a group ("Included with Ensemble"), `sub` a part of it ("Step-up"). */
export type ModelSection = { id: string; title: string; sub?: string; options: ModelOption[] };

const groupOf = (option: ModelOption) => option.group ?? "included";

/** Included (Everyday, then Step-up), then own API keys by provider, then AI plans by computer. */
export function modelSections(options: readonly ModelOption[]): ModelSection[] {
  const sections: ModelSection[] = [];
  const included = options.filter((row) => groupOf(row) === "included");
  const everyday = included.filter((row) => row.role !== "step-up");
  const stepUp = included.filter((row) => row.role === "step-up");
  if (everyday.length) sections.push({ id: "included-everyday", title: "Included with Ensemble", sub: "Everyday", options: everyday });
  if (stepUp.length) sections.push({ id: "included-step-up", title: "Included with Ensemble", sub: "Step-up: harder work, more credits", options: stepUp });
  const keys = new Map<string, ModelOption[]>();
  for (const row of options.filter((option) => groupOf(option) === "keys")) keys.set(row.vendor ?? row.provider, [...(keys.get(row.vendor ?? row.provider) ?? []), row]);
  for (const [vendor, rows] of keys) sections.push({ id: `keys-${vendor}`, title: "Your API keys", sub: vendor, options: rows });
  const plans = new Map<string, ModelOption[]>();
  for (const row of options.filter((option) => groupOf(option) === "plans")) plans.set(row.computer ?? "your computer", [...(plans.get(row.computer ?? "your computer") ?? []), row]);
  for (const [computer, rows] of plans) sections.push({ id: `plans-${computer}`, title: `Your AI plans on ${computer}`, options: rows });
  return sections;
}

export function sameModel(option: Pick<ModelOption, "provider" | "model">, provider: string | null | undefined, model: string | null | undefined): boolean {
  if (!model) return false;
  return option.model === model && option.provider === (provider || INCLUDED_PROVIDER);
}

/** "GPT-6 Luna (2026-09-22)" → "GPT-6 Luna", for tight places like a chat header. */
export const shortModelName = (label: string): string => label.replace(/\s*\([^)]*\)\s*$/, "").trim() || label;

/** What a node talks with, by name: its model, or "Default (GPT-5 mini)". */
export function modelName(options: readonly ModelOption[], provider: string | null | undefined, model: string | null | undefined, fallback: string): string {
  if (!model) {
    const preset = options.find((row) => row.default);
    return `Default (${preset ? shortModelName(preset.label) : fallback})`;
  }
  const hit = options.find((row) => sameModel(row, provider, model));
  if (hit) return hit.label;
  return provider && provider !== INCLUDED_PROVIDER ? `${model} (${provider})` : model;
}

/** The line under a model: "Everyday · 1× credits", "openai key", "Claude Code on Mira's MacBook". */
export function modelDetail(option: ModelOption): string {
  const group = groupOf(option);
  if (group === "keys") return `Your ${option.vendor ?? option.provider} key`;
  if (group === "plans") return `${option.vendor ?? option.provider}${option.computer ? ` on ${option.computer}` : ""}`;
  const parts = [option.role === "step-up" ? "Step-up" : "Everyday"];
  if (option.relativeCost) parts.push(`${option.relativeCost}× credits`);
  return parts.join(" · ");
}

export function filterModels(options: readonly ModelOption[], query: string): ModelOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...options];
  return options.filter((row) => [row.label, row.model, row.vendor, row.computer, row.provider].some((value) => value?.toLowerCase().includes(q)));
}
