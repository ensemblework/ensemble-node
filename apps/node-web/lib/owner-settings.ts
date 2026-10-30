/**
 * What Node reads from the owner's Ensemble settings (`GET /api/settings`, saved with `PATCH
 * /api/settings`): which run profile a node's agent sessions use, and whether a node asks before it
 * opens a website for the first time (`node.askBeforeBrowsing`, off unless the owner turns it on).
 */
import { engineName } from "./work-log";

/** A saved run profile, the fields Node shows (Ensemble's RunProfile). */
export type RunProfileView = { id: string; name: string; engine?: string; model?: string; effort?: string; context?: string };

/** The part of Ensemble's settings Node reads. `node` is absent on an Ensemble that does not offer Node's own settings yet. */
export type OwnerSettings = {
  runProfiles?: RunProfileView[];
  defaultRunProfileId?: string | null;
  node?: { askBeforeBrowsing?: boolean } | null;
};

/** Ensemble's built-in profile while none is saved: its own agent, its default model. */
export const QUICK_PROFILE: RunProfileView = { id: "quick", name: "Quick", engine: "ensemble", model: "", effort: "default" };

/**
 * The run profile a node's agent sessions use when a message names none, as Ensemble picks it: the
 * node's own (by id or name), else the default profile, else the first, else Quick.
 */
export function runProfileFor(settings: Pick<OwnerSettings, "runProfiles" | "defaultRunProfileId"> | null | undefined, wanted?: string | null): RunProfileView {
  const profiles = Array.isArray(settings?.runProfiles) ? settings.runProfiles : [];
  const key = wanted?.trim().toLowerCase();
  const named = key ? profiles.find((row) => row.id.toLowerCase() === key || row.name.toLowerCase() === key) : undefined;
  return named ?? profiles.find((row) => row.id === settings?.defaultRunProfileId) ?? profiles[0] ?? QUICK_PROFILE;
}

/** "GitHub Copilot · gpt-6.1-sol · medium thinking · long context": a profile's engine, model, thinking and context. */
export function runProfileLine(profile: RunProfileView): string {
  const raw = (profile.model ?? "").trim();
  // Ensemble's own agent names a model as `provider::model`.
  const model = raw.includes("::") ? raw.slice(raw.indexOf("::") + 2) : raw;
  const effort = (profile.effort ?? "").trim();
  return [
    engineName(profile.engine || "ensemble"),
    model && !["default", "auto"].includes(model.toLowerCase()) ? model : "its default model",
    effort && effort !== "default" ? `${effort} thinking` : null,
    profile.context === "long_context" ? "long context" : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

/**
 * Whether nodes ask before opening a new website (off unless set), or null when this Ensemble has no
 * Node section in its settings yet and so cannot keep the choice.
 */
export function askBeforeBrowsing(settings: OwnerSettings | null | undefined): boolean | null {
  const section = settings?.node;
  if (!section || typeof section !== "object") return null;
  return section.askBeforeBrowsing === true;
}
