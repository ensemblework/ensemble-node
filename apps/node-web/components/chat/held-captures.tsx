"use client";

/**
 * Captures the owner's computer held for them to check before anything uses them (Ensemble docs/35
 * §8.16, `data.type: "media_preview"`): a saved secret or something key-shaped on screen, a desktop
 * app's window, a site they asked to see first. The files stay on the computer: each preview is read
 * from there for the owner only, never kept by the browser. Send uploads them (then a node may show
 * them, and a run's card has them); Discard deletes them on the computer too. With several files, each
 * can be answered on its own; the card settles when all are.
 */
import { Check, CircleSlash, Download, EyeOff, Film, FileText, Image as ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { download, evidenceBlob, type ApiError } from "@/lib/api";
import { sizeLabel } from "@/lib/attachments";
import { cardWords } from "@/lib/cards";
import { heldReasons, heldState } from "@/lib/captures";
import { durationLabel, evidenceErrorWords, evidenceItems, evidenceKind, evidencePath, evidenceShow } from "@/lib/evidence";
import { useReleaseHeld, useSettle } from "@/lib/hooks";
import { toastError } from "@/lib/toast";
import type { EvidenceItem, Message, NodePublic } from "@/lib/types";
import { Button, Spinner } from "../ui";
import { forgetPictures, usePicture } from "./evidence";
import type { MessageContext } from "./message";
import { OwnerCard } from "./owner-card";

type Answer = "released" | "discarded";

const DISCARD_ALL = "Discard these captures? They are deleted on your computer too.";
const DISCARD_ONE = "Discard this capture? It is deleted on your computer too.";

/** A held video read whole from the computer, played from memory; let go when the preview closes. */
function useHeldVideo(id: string) {
  const [state, setState] = useState<{ url: string } | { error: string; status: number } | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    let url: string | null = null;
    void evidenceBlob(id, abort.signal).then(
      (blob) => {
        url = URL.createObjectURL(blob);
        setState({ url });
      },
      (error: ApiError | Error) => {
        if (abort.signal.aborted) return;
        const status = "status" in error && typeof error.status === "number" ? error.status : 0;
        setState({ error: error.message || evidenceErrorWords(status), status });
      },
    );
    return () => {
      abort.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  return state;
}

function Fetching() {
  return (
    <p className="flex items-center gap-2 py-3 text-xs text-muted" role="status">
      <Spinner className="h-3.5 w-3.5" /> Fetching it from your computer…
    </p>
  );
}

function HeldPicture({ id, name }: { id: string; name: string }) {
  const shown = usePicture(id, true, null);
  if (!shown) return <Fetching />;
  if ("error" in shown) return <p className="py-2 text-xs text-danger">{shown.error}</p>;
  return <img src={shown.url} alt={`Preview of ${name}`} className="max-h-[60vh] w-auto max-w-full rounded-lg border border-line bg-black/40 object-contain" />;
}

function HeldVideo({ item }: { item: EvidenceItem }) {
  const shown = useHeldVideo(item.id);
  const [poster, setPoster] = useState(false);
  if (!shown) return <Fetching />;
  if ("url" in shown) return <video src={shown.url} controls playsInline preload="metadata" aria-label={`Preview of ${item.name}`} className="max-h-[60vh] w-full rounded-lg bg-black" />;
  return (
    <div className="space-y-2 py-1">
      <p className={`text-xs ${shown.status === 413 ? "text-muted" : "text-danger"}`}>{shown.error}</p>
      {shown.status === 413 && item.poster ? (
        poster ? (
          <HeldPicture id={item.poster} name={`${item.name}'s poster`} />
        ) : (
          <Button size="sm" tone="ghost" onClick={() => setPoster(true)}>
            Preview its poster
          </Button>
        )
      ) : null}
    </div>
  );
}

function HeldPreview({ item }: { item: EvidenceItem }) {
  const show = evidenceShow(item);
  if (show === "image") return <HeldPicture id={item.id} name={item.name} />;
  if (show === "video") return <HeldVideo item={item} />;
  return (
    <Button
      size="sm"
      tone="ghost"
      onClick={() => {
        void download(evidencePath(item.id), item.name).catch(toastError);
      }}
    >
      <Download size={13} /> Download it to look at it
    </Button>
  );
}

const ICON = { image: ImageIcon, video: Film, download: FileText } as const;

function HeldFile({ item, answer, open, onToggle, single, waiting, pending, onAnswer, busy, error }: { item: EvidenceItem; answer: Answer | null; open: boolean; onToggle: () => void; single: boolean; waiting: boolean; pending: boolean; onAnswer: (decision: "approve" | "discard") => void; busy: "approve" | "discard" | null; error: string | null }) {
  const Icon = ICON[evidenceShow(item)];
  const facts = [evidenceKind(item.kind), durationLabel(item.durationMs), typeof item.size === "number" ? sizeLabel(item.size) : null].filter(Boolean).join(" · ");
  return (
    <li className="rounded-xl border border-line bg-bg/70 p-2" data-held={item.id}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-raised text-muted">
          <Icon size={16} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{item.name}</span>
          <span className="block truncate text-[11px] text-muted">{answer === "released" ? "Sent" : answer === "discarded" ? "Discarded" : facts}</span>
        </span>
        {answer ? (
          answer === "released" ? <Check size={15} className="shrink-0 text-ok" aria-label="Sent" role="img" /> : <CircleSlash size={15} className="shrink-0 text-muted" aria-label="Discarded" role="img" />
        ) : waiting ? (
          <Button size="sm" tone="ghost" onClick={onToggle} aria-expanded={open} aria-label={`${open ? "Hide" : "Preview"} ${item.name}`}>
            {open ? <EyeOff size={13} /> : null}
            {open ? "Hide" : "Preview"}
          </Button>
        ) : null}
      </div>
      {open && waiting && !answer ? (
        <div className="mt-2 space-y-2">
          <HeldPreview item={item} />
          {pending && !single ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" busy={busy === "approve"} disabled={Boolean(busy)} onClick={() => onAnswer("approve")}>
                <Check size={13} /> Send this one
              </Button>
              <Button size="sm" tone="ghost" busy={busy === "discard"} disabled={Boolean(busy)} onClick={() => onAnswer("discard")}>
                <CircleSlash size={13} /> Discard this one
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="mt-1.5 text-xs text-danger">{error}</p> : null}
    </li>
  );
}

/** The held files with why they are held, each previewed on request (while the card waits) and answerable on its own. */
export function HeldFiles({ card }: { card: Message }) {
  const data = card.data;
  const files = evidenceItems(data.evidence);
  const reasons = heldReasons(data);
  const release = useReleaseHeld();
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [answered, setAnswered] = useState<ReadonlyMap<string, Answer>>(new Map());
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map());
  const pending = data.status === "pending";
  const waiting = pending || data.status === "applying";
  const result = (data.result ?? {}) as { released?: unknown; discarded?: unknown };
  // Answered here, else as the settled card says; a file answered on its own before the card settled may be in neither.
  const answerOf = (id: string): Answer | null => {
    const here = answered.get(id);
    if (here) return here;
    if (Array.isArray(result.released) && result.released.includes(id)) return "released";
    if (Array.isArray(result.discarded) && result.discarded.includes(id)) return "discarded";
    return null;
  };
  const answer = (item: EvidenceItem, decision: "approve" | "discard") => {
    if (decision === "discard" && !confirm(DISCARD_ONE)) return;
    setErrors((current) => new Map([...current].filter(([id]) => id !== item.id)));
    release.mutate(
      { id: item.id, decision },
      {
        onSuccess: (done) => {
          if (done.discarded.length) forgetPictures([item.id, ...(item.poster ? [item.poster] : [])]);
          setAnswered((current) => new Map([...current, ...done.released.map((id) => [id, "released"] as const), ...done.discarded.map((id) => [id, "discarded"] as const)]));
        },
        onError: (error) => setErrors((current) => new Map([...current, [item.id, error.message]])),
      },
    );
  };
  return (
    <div className="space-y-2">
      {reasons.length === 1 ? (
        <p className="text-sm">{reasons[0]}</p>
      ) : (
        <ul className="list-disc space-y-0.5 pl-5 text-sm">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      <ul className="space-y-1.5" aria-label="Held captures">
        {files.map((item) => (
          <HeldFile
            key={item.id}
            item={item}
            answer={answerOf(item.id)}
            open={open.has(item.id)}
            onToggle={() => setOpen((current) => (current.has(item.id) ? new Set([...current].filter((id) => id !== item.id)) : new Set([...current, item.id])))}
            single={files.length < 2}
            waiting={waiting}
            pending={pending}
            onAnswer={(decision) => answer(item, decision)}
            busy={release.isPending && release.variables?.id === item.id ? release.variables.decision : null}
            error={errors.get(item.id) ?? null}
          />
        ))}
      </ul>
    </div>
  );
}

/** Send or Discard every file on the card (`POST /api/node/approvals/:id`); Discard asks first. */
export function HeldActions({ card, settle, approve, discard, size = "md" }: { card: Message; settle: ReturnType<typeof useSettle>; approve: string; discard: string; size?: "sm" | "md" }) {
  const files = evidenceItems(card.data.evidence);
  return (
    <>
      <Button size={size} busy={settle.isPending && settle.variables?.decision === "approve"} disabled={settle.isPending} onClick={() => settle.mutate({ messageId: card.id, decision: "approve" })}>
        <Check size={size === "sm" ? 14 : 16} /> {approve}
      </Button>
      <Button
        size={size}
        tone="ghost"
        busy={settle.isPending && settle.variables?.decision === "discard"}
        disabled={settle.isPending}
        onClick={() => {
          if (!confirm(files.length > 1 ? DISCARD_ALL : DISCARD_ONE)) return;
          settle.mutate({ messageId: card.id, decision: "discard" }, { onSuccess: () => forgetPictures(files.flatMap((item) => [item.id, ...(item.poster ? [item.poster] : [])])) });
        }}
      >
        <CircleSlash size={size === "sm" ? 14 : 16} /> {discard}
      </Button>
    </>
  );
}

/** The held card in its conversation (owner only). */
export function HeldCapturesCard({ message, ctx, node }: { message: Message; ctx: MessageContext; node?: NodePublic }) {
  const settle = useSettle();
  const data = message.data;
  const handle = node?.slug ?? "node";
  const words = cardWords(data, handle, ctx.roomTitle);
  const files = evidenceItems(data.evidence);
  const pending = data.status === "pending";
  const many = files.length > 1;
  const error = settle.error?.message ?? (typeof data.error === "string" && data.error ? data.error : null);
  return (
    <OwnerCard title={words.title} state={heldState(settle.isPending ? "applying" : data.status)}>
      <div className="space-y-2.5">
        <HeldFiles card={message} />
        {typeof data.planId === "string" && data.planId ? (
          <button type="button" onClick={() => ctx.onJump(data.planId)} className="text-xs text-accent hover:underline">
            See the plan
          </button>
        ) : null}
        {error && pending ? <p className="text-sm text-danger">{error}</p> : null}
        {pending ? (
          <>
            <p className="text-xs text-muted">Nothing goes to a model or into a chat until you send {many ? "them" : "it"}.</p>
            <div className="flex flex-wrap items-center gap-2">
              <HeldActions card={message} settle={settle} approve={words.approve} discard={words.discard} />
            </div>
          </>
        ) : data.status === "released" ? (
          <p className="text-xs text-muted">{data.nodeCapture ? `Sent. @${handle} may show ${many ? "them" : "it"} now.` : `Sent: ${many ? "they are" : "it is"} on the run's card now.`}</p>
        ) : data.status === "discarded" ? (
          <p className="text-xs text-muted">Discarded: deleted on your computer too.</p>
        ) : null}
      </div>
    </OwnerCard>
  );
}
