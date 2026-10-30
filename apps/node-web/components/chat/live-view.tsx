"use client";

/**
 * A working run's browser tab, live (Ensemble docs/35 §8.16): about every 3 seconds the computer sends
 * a small picture of the tab its agent uses, for its owner only. A small picture with the page's title
 * and address, larger on a tap; larger, it offers Take over when the computer can show its browser here
 * (§8.16.2), for that very tab. Paused, it says why (a sign-in, a private site, a secret on screen); while
 * signing in it points to the sign-in card. Nothing shows when the computer sends none.
 */
import Link from "next/link";
import { MonitorSmartphone, PauseCircle } from "lucide-react";
import { useState } from "react";
import { livePausedWords, pageAddress } from "@/lib/captures";
import { useLiveView, useRunLoginCard } from "@/lib/hooks";
import { requestJump } from "@/lib/jump";
import type { LiveFrame } from "@/lib/types";
import { Button } from "../ui";

const TAKE_OVER_HINT = "Control this tab from here, encrypted end to end; the agent cannot use it meanwhile.";

export function LiveView({ jobId, enabled, onTakeOver }: { jobId: string; enabled: boolean; onTakeOver?: (frame: LiveFrame) => void }) {
  const live = useLiveView(jobId, enabled);
  const [large, setLarge] = useState(false);
  const frame = live.data;
  // A sign-in (or a takeover) makes the tab sensitive; a sign-in has its card, wherever the run is followed.
  const signIn = useRunLoginCard(frame?.paused === "sensitive" ? jobId : null);
  if (!frame) return null;
  const address = pageAddress(frame.url);
  const title = frame.title || address;
  if (!frame.image) {
    return (
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-line bg-bg/60 px-2.5 py-1.5 text-xs text-muted" role="status" data-live="paused">
        <PauseCircle size={14} className="shrink-0" aria-hidden />
        <span className="shrink-0 font-medium text-ink/80">{livePausedWords(frame.paused)}</span>
        {title ? <span className="min-w-[7rem] flex-1 truncate">· {title}</span> : <span className="flex-1" />}
        {frame.paused === "sensitive" ? (
          signIn ? (
            <Link href={`/r/${signIn.roomId}#m-${signIn.id}`} onClick={() => requestJump(signIn.roomId, signIn.id)} className="shrink-0 font-medium text-accent hover:underline">
              Go to its sign-in card
            </Link>
          ) : null
        ) : onTakeOver ? (
          <button type="button" onClick={() => onTakeOver(frame)} title={TAKE_OVER_HINT} className="inline-flex shrink-0 items-center gap-1 font-medium text-accent hover:underline">
            <MonitorSmartphone size={12} aria-hidden /> Take over
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <section aria-label="Live view" data-live="picture" className={`mt-2 rounded-xl border border-line bg-bg/60 p-1.5 ${large ? "space-y-1.5" : "flex items-center gap-2.5"}`}>
      <button
        type="button"
        onClick={() => setLarge(!large)}
        aria-expanded={large}
        aria-label={large ? "Show the live view smaller" : "Show the live view larger"}
        style={{ aspectRatio: frame.width && frame.height ? `${frame.width} / ${frame.height}` : "16 / 10" }}
        className={`relative block shrink-0 overflow-hidden rounded-lg border border-line bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 ${large ? "w-full max-w-2xl" : "w-28 sm:w-36"}`}
      >
        <img src={frame.image} alt={title ? `Live view of ${title}` : "Live view of the agent's browser tab"} className="h-full w-full object-cover object-top" />
        <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded bg-black/65 px-1 py-px text-[10px] font-semibold uppercase tracking-wide text-white">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger motion-reduce:animate-none" aria-hidden />
          Live
        </span>
      </button>
      <div className={`min-w-0 ${large ? "px-1 pb-0.5" : "flex-1"}`}>
        <p className="truncate text-[13px] font-medium" title={frame.title ?? undefined}>
          {title ?? "The agent's browser"}
        </p>
        {address && address !== title ? (
          <p className="truncate text-[11px] text-muted" title={frame.url ?? undefined}>
            {address}
          </p>
        ) : null}
        {large && onTakeOver ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Button size="sm" tone="ghost" onClick={() => onTakeOver(frame)}>
              <MonitorSmartphone size={13} /> Take over
            </Button>
            <span className="text-[11px] text-muted">{TAKE_OVER_HINT}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
