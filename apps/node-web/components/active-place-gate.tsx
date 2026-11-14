"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { ENSEMBLE_API } from "@/lib/config";
import { acquirePlace, nextPlaceInput, PLACE_BLOCKED_EVENT, setPlaceAllowed, type OpenPlace, type PlaceAnswer } from "@/lib/active-place";
import { loginPath } from "@/lib/next-path";
import type { Me } from "@/lib/types";
import { Button, InfoTip, Notice, Spinner } from "./ui";

const Access = createContext(true);
export const usePlaceAccess = () => useContext(Access);

export function ActivePlaceGate({ children }: { children: ReactNode }) {
  const [entered, setEntered] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [places, setPlaces] = useState<OpenPlace[]>([]);
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const join = useRef<(replace?: string) => Promise<void>>(async () => {});
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (allowed || !choosing) return;
    panel.current?.focus({ preventScroll: true });
  }, [allowed, choosing]);

  useEffect(() => {
    let live = true;
    let stop: (() => void) | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let joining = false;
    const signIn = () => {
      setPlaceAllowed(false);
      window.location.href = loginPath(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    };
    const block = (answer: PlaceAnswer) => {
      if (!live) return;
      setPlaceAllowed(false);
      if (answer.code === "PLACE_ACCOUNT_CHANGED") { window.location.reload(); return; }
      setAllowed(false);
      setChoosing(true);
      setPlaces(answer.places ?? []);
      setError(null);
    };
    const heartbeat = async (replace?: string) => {
      if (!live || joining) return;
      joining = true;
      setBusy(true);
      try {
        const answer = await api<PlaceAnswer>(replace ? "/api/auth/places/continue" : "/api/auth/places", {
          body: { ...nextPlaceInput(), ...(replace ? { replace } : {}) },
        });
        if (!live) return;
        if (!answer.allowed) { block(answer); return; }
        setPlaceAllowed(true);
        setEntered(true);
        setAllowed(true);
        setChoosing(false);
        setPlaces([]);
        setError(null);
      } catch (cause) {
        if (!live) return;
        if (cause instanceof ApiError && cause.status === 401) signIn();
        else if (cause instanceof ApiError && cause.code?.startsWith("PLACE_")) block(cause.data as PlaceAnswer);
        else setError(cause instanceof Error ? cause.message : "Could not check your open Node places.");
      } finally {
        joining = false;
        if (live) setBusy(false);
      }
    };
    const release = () => {
      if (!stop) return;
      const body = new Blob([JSON.stringify(nextPlaceInput())], { type: "application/json" });
      void fetch(`${ENSEMBLE_API}/api/auth/places/release`, { method: "POST", credentials: "include", body, keepalive: true }).catch(() => {
        console.warn("This Node place could not be released. Its lease will expire.");
      });
    };
    const onBlock = (event: Event) => block((event as CustomEvent<PlaceAnswer>).detail);
    const onReturn = () => { void heartbeat(); };
    const start = async () => {
      try {
        const me = await api<Me>("/api/auth/me");
        if (!live) return;
        const unlock = await acquirePlace(me.user.id);
        if (!live) { unlock(); return; }
        stop = unlock;
        join.current = heartbeat;
        window.addEventListener("pagehide", release);
        window.addEventListener("pageshow", onReturn);
        window.addEventListener(PLACE_BLOCKED_EVENT, onBlock);
        await heartbeat();
        if (live) timer = setInterval(() => void heartbeat(), 10_000);
      } catch (cause) {
        if (!live) return;
        if (cause instanceof ApiError && cause.status === 401) signIn();
        else {
          setError(cause instanceof Error ? cause.message : "Could not open Ensemble Node.");
          join.current = async () => { await start(); };
        }
      }
    };
    void start();
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("pagehide", release);
      window.removeEventListener("pageshow", onReturn);
      window.removeEventListener(PLACE_BLOCKED_EVENT, onBlock);
      release();
      stop?.();
    };
  }, []);

  return <Access.Provider value={allowed}>
    {entered ? <div className="contents" inert={!allowed} aria-hidden={!allowed || undefined}>{children}</div> : null}
    {allowed && error ? <div role="status" className="fixed bottom-4 left-1/2 z-[70] flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-line bg-panel p-3 text-sm text-muted shadow-xl">{error}<Button tone="ghost" busy={busy} onClick={() => void join.current()}>Retry</Button></div> : null}
    {!allowed ? <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-bg p-4">
      <section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Open Node places" className="w-full max-w-lg rounded-2xl border border-line bg-panel p-6 shadow-xl" onKeyDown={event => {
        if (event.key !== "Tab") return;
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first?.focus(); }
      }}>
        {choosing ? <>
          <h1 className="flex items-center gap-2 text-xl font-semibold">Choose where to continue <InfoTip text="Ensemble Node can be open in three places. Ensemble has its own separate three-place limit. Closing a Node place or one minute without a heartbeat frees its slot. Continue here replaces the least recently heard Node place. Ensemble and the CLI stay signed in." /></h1>
          <p className="mt-2 text-sm text-muted">{places.length ? "Continue here by signing out one Node place." : "Continue here to reopen this Node place."}</p>
          <ul className="mt-4 divide-y divide-line">{places.map(place => <li key={place.windowId} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span className="min-w-0"><span className="block text-sm font-medium">Ensemble Node</span><span className="block text-sm text-muted">{place.label}</span></span>
            <Button tone="ghost" className="min-h-11" disabled={busy} onClick={() => void join.current(place.windowId)}>Sign out this place</Button>
          </li>)}</ul>
          <Button className="mt-4 min-h-11" busy={busy} onClick={() => void join.current("oldest")}>Continue here</Button>
        </> : error ? <h1 className="text-xl font-semibold">Could not open Ensemble Node</h1> : <div className="flex items-center gap-3 text-sm text-muted"><Spinner />Checking open places…</div>}
        {error ? <div className="mt-3"><Notice tone="error">{error}</Notice></div> : null}
        {error || choosing ? <Button tone="quiet" className="mt-3 min-h-11" disabled={busy} onClick={() => void join.current()}>Check again</Button> : null}
      </section>
    </div> : null}
  </Access.Provider>;
}
