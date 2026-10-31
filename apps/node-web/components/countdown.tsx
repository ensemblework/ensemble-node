"use client";

import { Clock3 } from "lucide-react";
import { useEffect, useState } from "react";
import { COUNTDOWN_WARN_MS, countdownText, countdownWords, timeLeft } from "@/lib/countdown";

/** The time now, ticking every `ms` while `active`. */
export function useNow(active = true, ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [active, ms]);
  return now;
}

/** Milliseconds left until `until`, ticking each second; null when there is no end. */
export function useTimeLeft(until: string | null | undefined, active = true): number | null {
  const now = useNow(active && Boolean(until));
  return timeLeft(until, now);
}

/**
 * A visible timer to an end: "⏱ 14:32 left", warning under two minutes. `what` finishes the sentence for
 * screen readers ("to sign in").
 */
export function Countdown({ left, what, className = "" }: { left: number | null; what: string; className?: string }) {
  if (left === null) return null;
  const warn = left < COUNTDOWN_WARN_MS;
  return (
    <span
      role="timer"
      aria-label={`${countdownWords(left)} ${what}`}
      title={`${countdownWords(left)} ${what}`}
      data-countdown={countdownText(left)}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] tabular-nums ${warn ? "border-warn/60 bg-warn/10 text-warn" : "border-line bg-bg/60 text-muted"} ${className}`}
    >
      <Clock3 size={11} aria-hidden /> {left > 0 ? `${countdownText(left)} left` : "Time's up"}
    </span>
  );
}
