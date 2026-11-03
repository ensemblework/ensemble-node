import { ApiError } from "./api";
import { originalKey, readOriginal, saveOriginal, type OriginalData, type OriginalEntry } from "./original-files";

export type FileBuffer = {
  entry: OriginalEntry;
  data?: OriginalData;
  text: string;
  base: string;
  hash: string | null;
  status: "loading" | "saved" | "modified" | "saving" | "error" | "conflict";
  error?: string;
  latest?: OriginalData;
  refreshing?: boolean;
};
type Transport = { read: typeof readOriginal; save: typeof saveOriginal };

/** Source text lives only in this tab's memory, never in web storage or the query cache. */
export class FileBuffers {
  private values = new Map<string, FileBuffer>();
  private listeners = new Map<string, Set<() => void>>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private saving = new Map<string, Promise<void>>();
  private pendingSaves = new Map<string, string>();
  private loading = new Map<string, Promise<void>>();
  private closing = new Set<string>();
  private paused = false;
  private saveErrors = new Set<(key: string, message: string) => void>();
  constructor(private transport: Transport = { read: readOriginal, save: saveOriginal }, private delay = 700) {}
  get = (key: string) => this.values.get(key);
  dirty = (key: string) => { const value = this.get(key); return Boolean(value?.data && value.text !== value.base); };
  hasDrafts = () => [...this.values.keys()].some(key => this.dirty(key));
  subscribe = (key: string, listener: () => void) => {
    const listeners = this.listeners.get(key) ?? new Set();
    listeners.add(listener); this.listeners.set(key, listeners);
    return () => { listeners.delete(listener); };
  };
  subscribeSaveErrors(listener: (key: string, message: string) => void) {
    this.saveErrors.add(listener);
    return () => { this.saveErrors.delete(listener); };
  }
  private patch(key: string, change: Partial<FileBuffer>) {
    if (!this.values.has(key)) return;
    this.values.set(key, { ...this.values.get(key)!, ...change });
    for (const listener of this.listeners.get(key) ?? []) listener();
  }
  private clearTimer(key: string) {
    const timer = this.timers.get(key);
    if (timer) clearTimeout(timer);
    this.timers.delete(key);
  }
  async open(entry: OriginalEntry): Promise<string> {
    const key = originalKey(entry);
    if (!this.values.has(key)) this.values.set(key, { entry, text: "", base: "", hash: null, status: "loading" });
    else this.patch(key, { entry: { ...this.get(key)!.entry, ...entry } });
    if (!this.get(key)!.data) await this.load(key);
    else await this.refresh(key);
    return key;
  }
  async refresh(key: string): Promise<void> {
    if (!this.get(key)) return;
    if (!this.get(key)!.data) return this.load(key);
    if (this.loading.has(key)) return this.loading.get(key);
    const task = (async () => {
      await this.saving.get(key);
      const before = this.get(key);
      if (!before) return;
      this.patch(key, { refreshing: true });
      try {
        const latest = await this.transport.read(before.entry.source);
        const current = this.get(key);
        if (!current || current.hash !== before.hash) return;
        if (latest.hash !== current.hash || latest.content !== current.base || latest.readOnly !== current.data?.readOnly) {
          if (this.dirty(key)) { this.clearTimer(key); this.patch(key, { latest, status: "conflict", error: undefined }); }
          else this.patch(key, { data: latest, text: latest.content ?? "", base: latest.content ?? "", hash: latest.hash, status: "saved", error: undefined, latest: undefined });
        } else {
          this.patch(key, { data: latest });
          if (!this.dirty(key) && current.status === "error") this.patch(key, { status: "saved", error: undefined });
        }
      } catch (error) { this.patch(key, { error: error instanceof Error ? error.message : "The latest original could not be opened.", status: "error" }); }
      finally { this.patch(key, { refreshing: false }); }
    })();
    this.loading.set(key, task);
    try { await task; } finally { this.loading.delete(key); }
  }
  async load(key: string): Promise<void> {
    if (this.loading.has(key)) return this.loading.get(key);
    if (this.dirty(key)) return this.compare(key);
    const task = (async () => {
      this.patch(key, { status: "loading", error: undefined });
      try {
        const data = await this.transport.read(this.get(key)!.entry.source);
        this.patch(key, { data, text: data.content ?? "", base: data.content ?? "", hash: data.hash, status: "saved", latest: undefined });
      } catch (error) { this.patch(key, { status: "error", error: error instanceof Error ? error.message : "The original could not be opened." }); }
    })();
    this.loading.set(key, task);
    try { await task; } finally { this.loading.delete(key); }
  }
  change(key: string, text: string) {
    const value = this.get(key);
    if (!value?.data || value.data.readOnly) return;
    const blocked = value.status === "conflict" || Boolean(value.latest);
    this.patch(key, { text, ...(!blocked && value.status !== "saving" ? { status: text === value.base ? "saved" : "modified", error: undefined } : {}) });
    this.clearTimer(key);
    if (!blocked) this.timers.set(key, setTimeout(() => { void this.save(key); }, this.delay));
  }
  async save(key: string): Promise<void> {
    this.clearTimer(key);
    const current = this.get(key);
    if (!current?.data || current.data.readOnly || !current.hash || current.status === "conflict" || current.latest) return;
    this.pendingSaves.set(key, current.text);
    if (this.saving.has(key)) return this.saving.get(key);
    const task = (async () => {
      while (!this.paused && !this.closing.has(key) && this.pendingSaves.has(key)) {
        const value = this.get(key)!;
        const text = this.pendingSaves.get(key)!;
        this.pendingSaves.delete(key);
        if (!value?.data || value.data.readOnly || !value.hash || value.status === "conflict" || value.latest) return;
        if (text === value.base) continue;
        this.patch(key, { status: "saving", error: undefined });
        try {
          const answer = await this.transport.save(value.entry.source, text, value.hash);
          if (!this.get(key)) return;
          this.patch(key, { base: text, hash: answer.hash, status: this.get(key)!.text === text ? "saved" : "modified" });
        } catch (error) {
          this.pendingSaves.delete(key);
          if (error instanceof ApiError && error.code === "FILE_CONFLICT") this.clearTimer(key);
          const message = error instanceof Error ? error.message : "The save failed. Your draft is retained.";
          this.patch(key, { status: error instanceof ApiError && error.code === "FILE_CONFLICT" ? "conflict" : "error", error: message });
          for (const listener of this.saveErrors) listener(key, message);
          return;
        }
      }
    })();
    this.saving.set(key, task);
    try { await task; } finally { this.saving.delete(key); }
  }
  async compare(key: string) {
    this.clearTimer(key);
    if (this.saving.has(key)) await this.saving.get(key);
    try {
      const latest = await this.transport.read(this.get(key)!.entry.source);
      this.patch(key, { latest, status: "conflict", error: undefined });
    } catch (error) { this.patch(key, { error: error instanceof Error ? error.message : "The latest version could not be opened." }); }
  }
  useComputer(key: string) {
    const latest = this.get(key)?.latest;
    if (!latest) return;
    this.patch(key, { data: latest, text: latest.content ?? "", base: latest.content ?? "", hash: latest.hash, status: "saved", latest: undefined, error: undefined });
  }
  async keepDraft(key: string) {
    const latest = this.get(key)?.latest;
    if (!latest || latest.readOnly || !latest.hash) return;
    this.patch(key, { data: latest, base: latest.content ?? "", hash: latest.hash, status: this.get(key)!.text === (latest.content ?? "") ? "saved" : "modified", latest: undefined, error: undefined });
    await this.save(key);
  }
  forget(key: string) {
    this.clearTimer(key);
    this.pendingSaves.delete(key);
    this.values.delete(key);
    this.closing.delete(key);
  }
  async discard(key: string) {
    this.closing.add(key);
    this.clearTimer(key);
    this.pendingSaves.delete(key);
    await this.saving.get(key);
    this.forget(key);
  }
  pause() { this.paused = true; for (const timer of this.timers.values()) clearTimeout(timer); this.timers.clear(); this.pendingSaves.clear(); }
  resume() { this.paused = false; }
  dispose() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.listeners.clear();
    this.saveErrors.clear();
    this.pendingSaves.clear();
    this.values.clear();
  }
}
