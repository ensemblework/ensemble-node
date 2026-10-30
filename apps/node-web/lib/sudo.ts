/**
 * A command a node wants to run as administrator on its owner's computer (Ensemble's sudo cards, docs/35
 * §8): the exact command, why, and where. The owner types the computer's password on the card; this
 * browser encrypts it for that computer's own key (lib/seal.ts, purpose `sudo`), bound to the card and
 * to the SHA-256 of the exact command shown, so Ensemble's server only relays ciphertext and the
 * computer refuses it for any other command. The password is never kept: it is cleared once sealed, and
 * no model ever sees it. A computer where sudo needs no password runs it without one.
 */
import { sealFor, type SealContext, type SealKeyInfo, type Sealed, type SealOptions } from "./seal";

/** `GET /api/node/sudo/:messageId`: the command, its hash, the computer (and whether it is online), how a password reaches it, and how long a sealed one is good for. */
export type SudoTarget = {
  command: string;
  commandHash: string;
  deviceId?: string;
  deviceName: string;
  online?: boolean;
  ttlMs?: number;
  route: { mode: "sealed"; sealKey: SealKeyInfo } | { mode: "unavailable"; reason: string };
};

/** Passwords the computer's sudo may refuse for one card before the card closes (more could lock the account). */
export const SUDO_PASSWORD_TRIES = 3;

/** What `POST /api/node/sudo/:messageId` takes: run (with a sealed password, or without one), or don't. */
export type SudoAnswer = { action: "run"; sealed?: Sealed } | { action: "deny" };

/** A sudo card's `data` (`type: "sudo"`). */
export type SudoCardData = {
  type?: string;
  status?: string;
  command?: string;
  commandHash?: string;
  reason?: string | null;
  deviceId?: string;
  deviceName?: string;
  folder?: string | null;
  exitCode?: number | null;
  error?: string | null;
  answeredAt?: string | null;
  /** Passwords refused so far. */
  tries?: number;
};

export type SudoBadge = { label: string; tone: "warn" | "accent" | "ok" | "danger" | "muted" };

/** The SHA-256 of a command, in lower-case hex, as the computer checks it. */
export async function commandHash(command: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("This browser cannot encrypt here (it needs a secure https page).");
  const digest = new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(command)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** What the sealed password is bound to: the computer, this card, the command's hash and this site. */
export function sudoSealContext(card: { id: string; data: Pick<SudoCardData, "deviceId"> }, target: Pick<SudoTarget, "commandHash" | "deviceId">, origin: string): SealContext {
  const deviceId = (typeof card.data.deviceId === "string" && card.data.deviceId.trim()) || target.deviceId?.trim() || "";
  if (!deviceId) throw new Error("This card does not say which computer runs the command. Reload the page.");
  return { purpose: "sudo", deviceId, decisionId: card.id, name: target.commandHash, origin };
}

/**
 * The answer that runs the command with the password typed here: sealed for the card's computer. The
 * command shown, the card's hash and the hash the computer will check must all agree first, so the
 * password can only ever run the command the owner read.
 */
export async function sealedSudoRun(target: SudoTarget, card: { id: string; data: SudoCardData }, password: string, origin: string, options?: SealOptions): Promise<SudoAnswer> {
  if (target.route.mode !== "sealed") throw new Error(target.route.reason || "This computer cannot take a password from here.");
  if (!password) throw new Error("Type the computer's password first.");
  const shown = typeof card.data.command === "string" ? card.data.command : target.command;
  const hash = await commandHash(shown);
  if (shown !== target.command || hash !== target.commandHash || (card.data.commandHash && card.data.commandHash !== target.commandHash)) {
    throw new Error("The command on this card is not the one the computer would run. Reload the page and read it again.");
  }
  const made = await sealFor(target.route.sealKey, sudoSealContext(card, target, origin), { password }, { ...(target.ttlMs ? { ttlMs: target.ttlMs } : {}), ...options });
  return { action: "run", sealed: made.sealed };
}

/** While the card waits again after a refused password: why, and how many tries are left. */
export function sudoRetryNote(data: Pick<SudoCardData, "status" | "error" | "tries">): string | null {
  if (data.status !== "pending" || !data.error?.trim()) return null;
  const left = typeof data.tries === "number" && data.tries > 0 ? SUDO_PASSWORD_TRIES - data.tries : null;
  return `${data.error.trim()}${left !== null && left > 0 ? ` ${left === 1 ? "1 try" : `${left} tries`} left.` : ""}`;
}

/** A run that ended with an exit code other than 0 did not work, whether Ensemble calls it done or failed. */
const exitFailed = (data: Pick<SudoCardData, "status" | "exitCode">) => (data.status === "done" || data.status === "failed") && typeof data.exitCode === "number" && data.exitCode !== 0;

/** The card's pill. A run that ended with a non-zero exit code did not work. */
export function sudoState(data: Pick<SudoCardData, "status" | "exitCode">): SudoBadge {
  switch (data.status) {
    case "running":
      return { label: "Running…", tone: "accent" };
    case "done":
    case "failed":
      return exitFailed(data) ? { label: `Failed · exit ${data.exitCode}`, tone: "danger" } : data.status === "done" ? { label: "Done", tone: "ok" } : { label: "Failed", tone: "danger" };
    case "denied":
      return { label: "Not run", tone: "muted" };
    case "expired":
      return { label: "Expired", tone: "muted" };
    default:
      return { label: "Waiting for you", tone: "warn" };
  }
}

/** What came of it, in one sentence. */
export function sudoOutcome(data: SudoCardData): string {
  const computer = data.deviceName?.trim() || "your computer";
  switch (data.status) {
    case "running":
      return `Running on ${computer}…`;
    case "done":
    case "failed":
      if (exitFailed(data)) return `It ran on ${computer} and failed with exit code ${data.exitCode}.`;
      if (data.status === "done") return `Ran as administrator on ${computer}${data.exitCode === 0 ? " · exit code 0" : ""}.`;
      return `It could not run on ${computer}${data.error?.trim() ? `: ${data.error.trim()}` : "."}`;
    case "denied":
      return "You chose not to run it. Nothing ran.";
    case "expired":
      return "Nobody answered in time, so it was not run.";
    default:
      return "";
  }
}
