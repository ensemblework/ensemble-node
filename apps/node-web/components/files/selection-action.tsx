"use client";

import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useState } from "react";
import { Quote } from "lucide-react";
import type { EditorView } from "@codemirror/view";
import type { FileQuote } from "@/lib/original-files";
import { toastError } from "@/lib/toast";
import { Spinner } from "../ui";

export function SelectionAction({ view, quote, onQuote }: { view: EditorView | null; quote: FileQuote | null; onQuote: (quote: FileQuote) => Promise<void> }) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(true);
  useEffect(() => {
    if (!view) return;
    const update = () => queueMicrotask(() => setFocused(view.hasFocus || Boolean(document.activeElement?.closest('[aria-label="Selected file text actions"]'))));
    view.dom.addEventListener("focusin", update);
    view.dom.addEventListener("focusout", update);
    return () => { view.dom.removeEventListener("focusin", update); view.dom.removeEventListener("focusout", update); };
  }, [view]);
  useLayoutEffect(() => {
    if (!view || !quote) { setPosition(null); return; }
    const place = () => {
      const selection = view.state.selection.main;
      const start = view.coordsAtPos(selection.from), end = view.coordsAtPos(selection.to);
      const bounds = view.dom.getBoundingClientRect();
      const anchor = start && start.top >= bounds.top && start.top <= bounds.bottom ? start
        : end && end.top >= bounds.top && end.top <= bounds.bottom ? end
          : { left: bounds.left + 48, top: bounds.top + 12, bottom: bounds.top + 30 };
      setPosition({ left: Math.max(8, Math.min(window.innerWidth - 156, anchor.left)), top: anchor.top >= bounds.top + 44 ? anchor.top - 42 : anchor.bottom + 5 });
    };
    place();
    view.scrollDOM.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => { view.scrollDOM.removeEventListener("scroll", place); window.removeEventListener("resize", place); };
  }, [view, quote]);
  useEffect(() => {
    if (!view || !quote) return;
    const shortcut = (event: KeyboardEvent) => {
      if (!busy && event.altKey && event.key === "Enter" && view.hasFocus) {
        event.preventDefault(); setBusy(true);
        void onQuote(quote).catch(toastError).finally(() => setBusy(false));
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [view, quote, busy, onQuote]);
  if (!quote || !position || !focused) return null;
  const large = quote.text.length > 12_000;
  return createPortal(<div role="toolbar" aria-label="Selected file text actions" className="fixed z-40 rounded-xl border border-line bg-panel p-1 shadow-xl" style={position}>
    <button type="button" aria-label="Quote selection" title={large ? "Select at most 12,000 characters" : "Ask the last editor about these lines (Alt+Enter)"} disabled={busy || large}
      onPointerDown={event => event.preventDefault()}
      onClick={() => { setBusy(true); void onQuote(quote).catch(toastError).finally(() => setBusy(false)); }}
      className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-accent hover:bg-raised disabled:opacity-50">
      {busy ? <Spinner className="!size-3" /> : <Quote size={15} aria-hidden />}Ask about selection
    </button>
  </div>, document.body);
}
