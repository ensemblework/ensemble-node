"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode, type RefObject } from "react";
import { APPEARANCE_KEY, DEFAULT_APPEARANCE, PALETTES, normaliseAppearance, type Appearance } from "@/lib/appearance";
import { toastError } from "@/lib/toast";

const AppearanceContext = createContext({ appearance: DEFAULT_APPEARANCE, update: (_patch: Partial<Appearance>) => {}, motion: false });

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState(DEFAULT_APPEARANCE);
  const [ready, setReady] = useState(false);
  const [systemLight, setSystemLight] = useState(false);
  const [systemReduced, setSystemReduced] = useState(true);
  useEffect(() => {
    const read = () => {
      try { setAppearance(normaliseAppearance(JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? "null"))); }
      catch { toastError(new Error("Your appearance could not be restored. Choose it again in Settings.")); }
    };
    read();
    setReady(true);
    const light = matchMedia("(prefers-color-scheme: light)");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { setSystemLight(light.matches); setSystemReduced(reduced.matches); };
    sync();
    const storage = (event: StorageEvent) => { if (event.key === APPEARANCE_KEY || event.key === null) read(); };
    light.addEventListener("change", sync);
    reduced.addEventListener("change", sync);
    window.addEventListener("storage", storage);
    return () => { light.removeEventListener("change", sync); reduced.removeEventListener("change", sync); window.removeEventListener("storage", storage); };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const theme = appearance.mode === "system" ? (systemLight ? "light" : "dark") : appearance.mode;
    const root = document.documentElement;
    for (const [key, value] of Object.entries(appearance)) root.dataset[key] = value;
    root.dataset.theme = theme;
    const palette = PALETTES.find(row => row.id === appearance.palette)!;
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute("content", `rgb(${palette[theme][0]})`);
  }, [appearance, ready, systemLight]);
  const update = useCallback((patch: Partial<Appearance>) => {
    const next = normaliseAppearance({ ...appearance, ...patch });
    setAppearance(next);
    try { localStorage.setItem(APPEARANCE_KEY, JSON.stringify(next)); }
    catch { toastError(new Error("Your appearance changed, but this browser could not save it for next time.")); }
  }, [appearance]);
  return <AppearanceContext value={{ appearance, update, motion: ready && !systemReduced && appearance.motion !== "off" }}>{children}</AppearanceContext>;
}

export const useAppearance = () => useContext(AppearanceContext);

/** Decorative motion is allowed only on screen, in a visible tab, and when the owner allows it. */
export function useVisibleMotion(ref: RefObject<Element | null>, enabled = true) {
  const { motion } = useAppearance();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || !motion || !enabled) { setVisible(false); return; }
    let inView = false;
    const sync = () => setVisible(inView && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => { inView = entry?.isIntersecting ?? false; sync(); });
    observer.observe(element);
    document.addEventListener("visibilitychange", sync);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", sync); };
  }, [motion, ref, enabled]);
  return visible && motion && enabled;
}
