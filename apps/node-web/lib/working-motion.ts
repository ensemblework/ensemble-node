export type WorkingZone = "sidebar" | "chat";

/** One browser-local attention cue, shared by every visible working portrait. */
export class WorkingMotion {
  private candidates = new Map<string, WorkingZone>();
  private active: string | null = null;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private random: () => number = Math.random) {}

  getSnapshot = () => this.active;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  register(id: string, zone: WorkingZone): () => void {
    this.candidates.set(id, zone);
    if (!this.active) this.choose();
    this.schedule();
    return () => {
      this.candidates.delete(id);
      if (this.active === id) this.choose(zone);
      this.schedule();
    };
  }

  private choose(previous = this.active ? this.candidates.get(this.active) : undefined) {
    const remaining = [...this.candidates].filter(([id]) => id !== this.active);
    const otherZone = remaining.filter(([, zone]) => zone !== previous);
    const choices = otherZone.length ? otherZone : remaining;
    const next = choices.length ? choices[Math.floor(this.random() * choices.length)]![0] : null;
    if (next === this.active) return;
    this.active = next;
    for (const listener of this.listeners) listener();
  }

  private schedule() {
    if (this.candidates.size < 2) {
      clearTimeout(this.timer);
      this.timer = undefined;
      return;
    }
    if (this.timer !== undefined) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.choose();
      this.schedule();
    }, 4500 + this.random() * 3000);
  }
}

export const workingMotion = new WorkingMotion();
