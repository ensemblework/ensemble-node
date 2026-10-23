"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { isEmail, takeEmails } from "@/lib/chat";

/** Email addresses as chips: type or paste, separated by commas, spaces or Enter. */
export function EmailChips({ emails, onChange, max, placeholder = "name@example.com", label = "Emails" }: { emails: string[]; onChange: (next: string[]) => void; max: number; placeholder?: string; label?: string }) {
  const [text, setText] = useState("");
  const add = (found: string[]) => {
    const next = [...emails];
    for (const email of found) if (!next.includes(email) && next.length < max) next.push(email);
    if (next.length !== emails.length) onChange(next);
  };
  const commit = (value: string, all: boolean) => {
    const { emails: found, rest } = takeEmails(value, all);
    add(found);
    setText(rest);
  };
  const full = emails.length >= max;
  return (
    <div className="space-y-1">
      <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-xl border border-line bg-bg px-2 py-1.5 focus-within:border-accent">
        {emails.map((email) => {
          const valid = isEmail(email);
          return (
            <span key={email} title={valid ? undefined : "This is not an email address."} className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-sm ${valid ? "bg-raised" : "bg-danger/15 text-danger"}`}>
              {email}
              <button type="button" aria-label={`Remove ${email}`} className="text-muted hover:text-ink" onClick={() => onChange(emails.filter((row) => row !== email))}>
                <X size={12} />
              </button>
            </span>
          );
        })}
        <input
          value={text}
          aria-label={label}
          disabled={full}
          placeholder={full ? "" : emails.length ? "Add another" : placeholder}
          onChange={(event) => (/[\s,;]/.test(event.target.value) ? commit(event.target.value, false) : setText(event.target.value))}
          onPaste={(event) => {
            event.preventDefault();
            commit(`${text}${event.clipboardData.getData("text")}`, true);
          }}
          onKeyDown={(event) => {
            if ((event.key === "Enter" || event.key === "Tab") && text.trim()) {
              event.preventDefault();
              commit(text, true);
            } else if (event.key === "Backspace" && !text && emails.length) {
              onChange(emails.slice(0, -1));
            }
          }}
          onBlur={() => text.trim() && commit(text, true)}
          type="text"
          inputMode="email"
          autoComplete="off"
          className="min-w-[10rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted"
        />
      </div>
      <p className="text-xs text-muted">
        {emails.length} of {max}
        {emails.some((email) => !isEmail(email)) ? " · remove the ones in red" : ""}
      </p>
    </div>
  );
}
