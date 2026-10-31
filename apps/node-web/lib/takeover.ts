/**
 * Controlling a tab of the owner's computer from here (Ensemble docs/35 §8.16.2, design B21), or
 * watching and using one of its node's live sessions (a terminal or a browser). The page opens a
 * takeover (a short-lived capability for this browser session only), makes a 32-byte secret and sends
 * it sealed for the computer's key (lib/seal.ts, purpose `takeover`), so only this page and the computer
 * can derive the channel's keys (lib/takeover-channel.ts). Frames arrive encrypted and are opened here;
 * input goes back encrypted and numbered, each key at once, several messages in flight (the relay passes
 * them on in their numbers' order). Ensemble's server relays ciphertext it cannot read. The capability
 * and the keys live in this page's memory only.
 */
import { ApiError } from "./api";
import { sealFor, type SealKeyInfo } from "./seal";
import { channelBase64Url, newTakeoverSecret, openMessage, sealMessage, takeoverKeys, unpackMessage, type ChannelKeys, type ChannelMessage } from "./takeover-channel";
import { terminalScreen, type TerminalInput, type TerminalScreen } from "./terminal";

/** A sign-in card's tab, a running run's tab (the one its live view shows, by its id when the page knows it), or a live card's terminal or browser. */
export type TakeoverSource = { loginCardId: string } | { jobId: string; tab?: string } | { liveCardId: string };

export type TakeoverInfo = {
  id: string;
  computer: { id: string; name: string };
  tab: string;
  origin: string;
  state: "created" | "live" | "ended";
  startBy: string;
  endsAt: string | null;
  loginCardId: string | null;
  /** What it shows: a browser (the default) or a terminal. */
  kind?: string;
  /** "watch" until the owner takes control of a live browser; "control" otherwise. Older servers say which browser ("tab", "clean"), which is control. */
  mode?: string;
  sealKey?: SealKeyInfo;
  reason?: string;
  /** Why the computer shows its node's own tab, not the clean sign-in browser (it could not start there). */
  note?: string;
};

export type TakeoverKind = "browser" | "terminal";

export const takeoverKind = (info: Pick<TakeoverInfo, "kind"> | null | undefined, fallback: TakeoverKind = "browser"): TakeoverKind => (info?.kind === "terminal" ? "terminal" : info?.kind === "browser" ? "browser" : fallback);

/** Whether the owner controls it (types and clicks) rather than watches. */
export const takeoverControls = (info: Pick<TakeoverInfo, "mode"> | null | undefined): boolean => info?.mode !== "watch";

export type InputEvent =
  | { t: "mouse"; type: "move" | "down" | "up"; x: number; y: number; button?: "left" | "right" | "middle"; clicks?: number }
  | { t: "wheel"; x: number; y: number; dx: number; dy: number }
  | { t: "key"; type: "down" | "up"; key: string }
  | { t: "text"; text: string }
  | TerminalInput
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

/** Joins queued input: consecutive moves (and terminal sizes) keep only the last, so a slow link does not lag behind; consecutive terminal text goes as one. */
export function batchEvents(events: InputEvent[]): InputEvent[] {
  const out: InputEvent[] = [];
  for (const event of events) {
    const last = out.at(-1);
    if (event.t === "mouse" && event.type === "move" && last?.t === "mouse" && last.type === "move") out[out.length - 1] = event;
    else if (event.t === "tty-size" && last?.t === "tty-size") out[out.length - 1] = event;
    else if (event.t === "tty" && last?.t === "tty" && last.text.length + event.text.length <= 1000) out[out.length - 1] = { t: "tty", text: last.text + event.text };
    else if (event.t === "ping" && out.some((item) => item.t === "ping")) continue;
    else out.push(event);
  }
  return out;
}

/** The most events one message carries (the computer's limit). */
export const EVENTS_PER_MESSAGE = 100;

