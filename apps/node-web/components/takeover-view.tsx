"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ClipboardPaste, CornerDownLeft, Delete, Eye, EyeOff, Hand, Lock, MonitorSmartphone, MousePointerClick, Plus, Square, SquareTerminal, WifiOff, X } from "lucide-react";
import { api } from "@/lib/api";
import { canExtend } from "@/lib/countdown";
import { endedText, fitFrame, HOLD_MS, keyEvent, keyPress, pageLabel, pointOnFrame, reconnectDelay, retryable, takeoverControls, takeoverKind, TakeoverSession, TouchGesture, typingEvents, unsupported, type InputEvent, type NextFrame, type PageInfo, type TakeoverInfo, type TakeoverKind, type TakeoverSource } from "@/lib/takeover";
import type { TerminalScreen } from "@/lib/terminal";
import type { Message } from "@/lib/types";
import { Countdown, useTimeLeft } from "./countdown";
import { TerminalKeys, TerminalStage } from "./terminal-view";
import { Button, Spinner } from "./ui";

type Phase = { kind: "opening" } | { kind: "live" } | { kind: "reconnecting"; offline: boolean } | { kind: "ending" } | { kind: "ended"; text: string; done: boolean } | { kind: "error"; text: string };

/** The card the view was opened for, once settled: done (signed in, passed), or not, in its words. */
export type RemoteSettled = { done: boolean; text: string };

const BUTTONS: Record<number, "left" | "middle" | "right"> = { 0: "left", 1: "middle", 2: "right" };
/** A frames request waits up to 20 s on the server; one that takes much longer lost its connection. */
const FRAMES_TIMEOUT_MS = 35_000;
/** About three minutes of trying again before the view gives up on the connection. */
const MAX_RECONNECTS = 24;

/** Waits `ms`, or less when the network comes back or the view closes. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener("online", done);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    window.addEventListener("online", done);
    signal.addEventListener("abort", done);
  });
}

/**
 * The remote view: a page on the owner's computer, shown and controlled from this browser, on a phone
 * as on a laptop (lib/takeover.ts, Ensemble docs/35 §8.16.2). For a sign-in or a human check it is a
 * clean browser on the computer; for a run, the run's tab; for a live card, the node's terminal or
 * browser, live (the node keeps using it). The picture fits the width; a tap clicks, a drag scrolls and
 * a finger kept still presses and holds ("Press and hold" checks); the mouse, the wheel and the keyboard
 * work as usual. A box types into the page as you type, each key at once, with Enter, Tab, Backspace,
 * Esc and Paste. The header names the site shown ("accounts.google.com — popup") and the time left,
 * with "+15 min" in its last five minutes. A live browser starts watched: Take control to click and
 * type (the node waits on that tab), Hand back to let it go on. A terminal shows its screen and types
 * into the shell. I'm done asks the computer to check a sign-in; Stop ends it. When the card it was
 * opened for is settled the view says so and closes itself; a lost connection is tried again.
 * Everything is encrypted between this page and the computer; while a sign-in lasts, no node or model
 * sees the page.
 */
