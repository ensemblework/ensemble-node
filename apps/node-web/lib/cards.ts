/**
 * A node's owner-only cards (approval messages) in words: what the card asks and what its two answers
 * are called, the same in a conversation and in Needs me. Held writes, drafts, work on the computer
 * (starting or sending to a session, or handing one to another node) and secrets; a proposed node or
 * crew; and in rooms with other people, a request for work or a review, and a question about sharing
 * something private (Ensemble docs/35 §6.1, §8.9, §12.4, §12.6).
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
  [key: string]: unknown;
} | null | undefined;

export type CardWords = {
  /** The card's title in the conversation. */
  title: string;
  /** What the node wants, after its handle, in Needs me. */
  wants: string;
  approve: string;
  discard: string;
};

const text = (value: unknown, fallback: string) => (typeof value === "string" && value.trim() ? value.trim() : fallback);

/** A card's title, Needs me line and answers. `handle` is the node's, `roomTitle` the conversation's. */
export function cardWords(data: CardData, handle: string, roomTitle: string): CardWords {
  const type = text(data?.type, "tools");
  switch (type) {
    case "post":
      return data?.disclosure || data?.peerRequest
        ? { title: `Post this answer in “${roomTitle}” for you?`, wants: "drafted an answer for you to post", approve: "Post", discard: "Discard" }
        : { title: `Post this in “${roomTitle}” for you?`, wants: "wants to post for you", approve: "Post", discard: "Discard" };
    case "session": {
      if (data?.action !== "hand_over") return { title: `@${handle} wants to start work on your computer`, wants: "wants to start work on your computer", approve: "Start it", discard: "Discard" };
      // Hand-over cards have no prompt or title: only the session, the node it goes to and a note.
      const to = text(data.input?.to, "");
      const who = to ? `@${to.replace(/^@/, "")}` : "another of your nodes";
      return { title: `@${handle} wants to hand a session to ${who}`, wants: `wants to hand a session to ${who}`, approve: "Hand it over", discard: "Discard" };
    }
    case "secret":
      return { title: `@${handle} needs a secret: ${text(data?.name, "a value")}`, wants: "needs a secret", approve: "Save", discard: "Decline" };
    case "node_proposal":
      return data?.action === "crew"
        ? { title: `@${handle} proposes a crew`, wants: "proposes a crew", approve: "Make it", discard: "Discard" }
        : { title: `@${handle} proposes a new node`, wants: "proposes a new node", approve: "Make it", discard: "Discard" };
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
