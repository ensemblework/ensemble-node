/**
 * Controlling a tab of the owner's computer from here (Ensemble docs/35 §8.16.2, design B21). The page
 * opens a takeover (a short-lived capability for this browser session only), makes a 32-byte secret and
 * sends it sealed for the computer's key (lib/seal.ts, purpose `takeover`), so only this page and the
 * computer can derive the channel's keys (lib/takeover-channel.ts). Frames arrive encrypted and are
 * opened here; input goes back encrypted, numbered, one message at a time. Ensemble's server relays
 * ciphertext it cannot read. The capability and the keys live in this page's memory only.
 */
import { ApiError } from "./api";
import { sealFor, type SealKeyInfo } from "./seal";
import { channelBase64Url, newTakeoverSecret, openMessage, sealMessage, takeoverKeys, unpackMessage, type ChannelKeys, type ChannelMessage } from "./takeover-channel";

/** A sign-in card's tab, or a running run's tab: the one its live view shows, by its id when the page knows it. */
export type TakeoverSource = { loginCardId: string } | { jobId: string; tab?: string };

export type TakeoverInfo = {
  id: string;
  computer: { id: string; name: string };
  tab: string;
  origin: string;
  state: "created" | "live" | "ended";
  startBy: string;
  endsAt: string | null;
  loginCardId: string | null;
  sealKey?: SealKeyInfo;
  reason?: string;
  /** Why the computer shows its node's own tab, not the clean sign-in browser (it could not start there). */
  note?: string;
};

export type InputEvent =
  | { t: "mouse"; type: "move" | "down" | "up"; x: number; y: number; button?: "left" | "right" | "middle"; clicks?: number }
  | { t: "wheel"; x: number; y: number; dx: number; dy: number }
  | { t: "key"; type: "down" | "up"; key: string }
  | { t: "text"; text: string }
  | { t: "ping" };

/** What the computer says about the page a frame shows: its address, its title, and whether it is a popup the sign-in opened. */
export type PageInfo = { url: string; title: string | null; popup: boolean };

export type Frame = PageInfo & { width: number; height: number; jpeg: Uint8Array };

type Api = <T>(path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal; headers?: Record<string, string> }) => Promise<T>;

/**
 * Where a pointer is on the tab, as a fraction of the page, for a canvas that shows the frame scaled to
 * fit (letterboxed) in `box`. Null outside the picture.
 */
export function pointOnFrame(clientX: number, clientY: number, box: { left: number; top: number; width: number; height: number }, frame: { width: number; height: number }): { x: number; y: number } | null {
  if (!frame.width || !frame.height || !box.width || !box.height) return null;
  const scale = Math.min(box.width / frame.width, box.height / frame.height);
  const shownWidth = frame.width * scale;
  const shownHeight = frame.height * scale;
  const left = box.left + (box.width - shownWidth) / 2;
  const top = box.top + (box.height - shownHeight) / 2;
  const x = (clientX - left) / shownWidth;
  const y = (clientY - top) / shownHeight;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x: Math.round(x * 10_000) / 10_000, y: Math.round(y * 10_000) / 10_000 };
}

