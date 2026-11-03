"use client";
import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
export type ViewerProps = { file: { filename: string }; bytes: ArrayBuffer; compact: boolean };
export type PresentControl = { active: boolean; layer: (node: HTMLElement | null) => void; exit: () => void; toggleNative: () => void; setReady: (ready: boolean) => void };
export const PresentContext = createContext<PresentControl | null>(null);
export const ToolbarTarget = createContext<HTMLElement | null>(null);
export function ViewerNote({ title, children }: { title: string; children?: ReactNode; file?: ViewerProps["file"]; bytes?: ArrayBuffer; compact?: boolean }) {
  return <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center" role="status"><p className="text-sm font-medium">{title}</p>{children}<p className="text-xs text-muted">Download the original from the file header to open it on your computer.</p></div>;
}
export function Toolbar({ children, className = "" }: { children: ReactNode; className?: string }) {
  const target = useContext(ToolbarTarget);
  if (target) return createPortal(children, target);
  return <div className={`flex min-h-10 shrink-0 flex-wrap items-center gap-1 border-b border-line px-2 py-1 text-xs text-muted ${className}`}>{children}</div>;
}
