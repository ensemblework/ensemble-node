"use client";

/**
 * Cards in rooms with other people (rooms v2, Ensemble docs/35 §12): a peer request's public card and
 * the card its target decides on, a question about sharing something private, and the status cards
 * `@leads status` brings. Also a node's proposal of a new node or crew (§6.1). The owner's own cards
 * use the same frame as the other approval cards: what is asked, the answers, and what came of it.
 */
import Link from "next/link";
import { Check, CircleSlash, ExternalLink, Handshake, Lock, MessageSquareReply, Pencil, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cardWords } from "@/lib/cards";
import { useBootstrap, usePeerDecision, useSettle } from "@/lib/hooks";
import type { Badge } from "@/lib/plan";
import { candidateText, disclosureState, ownerCardState, requestKind, requestRole, requestState, requestUndecided, statusCardView } from "@/lib/rooms";
import { toast, toastError } from "@/lib/toast";
import type { Message, NodePublic, PeerKind, RequestCandidate, RequestRef, StatusCard } from "@/lib/types";
import { PersonAvatar } from "../node-avatar";
import { Button, External, Pill, Textarea } from "../ui";
import type { MessageContext } from "./message";
import { RichText } from "./rich-text";

/** The frame of a card only its owner sees: what it asks, that it is theirs alone, and where it stands. */
export function OwnerCard({ title, state, children }: { title: ReactNode; state: Badge; children: ReactNode }) {
  return (
    <div className="mt-1 rounded-2xl border border-warn/40 bg-warn/5 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 text-sm font-medium">{title}</span>
        <span className="flex items-center gap-2">
          <Pill tone="private">
            <Lock size={10} /> only you
          </Pill>
          <Pill tone={state.tone}>{state.label}</Pill>
        </span>
      </div>
      {children}
    </div>
  );
}

function Quote({ children }: { children: ReactNode }) {
  return <div className="whitespace-pre-wrap break-words rounded-lg border-l-2 border-line bg-bg/70 px-2.5 py-1.5 text-sm">{children}</div>;
}

function Candidate({ candidate }: { candidate: RequestCandidate | null | undefined }) {
  const line = candidateText(candidate);
  if (!line) return null;
  return (
    <p className="break-words text-xs text-muted">
      <span className="font-medium text-ink/80">Candidate:</span>{" "}
      {candidate?.url && !candidate.commit ? (
        <External href={candidate.url} icon className="text-accent hover:underline">
          {candidate.url}
        </External>
      ) : (
        <span className="font-mono">{line}</span>
      )}
    </p>
  );
}

