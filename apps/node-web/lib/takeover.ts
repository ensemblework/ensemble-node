/**
 * Controlling a tab of the owner's computer from here (Ensemble docs/35 §8.16.2, design B21). The page
 * opens a takeover (a short-lived capability for this browser session only), makes a 32-byte secret and
 * sends it sealed for the computer's key (lib/seal.ts, purpose `takeover`), so only this page and the
 * computer can derive the channel's keys (lib/takeover-channel.ts). Frames arrive encrypted and are
 * opened here; input goes back encrypted, numbered, one message at a time. Ensemble's server relays
 * ciphertext it cannot read. The capability and the keys live in this page's memory only.
 */
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
};

export type InputEvent =
  | { t: "mouse"; type: "move" | "down" | "up"; x: number; y: number; button?: "left" | "right" | "middle"; clicks?: number }
  | { t: "wheel"; x: number; y: number; dx: number; dy: number }
  | { t: "key"; type: "down" | "up"; key: string }
  | { t: "text"; text: string }
  | { t: "ping" };

export type Frame = { width: number; height: number; url: string; jpeg: Uint8Array };

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

/** Joins queued input into one message: consecutive moves keep only the last, so a slow link does not lag behind. */
export function batchEvents(events: InputEvent[]): InputEvent[] {
  const out: InputEvent[] = [];
  for (const event of events) {
    const last = out.at(-1);
    if (event.t === "mouse" && event.type === "move" && last?.t === "mouse" && last.type === "move") out[out.length - 1] = event;
    else if (event.t === "ping" && out.some((item) => item.t === "ping")) continue;
    else out.push(event);
  }
  return out.slice(0, 100);
}

/** Why a takeover ended, in words. */
export function endedText(reason: string | undefined, computer: string): string {
  switch (reason) {
    case "done":
      return "You're done.";
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
      const started = await this.api<{ takeover: TakeoverInfo }>(`/api/node/takeovers/${created.takeover.id}/start`, { body: { sealed: box.sealed }, headers: this.headers() });
      this.info = { ...created.takeover, ...started.takeover, sealKey: created.takeover.sealKey };
    } finally {
      secret.fill(0);
    }
    this.ping = setInterval(() => this.send([{ t: "ping" }]), 15_000);
    return this.info;
  }

  /** The next frame, opened here; null when none came in time; `ended` with why. */
  async next(signal?: AbortSignal): Promise<{ frame: Frame | null; ended?: string }> {
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
    return { frame: { width: Number(header.w) || 0, height: Number(header.h) || 0, url: typeof header.url === "string" ? header.url : "", jpeg: payload } };
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
      while (this.queue.length && !this.stopped) {
        const events = batchEvents(this.queue.splice(0));
        this.outSeq += 1;
        const message = await sealMessage(this.keys.w2d, this.info.id, "w2d", this.outSeq, new TextEncoder().encode(JSON.stringify({ events })));
        await this.api(`/api/node/takeovers/${this.info.id}/input`, { body: message, headers: this.headers() }).catch(() => undefined);
      }
    } finally {
      this.sending = false;
    }
  }

  /** I'm done (the computer checks the sign-in) or Stop. */
  async end(done: boolean): Promise<{ signedIn: boolean | null; message?: string; card?: unknown }> {
    if (!this.info) return { signedIn: null };
    while (this.sending) await new Promise((resolve) => setTimeout(resolve, 20));
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
