"use client";

import { ArrowUp, Lock, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { insertMention, matchHandles, typingMention } from "@/lib/text";
import type { Avatar } from "@/lib/types";
import { NodeAvatar, PersonAvatar } from "../node-avatar";

export type MentionOption = { handle: string; label: string; detail: string; avatar?: Avatar; person?: boolean };

export function Composer({
  options,
  placeholder,
  canBePrivate,
  busy,
  disabled,
  disabledReason,
  onSend,
  onStop,
}: {
  options: MentionOption[];
  placeholder: string;
  canBePrivate: boolean;
  busy: boolean;
  disabled?: boolean;
  disabledReason?: React.ReactNode;
  onSend: (body: string, isPrivate: boolean) => void;
  onStop: () => void;
}) {
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0);
  const [index, setIndex] = useState(0);
  const [isPrivate, setPrivate] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const typing = typingMention(value, cursor);
  const matches = typing ? matchHandles(options, typing.query) : [];

  useEffect(() => {
    const element = area.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(220, element.scrollHeight)}px`;
  }, [value]);
  useEffect(() => setIndex(0), [typing?.query]);

  const choose = (handle: string) => {
    if (!typing) return;
    const next = insertMention(value, typing.start, cursor, handle);
    setValue(next.value);
    setCursor(next.cursor);
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(next.cursor, next.cursor);
    });
  };

  const send = () => {
    const body = value.trim();
    if (!body || disabled) return;
    onSend(body, canBePrivate && isPrivate);
    setValue("");
    setCursor(0);
  };

  return (
    <div className="relative mx-auto w-full max-w-3xl px-3 pb-3 md:px-6 md:pb-5">
      {matches.length ? (
        <ul className="absolute bottom-full left-3 right-3 mb-2 overflow-hidden rounded-2xl border border-line bg-panel shadow-xl md:left-6 md:right-auto md:w-80" role="listbox">
          {matches.map((option, at) => (
            <li key={option.handle}>
              <button
                type="button"
                onMouseDown={(event) => (event.preventDefault(), choose(option.handle))}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm ${at === index ? "bg-raised" : ""}`}
              >
                {option.person ? <PersonAvatar name={option.label} size={24} /> : <NodeAvatar avatar={option.avatar} size={24} />}
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {option.label} <span className="font-mono text-xs text-muted">@{option.handle}</span>
                  </span>
                  <span className="block truncate text-xs text-muted">{option.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {disabled && disabledReason ? <div className="mb-2 text-center text-sm text-muted">{disabledReason}</div> : null}
      <div className={`rounded-3xl border bg-panel p-2 shadow-lg transition focus-within:border-accent/60 ${isPrivate && canBePrivate ? "border-private/50" : "border-line"}`}>
        <textarea
          ref={area}
          value={value}
          disabled={disabled}
          rows={1}
          placeholder={placeholder}
          onChange={(event) => {
            setValue(event.target.value);
            setCursor(event.target.selectionStart);
          }}
          onSelect={(event) => setCursor((event.target as HTMLTextAreaElement).selectionStart)}
          onKeyDown={(event) => {
            if (matches.length) {
              if (event.key === "ArrowDown") return (event.preventDefault(), setIndex((index + 1) % matches.length));
              if (event.key === "ArrowUp") return (event.preventDefault(), setIndex((index - 1 + matches.length) % matches.length));
              if (event.key === "Enter" || event.key === "Tab") return (event.preventDefault(), choose(matches[index]!.handle));
              if (event.key === "Escape") return setCursor(-1);
            }
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              send();
            }
          }}
          className="max-h-[220px] w-full resize-none bg-transparent px-3 py-2 text-[15px] outline-none placeholder:text-muted disabled:opacity-60"
        />
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-1">
            {canBePrivate ? (
              <button
                type="button"
                onClick={() => setPrivate(!isPrivate)}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition ${isPrivate ? "bg-private/15 text-private" : "text-muted hover:bg-raised"}`}
                aria-pressed={isPrivate}
                title="Only you and your own nodes see it"
              >
                <Lock size={12} /> Only me
              </button>
            ) : null}
            <span className="hidden text-xs text-muted sm:inline">@ to mention · Shift+Enter for a new line</span>
          </div>
          {busy && !value.trim() ? (
            <button type="button" onClick={onStop} className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-raised text-ink hover:bg-line" aria-label="Stop">
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button type="button" onClick={send} disabled={!value.trim() || disabled} className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-ink transition hover:brightness-110 disabled:opacity-40" aria-label="Send">
              <ArrowUp size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
