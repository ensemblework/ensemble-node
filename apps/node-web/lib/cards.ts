/**
 * A node's owner-only cards (approval messages) in words: what the card asks and what its two answers
 * are called, the same in the conversation and in the Activity panel. Held writes, drafts, work on the
 * computer (starting or sending to a session, or handing one to another node), secrets and sign-ins; a
 * question from the owner's computer (a folder or a website used for the first time), a command to run
 * as administrator; a proposed node or crew, or an existing node to bring into a crew; captures held
 * for the owner to check before they are sent; and in rooms with other people, a request for work or a
 * review, a request the lead drafted for the owner to send, and a question about sharing something
 * private (Ensemble docs/35 §6.1, §8.9, §8.16, §12.4, §12.6).
 */

type CardData = {
  type?: unknown;
  action?: unknown;
  mode?: unknown;
  kind?: unknown;
  name?: unknown;
  from?: { name?: unknown } | null;
  asker?: { name?: unknown } | null;
  input?: { to?: unknown; [key: string]: unknown } | null;
  disclosure?: unknown;
  peerRequest?: unknown;
  request?: { to?: { name?: unknown; handle?: unknown; [key: string]: unknown } | null; [key: string]: unknown } | null;
  [key: string]: unknown;
} | null | undefined;

export type CardWords = {
  /** The card's title in the conversation. */
  title: string;
  /** What the node wants, after its handle, in lists of what waits for you (the Activity panel). */
  wants: string;
  approve: string;
  discard: string;
};

const text = (value: unknown, fallback: string) => (typeof value === "string" && value.trim() ? value.trim() : fallback);

/** What each capability of the owner's computer lets a node do (Ensemble's node/device-tool-decisions.ts). */
const COMPUTER_VERBS: Record<string, string> = { run: "run commands", git: "read git", files: "change files", http: "call", browse: "browse", read: "share files" };

/**
 * What a node asked its owner's computer for, after "wants to" or "Allowed @x to": "browse walmart.com",
 * "call api.example.com", "run commands in live-test". A website is the address itself; a folder is
 * where the capability is used.
 */
export function computerAction(data: { capability?: unknown; label?: unknown; scope?: unknown; [key: string]: unknown } | null | undefined): string {
  const capability = text(data?.capability, "run");
  const label = text(data?.label, data?.scope === "origin" ? "a website" : "a folder");
  if (data?.scope === "origin" || capability === "browse" || capability === "http") return `${capability === "http" ? "call" : "browse"} ${label}`;
  return `${COMPUTER_VERBS[capability] ?? "use the computer"} in ${label}`;
}

/** A card's title, its line in a list of what waits for you, and its answers. `handle` is the node's, `roomTitle` the conversation's. */
export function cardWords(data: CardData, handle: string, roomTitle: string): CardWords {
  const type = text(data?.type, "tools");
  switch (type) {
    case "computer": {
      const on = typeof data?.deviceName === "string" && data.deviceName.trim() ? ` on ${data.deviceName.trim()}` : "";
      const what = `${computerAction(data)}${on}`;
      return { title: `@${handle} wants to ${what}`, wants: `wants to ${what}`, approve: "Allow", discard: "Don't allow" };
    }
    case "sudo": {
      const on = typeof data?.deviceName === "string" && data.deviceName.trim() ? ` on ${data.deviceName.trim()}` : "";
      return { title: `@${handle} wants to run a command as administrator${on}`, wants: `wants to run a command as administrator${on}`, approve: "Run as administrator", discard: "Don't run" };
    }
    case "crew_add": {
      const slug = text(data?.nodeSlug, "");
      const who = slug ? `@${slug.replace(/^@/, "")}` : text(data?.nodeName, "another of your nodes");
      // The crew is the conversation it asks in, or, asked from elsewhere (its own chat), the crew it leads.
      const crew = text(data?.crewTitle, roomTitle);
      return { title: `@${handle} wants to add ${who} to ${crew === roomTitle ? "this crew" : `“${crew}”`}`, wants: `wants to add ${who} to “${crew}”`, approve: "Approve", discard: "Not now" };
    }
    case "post": {
      // A request the lead drafted in My crew: it reaches the room only when its owner sends it.
      if (data?.request) {
        const handle = text(data.request.to?.handle, "");
        const who = handle ? `@${handle.replace(/^@/, "")}` : text(data.request.to?.name, "someone");
        return { title: `Send this request to ${who}?`, wants: `drafted a request to ${who} for you to send`, approve: "Send request", discard: "Discard" };
      }
      // A result its work delivers to the room: built from the work's ledger, posted only when its owner says.
      if (data?.result) return { title: `Post this result in “${roomTitle}” for you?`, wants: "drafted a result for you to post", approve: "Post", discard: "Discard" };
      return data?.disclosure || data?.peerRequest
        ? { title: `Post this answer in “${roomTitle}” for you?`, wants: "drafted an answer for you to post", approve: "Post", discard: "Discard" }
        : { title: `Post this in “${roomTitle}” for you?`, wants: "wants to post for you", approve: "Post", discard: "Discard" };
    }
    case "session": {
      if (data?.action !== "hand_over") return { title: `@${handle} wants to start work on your computer`, wants: "wants to start work on your computer", approve: "Start it", discard: "Discard" };
      // Hand-over cards have no prompt or title: only the session, the node it goes to and a note.
      const to = text(data.input?.to, "");
      const who = to ? `@${to.replace(/^@/, "")}` : "another of your nodes";
      return { title: `@${handle} wants to hand a session to ${who}`, wants: `wants to hand a session to ${who}`, approve: "Hand it over", discard: "Discard" };
    }
    case "secret":
      return { title: `@${handle} needs a secret: ${text(data?.name, "a value")}`, wants: "needs a secret", approve: "Save", discard: "Decline" };
    case "login": {
      const where = `${text(data?.origin, "a site")}${typeof data?.computer === "string" && data.computer ? ` on ${data.computer}` : ""}`;
      return { title: `@${handle} needs you to sign in to ${where}`, wants: `needs you to sign in to ${where}`, approve: "Sign in", discard: "Not now" };
    }
    case "node_proposal":
      return data?.action === "crew"
        ? { title: `@${handle} proposes a crew`, wants: "proposes a crew", approve: "Make it", discard: "Discard" }
        : { title: `@${handle} proposes a new node`, wants: "proposes a new node", approve: "Make it", discard: "Discard" };
    case "media_preview": {
      const files = Array.isArray(data?.evidence) ? data.evidence.length : 0;
      const what = files > 1 ? `${files} captures` : "a capture";
      return { title: `@${handle} has ${what} for you to check first`, wants: `has ${what} for you to check first`, approve: "Send", discard: "Discard" };
    }
    case "peer_request": {
      const from = text(data?.from?.name, "Someone");
      const what = data?.kind === "review" ? "a review" : "work";
      return { title: `${from} asks you for ${what}`, wants: `brings you ${from}'s request for ${what}`, approve: "Accept", discard: "Decline" };
    }
    case "disclosure": {
      const asker = text(data?.asker?.name, "Someone");
      return data?.mode === "answer"
        ? { title: `${asker} asked @${handle} something`, wants: `asks before answering ${asker}`, approve: "Answer", discard: "Don't answer" }
        : { title: `May @${handle} share this with the room?`, wants: `asks before sharing with ${asker}`, approve: "Allow", discard: "Don't share" };
    }
    default:
      return { title: `@${handle} wants to do this for you`, wants: "wants to act for you", approve: "Approve", discard: "Discard" };
  }
}
