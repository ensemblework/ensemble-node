"use client";

import type { InputHTMLAttributes } from "react";
import { HANDLE_MAX, handleInput } from "@/lib/crew";

/** A node's handle after its "@": lowercase as it is typed, spaces as dashes. */
export function HandleInput({ value, onValue, invalid = false, className = "", ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & { value: string; onValue: (next: string) => void; invalid?: boolean }) {
  return (
    <span className={`compound-field flex min-w-0 items-center rounded-xl border bg-bg text-sm transition-colors ${invalid ? "border-danger/70" : "border-line"} ${className}`}>
      <span className="select-none pl-3 font-mono text-muted" aria-hidden>
        @
      </span>
      <input
        {...rest}
        value={value}
        onChange={(event) => onValue(handleInput(event.target.value))}
        maxLength={HANDLE_MAX}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        aria-invalid={invalid || undefined}
        className="min-w-0 flex-1 rounded-r-xl bg-transparent py-2 pl-0.5 pr-3 font-mono outline-none placeholder:text-muted"
      />
    </span>
  );
}
