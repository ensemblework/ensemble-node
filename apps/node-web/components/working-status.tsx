"use client";

import { useEffect, useRef, useState } from "react";
import { useVisibleMotion } from "./appearance-provider";
import { BrandMotion } from "./brand-motion";

const PHRASES = ["Thinking it through", "Connecting the dots", "Working on it", "Putting it together"];

export function WorkingStatus({ writing = false }: { writing?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const visible = useVisibleMotion(ref);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!visible || writing) return;
    const timer = setInterval(() => setIndex(current => (current + 1) % PHRASES.length), 5200);
    return () => clearInterval(timer);
  }, [visible, writing]);
  return <span ref={ref} className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted">
    <span className="sr-only" role="status">{writing ? "Writing a reply" : "Working on your request"}</span>
    <span aria-hidden className="inline-flex items-center gap-1.5"><BrandMotion size={16} kind="threadline" /><span key={writing ? "writing" : index} className={visible ? "working-words" : undefined}>{writing ? "Writing a reply" : PHRASES[visible ? index : 0]}<span className="text-accent">…</span></span></span>
  </span>;
}
