/**
 * What a person's lead may do for others in a room without asking them (rooms v2 trust, Ensemble
 * docs/35 §12.5): their choices for everyone in the room, and for one person, over the defaults. The
 * settings sheet shows them as plain choices; only what changed is sent back.
 */
import type { PeerKind, TrustSettings, TrustView } from "./types";

export const TRUST_DEFAULTS: TrustSettings = {
  status: "answer",
  statusDetail: "titles",
  shareSpaceArtefacts: "answer",
  shareOther: "ask",
  workRequests: "ask",
  acceptKinds: [],
  freeFormAnswers: "allow",
};

type ChoiceKey = Exclude<keyof TrustSettings, "acceptKinds">;
export type TrustField = { key: ChoiceKey; label: string; hint: string; options: ReadonlyArray<{ id: string; label: string }> };

/** The sheet's questions, in the order they are asked. Requests for work also take which kinds are accepted. */
export const TRUST_FIELDS: readonly TrustField[] = [
  {
    key: "status",
    label: "Status questions",
    hint: "“What is Mira working on?” Your lead answers from your status card, or asks you first.",
    options: [
      { id: "answer", label: "Answer from my status card" },
      { id: "ask", label: "Ask me first" },
    ],
  },
  {
    key: "statusDetail",
    label: "How much of my status",
    hint: "Titles: what you work on for this room and how it stands. Details: also each requirement and step.",
    options: [
      { id: "nothing", label: "Nothing" },
      { id: "titles", label: "Titles" },
      { id: "details", label: "Details" },
    ],
  },
  {
    key: "shareSpaceArtefacts",
    label: "Items in the room's shared space",
    hint: "Pages, tasks and files in the space this room shares.",
    options: [
      { id: "answer", label: "Share them" },
      { id: "ask", label: "Ask me first" },
    ],
  },
  {
    key: "shareOther",
    label: "Anything else of mine",
    hint: "Your own pages, tasks, files and notes. Asking means a card for you; nothing goes out without your yes.",
    options: [
      { id: "ask", label: "Ask me first" },
      { id: "never", label: "Never" },
    ],
  },
  {
    key: "freeFormAnswers",
    label: "Answers in its own words",
    hint: "Answering someone with its model uses your credits.",
    options: [
      { id: "allow", label: "Allow" },
      { id: "ask", label: "Ask me first" },
    ],
  },
  {
    key: "workRequests",
    label: "Requests for work and reviews",
    hint: "Accepted work runs on your computer, with your subscriptions and credits.",
    options: [
      { id: "ask", label: "Ask me" },
      { id: "accept", label: "Accept on its own" },
    ],
  },
];

/** Only reviews and work wait for a yes; questions and shares are answered by the lead within the rules above. */
export const ACCEPT_KINDS: ReadonlyArray<{ id: PeerKind; label: string }> = [
  { id: "review", label: "Reviews" },
  { id: "work", label: "Work" },
];

/** The settings that apply: the defaults, then each layer on top (everyone, then one person). */
export function mergeTrust(...layers: Array<Partial<TrustSettings> | null | undefined>): TrustSettings {
  return layers.reduce<TrustSettings>((merged, layer) => ({ ...merged, ...(layer ?? {}) }), { ...TRUST_DEFAULTS, acceptKinds: [] });
}

const sameKinds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((kind) => b.includes(kind));

/** What changed between two sets of settings, as the patch `PUT /api/node/rooms/:id/trust` takes. */
export function trustPatch(before: TrustSettings, after: TrustSettings): Partial<TrustSettings> {
  const patch: Partial<TrustSettings> = {};
  for (const field of TRUST_FIELDS) if (before[field.key] !== after[field.key]) (patch as Record<string, unknown>)[field.key] = after[field.key];
  if (!sameKinds(before.acceptKinds, after.acceptKinds)) patch.acceptKinds = [...after.acceptKinds];
  return patch;
}

/** The settings one person has of their own, set apart from everyone's. */
export function ownSettings(overrides: Partial<TrustSettings> | null | undefined): Array<keyof TrustSettings> {
  return overrides ? (Object.keys(overrides) as Array<keyof TrustSettings>).filter((key) => overrides[key] !== undefined) : [];
}

const option = (key: ChoiceKey, value: string) => TRUST_FIELDS.find((field) => field.key === key)?.options.find((row) => row.id === value)?.label ?? value;

/** One line for a person's row: what differs from everyone's, or that nothing does. */
export function trustSummary(effective: TrustSettings, everyone: TrustSettings): string {
  const changed = TRUST_FIELDS.filter((field) => effective[field.key] !== everyone[field.key]).map((field) => `${field.label.toLowerCase()}: ${option(field.key, effective[field.key]).toLowerCase()}`);
  if (!sameKinds(effective.acceptKinds, everyone.acceptKinds)) changed.push(acceptLine(effective).toLowerCase());
  return changed.length ? changed.join(" · ") : "As for everyone";
}

/** "Accepts reviews and work on its own", "Asks you about work". */
export function acceptLine(settings: Pick<TrustSettings, "workRequests" | "acceptKinds">): string {
  if (settings.workRequests !== "accept" || !settings.acceptKinds.length) return "Asks you about work";
  const kinds = ACCEPT_KINDS.filter((row) => settings.acceptKinds.includes(row.id)).map((row) => row.label.toLowerCase());
  return `Accepts ${kinds.join(" and ")} on its own`;
}

/** The month's budget for answering others in its own words, in a line. */
export function budgetLine(budget: TrustView["budget"]): string {
  const used = Math.round(budget.usedThisMonth);
  if (budget.credits === null || budget.credits === undefined) return used ? `No limit · ${used} credits used this month` : "No limit";
  return `${used} of ${Math.round(budget.credits)} credits used this month`;
}
