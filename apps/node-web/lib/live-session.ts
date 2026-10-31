/**
 * A live session's card (Ensemble docs/35, live sessions): a node's terminal or browser on the owner's
 * computer, which the owner can watch live from here, type into, or take control of. Only the owner
 * sees the card. "Open" starts the same sealed channel as the remote view (`POST /api/node/takeovers`
 * with `{liveCardId}`): a terminal's screens, or a browser's pictures.
 */
import type { Badge } from "./plan";

export type LiveCardData = {
  type?: string;
  kind?: string;
  status?: string;
  liveId?: string | null;
  deviceId?: string | null;
  computer?: string | null;
  title?: string | null;
  session?: string | null;
  tab?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
};

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export const liveKind = (data: Pick<LiveCardData, "kind"> | null | undefined): "terminal" | "browser" => (data?.kind === "terminal" ? "terminal" : "browser");

/** Open until the computer says it ended. */
export const liveOpen = (data: Pick<LiveCardData, "status"> | null | undefined): boolean => text(data?.status) !== "ended";

/** "Live terminal on Studio", "Live browser: Pricing — Fieldnote". */
export function liveTitle(data: LiveCardData | null | undefined): string {
  const computer = text(data?.computer) || "your computer";
  if (liveKind(data) === "terminal") return `Live terminal on ${computer}`;
  const title = text(data?.title);
  return title ? `Live browser: ${title.length > 80 ? `${title.slice(0, 79)}…` : title}` : `Live browser on ${computer}`;
}

export function liveBadge(data: Pick<LiveCardData, "status"> | null | undefined): Badge {
  return liveOpen(data) ? { label: "Live", tone: "accent" } : { label: "Ended", tone: "muted" };
}

/** What the card says about the session, open or ended. */
export function liveLine(data: LiveCardData, handle: string): string {
  const terminal = liveKind(data) === "terminal";
  if (!liveOpen(data)) return terminal ? `The terminal on ${text(data.computer) || "your computer"} is closed.` : "The browser session ended.";
  return terminal
    ? `@${handle} works in this terminal. Watch it live, and type in it too: it is your shell.`
    : `Watch @${handle}'s browser live. Take control to click and type: @${handle} waits on that tab until you hand it back.`;
}

/** The checkpoint's line once it ended: "Live terminal on Studio ended". */
export const liveEndedText = (data: LiveCardData): string => `${liveTitle(data)} ended`;