/**
 * Input messages on their way at once. Each key goes as soon as it is typed; only what is typed while
 * this many are on their way waits, and then goes together. The relay passes them to the computer in
 * their numbers' order (Ensemble docs/35 §8.16.2, C1), which refuses a number it has applied already.
 */
export const MAX_IN_FLIGHT = 4;

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
    case "live_ended":
    case "session_ended":
      return "The live session ended.";
    case "done":
      return "You're done.";
    case "signed_in":
      return "Signed in.";
    case "passed":
      return "Check passed.";
    case "stopped":
      return "You stopped controlling it.";
    case "expired":
      return "Its time ran out. Open it again to go on.";
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

/** What `next()` brings: a picture of a browser, a terminal's screen, the page shown, or that it ended and why. */
export type NextFrame = { frame: Frame | null; terminal?: TerminalScreen; page?: PageInfo; ended?: string };

/** Whether a route is missing on this server (an older Ensemble): its features are not offered. */
export const unsupported = (error: unknown): boolean => error instanceof ApiError && (error.status === 404 || error.status === 405 || error.status === 501);

/** One takeover, from opening to ending. */
export class TakeoverSession {
  info: TakeoverInfo | null = null;
  /** Told whenever the input not yet taken by the relay changes: the view shows that keys are on their way. */
  onPending: ((count: number) => void) | null = null;
  private controller = "";
  private keys: ChannelKeys | null = null;
  private outSeq = 0;
  private inSeq = 0;
  private queue: InputEvent[] = [];
  private scheduled = false;
  private inFlight = 0;
  /** Sealed messages the relay has not taken yet, by number. */
  private undelivered = new Map<number, ChannelMessage>();
  /** Numbers on their first try right now. */
  private trying = new Set<number>();
  private repairing = false;
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
  async next(signal?: AbortSignal): Promise<NextFrame> {
    if (!this.info || !this.keys) throw new Error("Not open.");
    const answer = await this.api<{ state: string; reason?: string; frame: ChannelMessage | null }>(`/api/node/takeovers/${this.info.id}/frames?after=${this.inSeq}`, { headers: this.headers(), signal });
    if (answer.state === "ended") {
      this.close();
      return { frame: null, ended: answer.reason ?? "ended" };
    }
    if (!answer.frame || answer.frame.seq <= this.inSeq || !this.keys) return { frame: null };
    const plain = await openMessage(this.keys.d2w, this.info.id, "d2w", answer.frame);
    this.inSeq = Math.max(this.inSeq, answer.frame.seq);
    const { header, payload } = unpackMessage(plain);
    if (header.kind === "terminal") {
      const screen = terminalScreen(header, payload);
      return screen ? { frame: null, terminal: screen } : { frame: null };
    }
    const page = pageInfo(header);
    // A message without a picture says only which page is shown.
    if ((header.t !== undefined && header.t !== "frame") || !payload.length) return { frame: null, page };
    return { frame: { width: Number(header.w) || 0, height: Number(header.h) || 0, ...page, jpeg: payload }, page };
  }

  /** Input not yet taken by the relay: queued, being sealed, or on its way. */
  get pending(): number {
    return this.queue.length + this.inFlight + this.undelivered.size;
  }

  private changed(): void {
    this.onPending?.(this.pending);
  }

