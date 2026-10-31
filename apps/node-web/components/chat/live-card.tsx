"use client";

/**
 * A node's live terminal or browser on the owner's computer (Ensemble docs/35, live sessions), on a
 * card only the owner sees: "Live terminal on Studio", "Live browser: Pricing — Fieldnote". Open shows
 * it live in the remote view (the same sealed channel): a terminal's screen, which the owner can type
 * in too (it is their shell); a browser, watched, with Take control and Hand back. The node keeps
 * using it. When the computer ends it the card says so and folds into its checkpoint.
 */
import { MonitorPlay, SquareTerminal } from "lucide-react";
import { useEffect, useState } from "react";
import { remoteAsked } from "@/lib/login";
import { liveBadge, liveKind, liveLine, liveOpen, liveTitle, type LiveCardData } from "@/lib/live-session";
import type { Message } from "@/lib/types";
import { TakeoverView } from "../takeover-view";
import { Button } from "../ui";
import { OwnerCard } from "./owner-card";

const clock = (value: unknown) => {
  const time = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? new Date(time).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : null;
};

export function LiveCard({ message, handle }: { message: Message; handle: string }) {
  const data = message.data as LiveCardData;
  const open = liveOpen(data);
  const kind = liveKind(data);
  const [viewing, setViewing] = useState(false);
  const computer = typeof data.computer === "string" && data.computer.trim() ? data.computer.trim() : "your computer";
  const started = clock(data.startedAt);
  const ended = clock(data.endedAt);
  const Icon = kind === "terminal" ? SquareTerminal : MonitorPlay;

  // Opened from the card's link with `?remote=1`: it shows at once, once.
  useEffect(() => {
    if (!open || !remoteAsked(window.location.search, window.location.hash, message.id)) return;
    const params = new URLSearchParams(window.location.search);
    params.delete("remote");
    const rest = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
    setViewing(true);
  }, [open, message.id]);

  return (
    <OwnerCard title={liveTitle(data)} state={liveBadge(data)}>
      <div className="space-y-2.5" data-live-card={open ? "open" : "ended"} data-live-kind={kind}>
        <p className="flex items-start gap-2 text-sm">
          <Icon size={15} className={`mt-0.5 shrink-0 ${open ? "text-accent" : "text-muted"}`} aria-hidden />
          <span className={open ? "" : "text-muted"}>{liveLine(data, handle)}</span>
        </p>
        <p className="text-xs text-muted">
          On {computer}
          {started ? ` · started ${started}` : ""}
          {!open && ended ? ` · ended ${ended}` : ""}
        </p>
        {open ? (
          <Button size="sm" onClick={() => setViewing(true)} disabled={viewing}>
            <Icon size={14} /> Open
          </Button>
        ) : null}
      </div>
      {viewing ? (
        <TakeoverView
          source={{ liveCardId: message.id }}
          kind={kind}
          site={kind === "terminal" ? "Terminal" : typeof data.title === "string" && data.title.trim() ? data.title.trim() : "The node's browser"}
          computer={computer}
          onClose={() => setViewing(false)}
        />
      ) : null}
    </OwnerCard>
  );
}
