"use client";

import { ExternalLink, X } from "lucide-react";
import { useEffect, type AnchorHTMLAttributes, type RefObject, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { dismissToast, useToasts } from "@/lib/toast";

type Tone = "primary" | "ghost" | "danger" | "quiet";

/** Closes a menu or popover on Escape or a click outside `ref`. */
export function useDismiss(open: boolean, close: () => void, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const away = (event: Event) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const key = (event: KeyboardEvent) => event.key === "Escape" && close();
    document.addEventListener("mousedown", away);
    document.addEventListener("touchstart", away);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("touchstart", away);
      window.removeEventListener("keydown", key);
    };
  }, [open, close, ref]);
}

/** One row of a menu. */
export function MenuItem({ children, onClick, checked, tone }: { children: ReactNode; onClick: () => void; checked?: boolean; tone?: "danger" }) {
  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={checked}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm outline-none hover:bg-raised focus:bg-raised ${tone === "danger" ? "text-danger" : checked ? "text-accent" : ""}`}
    >
      {children}
    </button>
  );
}

export function Button({ tone = "primary", size = "md", className = "", busy, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: "sm" | "md"; busy?: boolean }) {
  const tones: Record<Tone, string> = {
    primary: "bg-accent text-accent-ink hover:brightness-110",
    ghost: "border border-line bg-panel text-ink hover:bg-raised",
    danger: "border border-danger/40 text-danger hover:bg-danger/10",
    quiet: "text-muted hover:bg-raised hover:text-ink",
  };
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={`inline-flex items-center justify-center font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${size === "sm" ? "gap-1.5 rounded-lg px-3 py-1.5 text-xs" : "gap-2 rounded-xl px-4 py-2 text-sm"} ${tones[tone]} ${className}`}
    >
      {busy ? <Spinner className={size === "sm" ? "h-3 w-3" : ""} /> : null}
      {children}
    </button>
  );
}

export function IconButton({ label, className = "", children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button {...rest} aria-label={label} title={label} className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-raised hover:text-ink disabled:opacity-40 ${className}`}>
      {children}
    </button>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} aria-hidden />;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none transition placeholder:text-muted focus:border-accent ${props.className ?? ""}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none transition placeholder:text-muted focus:border-accent ${props.className ?? ""}`} />;
}

/** A link that leaves Node (Ensemble, ensemblework.com, vendors): it opens in a new tab. */
export function External({ href, children, icon = false, className = "", ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; icon?: boolean }) {
  return (
    <a {...rest} href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      {icon ? <ExternalLink size={12} className="ml-1 inline shrink-0 align-[-1px]" aria-hidden /> : null}
    </a>
  );
}

/** An on/off switch with its label and explanation. */
export function Switch({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  return (
    <label className={`flex items-start justify-between gap-4 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-muted">{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${checked ? "border-accent bg-accent" : "border-line bg-raised"}`}
      >
        <span className={`inline-block h-4 w-4 rounded-full shadow transition ${checked ? "translate-x-6 bg-accent-ink" : "translate-x-1 bg-muted"}`} />
      </button>
    </label>
  );
}

/** A small set of mutually exclusive choices, like a tab strip. */
export function Segmented<T extends string>({ value, onChange, options, label, size = "md" }: { value: T; onChange: (next: T) => void; options: ReadonlyArray<{ id: T; label: ReactNode; title?: string }>; label: string; size?: "sm" | "md" }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-line bg-panel p-0.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          title={option.title}
          onClick={() => onChange(option.id)}
          className={`inline-flex items-center gap-1.5 rounded-lg ${size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"} ${value === option.id ? "bg-raised font-medium text-ink" : "text-muted hover:text-ink"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Toasts from `lib/toast`, at the bottom of the screen. */
export function Toaster() {
  const toasts = useToasts();
  if (!toasts.length) return null;
  const tones = { info: "border-line bg-panel text-ink", ok: "border-ok/40 bg-panel text-ok", error: "border-danger/40 bg-panel text-danger" };
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((row) => (
        <div key={row.id} role={row.tone === "error" ? "alert" : "status"} className={`pointer-events-auto flex max-w-md items-start gap-2 rounded-xl border px-3 py-2 text-sm shadow-xl ${tones[row.tone]}`}>
          <span className="min-w-0 flex-1">{row.text}</span>
          <button className="text-muted hover:text-ink" aria-label="Dismiss" onClick={() => dismissToast(row.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** A labelled input; `group` for a set of buttons or choices, which a <label> must not wrap. */
export function Field({ label, hint, error, group = false, children }: { label: string; hint?: ReactNode; error?: string | null; group?: boolean; children: ReactNode }) {
  const Tag = group ? "div" : "label";
  return (
    <Tag className="block space-y-1.5" {...(group ? { role: "group", "aria-label": label } : {})}>
      <span className="block text-sm font-medium">{label}</span>
      {children}
      {error ? (
        <span className="block text-xs text-danger" role="alert">
          {error}
        </span>
      ) : null}
      {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
    </Tag>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "ok" | "warn"; children: ReactNode }) {
  const tones = { info: "border-line bg-raised text-ink", error: "border-danger/40 bg-danger/10 text-danger", ok: "border-ok/40 bg-ok/10 text-ok", warn: "border-warn/40 bg-warn/10 text-warn" };
  return <div className={`rounded-xl border px-3 py-2 text-sm ${tones[tone]}`}>{children}</div>;
}

export function Drawer({ open, onClose, title, children, side = "right" }: { open: boolean; onClose: () => void; title: string; children: ReactNode; side?: "right" | "center" | "top" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal aria-label={title}>
      <button className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-label="Close" onClick={onClose} />
      <div
        className={
          side === "center"
            ? "relative m-auto max-h-[90vh] w-[min(560px,94vw)] overflow-y-auto rounded-2xl border border-line bg-panel p-5 shadow-2xl scroll-thin"
            : side === "top"
              ? "relative mx-auto mt-[8vh] max-h-[80vh] w-[min(680px,94vw)] self-start overflow-y-auto rounded-2xl border border-line bg-panel p-4 shadow-2xl scroll-thin"
              : "relative ml-auto h-full w-[min(460px,100vw)] overflow-y-auto border-l border-line bg-panel p-5 shadow-2xl scroll-thin"
        }
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "accent" | "ok" | "warn" | "danger" | "private" }) {
  const tones = { muted: "bg-raised text-muted", accent: "bg-accent/15 text-accent", ok: "bg-ok/15 text-ok", warn: "bg-warn/15 text-warn", danger: "bg-danger/15 text-danger", private: "bg-private/15 text-private" };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}