  /** Queues input; it goes at once (what is queued in the same moment goes together), numbered in order. */
  send(events: InputEvent[]): void {
    if (this.stopped || !events.length) return;
    this.queue.push(...events);
    this.changed();
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.pump();
    });
  }

  /** Sends what is queued while fewer than `MAX_IN_FLIGHT` messages are on their way, and none waits to be sent again. */
  private pump(): void {
    while (this.queue.length && this.inFlight < MAX_IN_FLIGHT && !this.repairing && !this.stopped && this.info && this.keys) {
      const events = batchEvents(this.queue.splice(0, EVENTS_PER_MESSAGE * 4));
      for (let at = 0; at < events.length; at += EVENTS_PER_MESSAGE) this.post(events.slice(at, at + EVENTS_PER_MESSAGE));
    }
  }

  /** Numbers and seals one message, then posts it at once, beside any others on their way (the relay puts them in order). */
  private post(events: InputEvent[]): void {
    const id = this.info!.id;
    const keys = this.keys!;
    this.outSeq += 1;
    const seq = this.outSeq;
    this.inFlight += 1;
    void sealMessage(keys.w2d, id, "w2d", seq, new TextEncoder().encode(JSON.stringify({ events })))
      .then(async (message) => {
        this.undelivered.set(seq, message);
        // While earlier input is being sent again, this waits its turn there.
        if (this.repairing || this.stopped) return;
        this.trying.add(seq);
        const outcome = await this.tryOnce(message).finally(() => this.trying.delete(seq));
        if (outcome === "retry") void this.repair();
        else this.undelivered.delete(seq);
      })
      .catch(() => undefined)
      .finally(() => {
        this.inFlight -= 1;
        this.changed();
        this.pump();
      });
  }

  private async tryOnce(message: ChannelMessage): Promise<"ok" | "retry" | "drop"> {
    try {
      await this.api(`/api/node/takeovers/${this.info!.id}/input`, { body: message, headers: this.headers() });
      return "ok";
    } catch (error) {
      return retryable(error) ? "retry" : "drop";
    }
  }

  /**
   * The link is down: what the relay has not taken goes again, oldest first and one at a time, the same
   * messages with the same numbers (the computer takes each once), for as long as the view is open; new
   * input waits behind it. Given up only when the takeover ended or was refused (the frames say why).
   */
  private async repair(): Promise<void> {
    if (this.repairing) return;
    this.repairing = true;
    this.changed();
    try {
      let attempt = 0;
      while (this.undelivered.size && !this.stopped && !this.ending) {
        const waiting = [...this.undelivered.keys()].filter((seq) => !this.trying.has(seq));
        if (!waiting.length) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          continue;
        }
        await new Promise((resolve) => setTimeout(resolve, reconnectDelay(attempt)));
        const seq = Math.min(...waiting);
        const message = this.undelivered.get(seq);
        if (!message || this.stopped || this.ending) continue;
        const outcome = await this.tryOnce(message);
        if (outcome === "retry") {
          attempt += 1;
          continue;
        }
        this.undelivered.delete(seq);
        attempt = 0;
        this.changed();
      }
    } finally {
      this.repairing = false;
      this.changed();
      this.pump();
    }
  }

  /** "+15 min": more time, up to the server's limit. The answer has the new `endsAt`. */
  async extend(): Promise<TakeoverInfo> {
    if (!this.info) throw new Error("Not open.");
    const answer = await this.api<{ takeover: TakeoverInfo }>(`/api/node/takeovers/${this.info.id}/extend`, { body: {}, headers: this.headers() });
    this.info = { ...this.info, ...answer.takeover, sealKey: this.info.sealKey };
    return this.info;
  }

  /** Take control of a live browser (the node waits on that tab), or hand it back (watching again). */
  async control(on: boolean): Promise<TakeoverInfo> {
    if (!this.info) throw new Error("Not open.");
    const answer = await this.api<{ takeover: TakeoverInfo }>(`/api/node/takeovers/${this.info.id}/control`, { body: { on }, headers: this.headers() });
    this.info = { ...this.info, mode: on ? "control" : "watch", ...answer.takeover, sealKey: this.info.sealKey };
    return this.info;
  }

  /** I'm done (the computer checks the sign-in) or Stop. */
  async end(done: boolean): Promise<{ signedIn: boolean | null; message?: string; card?: unknown }> {
    if (!this.info) return { signedIn: null };
    // What was typed goes first; a link that is down does not hold the end back for long.
    for (let waited = 0; this.pending > 0 && waited < 3_000; waited += 20) await new Promise((resolve) => setTimeout(resolve, 20));
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
    this.queue = [];
    this.undelivered.clear();
    this.changed();
  }
}