function Refs({ refs }: { refs: RequestRef[] | null | undefined }) {
  if (!refs?.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="About">
      {refs.map((ref, at) => (
        <li key={`${ref.kind}-${ref.id ?? at}`} className="max-w-full">
          {ref.url ? (
            <External href={ref.url} className="inline-flex max-w-full items-center gap-1 rounded-lg border border-line bg-bg px-2 py-0.5 text-xs hover:border-accent">
              <span className="truncate">{ref.title}</span> <ExternalLink size={10} className="shrink-0 text-muted" aria-hidden />
            </External>
          ) : (
            <span className="inline-flex max-w-full items-center rounded-lg border border-line bg-bg px-2 py-0.5 text-xs">
              <span className="truncate">{ref.title}</span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

type RequestData = {
  requestId: string;
  kind: PeerKind;
  status: string;
  text: string;
  refs?: RequestRef[] | null;
  candidate?: RequestCandidate | null;
  from: { accountId: string; name: string; handle?: string | null; nodeId?: string | null; nodeHandle?: string | null };
  to: { accountId: string; name: string; handle?: string | null; leadNodeId?: string | null; leadHandle?: string | null };
  answer?: string | null;
  answerMessageId?: string | null;
  outcome?: string | null;
  requirements?: Array<{ text: string; status: string }>;
};

const OUTCOME: Record<string, Badge> = {
  succeeded: { label: "Succeeded", tone: "ok" },
  partially_completed: { label: "Partly done", tone: "warn" },
  failed: { label: "Failed", tone: "danger" },
  stopped: { label: "Stopped", tone: "muted" },
};

/**
 * A peer request's public card (kind `request`), kept current in place: who asked whom, what, and how it
 * stands; the answer or the outcome when there is one. Its asker can cancel it while it is undecided; the
 * person asked decides on their own card in My crew.
 */
export function RequestCard({ message, ctx }: { message: Message; ctx: MessageContext }) {
  const data = message.data as RequestData;
  const decide = usePeerDecision(message.roomId);
  const role = requestRole(data, ctx.meId);
  const undecided = requestUndecided(data.status);
  const state = requestState(data.status, role === "to" ? "you" : (data.to?.name ?? "them"));
  const request = ctx.requestOf?.(data.requestId);
  const lead = data.to?.leadHandle ? `@${data.to.leadHandle}` : "their lead";
  const outcome = data.outcome ? (OUTCOME[data.outcome] ?? { label: data.outcome.replace(/_/g, " "), tone: "muted" as const }) : null;
  const cancel = () => {
    if (!confirm("Cancel this request? Its card says it was cancelled.")) return;
    decide.mutate({ requestId: data.requestId, action: "cancel", cardId: message.id }, { onSuccess: () => toast("Request cancelled.", "ok"), onError: toastError });
  };
  return (
    <div className="space-y-2 rounded-2xl border border-line bg-panel px-3 py-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <Handshake size={14} className="text-accent" aria-hidden />
        <span className="font-semibold uppercase tracking-wide">{requestKind(data.kind)}</span>
        <Pill tone={state.tone}>{state.label}</Pill>
        <span className="min-w-0">
          {role === "from" ? "You asked" : `${data.from?.name ?? "Someone"} asked`} {role === "to" ? "you" : (data.to?.name ?? "someone")}
          {data.from?.nodeHandle ? ` · through @${data.from.nodeHandle}` : ""}
        </span>
      </div>
      <RichText text={data.text ?? ""} handles={ctx.handles} small />
      <Candidate candidate={data.candidate} />
      <Refs refs={data.refs} />
      {data.answer ? (
        <div className="rounded-lg bg-bg/70 px-2.5 py-1.5 text-sm">
          <span className="text-xs font-medium text-muted">{data.status === "declined" ? "Declined: " : "Answer: "}</span>
          <span className="whitespace-pre-wrap break-words">{data.answer}</span>
        </div>
      ) : null}
      {outcome ? (
        <div className="space-y-1">
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
            Outcome <Pill tone={outcome.tone}>{outcome.label}</Pill>
          </p>
          {data.requirements?.length ? (
            <ul className="space-y-0.5 text-xs text-muted" aria-label="Requirements">
              {data.requirements.map((row, at) => (
                <li key={at} className="break-words">
                  {row.text} · {row.status.replace(/_/g, " ")}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {decide.error ? <p className="text-sm text-danger">{decide.error.message}</p> : null}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {data.answerMessageId ? (
          <Button size="sm" tone="ghost" onClick={() => ctx.onJump(data.answerMessageId!)}>
            <MessageSquareReply size={13} /> See the answer
          </Button>
        ) : null}
        {role === "to" && data.status === "awaiting_owner" ? (
          request?.ownerCardId ? (
            <Button size="sm" onClick={() => ctx.onJump(request.ownerCardId!)}>
              Decide in My crew
            </Button>
          ) : (
            <span className="text-xs text-muted">Your card for it is in My crew.</span>
          )
        ) : role === "to" && data.status === "open" ? (
          <span className="text-xs text-muted">{lead === "their lead" ? "Your lead" : lead} answers it here, with only what this room may see.</span>
        ) : role === "from" && data.status === "open" ? (
          <span className="text-xs text-muted">{lead} answers it here, or asks {data.to?.name ?? "them"} first.</span>
        ) : null}
        {request?.missionId && role === "to" && (data.status === "approved" || data.status === "done") ? (
          <Button size="sm" tone="ghost" onClick={() => ctx.onJump(request.missionId!)}>
            Open its plan
          </Button>
        ) : null}
        {role === "from" && undecided ? (
          <Button size="sm" tone="quiet" busy={decide.isPending} onClick={cancel}>
            <X size={13} /> Cancel request
          </Button>
        ) : null}
      </div>
    </div>
  );
}

type OwnerRequestData = {
  status: string;
  requestId: string;
  kind: PeerKind;
  text: string;
  refs?: RequestRef[] | null;
  candidate?: RequestCandidate | null;
  from: { accountId: string; name: string };
  nodes?: Array<{ handle: string; name: string; role: string; lead: boolean }>;
  cost?: string;
  note?: string | null;
  error?: string | null;
};

/**
 * The card the person asked decides on, in their My crew: who asks for what, which of their nodes would
 * do it and what it costs. Accept (as asked or edited, and optionally always for this person), or
 * decline with a note.
 */
export function RequestOwnerCard({ message, ctx, node }: { message: Message; ctx: MessageContext; node?: NodePublic }) {
  const data = message.data as OwnerRequestData;
  const decide = usePeerDecision(message.roomId);
  const words = cardWords(data, node?.slug ?? "node", ctx.roomTitle);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(data.text ?? "");
  const [always, setAlways] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const pending = data.status === "pending";
  const kind = data.kind === "review" ? "reviews" : "work";
  const error = decide.error?.message ?? data.error ?? null;
  const accept = () =>
    decide.mutate(
      { requestId: data.requestId, action: "accept", ...(editing && text.trim() && text.trim() !== data.text ? { text: text.trim() } : {}), ...(always ? { always: true } : {}), cardId: message.id },
      { onSuccess: () => toast(`Accepted. ${node ? `@${node.slug}` : "Your lead"} plans it with your nodes.`, "ok") },
    );
  const decline = () => decide.mutate({ requestId: data.requestId, action: "decline", ...(note.trim() ? { note: note.trim() } : {}), cardId: message.id }, { onSuccess: () => toast("Declined. The room's card says so.", "ok") });
  const request = ctx.requestOf?.(data.requestId);
  return (
    <OwnerCard title={words.title} state={ownerCardState(data.status)}>
      <div className="space-y-2">
        {editing && pending ? (
          <Textarea aria-label="The request, as you accept it" value={text} onChange={(event) => setText(event.target.value)} rows={Math.min(8, Math.max(3, text.split("\n").length + 1))} maxLength={4000} />
        ) : (
          <Quote>{data.text}</Quote>
        )}
        <Candidate candidate={data.candidate} />
        <Refs refs={data.refs} />
        {data.nodes?.length ? (
          <p className="text-xs text-muted">
            <span className="font-medium text-ink/80">Your nodes here:</span> {data.nodes.map((row) => `@${row.handle}${row.lead ? " (lead)" : ""}`).join(", ")}
          </p>
        ) : null}
        {data.cost && pending ? <p className="text-xs text-muted">{data.cost}</p> : null}
        {data.note ? <p className="text-xs text-muted">Your note: {data.note}</p> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {pending ? (
          declining ? (
            <div className="space-y-2">
              <Textarea aria-label="A note for them (optional)" placeholder={`A note for ${data.from?.name ?? "them"} (optional)`} value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={500} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" tone="danger" busy={decide.isPending} onClick={decline}>
                  <CircleSlash size={13} /> Decline
                </Button>
                <Button size="sm" tone="quiet" disabled={decide.isPending} onClick={() => setDeclining(false)}>
                  Back
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-xs text-muted">
                <input type="checkbox" className="mt-0.5 accent-[rgb(var(--accent))]" checked={always} onChange={(event) => setAlways(event.target.checked)} />
                <span>
                  Always accept {kind} from {data.from?.name ?? "them"} in this room
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" busy={decide.isPending && decide.variables?.action === "accept"} disabled={decide.isPending || (editing && !text.trim())} onClick={accept}>
                  <Check size={13} /> {editing ? "Accept as edited" : "Accept"}
                </Button>
                {editing ? null : (
                  <Button size="sm" tone="ghost" disabled={decide.isPending} onClick={() => setEditing(true)}>
                    <Pencil size={13} /> Edit
                  </Button>
                )}
                <Button size="sm" tone="ghost" disabled={decide.isPending} onClick={() => setDeclining(true)}>
                  <CircleSlash size={13} /> Decline
                </Button>
              </div>
            </div>
          )
        ) : data.status === "accepted" && request?.missionId ? (
          <Button size="sm" tone="ghost" onClick={() => ctx.onJump(request.missionId!)}>
            Open its plan
          </Button>
        ) : null}
      </div>
    </OwnerCard>
  );
}

type DisclosureData = { mode: "share" | "answer"; status: string; asker: { accountId: string; name: string }; question: string; need: string; shared?: string | null; why?: string | null; error?: string | null };

/**
 * A lead's question to its owner before it shares something private with the room (or answers in its
 * own words): who asked what, and what it would share. Allow, and its drafted answer comes as the usual
 * "Post this for you?" card; don't, and the room is told only that you chose not to.
 */
export function DisclosureCard({ message, ctx, node }: { message: Message; ctx: MessageContext; node?: NodePublic }) {
  const data = message.data as DisclosureData;
  const settle = useSettle();
  const words = cardWords(data, node?.slug ?? "node", ctx.roomTitle);
  const share = data.mode !== "answer";
  const pending = data.status === "pending";
  const asker = data.asker?.accountId === ctx.meId ? "You" : (data.asker?.name ?? "Someone");
  const error = settle.error?.message ?? data.error ?? null;
  return (
    <OwnerCard title={words.title} state={disclosureState(data.status, data.mode)}>
      <div className="space-y-2">
        <p className="text-sm">
          <span className="text-muted">{asker} asked:</span> “{data.question}”
        </p>
        {share ? (
          <p className="text-sm">
            <span className="text-muted">May {node ? `@${node.slug}` : "your lead"} share:</span> {data.need}?
          </p>
        ) : (
          <p className="text-xs text-muted">Answering in its own words uses your credits.</p>
        )}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {pending ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" busy={settle.isPending && settle.variables?.decision === "approve"} disabled={settle.isPending} onClick={() => settle.mutate({ messageId: message.id, decision: "approve" })}>
              <Check size={13} /> {words.approve}
            </Button>
            <Button size="sm" tone="ghost" busy={settle.isPending && settle.variables?.decision === "discard"} disabled={settle.isPending} onClick={() => settle.mutate({ messageId: message.id, decision: "discard" })}>
              <CircleSlash size={13} /> {words.discard}
            </Button>
          </div>
        ) : data.status === "approved" ? (
          data.shared ? (
            <Button size="sm" tone="ghost" onClick={() => ctx.onJump(data.shared!)}>
              See it in the room
            </Button>
          ) : (
            <p className="text-xs text-muted">{share ? `${node ? `@${node.slug}` : "Your lead"} is writing the answer. It comes to you as a draft to post.` : `${node ? `@${node.slug}` : "Your lead"} answers in the room.`}</p>
          )
        ) : data.status === "declined" ? (
          <p className="text-xs text-muted">The room was told only that you chose not to {share ? "share" : "answer"}.</p>
        ) : data.why ? (
          <p className="text-xs text-muted">{data.why}</p>
        ) : null}
      </div>
    </OwnerCard>
  );
}

type ProposalData = {
  status: string;
  action: "node" | "crew";
  input: { name?: string; role?: string; charter?: string; templateId?: string; title?: string; members?: string[]; lead?: string };
  error?: string | null;
  result?: { summary?: string; nodeId?: string; handle?: string; roomId?: string } | null;
};

const PROPOSAL: Record<string, Badge> = {
  pending: { label: "Waiting for you", tone: "warn" },
  applying: { label: "Making it…", tone: "accent" },
  applied: { label: "Made", tone: "ok" },
  discarded: { label: "Discarded", tone: "muted" },
};

/** A node proposes a new node or crew (its owner asked for it, or it needs one): make it, or discard it. */
export function NodeProposalCard({ message, ctx, node }: { message: Message; ctx: MessageContext; node?: NodePublic }) {
  const data = message.data as ProposalData;
  const settle = useSettle();
  const boot = useBootstrap();
  const [more, setMore] = useState(false);
  const words = cardWords(data, node?.slug ?? "node", ctx.roomTitle);
  const pending = data.status === "pending";
  const input = data.input ?? {};
  const error = settle.error?.message ?? data.error ?? null;
  const madeChat = data.result?.nodeId ? boot.data?.rooms.find((room) => room.kind === "dm" && room.members.some((member) => member.kind === "node" && member.node.id === data.result!.nodeId)) : undefined;
  const madeRoom = data.result?.roomId ?? madeChat?.id;
  const charter = input.charter?.trim() ?? "";
  return (
    <OwnerCard title={words.title} state={PROPOSAL[data.status] ?? { label: data.status, tone: "muted" }}>
      <div className="space-y-2">
        {data.action === "crew" ? (
          <div className="rounded-lg bg-bg/70 px-2.5 py-2 text-sm">
            <p className="font-medium">{input.title}</p>
            <p className="mt-0.5 text-xs text-muted">
              {(input.members ?? []).map((handle) => `@${handle}${handle === input.lead ? " (lead)" : ""}`).join(", ")}
            </p>
          </div>
        ) : (
          <div className="rounded-lg bg-bg/70 px-2.5 py-2 text-sm">
            <p>
              <span className="font-medium">{input.name}</span>
              {input.role ? <span className="text-muted"> · {input.role}</span> : null}
            </p>
            {charter ? (
              <div className="mt-1">
                <div className={more ? "" : "line-clamp-3"}>
                  <RichText text={charter} handles={ctx.handles} small />
                </div>
                {charter.length > 180 ? (
                  <button type="button" onClick={() => setMore(!more)} className="mt-0.5 text-xs text-accent hover:underline" aria-expanded={more}>
                    {more ? "Show less" : "Show its charter"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {pending ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" busy={settle.isPending && settle.variables?.decision === "approve"} disabled={settle.isPending} onClick={() => settle.mutate({ messageId: message.id, decision: "approve" })}>
              <Check size={13} /> {words.approve}
            </Button>
            <Button size="sm" tone="ghost" busy={settle.isPending && settle.variables?.decision === "discard"} disabled={settle.isPending} onClick={() => settle.mutate({ messageId: message.id, decision: "discard" })}>
              <CircleSlash size={13} /> {words.discard}
            </Button>
          </div>
        ) : data.status === "applied" ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-ok">
            <span>{data.action === "crew" ? `Made the crew “${input.title}”.` : `Made @${data.result?.handle ?? input.name}.`}</span>
            {madeRoom ? (
              <Link href={`/r/${madeRoom}`} className="text-accent hover:underline">
                {data.action === "crew" ? "Open the crew" : "Open its chat"}
              </Link>
            ) : null}
          </p>
        ) : null}
      </div>
    </OwnerCard>
  );
}

/** Online, away or offline, as a dot beside a name (its words are in the card or a title). */
export function PresenceDot({ presence }: { presence: string }) {
  const tone = presence === "online" ? "bg-ok" : presence === "away" ? "bg-warn" : "bg-muted/50";
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${tone}`} aria-hidden />;
}

/** One person's status card: presence, away, and their work here at the detail they chose. */
export function StatusCardView({ card, meId }: { card: StatusCard; meId: string }) {
  const view = statusCardView(card);
  return (
    <li className="min-w-0 rounded-xl border border-line bg-bg/60 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <PersonAvatar name={card.name} size={24} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <span className="truncate">{card.accountId === meId ? `${card.name} (you)` : card.name}</span>
            <PresenceDot presence={card.presence} />
            <span className="sr-only">{view.presence.label}</span>
          </span>
          {card.lead ? <span className="block truncate text-[11px] text-muted">lead @{card.lead.handle}</span> : null}
        </span>
        <Pill tone={view.presence.tone}>{view.presence.label}</Pill>
      </div>
      {view.away ? <p className="mt-1.5 text-xs text-warn">{view.away}</p> : null}
      {view.note ? <p className="mt-1.5 text-xs text-muted">{view.note}</p> : null}
      {view.missions.length ? (
        <ul className="mt-2 space-y-1.5" aria-label="Missions">
          {view.missions.map((mission, at) => (
            <li key={at} className="text-sm">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="min-w-0 break-words">{mission.title}</span>
                <Pill tone={mission.status.tone}>{mission.status.label}</Pill>
              </span>
              {mission.steps ? <span className="block text-[11px] text-muted">{mission.steps}</span> : null}
              {mission.requirements.length ? (
                <ul className="mt-0.5 space-y-0.5 pl-3 text-[11px] text-muted">
                  {mission.requirements.map((row, index) => (
                    <li key={index} className="break-words">
                      {row.text} · <span className={row.status.tone === "ok" ? "text-ok" : row.status.tone === "danger" ? "text-danger" : ""}>{row.status.label.toLowerCase()}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {view.tasks.length ? (
        <ul className="mt-2 space-y-0.5 text-xs text-muted" aria-label="Tasks">
          {view.tasks.map((task, at) => (
            <li key={at} className="break-words">
              <span className="text-ink/90">{task.title}</span> · {task.status}
              {task.due ? ` · due ${task.due.slice(0, 10)}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** `@leads status`, answered by Ensemble without a model: every person's card, side by side. */
export function StatusCardsMessage({ message, ctx }: { message: Message; ctx: MessageContext }) {
  const cards: StatusCard[] = Array.isArray(message.data?.cards) ? message.data.cards : [];
  return (
    <section aria-label="Status of everyone here" className="rounded-2xl border border-line bg-panel px-3 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-semibold uppercase tracking-wide">Status</span>
        <span>{cards.length === 1 ? "1 person" : `${cards.length} people`}</span>
        {message.private ? (
          <Pill tone="private">
            <Lock size={10} /> only you
          </Pill>
        ) : null}
      </div>
      {cards.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {cards.map((card) => (
            <StatusCardView key={card.accountId} card={card} meId={ctx.meId} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{message.body || "Nobody shares a status here."}</p>
      )}
    </section>
  );
}
