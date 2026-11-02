const REST_AFTER = 4 * 24 * 60 * 60 * 1000;
export type NodeVisits = Record<string, number>;

export function nodeIsResting(lastActivity: string | null | undefined, lastVisit: number | undefined, now: number): boolean {
  const last = Math.max(Date.parse(lastActivity ?? "") || 0, lastVisit ?? 0);
  return last > 0 && now - last >= REST_AFTER;
}

export function normaliseVisits(value: unknown, now: number): NodeVisits {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, at]) => id.length <= 100 && typeof at === "number" && Number.isFinite(at) && at > 0 && at <= now)
    .sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 128));
}