export function TakeoverView({
  source,
  site,
  computer,
  kind: expected = "browser",
  settled = null,
  onEnded,
  onClose,
}: {
  source: TakeoverSource;
  site: string;
  computer: string;
  /** What a live card says it shows, until the computer says. */
  kind?: TakeoverKind;
  settled?: RemoteSettled | null;
  /** The takeover ended without this page ending it (the computer finished it, its time ran out): the card may have changed. */
  onEnded?: (reason: string) => void;
  onClose: (result: { signedIn: boolean | null; card?: Message }) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const session = useRef<TakeoverSession | null>(null);
  const loop = useRef<AbortController | null>(null);
  const size = useRef({ width: 0, height: 0 });
  const touch = useRef<{ id: number; gesture: TouchGesture; timer: ReturnType<typeof setTimeout> | null } | null>(null);
  const typedRef = useRef("");
  const box = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "opening" });
  const [page, setPage] = useState<PageInfo | null>(null);
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);
  const [room, setRoom] = useState<{ width: number; height: number } | null>(null);
  const [hidden, setHidden] = useState(false);
  const [holding, setHolding] = useState<{ x: number; y: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [coarse, setCoarse] = useState(false);
  const [viewport, setViewport] = useState<{ top: number; height: number } | null>(null);
  const [info, setInfo] = useState<TakeoverInfo | null>(null);
  const [screen, setScreen] = useState<TerminalScreen | null>(null);
  const [pending, setPending] = useState(0);
  const [extend, setExtend] = useState<{ busy: boolean; supported: boolean; error: string | null }>({ busy: false, supported: true, error: null });
  const [switching, setSwitching] = useState(false);
  /** Keys typed on the picture itself, shown at once while the page catches up. */
  const [echo, setEcho] = useState("");

  const live = "liveCardId" in source;
  const kind = takeoverKind(info, expected);
  const terminal = kind === "terminal";
  // A live browser starts watched (until the computer says otherwise); a terminal is the owner's shell, so it always types.
  const controls = terminal || (live ? info !== null && takeoverControls(info) : takeoverControls(info));
  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  const send = useCallback((events: InputEvent[]) => {
    if (controlsRef.current) session.current?.send(events);
  }, []);
  const press = useCallback((key: string) => send(keyPress(key)), [send]);
  const opened = useRef({ source, computer, onEnded, kind: expected });
  opened.current.onEnded = onEnded;
  const left = useTimeLeft(info?.endsAt ?? null, Boolean(info?.endsAt));

  // The box is the browser's own (not redrawn by React on each key), so what is typed shows at once.
  const clearTyped = () => {
    typedRef.current = "";
    if (box.current) box.current.value = "";
  };

  /** A finger still down lets the mouse go: before the view ends, so the computer gets it. */
  const releaseHold = (target: TakeoverSession | null) => {
    const held = touch.current;
    touch.current = null;
    if (held?.timer) clearTimeout(held.timer);
    if (held?.gesture.isHolding) target?.send(held.gesture.cancel());
    setHolding(null);
  };
  const releaseRef = useRef(releaseHold);
  releaseRef.current = releaseHold;

  useEffect(() => {
    const control = new AbortController();
    loop.current = control;
    const current = new TakeoverSession(api, opened.current.source);
    const name = opened.current.computer;
    session.current = current;
    // Only whether something is still on its way: the view does not draw again for every key.
    current.onPending = (count) => setPending(count > 0 ? 1 : 0);
    /** One frames request, cut off when the view closes or it takes far longer than the server waits. */
    const fetchNext = (): Promise<{ next: NextFrame } | { error: unknown }> => {
      const request = new AbortController();
      const cut = () => request.abort();
      control.signal.addEventListener("abort", cut);
      const slow = setTimeout(cut, FRAMES_TIMEOUT_MS);
      return current.next(request.signal).then(
        (next) => ({ next }),
        (error: unknown) => ({ error }),
      ).finally(() => {
        clearTimeout(slow);
        control.signal.removeEventListener("abort", cut);
      });
    };
    // Opened on the next tick, so a mount React undoes at once never opens one.
    const timer = setTimeout(() => void (async () => {
      if (control.signal.aborted) return;
      try {
        const started = await current.open(window.location.origin);
        setInfo(started);
        if (started.note) setNote(started.note);
      } catch (error) {
        if (!control.signal.aborted) setPhase({ kind: "error", text: error instanceof Error ? error.message : String(error) });
        return;
      }
      if (control.signal.aborted) {
        void current.end(false).catch(() => undefined);
        return;
      }
      setPhase((now) => (now.kind === "opening" ? { kind: "live" } : now));
      // Keys go to the picture or the terminal straight away, once it shows.
      const startedKind = takeoverKind(current.info, opened.current.kind);
      setTimeout(() => (startedKind === "terminal" ? stage.current?.querySelector<HTMLElement>("[data-terminal-screen]") : canvas.current)?.focus({ preventScroll: true }), 50);
      let attempt = 0;
      let ahead = fetchNext();
      while (!control.signal.aborted) {
        const answer = await ahead;
        if (control.signal.aborted) return;
        if ("error" in answer) {
          const error = answer.error;
          if (!retryable(error) || attempt >= MAX_RECONNECTS) {
            setPhase({ kind: "error", text: retryable(error) ? "The connection to your computer was lost. Open it again." : error instanceof Error ? error.message : String(error) });
            return;
          }
          setPhase((now) => (now.kind === "live" || now.kind === "reconnecting" ? { kind: "reconnecting", offline: typeof navigator !== "undefined" && navigator.onLine === false } : now));
          await pause(reconnectDelay(attempt), control.signal);
          attempt += 1;
          ahead = fetchNext();
          continue;
        }
        const next = answer.next;
        if (attempt) {
          attempt = 0;
          setPhase((now) => (now.kind === "reconnecting" ? { kind: "live" } : now));
        }
        if (next.ended) {
          const reason = next.ended;
          setPhase((now) => (now.kind === "ended" ? now : { kind: "ended", text: endedText(reason, name), done: reason === "signed_in" || reason === "passed" }));
          opened.current.onEnded?.(reason);
          return;
        }
        // Asked for the next frame at once, while this one is drawn: the line to the computer is never idle.
        ahead = fetchNext();
        if (next.terminal) {
          setScreen(next.terminal);
          setEcho("");
          continue;
        }
        if (next.page) {
          const shownPage = next.page;
          setPage((now) => (now && now.url === shownPage.url && now.title === shownPage.title && now.popup === shownPage.popup ? now : shownPage));
        }
        const shown = next.frame;
        if (!shown || !canvas.current) continue;
        let bitmap: ImageBitmap;
        try {
          bitmap = await createImageBitmap(new Blob([shown.jpeg as BlobPart], { type: "image/jpeg" }));
        } catch {
          continue;
        }
        const target = canvas.current;
        if (!target) return;
        if (target.width !== bitmap.width || target.height !== bitmap.height) {
          target.width = bitmap.width;
          target.height = bitmap.height;
        }
        target.getContext("2d")?.drawImage(bitmap, 0, 0);
        bitmap.close();
        setEcho("");
        // The page's size for pointer and scroll mapping; the picture's own for its shape on screen.
        size.current = { width: shown.width || target.width, height: shown.height || target.height };
        const drawn = { width: target.width, height: target.height };
        setFrame((now) => (now && now.width === drawn.width && now.height === drawn.height ? now : drawn));
      }
    })(), 0);
    return () => {
      clearTimeout(timer);
      control.abort();
      current.onPending = null;
      releaseRef.current(current);
      // Leaving the view stops it: nobody controls the page from a view that is gone.
      if (session.current === current && current.info) void current.end(false).catch(() => undefined);
    };
  }, []);

  // The card was settled (by the computer seeing it done, or elsewhere): say so; when it worked, close.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const settledDone = settled?.done ?? null;
  const settledText = settled?.text ?? "";
  useEffect(() => {
    if (settledDone === null) return;
    loop.current?.abort();
    setPhase({ kind: "ended", text: settledText, done: settledDone });
    if (!settledDone) return;
    const timer = setTimeout(() => onCloseRef.current({ signedIn: true }), 1800);
    return () => clearTimeout(timer);
  }, [settledDone, settledText]);

  // The picture as large as the space allows; on a phone, the whole width.
  useEffect(() => {
    const element = stage.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setRoom({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Phones: the sheet follows the visual viewport, so the keyboard never covers the box.
  useEffect(() => {
    setCoarse(window.matchMedia?.("(pointer: coarse)").matches ?? false);
    const visual = window.visualViewport;
    if (!visual) return;
    const update = () => setViewport(window.innerWidth < 768 ? { top: visual.offsetTop, height: visual.height } : null);
    update();
    visual.addEventListener("resize", update);
    visual.addEventListener("scroll", update);
    return () => {
      visual.removeEventListener("resize", update);
      visual.removeEventListener("scroll", update);
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
    loop.current?.abort();
    releaseHold(current);
    if (!current?.info) return onClose({ signedIn: null });
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

  /** "+15 min": more time from the server; an older one has no such route, so the button goes. */
  const addTime = async () => {
    const current = session.current;
    if (!current?.info) return;
    setExtend((now) => ({ ...now, busy: true, error: null }));
    try {
      setInfo(await current.extend());
      setExtend({ busy: false, supported: true, error: null });
    } catch (error) {
      setExtend(unsupported(error) ? { busy: false, supported: false, error: "This Ensemble cannot add time yet: open it again when it ends." } : { busy: false, supported: false, error: error instanceof Error ? error.message : String(error) });
    }
  };

  /** Take control of a live browser, or hand it back to the node. */
  const setControl = async (on: boolean) => {
    const current = session.current;
    if (!current?.info) return;
    setSwitching(true);
    setNote(null);
    try {
      if (!on) releaseHold(current);
      setInfo(await current.control(on));
      if (on) canvas.current?.focus({ preventScroll: true });
      else clearTyped();
    } catch (error) {
      setNote(unsupported(error) ? "This Ensemble cannot hand over control of a live browser yet." : error instanceof Error ? error.message : String(error));
    } finally {
      setSwitching(false);
    }
  };

  const at = (event: { clientX: number; clientY: number }) => (canvas.current ? pointOnFrame(event.clientX, event.clientY, canvas.current.getBoundingClientRect(), size.current) : null);
  const onStage = (event: { clientX: number; clientY: number }) => {
    const box = stage.current?.getBoundingClientRect();
    return box ? { x: event.clientX - box.left, y: event.clientY - box.top } : null;
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) send([{ t: "text", text: text.slice(0, 2000) }]);
      else setNote("The clipboard is empty.");
    } catch {
      setNote("This browser would not read the clipboard: paste into the box instead.");
    }
  };

  const active = phase.kind === "live" || phase.kind === "reconnecting";
  const typing = active && controls;
  const shown = phase.kind === "live" || phase.kind === "reconnecting" || phase.kind === "ending";
  const fitted = frame && room ? fitFrame(frame, room) : null;
  const label = terminal ? `Live terminal on ${computer}` : (pageLabel(page) ?? site);
  const subtitle = terminal ? [screen?.title, `on ${computer}`] : [page?.title, `on ${computer}`];
  const watching = live && !terminal && !controls;
  const view = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={terminal ? `Live terminal on ${computer}` : `${live ? "Live browser" : "Remote view"}: ${site} on ${computer}`}
      className="fixed inset-x-0 top-0 z-50 flex h-[100dvh] flex-col bg-bg"
      style={viewport ? { top: viewport.top, height: viewport.height } : undefined}
      data-takeover={phase.kind}
      data-takeover-kind={kind}
      data-takeover-mode={controls ? "control" : "watch"}
    >
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        {terminal ? <SquareTerminal size={16} className="shrink-0 text-accent" aria-hidden /> : <MonitorSmartphone size={16} className="shrink-0 text-accent" aria-hidden />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" data-remote-site>
            {label}
          </p>
          <p className="truncate text-xs text-muted">{subtitle.filter(Boolean).join(" · ")}</p>
        </div>
        {active && left !== null ? (
          <span className="flex shrink-0 items-center gap-1.5">
            <Countdown left={left} what="in this view" />
            {canExtend(left, extend.supported) ? (
              <Button size="sm" tone="ghost" busy={extend.busy} onClick={() => void addTime()} title="Keep it open 15 minutes more">
                <Plus size={13} /> 15 min
              </Button>
            ) : null}
          </span>
        ) : null}
        <Button size="sm" tone="quiet" aria-label="Close" onClick={() => void finish(false)} disabled={phase.kind === "ending"}>
          <X size={16} />
        </Button>
      </header>
      <div ref={stage} className="relative flex min-h-0 flex-1 items-start justify-center overflow-hidden">
        {phase.kind === "opening" ? (
          <p className="mt-16 flex items-center gap-2 px-4 text-sm text-muted">
            <Spinner className="h-4 w-4" /> Opening {terminal ? "the terminal" : site} on {computer}…
          </p>
        ) : null}
        {terminal && shown ? <TerminalStage screen={screen} computer={computer} onInput={send} dimmed={phase.kind === "reconnecting"} /> : null}
        {echo && !terminal && shown ? (
          <span className="pointer-events-none absolute bottom-2 left-1/2 max-w-[90%] -translate-x-1/2 truncate rounded-full border border-line bg-panel/90 px-3 py-1 font-mono text-xs text-ink shadow" data-remote-echo aria-hidden>
            {hidden ? "•".repeat(Math.min(echo.length, 24)) : echo.slice(-32)}
          </span>
        ) : null}
        <canvas
          ref={canvas}
          tabIndex={0}
          aria-label={`The page on ${computer}. Click, type and scroll here.`}
          className={`block touch-none select-none bg-panel outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60 ${shown && !terminal ? "" : "hidden"} ${phase.kind === "reconnecting" ? "opacity-60" : ""} ${watching ? "cursor-default" : ""}`}
          style={{ width: fitted ? `${fitted.width}px` : "100%", height: fitted ? `${fitted.height}px` : "auto", WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => {
            const point = at(event);
            if (!point || !typing) return;
            if (event.pointerType === "touch") {
              if (touch.current) return;
              const box = event.currentTarget.getBoundingClientRect();
              const gesture = new TouchGesture({ client: { x: event.clientX, y: event.clientY }, page: point }, box.width ? size.current.width / box.width : 1);
              const where = onStage(event);
              const timer = setTimeout(() => {
                const events = gesture.hold();
                if (!events.length) return;
                send(events);
                setHolding(where);
                navigator.vibrate?.(15);
              }, HOLD_MS);
              touch.current = { id: event.pointerId, gesture, timer };
              return;
            }
            canvas.current?.focus({ preventScroll: true });
            event.currentTarget.setPointerCapture(event.pointerId);
            clearTyped();
            send([{ t: "mouse", type: "move", ...point }, { t: "mouse", type: "down", ...point, button: BUTTONS[event.button] ?? "left", clicks: event.detail > 1 ? Math.min(event.detail, 3) : 1 }]);
          }}
          onPointerMove={(event) => {
            if (event.pointerType === "touch") {
              const held = touch.current;
              if (!held || held.id !== event.pointerId) return;
              const events = held.gesture.move({ x: event.clientX, y: event.clientY }, at(event));
              if (!held.gesture.still && held.timer) {
                clearTimeout(held.timer);
                held.timer = null;
              }
              if (held.gesture.isHolding) setHolding(onStage(event));
              send(events);
              return;
            }
            const point = at(event);
            if (point) send([{ t: "mouse", type: "move", ...point }]);
          }}
          onPointerUp={(event) => {
            if (event.pointerType === "touch") {
              const held = touch.current;
              if (!held || held.id !== event.pointerId) return;
              touch.current = null;
              if (held.timer) clearTimeout(held.timer);
              const events = held.gesture.up();
              // A tap is a click: the page's focus moves, so the box starts afresh.
              if (events.some((item) => item.t === "mouse" && item.type === "down")) clearTyped();
              send(events);
              setHolding(null);
              return;
            }
            const point = at(event);
            if (point) send([{ t: "mouse", type: "up", ...point, button: BUTTONS[event.button] ?? "left", clicks: event.detail > 1 ? Math.min(event.detail, 3) : 1 }]);
          }}
          onPointerCancel={(event) => {
            const held = touch.current;
            if (!held || held.id !== event.pointerId) return;
            touch.current = null;
            if (held.timer) clearTimeout(held.timer);
            send(held.gesture.cancel());
            setHolding(null);
          }}
          onKeyDown={(event) => {
            if (!typing) return;
            const key = keyEvent("down", event.nativeEvent);
            if (!key) return;
            event.preventDefault();
            send([key]);
            if (key.t === "key" && key.key.length === 1 && !event.ctrlKey && !event.metaKey) setEcho((now) => (now + key.key).slice(-64));
            else if (key.t === "key" && key.key === "Backspace") setEcho((now) => now.slice(0, -1));
          }}
          onKeyUp={(event) => {
            if (!typing) return;
            const key = keyEvent("up", event.nativeEvent);
            if (!key) return;
            event.preventDefault();
            send([key]);
          }}
        />
        {holding ? (
          <span data-remote-holding className="pointer-events-none absolute h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-accent/20 motion-safe:animate-pulse" style={{ left: holding.x, top: holding.y }} aria-hidden />
        ) : null}
        {phase.kind === "reconnecting" ? (
          <p className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-warn/50 bg-panel px-3 py-1.5 text-xs text-warn shadow-lg" role="status">
            <WifiOff size={13} aria-hidden /> {phase.offline ? "You're offline: it reconnects when you're back" : "Connection lost: reconnecting…"}
          </p>
        ) : null}
        {phase.kind === "ended" || phase.kind === "error" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-bg/85 p-4">
            <div className="max-w-sm space-y-3 text-center" role={phase.kind === "error" ? "alert" : "status"}>
              {phase.kind === "ended" && phase.done ? (
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-ok/15 text-ok">
                  <Check size={20} aria-hidden />
                </span>
              ) : null}
              <p className={`text-sm ${phase.kind === "error" ? "text-danger" : phase.done ? "font-medium text-ok" : "text-muted"}`} data-remote-ended={phase.kind === "ended" && phase.done ? "done" : "other"}>
                {phase.text}
              </p>
              <Button size="sm" tone="ghost" onClick={() => onClose({ signedIn: phase.kind === "ended" && phase.done ? true : null })}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      <footer className="space-y-2 border-t border-line px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        <p className="flex items-center gap-1.5 text-[11px] text-muted">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${pending > 0 ? "bg-accent motion-safe:animate-pulse" : "bg-ok"}`}
            title={pending > 0 ? "Sending what you typed…" : "Everything you typed has gone"}
            data-remote-sent={pending > 0 ? "sending" : "sent"}
            aria-hidden
          />
          <span className="min-w-0">
            {watching
              ? "Watching live. Take control to click and type."
              : terminal
                ? "Type on the terminal, or in the box. It goes to the shell as you type."
                : holding
                  ? "Holding: lift your finger to let go."
                  : coarse
                    ? "Tap to click · drag to scroll · keep your finger down to press and hold"
                    : "Click, scroll and type on the page, or type in the box."}
          </span>
        </p>
        {terminal ? <TerminalKeys onInput={send} disabled={!active} stage={stage} /> : watching ? null : (
          <div className="flex items-center gap-2">
            <input
              ref={box}
              defaultValue=""
              type={hidden ? "password" : "text"}
              onChange={(event) => {
                const next = event.target.value;
                send(typingEvents(typedRef.current, next));
                typedRef.current = next;
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Enter" || event.key === "Tab") {
                  event.preventDefault();
                  press(event.key);
                  clearTyped();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  press("Escape");
                } else if (event.key === "Backspace" && !typedRef.current) {
                  press("Backspace");
                }
              }}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="go"
              data-1p-ignore
              data-lpignore="true"
              aria-label="Type into the page"
              placeholder="Type here: it goes into the page"
              disabled={!typing}
              className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-base outline-none focus:border-accent sm:text-sm"
            />
            <Button size="sm" tone="ghost" aria-label={hidden ? "Show what you type" : "Hide what you type"} title={hidden ? "Show what you type" : "Hide what you type (for passwords)"} aria-pressed={hidden} onClick={() => setHidden(!hidden)}>
              {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {terminal || watching ? null : (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Keys">
              <Button size="sm" tone="ghost" disabled={!typing} aria-label="Enter key" title="Enter" onClick={() => press("Enter")}>
                <CornerDownLeft size={14} /> Enter
              </Button>
              <Button size="sm" tone="ghost" disabled={!typing} aria-label="Tab key" onClick={() => press("Tab")}>
                Tab
              </Button>
              <Button size="sm" tone="ghost" disabled={!typing} aria-label="Backspace key" title="Backspace" onClick={() => press("Backspace")}>
                <Delete size={14} />
              </Button>
              <Button size="sm" tone="ghost" disabled={!typing} aria-label="Escape key" onClick={() => press("Escape")}>
                Esc
              </Button>
              <Button size="sm" tone="ghost" disabled={!typing} onClick={() => void paste()}>
                <ClipboardPaste size={14} /> Paste
              </Button>
            </div>
          )}
          <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {live && !terminal ? (
              controls ? (
                <Button size="sm" tone="ghost" busy={switching} disabled={!active} onClick={() => void setControl(false)}>
                  <Hand size={13} /> Hand back
                </Button>
              ) : (
                <Button size="sm" busy={switching} disabled={!active} onClick={() => void setControl(true)}>
                  <MousePointerClick size={14} /> Take control
                </Button>
              )
            ) : null}
            {live ? (
              <Button size="sm" tone="ghost" disabled={phase.kind === "ending" || phase.kind === "opening"} busy={phase.kind === "ending"} onClick={() => void finish(false)}>
                <X size={13} /> Close
              </Button>
            ) : (
              <>
                <Button size="sm" tone="ghost" disabled={phase.kind === "ending" || phase.kind === "opening"} busy={phase.kind === "ending"} onClick={() => void finish(false)}>
                  <Square size={13} /> Stop
                </Button>
                <Button size="sm" disabled={!active} busy={phase.kind === "ending"} onClick={() => void finish(true)}>
                  <Check size={14} /> I&apos;m done
                </Button>
              </>
            )}
          </span>
        </div>
        {extend.error ? <p className="text-xs text-muted">{extend.error}</p> : null}
        {note ? <p className="text-xs text-warn">{note}</p> : null}
        <p className="flex items-start gap-1.5 text-[11px] text-muted">
          <Lock size={12} className="mt-0.5 shrink-0 text-ok" aria-hidden />
          <span>
            Encrypted between this browser and {computer}: Ensemble&apos;s server passes it on without being able to see or change it.
            {live ? (terminal ? " The node keeps using this terminal too." : controls ? " The node waits on this tab until you hand it back." : " The node keeps working while you watch.") : " Nodes and models see nothing of this page while you use it."}
          </span>
        </p>
      </footer>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(view, document.body);
}
