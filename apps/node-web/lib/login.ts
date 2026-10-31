/**
 * A sign-in card (Ensemble's node/logins.ts, docs/35 §8.16.1): a tab on the owner's computer waits for
 * them to sign in to a site, or to pass a human check there (`purpose`). The owner does it in the remote
 * view (the page streamed from their computer to this browser, a phone or a laptop), in the window on the
 * computer, with the login saved there, or by typing the login here: encrypted in this browser for the
 * computer's own key (lib/seal.ts, purpose `login`, the same format as Ensemble's Hub), so Ensemble's
 * server only relays ciphertext. A code the site asks for afterwards is sealed the same way. The computer
 * fills the page; the node and its models never see what was typed.
 */
import type { Badge } from "./plan";
import { sealFingerprint, sealFor, type SealKeyInfo, type Sealed } from "./seal";
import type { Message } from "./types";

/** `GET /api/node/logins/:id`: the card's computer, how typed values reach it, and what it offers. */
export type LoginTarget = {
  id: string;
  status: string;
  origin: string;
  loginId: string;
  computer: { id: string; name: string; online: boolean };
  route: { mode: "sealed"; sealKey: SealKeyInfo } | { mode: "pair_again" } | { mode: "unsupported" };
  saved: boolean;
  display: boolean;
  takeover: boolean;
  ttlMs: number;
};

/**
 * What the owner answers (`POST /api/node/logins/:id`). `check` asks the computer whether it is done now
 * (the "done" said in the chat); `code` is the code the site asked for, sealed as a typed login is.
 */
export type LoginAnswer = { action: "saved" | "local" | "done" | "decline" | "check" } | { action: "typed"; sealed: Sealed } | { action: "code"; sealed: Sealed };

export type TypedLogin = { username: string; password: string; code?: string; save: boolean };

/** A sign-in, or a human check ("Verify you are human", "Press and hold"): older cards have no purpose and are sign-ins. */
export type LoginPurpose = "sign_in" | "human_check";

export type LoginCardData = {
  status?: string;
  purpose?: string;
  origin?: string;
  computer?: string | null;
  via?: string;
  savedNow?: boolean;
  note?: string | null;
  saved?: boolean;
  display?: boolean;
  takeover?: boolean;
  reasons?: string[];
  tab?: string;
  error?: string | null;
  working?: string | null;
  /** What the site asks for when it wants a code (`needs_code`): "Enter the 6-digit code from your authenticator app". */
  codeHint?: string | null;
  shownAt?: string | null;
  jobId?: string | null;
};

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export const loginPurpose = (data: Pick<LoginCardData, "purpose"> | null | undefined): LoginPurpose => (data?.purpose === "human_check" ? "human_check" : "sign_in");

/** While the card waits for its owner (a code too) or its computer acts on the answer. */
export const LOGIN_OPEN: ReadonlySet<string> = new Set(["pending", "working", "needs_code"]);

export const loginOpen = (data: { status?: unknown; [key: string]: unknown } | null | undefined): boolean => LOGIN_OPEN.has(text(data?.status) || "pending");

/** A site as people read it: its host ("https://portal.azure.com/x" → "portal.azure.com"). */
export function loginSite(origin: unknown): string {
  const value = text(origin);
  if (!value) return "the site";
  try {
    return new URL(value).host || value;
  } catch {
    return value.replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "");
  }
}

/** The card's title: "@node needs you to sign in to portal.azure.com", or to pass a human check on a site. */
export function loginTitle(data: LoginCardData | null | undefined, handle: string): string {
  const site = loginSite(data?.origin);
  return loginPurpose(data) === "human_check" ? `@${handle} needs you to pass a human check on ${site}` : `@${handle} needs you to sign in to ${site}`;
}

const STATES: Record<string, Badge> = {
  pending: { label: "Waiting for you", tone: "warn" },
  working: { label: "Working…", tone: "accent" },
  needs_code: { label: "Needs a code", tone: "warn" },
  signed_in: { label: "Signed in", tone: "ok" },
  passed: { label: "Passed", tone: "ok" },
  declined: { label: "Not now", tone: "muted" },
  expired: { label: "Expired", tone: "muted" },
  ended: { label: "Ended", tone: "muted" },
};

/** The card's status pill. A code to enter waits for the owner, as a new card does. */
export function loginBadge(data: { status?: unknown; [key: string]: unknown } | null | undefined): Badge {
  const status = text(data?.status) || "pending";
  return STATES[status] ?? { label: status.replace(/_/g, " "), tone: "muted" };
}

/** What the remote view says when the card was settled while it was open: done, the node goes on. */
export function remoteDoneText(data: LoginCardData | null | undefined, handle: string): string | null {
  const status = text(data?.status);
  if (status === "signed_in") return `Signed in — @${handle} is carrying on`;
  if (status === "passed") return `Check passed — @${handle} is carrying on`;
  return null;
}

/** The address of a card in its conversation: "Open on your phone" shows it as a QR code. */
export function cardLink(origin: string, roomId: string, cardId: string): string {
  return `${origin.replace(/\/+$/, "")}/r/${encodeURIComponent(roomId)}#m-${encodeURIComponent(cardId)}`;
}