const SPECIAL = new Set(["Enter", "Tab", "Backspace", "Delete", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Shift", "Control", "Alt", "Meta", " "]);

/** A key from this page's keyboard as the computer takes it, or null for keys the page keeps (composition, F-keys). */
export function keyEvent(type: "down" | "up", event: { key: string; isComposing?: boolean }): InputEvent | null {
  if (event.isComposing || event.key === "Process" || event.key === "Unidentified" || event.key === "Dead") return null;
  if (event.key.length === 1 || SPECIAL.has(event.key)) return { t: "key", type, key: event.key === " " ? " " : event.key };
  return null;
}

/** Joins queued input: consecutive moves keep only the last, so a slow link does not lag behind. */
export function batchEvents(events: InputEvent[]): InputEvent[] {
  const out: InputEvent[] = [];
  for (const event of events) {
    const last = out.at(-1);
    if (event.t === "mouse" && event.type === "move" && last?.t === "mouse" && last.type === "move") out[out.length - 1] = event;
    else if (event.t === "ping" && out.some((item) => item.t === "ping")) continue;
    else out.push(event);
  }
  return out;
}

/** The most events one message carries (the computer's limit). */
export const EVENTS_PER_MESSAGE = 100;

/** A key pressed and let go: Enter, Tab, Backspace, Escape. */
export const keyPress = (key: string): InputEvent[] => [
  { t: "key", type: "down", key },
  { t: "key", type: "up", key },
];

/**
 * What changed in the "Type into the page" box, as input for the page: a Backspace for each character
 * that went, then the new text. A phone's keyboard may replace a whole word (autocorrect): the page
 * still ends up with what the box shows.
 */
export function typingEvents(before: string, after: string): InputEvent[] {
  const was = Array.from(before);
  const now = Array.from(after);
  let same = 0;
  while (same < was.length && same < now.length && was[same] === now[same]) same += 1;
  const events: InputEvent[] = [];
  for (let gone = same; gone < was.length; gone += 1) events.push(...keyPress("Backspace"));
  const added = now.slice(same);
  for (let at = 0; at < added.length; at += 1000) events.push({ t: "text", text: added.slice(at, at + 1000).join("") });
  return events;
}

/** How far a finger may move and still tap. */
export const TAP_SLOP_PX = 10;
/** How long a finger stays still before it presses and holds. */
export const HOLD_MS = 450;

type Point = { x: number; y: number };

/**
 * One finger on the picture, as input for the page: a tap clicks, a drag scrolls the page by as much as
 * the finger moved over the picture, and a finger kept still presses the mouse and holds it down until
 * it lifts ("Press and hold" checks); moving it then drags with the button down (sliders). The view
 * calls `hold()` after `HOLD_MS` when the finger has not moved.
 */
export class TouchGesture {
  private moved = false;
  private holding = false;
  private last: Point;
  private lastPage: Point;

  constructor(
    private readonly start: { client: Point; page: Point },
    /** Page pixels per screen pixel of the picture. */
    private readonly ratio: number,
  ) {
    this.last = start.client;
    this.lastPage = start.page;
  }

  get isHolding(): boolean {
    return this.holding;
  }

  /** Whether it can still become a tap or a hold (it has not scrolled). */
  get still(): boolean {
    return !this.moved;
  }

  move(client: Point, page: Point | null): InputEvent[] {
    if (this.holding) {
      if (!page) return [];
      this.lastPage = page;
      return [{ t: "mouse", type: "move", ...page }];
    }
    if (!this.moved && Math.hypot(client.x - this.start.client.x, client.y - this.start.client.y) <= TAP_SLOP_PX) return [];
    this.moved = true;
    const dx = Math.round((this.last.x - client.x) * this.ratio);
    const dy = Math.round((this.last.y - client.y) * this.ratio);
    this.last = client;
    if (!dx && !dy) return [];
    const at = page ?? this.start.page;
    return [{ t: "wheel", x: at.x, y: at.y, dx: clampDelta(dx), dy: clampDelta(dy) }];
  }

  hold(): InputEvent[] {
    if (this.moved || this.holding) return [];
    this.holding = true;
    return [
      { t: "mouse", type: "move", ...this.start.page },
      { t: "mouse", type: "down", ...this.start.page },
    ];
  }

  /** The finger lifted (or the browser took the gesture back): a tap clicks, a hold lets go, a drag has scrolled already. */
  up(): InputEvent[] {
    if (this.holding) {
      this.holding = false;
      this.moved = true;
      return [{ t: "mouse", type: "up", ...this.lastPage }];
    }
    if (this.moved) return [];
    this.moved = true;
    return [
      { t: "mouse", type: "move", ...this.start.page },
      { t: "mouse", type: "down", ...this.start.page },
      { t: "mouse", type: "up", ...this.start.page },
    ];
  }

  /** The gesture was cancelled: a held button is let go; nothing else happens. */
  cancel(): InputEvent[] {
    if (!this.holding) {
      this.moved = true;
      return [];
    }
    return this.up();
  }
}

const clampDelta = (value: number) => Math.max(-5000, Math.min(5000, value));

/**
 * The picture's size on screen: as wide as the space allows and never taller than it, keeping its shape
 * (on a phone, the whole width).
 */
export function fitFrame(frame: { width: number; height: number }, box: { width: number; height: number }): { width: number; height: number } | null {
  if (!frame.width || !frame.height || box.width <= 0 || box.height <= 0) return null;
  const scale = Math.min(box.width / frame.width, box.height / frame.height);
  return { width: Math.floor(frame.width * scale), height: Math.floor(frame.height * scale) };
}

/** Which site the picture shows, for the view's header: "accounts.google.com — popup". */
export function pageLabel(page: Pick<PageInfo, "url" | "popup"> | null | undefined): string | null {
  const url = page?.url?.trim();
  if (!url) return null;
  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    host = url.replace(/^[a-z]+:\/\//i, "").replace(/[/?#].*$/, "");
  }
  if (!host) return null;
  return page?.popup ? `${host} — popup` : host;
}

/** The page a frame's header describes; a computer from before page info says only the address. */
export function pageInfo(header: Record<string, unknown>): PageInfo {
  const page = header.page && typeof header.page === "object" ? (header.page as Record<string, unknown>) : header;
  const url = typeof page.url === "string" ? page.url : typeof header.url === "string" ? header.url : "";
  const title = typeof page.title === "string" && page.title.trim() ? page.title.trim().slice(0, 200) : null;
  const popup = page.popup === true || page.kind === "popup";
  return { url, title, popup };
}

/** A failure the link may recover from: no network, or a gateway that gave up. The takeover itself goes on. */
export function retryable(error: unknown): boolean {
  return error instanceof ApiError && [0, 408, 429, 500, 502, 503, 504].includes(error.status);
}

/** How long to wait before the next try after a lost connection: 0.5 s, doubling, at most 8 s. */
export const reconnectDelay = (attempt: number): number => Math.min(8_000, 500 * 2 ** Math.max(0, attempt));

/** Why a takeover ended, in words. */
export function endedText(reason: string | undefined, computer: string): string {
  switch (reason) {
    case "done":
      return "You're done.";
    case "signed_in":
      return "Signed in.";
    case "passed":
      return "Check passed.";
    case "stopped":
      return "You stopped controlling it.";
    case "expired":
      return "Its time ran out (15 minutes). Open the browser again to go on.";
    case "signed_out":
      return "You signed out, so it ended.";
    case "unpaired":
      return `${computer} is no longer paired.`;
    case "idle":
      return "Nothing happened for a minute, so it ended.";
    case "tab_closed":
      return "The tab was closed on the computer.";
    case "refused":
      return `${computer} did not start it.`;
    default:
      return "It ended.";
  }
}

/** One takeover, from opening to ending. */
export class TakeoverSession {
  info: TakeoverInfo | null = null;
  private controller = "";
  private keys: ChannelKeys | null = null;
  private outSeq = 0;
  private inSeq = 0;
  private queue: InputEvent[] = [];
  private sending = false;
  private stopped = false;
  private ending = false;
  private ping: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly api: Api,
    private readonly source: TakeoverSource,
  ) {}

  private headers(): Record<string, string> {
    return { "x-ensemble-takeover": this.controller };
  }

  /** Opens and starts it: the secret is made here and sealed for the computer; the keys never leave this page. */
  async open(origin: string): Promise<TakeoverInfo> {
    const created = await this.api<{ takeover: TakeoverInfo; controller: string }>("/api/node/takeovers", { body: this.source });
    this.info = created.takeover;
    this.controller = created.controller;
    if (!created.takeover.sealKey) throw new Error("The computer's key is missing. Reload the page.");
    const secret = newTakeoverSecret();
    try {
      const box = await sealFor(created.takeover.sealKey, { purpose: "takeover", deviceId: created.takeover.computer.id, decisionId: created.takeover.id, name: created.takeover.tab, origin }, { k: channelBase64Url(secret) }, { ttlMs: 2 * 60_000 });
      this.keys = await takeoverKeys(secret, created.takeover.id);
      const started = await this.api<{ takeover: TakeoverInfo; note?: string }>(`/api/node/takeovers/${created.takeover.id}/start`, { body: { sealed: box.sealed }, headers: this.headers() });
      this.info = { ...created.takeover, ...started.takeover, sealKey: created.takeover.sealKey, ...(started.note ? { note: started.note } : {}) };
    } finally {
      secret.fill(0);
    }
    this.ping = setInterval(() => this.send([{ t: "ping" }]), 15_000);
    return this.info;
  }

  /** The next frame, opened here; null when none came in time; `ended` with why. */
  async next(signal?: AbortSignal): Promise<{ frame: Frame | null; page?: PageInfo; ended?: string }> {
    if (!this.info || !this.keys) throw new Error("Not open.");
    const answer = await this.api<{ state: string; reason?: string; frame: ChannelMessage | null }>(`/api/node/takeovers/${this.info.id}/frames?after=${this.inSeq}`, { headers: this.headers(), signal });
    if (answer.state === "ended") {
      this.close();
      return { frame: null, ended: answer.reason ?? "ended" };
    }
    if (!answer.frame || answer.frame.seq <= this.inSeq) return { frame: null };
    const plain = await openMessage(this.keys.d2w, this.info.id, "d2w", answer.frame);
    this.inSeq = answer.frame.seq;
    const { header, payload } = unpackMessage(plain);
    const page = pageInfo(header);
    // A message without a picture says only which page is shown.
    if ((header.t !== undefined && header.t !== "frame") || !payload.length) return { frame: null, page };
    return { frame: { width: Number(header.w) || 0, height: Number(header.h) || 0, ...page, jpeg: payload }, page };
  }

  /** Queues input; it goes out in order, one message at a time, each with the next number. */
  send(events: InputEvent[]): void {
    if (this.stopped || !events.length) return;
    this.queue.push(...events);
    void this.flush();
  }

  private async flush(): Promise<void> {
    if (this.sending || !this.info || !this.keys) return;
    this.sending = true;
    try {
      while (this.queue.length && !this.stopped && this.keys) {
        const events = batchEvents(this.queue.splice(0, EVENTS_PER_MESSAGE * 4));
        while (events.length && !this.stopped && this.keys) {
          this.outSeq += 1;
          const message = await sealMessage(this.keys.w2d, this.info.id, "w2d", this.outSeq, new TextEncoder().encode(JSON.stringify({ events: events.splice(0, EVENTS_PER_MESSAGE) })));
          await this.deliver(message);
        }
      }
    } finally {
      this.sending = false;
    }
  }

  /**
   * Sends one message, trying it again for as long as the connection is lost and the view is open: the
   * same message, so its number keeps its place and the computer takes it once; nothing after it goes
   * first. Given up only when the takeover ended or was refused (the frames say why) or the view closed.
   */
  private async deliver(message: ChannelMessage): Promise<void> {
    for (let attempt = 0; !this.stopped && !this.ending; attempt += 1) {
      try {
        await this.api(`/api/node/takeovers/${this.info!.id}/input`, { body: message, headers: this.headers() });
        return;
      } catch (error) {
        if (!retryable(error)) return;
        await new Promise((resolve) => setTimeout(resolve, reconnectDelay(attempt)));
      }
    }
  }

  /** I'm done (the computer checks the sign-in) or Stop. */
  async end(done: boolean): Promise<{ signedIn: boolean | null; message?: string; card?: unknown }> {
    if (!this.info) return { signedIn: null };
    // What was typed goes first; a link that is down does not hold the end back for long.
    for (let waited = 0; this.sending && waited < 3_000; waited += 20) await new Promise((resolve) => setTimeout(resolve, 20));
    this.ending = true;
    const result = await this.api<{ signedIn: boolean | null; message?: string; card?: unknown }>(`/api/node/takeovers/${this.info.id}/end`, { body: { done }, headers: this.headers() });
    this.close();
    return result;
  }

  /** Forgets the keys and the capability. */
  close(): void {
    this.stopped = true;
    if (this.ping) clearInterval(this.ping);
    this.ping = null;
    this.keys = null;
    this.controller = "";
  }
}
