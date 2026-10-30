"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ClipboardPaste, CornerDownLeft, Delete, Lock, MonitorSmartphone, Square, X } from "lucide-react";
import { api } from "@/lib/api";
import { endedText, keyEvent, pointOnFrame, TakeoverSession, type InputEvent, type TakeoverSource } from "@/lib/takeover";
import type { Message } from "@/lib/types";
import { Button, Spinner } from "./ui";

type Phase = { kind: "opening" } | { kind: "live" } | { kind: "ending" } | { kind: "ended"; text: string } | { kind: "error"; text: string };

const BUTTONS: Record<number, "left" | "middle" | "right"> = { 0: "left", 1: "middle", 2: "right" };

/**
 * A tab of the owner's computer, controlled from here (lib/takeover.ts, Ensemble docs/35 §8.16.2):
 * frames drawn on a canvas, the mouse, taps, scrolling and keys sent back, a text box and Paste for
 * phones, I'm done (the computer checks the sign-in) and Stop. Everything is encrypted between this page
 * and the computer; while it lasts, no node or model sees the tab.
 */
export function TakeoverView({ source, site, computer, onClose }: { source: TakeoverSource; site: string; computer: string; onClose: (result: { signedIn: boolean | null; card?: Message }) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const session = useRef<TakeoverSession | null>(null);
  const size = useRef({ width: 0, height: 0 });
  const touch = useRef<{ x: number; y: number; id: number; moved: boolean } | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "opening" });
  const [url, setUrl] = useState("");
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const send = useCallback((events: InputEvent[]) => session.current?.send(events), []);
  const opened = useRef({ source, computer });

  useEffect(() => {
    const control = new AbortController();
    const current = new TakeoverSession(api, opened.current.source);
    const name = opened.current.computer;
    session.current = current;
    // Opened on the next tick, so a mount React undoes at once never opens one.
    const timer = setTimeout(() => void (async () => {
      try {
        await current.open(window.location.origin);
        if (control.signal.aborted) {
          void current.end(false).catch(() => undefined);
          return;
        }
        setPhase({ kind: "live" });
        canvas.current?.focus();
        while (!control.signal.aborted) {
          const next = await current.next(control.signal);
          if (next.ended) {
            setPhase({ kind: "ended", text: endedText(next.ended, name) });
            return;
          }
          if (!next.frame || !canvas.current) continue;
          const bitmap = await createImageBitmap(new Blob([next.frame.jpeg as BlobPart], { type: "image/jpeg" }));
          const target = canvas.current;
          if (!target) return;
          if (target.width !== bitmap.width || target.height !== bitmap.height) {
            target.width = bitmap.width;
            target.height = bitmap.height;
          }
          target.getContext("2d")?.drawImage(bitmap, 0, 0);
          bitmap.close();
          size.current = { width: next.frame.width || bitmap.width, height: next.frame.height || bitmap.height };
          setUrl(next.frame.url);
        }
      } catch (error) {
        if (control.signal.aborted) return;
        setPhase({ kind: "error", text: error instanceof Error ? error.message : String(error) });
      }
    })(), 0);
    return () => {
      clearTimeout(timer);
      control.abort();
      // Leaving the view stops it: nobody controls the tab from a page that is gone.
      if (session.current === current && current.info) void current.end(false).catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const point = pointOnFrame(event.clientX, event.clientY, target.getBoundingClientRect(), size.current);
      if (point) send([{ t: "wheel", ...point, dx: Math.round(event.deltaX), dy: Math.round(event.deltaY) }]);
    };
    target.addEventListener("wheel", wheel, { passive: false });
    return () => target.removeEventListener("wheel", wheel);
  }, [send]);

  const finish = async (done: boolean) => {
    const current = session.current;
    if (!current) return onClose({ signedIn: null });
    setPhase({ kind: "ending" });
    try {
      const result = await current.end(done);
      session.current = null;
      onClose({ signedIn: result.signedIn, card: result.card as Message | undefined });
    } catch (error) {
      session.current = null;
      setPhase({ kind: "error", text: error instanceof Error ? error.message : String(error) });
    }
  };

  const at = (event: { clientX: number; clientY: number }) => (canvas.current ? pointOnFrame(event.clientX, event.clientY, canvas.current.getBoundingClientRect(), size.current) : null);

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) send([{ t: "text", text: text.slice(0, 2000) }]);
      else setNote("The clipboard is empty.");
    } catch {
      setNote("This browser would not read the clipboard: paste into the box below instead.");
    }
  };

  const live = phase.kind === "live";
  const view = (
    <div role="dialog" aria-modal="true" aria-label={`Control the browser on ${computer}`} className="fixed inset-0 z-50 flex flex-col bg-bg/95 backdrop-blur" data-takeover={phase.kind}>
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <MonitorSmartphone size={16} className="shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {site} on {computer}
          </p>
          <p className="truncate text-xs text-muted">{url || "Waiting for the first picture…"}</p>
        </div>
        <Button size="sm" tone="ghost" aria-label="Close" onClick={() => void finish(false)} disabled={phase.kind === "ending"}>
          <X size={14} />
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center p-2">
        {phase.kind === "opening" ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Spinner className="h-4 w-4" /> Opening the browser on {computer}…
          </p>
        ) : phase.kind === "ended" || phase.kind === "error" ? (
          <div className="max-w-sm space-y-3 text-center">
            <p className={`text-sm ${phase.kind === "error" ? "text-danger" : "text-muted"}`}>{phase.text}</p>
            <Button size="sm" tone="ghost" onClick={() => onClose({ signedIn: null })}>
              Close
            </Button>
          </div>
        ) : null}
        <canvas
          ref={canvas}
          tabIndex={0}
          aria-label={`The tab on ${computer}. Click, type and scroll here.`}
          className={`max-h-full max-w-full touch-none rounded-lg border border-line bg-panel outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${live || phase.kind === "ending" ? "" : "hidden"}`}
          style={{ width: "auto", height: "auto", maxHeight: "100%", objectFit: "contain" }}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => {
            const point = at(event);
            if (!point) return;
            canvas.current?.focus();
            if (event.pointerType === "touch") {
              touch.current = { x: event.clientX, y: event.clientY, id: event.pointerId, moved: false };
              return;
            }
            event.currentTarget.setPointerCapture(event.pointerId);
            send([{ t: "mouse", type: "move", ...point }, { t: "mouse", type: "down", ...point, button: BUTTONS[event.button] ?? "left", clicks: event.detail > 1 ? Math.min(event.detail, 3) : 1 }]);
          }}
          onPointerMove={(event) => {
            const point = at(event);
            if (!point) return;
            if (event.pointerType === "touch") {
              const start = touch.current;
              if (!start || start.id !== event.pointerId) return;
              const dy = start.y - event.clientY;
              const dx = start.x - event.clientX;
              if (Math.abs(dx) + Math.abs(dy) > 8) {
                start.moved = true;
                send([{ t: "wheel", ...point, dx: Math.round(dx * 2), dy: Math.round(dy * 2) }]);
                touch.current = { ...start, x: event.clientX, y: event.clientY };
              }
              return;
            }
            send([{ t: "mouse", type: "move", ...point }]);
          }}
          onPointerUp={(event) => {
            const point = at(event);
            if (event.pointerType === "touch") {
              const start = touch.current;
              touch.current = null;
              if (point && start && !start.moved) send([{ t: "mouse", type: "move", ...point }, { t: "mouse", type: "down", ...point }, { t: "mouse", type: "up", ...point }]);
              return;
            }
            if (point) send([{ t: "mouse", type: "up", ...point, button: BUTTONS[event.button] ?? "left", clicks: event.detail > 1 ? Math.min(event.detail, 3) : 1 }]);
          }}
          onKeyDown={(event) => {
            const key = keyEvent("down", event.nativeEvent);
            if (!key) return;
            event.preventDefault();
            send([key]);
          }}
          onKeyUp={(event) => {
            const key = keyEvent("up", event.nativeEvent);
            if (!key) return;
            event.preventDefault();
            send([key]);
          }}
        />
      </div>
      <footer className="space-y-2 border-t border-line px-3 py-2">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!typed) return;
            send([{ t: "text", text: typed }]);
            setTyped("");
          }}
        >
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="send"
            aria-label="Type into the tab"
            placeholder="Type here, then Send (for phones)"
            disabled={!live}
            className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <Button type="submit" size="sm" tone="ghost" disabled={!live || !typed}>
            Send
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" tone="ghost" disabled={!live} onClick={() => void paste()}>
            <ClipboardPaste size={14} /> Paste
          </Button>
          <Button size="sm" tone="ghost" disabled={!live} aria-label="Tab key" onClick={() => send([{ t: "key", type: "down", key: "Tab" }, { t: "key", type: "up", key: "Tab" }])}>
            Tab
          </Button>
          <Button size="sm" tone="ghost" disabled={!live} aria-label="Enter key" onClick={() => send([{ t: "key", type: "down", key: "Enter" }, { t: "key", type: "up", key: "Enter" }])}>
            <CornerDownLeft size={14} />
          </Button>
          <Button size="sm" tone="ghost" disabled={!live} aria-label="Backspace key" onClick={() => send([{ t: "key", type: "down", key: "Backspace" }, { t: "key", type: "up", key: "Backspace" }])}>
            <Delete size={14} />
          </Button>
          <span className="flex-1" />
          <Button size="sm" tone="ghost" disabled={phase.kind === "ending" || phase.kind === "opening"} busy={phase.kind === "ending"} onClick={() => void finish(false)}>
            <Square size={13} /> Stop
          </Button>
          <Button size="sm" disabled={!live} busy={phase.kind === "ending"} onClick={() => void finish(true)}>
            <Check size={14} /> I&apos;m done
          </Button>
        </div>
        {note ? <p className="text-xs text-warn">{note}</p> : null}
        <p className="flex items-start gap-1.5 text-xs text-muted">
          <Lock size={12} className="mt-0.5 shrink-0 text-ok" />
          <span>Encrypted between this browser and {computer}: Ensemble&apos;s server passes it on without being able to see or change it. Nodes and models see nothing of this tab while you control it.</span>
        </p>
      </footer>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(view, document.body);
}