/** How typed values travel, said plainly. */
export function loginRouteText(target: Pick<LoginTarget, "route" | "computer">, fingerprint: string | null, cli = "ensemble"): string {
  const computer = target.computer.name;
  if (target.route.mode === "sealed") return `Encrypted in this browser for ${computer}: only ${computer} can read it, and Ensemble's server passes it on without being able to.${fingerprint ? ` Key ${fingerprint}: it should match \`${cli} secrets fingerprint\` on ${computer}.` : ""}`;
  if (target.route.mode === "pair_again") return `${computer} now reports a different key from the one it was paired with, so nothing typed here is sent to it. Pair it again (\`${cli} login\`).`;
  return `Ensemble on ${computer} cannot open values typed here. Update it there, or sign in another way.`;
}

/** The fingerprint of the key the box is made for, worked out here from the key itself. */
export async function loginFingerprint(target: Pick<LoginTarget, "route">): Promise<string | null> {
  return target.route.mode === "sealed" ? sealFingerprint(target.route.sealKey.spki) : null;
}

/** A box for the computer, bound to this card, this sign-in and this website; the sign-in's site travels inside. */
async function sealLogin(target: LoginTarget, card: { id: string }, payload: Record<string, unknown>, origin: string): Promise<Sealed> {
  if (target.route.mode !== "sealed") throw new Error(loginRouteText(target, null));
  const made = await sealFor(target.route.sealKey, { purpose: "login", deviceId: target.computer.id, decisionId: card.id, name: target.loginId, origin }, { origin: target.origin, ...payload }, { ttlMs: target.ttlMs });
  return made.sealed;
}

/** The body for `POST /api/node/logins/:id` with what was typed: sealed for the computer, bound to this card, this sign-in and its site. */
export async function typedLoginAnswer(target: LoginTarget, card: { id: string }, typed: TypedLogin, origin: string): Promise<LoginAnswer> {
  const payload = { ...(typed.username.trim() ? { username: typed.username.trim() } : {}), ...(typed.password ? { password: typed.password } : {}), ...(typed.code?.trim() ? { code: typed.code.trim() } : {}), ...(typed.save ? { save: true } : {}) };
  return { action: "typed", sealed: await sealLogin(target, card, payload, origin) };
}

/** A code as people type it ("123 456", "123-456"): the spaces and dashes between its digits go. */
export function cleanCode(code: string): string {
  const trimmed = code.trim();
  return /^[0-9][0-9\s-]*[0-9]$/.test(trimmed) ? trimmed.replace(/[\s-]/g, "") : trimmed.replace(/\s+/g, "");
}

/** The body for `POST /api/node/logins/:id` with the code the site asked for (`needs_code`), sealed like a typed login. */
export async function codeAnswer(target: LoginTarget, card: { id: string }, code: string, origin: string): Promise<LoginAnswer> {
  const value = cleanCode(code);
  if (!value) throw new Error("Type the code first.");
  if (value.length > 20) throw new Error("That code is too long.");
  return { action: "code", sealed: await sealLogin(target, card, { code: value }, origin) };
}

/** The code box's heading. */
export const CODE_ASK = "Enter the code from your authenticator app, a text message or an email";

/** What the site itself said when it asked for the code, in its words: "github.com says: “Enter the 6-digit code…”". */
export function codeHintText(data: Pick<LoginCardData, "codeHint" | "origin"> | null | undefined): string | null {
  const hint = text(data?.codeHint);
  return hint ? `${loginSite(data?.origin)} says: “${hint.replace(/[.\s]+$/, "")}”` : null;
}

/** A numeric keypad for codes the site says are digits. */
export const codeInputMode = (data: Pick<LoginCardData, "codeHint"> | null | undefined): "numeric" | "text" => (/\bdigit|\bnumber/i.test(text(data?.codeHint)) ? "numeric" : "text");

const HOW: Record<string, string> = {
  saved: " with the saved login",
  typed: " with what you typed (encrypted for the computer)",
  code: " with the code you gave",
  takeover: " from the remote view",
  remote: " from the remote view",
  local: " in the window on the computer",
  computer: " on the computer",
};

/** What a settled sign-in card says. */
export function loginOutcomeText(data: LoginCardData): string {
  const where = `${data.origin ?? "the site"} on ${data.computer ?? "your computer"}`;
  const check = loginPurpose(data) === "human_check";
  const how = HOW[text(data.via)] ?? "";
  const note = data.note ? ` ${data.note}` : "";
  if (data.status === "signed_in") return `Signed in to ${where}${how}.${data.savedNow ? " The login is saved there for next time." : ""}${note}`;
  if (data.status === "passed") return `Passed the human check on ${where}${how}.${note}`;
  if (data.status === "declined") return check ? `You chose not to do the human check on ${where} now.` : `You chose not to sign in to ${where} now.`;
  if (data.status === "expired") return check ? `Nobody passed the human check on ${where} in time.` : `Nobody signed in to ${where} in time.`;
  if (data.status === "ended") return data.note ?? (check ? "The work that needed this check ended." : "The work that needed this sign-in ended.");
  return "";
}

/** Why the page wants a sign-in, for the card: the computer's reasons, in one line. */
export function loginReasonText(reasons: string[] | undefined): string {
  const list = (reasons ?? []).filter(Boolean).slice(0, 3);
  if (!list.length) return "";
  const line = list.join("; ");
  return `Why: ${line}${/[.?!]$/.test(line) ? "" : "."}`;
}

/** A run's sign-in card still open (waiting, or its computer acting on it) among the cards waiting for me: its paused live view points there. */
export function waitingLoginCard(cards: readonly Message[], jobId: string): Message | undefined {
  return cards.find((card) => card.kind === "approval" && card.data?.type === "login" && card.data.jobId === jobId && loginOpen(card.data));
}
