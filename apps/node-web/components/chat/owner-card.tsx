"use client";

/**
 * The frame of every card only its owner sees, and its checkpoint. While a card waits for its owner it
 * is open and stands out ("Waiting for you"); once answered it folds into a checkpoint chip in the chat,
 * one line saying what was decided, which opens back into the card, read only (lib/checkpoints.ts).
 */
import { AlertTriangle, Check, ChevronDown, Clock3, Lock, X } from "lucide-react";
import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { cardCheckpoint, cardOpen, withLocalAnswer, type Checkpoint } from "@/lib/checkpoints";
import { useLocalAnswer } from "@/lib/hooks";
import type { Badge } from "@/lib/plan";
import type { Message } from "@/lib/types";
import { Pill } from "../ui";

/** Set around a settled card opened from its checkpoint: it shows as a record, not as a question. */
const Settled = createContext(false);

/** The frame of a card only its owner sees: what it asks, that it is theirs alone, and where it stands. */
export function OwnerCard({ title, state, children }: { title: ReactNode; state: Badge; children: ReactNode }) {
  const settled = useContext(Settled);
  // An open card in the warning tone waits for its owner; one being carried out has its own tone.
  const waiting = !settled && state.tone === "warn";
  return (
    <div
      data-owner-card={waiting ? "waiting" : settled ? "settled" : "open"}
      className={`mt-1 rounded-2xl border p-3 ${waiting ? "border-warn/60 bg-warn/[0.07] shadow-[inset_3px_0_0_rgb(var(--warn))]" : settled ? "border-line bg-panel/60" : "border-warn/40 bg-warn/5"}`}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 break-words text-sm font-medium">{title}</span>
        <span className="flex items-center gap-2">
          <Pill tone="private">
            <Lock size={10} aria-hidden /> only you
          </Pill>
          <Pill tone={state.tone}>
            {waiting ? <span className="h-1.5 w-1.5 rounded-full bg-warn motion-safe:animate-pulse" aria-hidden /> : null}
            {state.label}
          </Pill>
        </span>
      </div>
      {children}
    </div>
  );
}

const ICONS = { check: Check, x: X, alert: AlertTriangle, clock: Clock3 } as const;
const TONES: Record<Checkpoint["tone"], string> = { ok: "bg-ok/15 text-ok", muted: "bg-raised text-muted", danger: "bg-danger/15 text-danger", warn: "bg-warn/15 text-warn" };

/** One checkpoint: a small round icon and one line; a button that opens what it stands for when there is more. */
export function CheckpointChip({ point, expanded, onToggle, controls, privateMark = false }: { point: Checkpoint; expanded?: boolean; onToggle?: () => void; controls?: string; privateMark?: boolean }) {
  const Icon = ICONS[point.icon];
  const content = (
    <>
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${TONES[point.tone]}`}>
        <Icon size={12} strokeWidth={2.5} aria-hidden />
      </span>
      <span className="line-clamp-2 min-w-0 break-words text-left">{point.text}</span>
      {privateMark ? (
        <span className="shrink-0 text-private" title="Only you see this">
          <Lock size={11} aria-hidden />
          <span className="sr-only">(only you)</span>
        </span>
      ) : null}
      {onToggle ? <ChevronDown size={13} className={`shrink-0 text-muted transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`} aria-hidden /> : null}
    </>
  );
  const style = "inline-flex min-h-8 max-w-full items-center gap-2 rounded-[14px] border border-line bg-panel/80 py-1 pl-1.5 pr-2.5 text-[13px] leading-snug text-ink/90";
  if (!onToggle) return <span className={style} data-checkpoint-chip>{content}</span>;
  return (
    <button type="button" data-checkpoint-chip aria-expanded={expanded} aria-controls={controls} onClick={onToggle} className={`${style} transition hover:border-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60`}>
      {content}
    </button>
  );
}

/**
 * A card in the chat: open while it waits for its owner (or its answer is being carried out), else its
 * checkpoint, which opens into the card read only. An answer given here shows at once, before Ensemble
 * updates the card (`useLocalAnswer`). The card stays mounted while folded, so what was answered on it
 * piece by piece is kept when it opens again.
 */
export function CardCheckpoint({ message, handle, roomTitle, children }: { message: Message; handle: string; roomTitle: string; children: (message: Message) => ReactNode }) {
  const local = useLocalAnswer(message.id);
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const data = withLocalAnswer(message.data, local);
  const shown = data === message.data ? message : { ...message, data };
  const settled = !cardOpen(data);
  return (
    <div className={settled ? "mt-0.5" : ""} data-checkpoint={settled ? message.id : undefined}>
      {settled ? <CheckpointChip point={cardCheckpoint(data, { handle, roomTitle })} expanded={expanded} onToggle={() => setExpanded(!expanded)} controls={id} privateMark /> : null}
      <div id={id} hidden={settled && !expanded}>
        <Settled.Provider value={settled}>{children(shown)}</Settled.Provider>
      </div>
    </div>
  );
}
