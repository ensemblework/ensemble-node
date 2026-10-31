/**
 * Where to go after signing in to Node: a link opened on a phone that is not signed in yet (a sign-in
 * card's QR code) goes to /login with `?next=` and, once signed in, back to it, with its own question
 * and hash. A provider's sign-in (Google, Microsoft, GitHub) leaves the site and comes back to `/`, so
 * the place is also kept in this tab's session storage for that trip.
 */

const KEY = "node.next";

/** A place on this site to go back to, or null: a path only (never another site, nor the sign-in pages themselves). */
export function safeNext(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const next = value.trim();
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || next.length > 500) return null;
  if (/[\u0000-\u001f]/.test(next)) return null;
  const path = next.replace(/[?#].*$/, "");
  if (path === "/" || path === "/login" || path.startsWith("/login/") || path === "/welcome") return null;
  return next;
}

/** The sign-in page, coming back to `next` afterwards. */
export const loginPath = (next: string | null | undefined): string => {
  const safe = safeNext(next);
  return safe ? `/login?next=${encodeURIComponent(safe)}` : "/login";
};

/** Keeps the place for a provider's sign-in, which comes back to the site's front page. */
export function rememberNext(next: string | null | undefined): void {
  const safe = safeNext(next);
  try {
    if (safe) sessionStorage.setItem(KEY, safe);
  } catch {
    // Private windows may refuse storage: the sign-in still works and lands on the chats.
  }
}

/** The place kept for after signing in, once (it is forgotten as it is read). */
export function takeNext(): string | null {
  try {
    const value = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return safeNext(value);
  } catch {
    return null;
  }
}
