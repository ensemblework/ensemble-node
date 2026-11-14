export const PLACE_BLOCKED_EVENT = "node:place-blocked";
const KEY = "node.active-place";
type Lease = { id: string; seq: number; accountId: string };
let lease: Lease | null = null;
let allowed = true;

export type OpenPlace = { windowId: string; surface: "node"; label: string; lastSeen: string };
export type PlaceAnswer = { allowed: boolean; code?: string; places: OpenPlace[] };

export function placeHeaders(): Record<string, string> {
  return lease ? { "x-ensemble-place": lease.id, "x-ensemble-place-account": lease.accountId, "x-ensemble-place-surface": "node" } : {};
}

export function placeQuery(): string {
  return lease ? `?${new URLSearchParams({ place: lease.id, placeAccount: lease.accountId })}` : "";
}

export function placeAllowed(): boolean { return allowed; }
export function setPlaceAllowed(value: boolean) {
  allowed = value;
}

export function nextPlaceInput() {
  if (!lease) throw new Error("This window has not joined Ensemble Node.");
  lease.seq += 1;
  try { window.sessionStorage.setItem(KEY, JSON.stringify(lease)); }
  catch { console.warn("This window could not keep its Node place id across reloads."); }
  return { ...lease, surface: "node" as const };
}

/** A duplicated tab copies sessionStorage; a held Web Lock gives the new tab its own id. */
export async function acquirePlace(accountId: string): Promise<() => void> {
  let saved: Partial<Lease> | null = null;
  try { saved = JSON.parse(window.sessionStorage.getItem(KEY) ?? "null"); }
  catch { console.warn("This window could not restore its Node place id."); }
  const id = typeof saved?.id === "string" && /^[a-f0-9-]{36}$/.test(saved.id) ? saved.id : crypto.randomUUID();
  const seq = typeof saved?.seq === "number" && Number.isSafeInteger(saved.seq) && saved.seq >= 0 ? saved.seq : 0;
  if (!navigator.locks) {
    lease = { id: crypto.randomUUID(), seq: 0, accountId };
    return () => { lease = null; allowed = true; };
  }
  return new Promise((resolve, reject) => {
    const lock = (wanted: string, serial: number) => {
      void navigator.locks.request(`node.place:${wanted}`, { ifAvailable: true }, async held => {
        if (!held) { lock(crypto.randomUUID(), 0); return; }
        lease = { id: wanted, seq: serial, accountId };
        await new Promise<void>(release => resolve(() => { lease = null; allowed = true; release(); }));
      }).catch(reject);
    };
    lock(id, seq);
  });
}
