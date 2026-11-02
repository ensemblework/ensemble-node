"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN, sidebarWidth } from "@/lib/sidebar";
import { toastError } from "@/lib/toast";

export function useSidebarWidth() {
  const [width, setWidth] = useState(SIDEBAR_DEFAULT);
  useEffect(() => {
    try { setWidth(sidebarWidth(localStorage.getItem("node.sidebar-width"))); }
    catch { toastError(new Error("Your sidebar width could not be restored.")); }
  }, []);
  const save = (next: number) => {
    const value = sidebarWidth(next);
    setWidth(value);
    try { localStorage.setItem("node.sidebar-width", String(value)); }
    catch { toastError(new Error("Your sidebar resized, but this browser could not save its width.")); }
  };
  return [width, save] as const;
}

export function SidebarFrame({ collapsed, width, onWidth, children }: { collapsed: boolean; width: number; onWidth: (value: number) => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [maxWidth, setMaxWidth] = useState(SIDEBAR_MAX);
  const shownWidth = Math.min(width, maxWidth);
  const drag = useRef<{ x: number; width: number; next: number } | null>(null);
  const frame = useRef<number | null>(null);
  useEffect(() => {
    const resize = () => setMaxWidth(Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, Math.floor(window.innerWidth * .42))));
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  const finish = (cancel = false) => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; }
    ref.current?.removeAttribute("data-resizing");
    const next = cancel ? shownWidth : current.next;
    if (ref.current) ref.current.style.width = `${next}px`;
    if (!cancel) onWidth(next);
  };
  return (
    <aside ref={ref} className="chat-sidebar relative hidden shrink-0 border-r border-line bg-panel md:block" style={{ width: collapsed ? 68 : shownWidth, minWidth: collapsed ? 68 : SIDEBAR_MIN, maxWidth: collapsed ? 68 : maxWidth }} data-sidebar-collapsed={collapsed} aria-label="Chat sidebar">
      {children}
      {!collapsed ? <div role="separator" aria-label="Conversation sidebar width" aria-orientation="vertical" aria-valuemin={SIDEBAR_MIN} aria-valuemax={maxWidth} aria-valuenow={shownWidth} tabIndex={0}
        title="Drag or use arrow keys to resize. Double-click to reset."
        className="sidebar-resize absolute -right-1 inset-y-0 z-30 w-2 cursor-col-resize touch-none"
        onDoubleClick={() => onWidth(SIDEBAR_DEFAULT)}
        onKeyDown={event => {
          if (event.key === "Escape") { finish(true); return; }
          const next = event.key === "ArrowLeft" ? shownWidth - 16 : event.key === "ArrowRight" ? shownWidth + 16 : event.key === "Home" ? SIDEBAR_MIN : event.key === "End" ? maxWidth : null;
          if (next !== null) { event.preventDefault(); onWidth(Math.min(maxWidth, next)); }
        }}
        onPointerDown={event => {
          if (event.button !== 0 || !ref.current) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          const actual = ref.current.getBoundingClientRect().width;
          drag.current = { x: event.clientX, width: actual, next: actual };
          ref.current.setAttribute("data-resizing", "true");
        }}
        onPointerMove={event => {
          if (!drag.current) return;
          drag.current.next = sidebarWidth(Math.min(maxWidth, drag.current.width + event.clientX - drag.current.x));
          frame.current ??= requestAnimationFrame(() => { frame.current = null; if (ref.current && drag.current) ref.current.style.width = `${drag.current.next}px`; });
        }}
        onPointerUp={() => finish()} onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish()}
      /> : null}
    </aside>
  );
}
