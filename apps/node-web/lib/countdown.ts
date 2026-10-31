/**
 * How long something still waits for its owner, as a timer people read at a glance: a sign-in card
 * until it expires (`expiresAt`), the remote view until its time is up (`endsAt`, "+15 min" once five
 * minutes or less are left), a device code until it runs out.
 */

/** Milliseconds left until `until` (an ISO date), never below 0; null when there is no end, or it cannot be read. */
export function timeLeft(until: unknown, now: number): number | null {
  if (typeof until !== "string" || !until.trim()) return null;
  const end = Date.parse(until);
  if (!Number.isFinite(end)) return null;
  return Math.max(0, end - now);
}

const two = (value: number) => String(value).padStart(2, "0");

/** "1:59:30", "14:32", "0:05": whole seconds, rounded up so it reads 0:00 only once the time is up. */
export function countdownText(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}

/** The same time in words, for screen readers: "14 minutes 32 seconds left". */
export function countdownWords(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  if (!total) return "No time left";
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts = [hours ? `${hours} hour${hours === 1 ? "" : "s"}` : "", minutes ? `${minutes} minute${minutes === 1 ? "" : "s"}` : "", !hours && seconds ? `${seconds} second${seconds === 1 ? "" : "s"}` : ""].filter(Boolean);
  return `${parts.join(" ")} left`;
}

/** Under two minutes the timer warns. */
export const COUNTDOWN_WARN_MS = 2 * 60_000;

/** The remote view offers more time once this much or less is left. */
export const EXTEND_SHOWN_MS = 5 * 60_000;

/** How much "+15 min" adds. */
export const EXTEND_MS = 15 * 60_000;

/** Whether the remote view offers "+15 min" now: five minutes or less left, and the server can add time. */
export const canExtend = (left: number | null, supported: boolean): boolean => supported && left !== null && left > 0 && left <= EXTEND_SHOWN_MS;
