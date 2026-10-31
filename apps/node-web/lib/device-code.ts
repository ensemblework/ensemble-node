/**
 * A device code (Ensemble docs/35, CLI sign-ins): a command the node runs on the owner's computer
 * (`az login --use-device-code`, `gh auth login`, `gcloud auth login --no-browser`, AWS SSO…) prints a
 * one-time code to enter on a website. The computer sees it and Ensemble posts it on a card only the
 * owner sees: the code, large, with Copy, the website (opened in a new tab), the command, the computer
 * and how long the code lasts. When the command ends the card says whether it worked.
 */
import type { Badge } from "./plan";

export type DeviceCodeData = {
  type?: string;
  status?: string;
  url?: string | null;
  code?: string | null;
  command?: string | null;
  computer?: string | null;
  deviceId?: string | null;
  operation?: string | null;
  expiresAt?: string | null;
};

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** Waiting for the owner to enter it, or done, or no longer usable. */
export const deviceCodeOpen = (data: Pick<DeviceCodeData, "status"> | null | undefined): boolean => (text(data?.status) || "pending") === "pending";

const STATES: Record<string, Badge> = {
  pending: { label: "Waiting for you", tone: "warn" },
  done: { label: "Signed in", tone: "ok" },
  expired: { label: "Expired", tone: "muted" },
};

export function deviceCodeBadge(data: Pick<DeviceCodeData, "status"> | null | undefined): Badge {
  const status = text(data?.status) || "pending";
  return STATES[status] ?? { label: status.replace(/_/g, " "), tone: "muted" };
}

/** The command on one line, shortened: "az login --use-device-code". */
export function deviceCodeCommand(data: Pick<DeviceCodeData, "command"> | null | undefined): string {
  const command = text(data?.command).split("\n")[0]!.trim();
  if (!command) return "A command";
  return command.length > 80 ? `${command.slice(0, 79)}…` : command;
}

/** "Sign-in code for az login on Studio". */
export function deviceCodeTitle(data: DeviceCodeData | null | undefined): string {
  const computer = text(data?.computer);
  return `Sign-in code for ${deviceCodeCommand(data)}${computer ? ` on ${computer}` : ""}`;
}

/** The website to enter the code on, when it is a web address: its link and how it reads ("microsoft.com/devicelogin"). */
export function deviceCodeLink(url: unknown): { href: string; label: string } | null {
  const value = text(url);
  if (!value) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const path = parsed.pathname.replace(/\/+$/, "");
  return { href: parsed.toString(), label: `${parsed.host.replace(/^www\./, "")}${path}` };
}

/** The code as it is shown and copied: as printed, without spaces around it. */
export const deviceCodeValue = (data: Pick<DeviceCodeData, "code"> | null | undefined): string => text(data?.code).replace(/\s+/g, " ");

/** What a card no longer waiting says. */
export function deviceCodeOutcome(data: DeviceCodeData): string {
  const command = deviceCodeCommand(data);
  const on = text(data.computer) ? ` on ${text(data.computer)}` : "";
  if (data.status === "done") return `Signed in: ${command}${on} finished.`;
  if (data.status === "expired") return `The code for ${command}${on} is no longer valid: it expired, or the command ended before it was used.`;
  return "";
}
