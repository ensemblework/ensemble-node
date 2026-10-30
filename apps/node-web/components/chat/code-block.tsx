"use client";
/** @jsxRuntime automatic */

/**
 * Code blocks in replies (language label, copy, horizontal scroll) and a small copy button.
 * Adapted from T3 Code's MarkdownCodeBlock and MessageCopyButton (MIT License, Copyright (c) 2026 T3 Tools Inc.).
 */
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toastError } from "@/lib/toast";

/** Copies `text`; the icon turns into a check for a moment. */
export function CopyButton({ text, label = "Copy", className = "" }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const copy = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(text).then(() => {
      if (timer.current) clearTimeout(timer.current);
      setCopied(true);
      timer.current = setTimeout(() => setCopied(false), 1200);
    }, toastError);
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-raised hover:text-ink ${className}`}
    >
      {copied ? <Check size={13} className="text-ok" /> : <Copy size={13} />}
    </button>
  );
}

/** A fenced code block: the language and a copy button above, the code scrolling sideways on a phone. */
export function CodeBlock({ code, lang }: { code: string; lang: string | null }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-line bg-bg" data-language={lang ?? undefined}>
      <div className="flex items-center justify-between gap-2 border-b border-line/60 py-0.5 pl-3 pr-1">
        <span className="truncate font-mono text-[11px] text-muted">{lang ?? "text"}</span>
        <CopyButton text={code} label="Copy code" />
      </div>
      <pre className="scroll-thin overflow-x-auto p-3 font-mono text-xs leading-relaxed" tabIndex={0} aria-label={lang ? `${lang} code` : "Code"}>
        <code className="whitespace-pre">{code}</code>
      </pre>
    </div>
  );
}
