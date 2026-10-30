/**
 * Browsing and capture on the owner's computer in words (Ensemble docs/35 §8.16, docs/25 §10): why a
 * capture is held for its owner's preview, the held card's state, why a run's live view is paused,
 * the live picture's details from its headers, and what a computer can capture (or what to run there).
 */
import type { CaptureSummary, DeviceCapabilities, LiveFrame } from "./types";

/** The computer's reasons are about "the owner"; the card speaks to them. Unknown reasons show as written. */
const HELD_WORDS: Record<string, string> = {
  "It shows one of your saved secret values.": "It shows one of your saved secrets.",
  "The owner asked to see captures of this site before they are sent.": "You asked to see captures of this site before they are sent.",
  "A desktop app's window cannot be checked for secrets on this computer, so the owner previews it first.": "A desktop app's window can't be checked for secrets, so you see it first.",
  "The recording reached a site the owner never wants captured.": "The recording reached a site you never want captured.",
};

const UNCHECKED = "Your computer could not check it.";

export const heldReasonWords = (reason: string): string => HELD_WORDS[reason.trim()] ?? reason.trim();

/** Why a card's captures are held: its reasons and each file's, each once, in the owner's words. */
export function heldReasons(data: Record<string, unknown> | null | undefined): string[] {
  const reasons = data?.reasons;
  const files = data?.evidence;
  const said = [...(Array.isArray(reasons) ? reasons : []), ...(Array.isArray(files) ? files.map((item: { holdReason?: unknown } | null) => item?.holdReason) : [])];
  const words = said.filter((reason): reason is string => typeof reason === "string" && Boolean(reason.trim())).map(heldReasonWords);
  return words.length ? [...new Set(words)] : [UNCHECKED];
}

export type HeldState = { label: string; tone: "warn" | "accent" | "ok" | "muted" };

/** A held card's state: waiting for the owner, being sent, sent or discarded. */
export function heldState(status: unknown): HeldState {
  if (status === "applying") return { label: "Sending…", tone: "accent" };
  if (status === "released") return { label: "Sent", tone: "ok" };
  if (status === "discarded") return { label: "Discarded", tone: "muted" };
  return { label: "Waiting for you", tone: "warn" };
}

const PAUSED: Record<string, string> = {
  sensitive: "Paused: signing in",
  private_site: "Paused: a private site",
  secret_on_screen: "Paused: a secret on screen",
};

/** Why a run's live view shows no picture right now. */
export const livePausedWords = (reason: string | null | undefined): string => PAUSED[reason ?? ""] ?? "Paused";

const decoded = (value: string | null): string | null => {
  if (!value) return null;
  try {
    return decodeURIComponent(value) || null;
  } catch {
    return value;
  }
};
const count = (value: string | null): number | null => {
  const number = Number(value);
  return value && Number.isFinite(number) && number > 0 ? number : null;
};

/**
 * A live picture's details from `GET /api/node/live/:jobId`'s headers. Read across origins only when
 * the API exposes them (`Access-Control-Expose-Headers`); otherwise every field is null.
 */
export function liveMeta(headers: { get(name: string): string | null }): Omit<LiveFrame, "image"> {
  const tab = headers.get("X-Ensemble-Live-Tab");
  return {
    at: headers.get("X-Ensemble-Live-At") || null,
    tab: tab && /^t\d{1,9}$/.test(tab) ? tab : null,
    url: decoded(headers.get("X-Ensemble-Live-Url")),
    title: decoded(headers.get("X-Ensemble-Live-Title")),
    width: count(headers.get("X-Ensemble-Live-Width")),
    height: count(headers.get("X-Ensemble-Live-Height")),
    paused: headers.get("X-Ensemble-Live-Paused") || null,
  };
}

/** "example.com/pricing": a page's address, short. Anything but http(s) shows as it came. */
export function pageAddress(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return url;
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.host.replace(/^www\./, "")}${path}`;
  } catch {
    return url;
  }
}

/** Whether a computer can show its browser here for the owner to control (it reports `takeover` 1 or later). */
export const takeoverReady = (capabilities: DeviceCapabilities | null | undefined): boolean => typeof capabilities?.takeover === "number" && capabilities.takeover >= 1;

const TARGETS: Array<[string, string]> = [
  ["web", "web pages"],
  ["electron", "Electron apps"],
  ["gui", "other desktop apps"],
  ["terminal", "terminals"],
];

const list = (items: string[]) => (items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

export type CaptureLine =
  | { state: "update"; text: string }
  | { state: "setup"; text: string; command: string }
  | { state: "ready"; text: string; command?: string };

/**
 * What a paired computer can browse and capture, from its last heartbeat: an older Ensemble says to
 * update it; a computer with no Chromium for Ensemble says to run setup; else what it captures, and
 * whether setup would add more. `cli` is this environment's CLI (`ensemble` or `ensemble-test`).
 */
export function captureLine(device: { name: string; capabilities?: DeviceCapabilities | null }, cli: string): CaptureLine {
  const caps = device.capabilities;
  const command = `${cli} capture setup`;
  if (!caps || typeof caps.browser !== "number" || caps.browser < 1) return { state: "update", text: `Update Ensemble on ${device.name} so your nodes can browse and capture there.` };
  const capture = caps.capture as CaptureSummary | null | undefined;
  if (!capture?.browser) return { state: "setup", text: `Run ${command} on ${device.name} so your nodes can browse and capture there.`, command };
  const can = TARGETS.flatMap(([key, label]) => {
    const target = capture.targets?.[key];
    if (!target?.screenshot) return [];
    return [`${label} (${target.video ? "pictures and video" : "pictures"})`];
  });
  const video = capture.video === "mp4" ? " Videos are MP4." : capture.video === "webm" ? " Videos are WebM." : "";
  const text = `${can.length ? `Captures ${list(can)}.` : "Browses the web."}${video}`;
  return capture.setup ? { state: "ready", text, command } : { state: "ready", text };
}
