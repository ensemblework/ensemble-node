export const SIDEBAR_MIN = 248;
export const SIDEBAR_MAX = 420;
export const SIDEBAR_DEFAULT = 288;

export function sidebarWidth(value: unknown): number {
  const width = typeof value === "number" ? value : Number(value);
  return value === null || value === "" || !Number.isFinite(width) ? SIDEBAR_DEFAULT : Math.round(Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, width)));
}
