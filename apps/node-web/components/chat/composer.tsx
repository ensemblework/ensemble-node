"use client";

import { ArrowUp, CornerUpLeft, Lock, Square, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { insertMention, matchHandles, typingMention } from "@/lib/text";
import type { Avatar, MessageFile, NodePublic } from "@/lib/types";
import { NodeAvatar, PersonAvatar } from "../node-avatar";
import { AttachButton, AttachmentShelf, DropHint, pasteFiles, useAttachments, useFileDrop } from "./attachments";

export type MentionOption = { handle: string; label: string; detail: string; avatar?: Avatar; node?: NodePublic; person?: boolean };
const drafts = new Map<string, { body: string; private: boolean }>();

/** The message being replied to, shown above the composer. */
export type ComposerReply = { id: string; author: string; excerpt: string; private: boolean };

/** A message put back into the composer (a failed one, to edit). A new `nonce` puts it back again. */
export type ComposerDraft = { nonce: number; body: string; private: boolean; files: MessageFile[] };

export function Composer({
  options,
  draftKey,
  placeholder,
  canBePrivate,
  busy,
  disabled,
  disabledReason,
  reply,
  onCancelReply,
  attachHint,
  draft,
  onSend,
  onStop,
}: {
  options: MentionOption[];
  draftKey: string;
  placeholder: string;
  canBePrivate: boolean;
  busy: boolean;
  disabled?: boolean;
  disabledReason?: React.ReactNode;
  reply?: ComposerReply | null;
  onCancelReply?: () => void;
  /** Turns attachments on; says who can read what is attached here. */
  attachHint?: string;
  draft?: ComposerDraft | null;
  onSend: (body: string, isPrivate: boolean, files: MessageFile[]) => void;
  onStop: () => void;
}) {
  const [value, setValue] = useState(() => drafts.get(draftKey)?.body ?? "");
  const [cursor, setCursor] = useState(0);
  const [index, setIndex] = useState(0);
  const [isPrivate, setPrivate] = useState(() => drafts.get(draftKey)?.private ?? false);
  const area = useRef<HTMLTextAreaElement>(null);
  const attachments = useAttachments();
  const canAttach = Boolean(attachHint) && !disabled;
  const drop = useFileDrop(attachments.addFiles, canAttach);
  const blockerId = useId();
  const typing = typingMention(value, cursor);
  const matches = typing ? matchHandles(options, typing.query) : [];
  // A public reply may not quote a private message, so a reply to one is private too.
  const lockedPrivate = Boolean(reply?.private);
  const privateNow = isPrivate || lockedPrivate;
  useEffect(() => {
    if (value) drafts.set(draftKey, { body: value, private: privateNow });
    else drafts.delete(draftKey);
  }, [draftKey, value, privateNow]);

  const replyId = reply?.id;
  useEffect(() => {
    if (replyId) area.current?.focus();
  }, [replyId]);

  useEffect(() => {
    const element = area.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(220, element.scrollHeight)}px`;
  }, [value]);
  useEffect(() => setIndex(0), [typing?.query]);

  const { addExisting } = attachments;
  const draftNonce = draft?.nonce;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(() => {
    const restored = draftRef.current;
    if (!draftNonce || !restored) return;
    setValue((current) => (current.trim() ? `${current}\n${restored.body}` : restored.body));
    setPrivate(restored.private);
    if (restored.files.length) addExisting(restored.files);
    area.current?.focus();
  }, [draftNonce, addExisting]);

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

  const files = attachments.files;
  const blocker = attachments.blocker;
  const canSend = Boolean(value.trim() || files.length) && !blocker && !disabled;

  const send = () => {
    if (!canSend) return;
    onSend(value.trim(), privateNow, files);
    setValue("");
    setCursor(0);
    attachments.clear();
  };

  return (
    <div className="relative mx-auto w-full max-w-[840px] shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-8 md:pb-6">
      {matches.length ? (
        <ul className="absolute bottom-full left-3 right-3 mb-2 overflow-hidden rounded-2xl border border-line bg-panel shadow-xl md:left-6 md:right-auto md:w-80" role="listbox">
          {matches.map((option, at) => (
            <li key={option.handle}>
              <button
                type="button"
                onMouseDown={(event) => (event.preventDefault(), choose(option.handle))}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm ${at === index ? "bg-raised" : ""}`}
              >
                {option.person ? <PersonAvatar name={option.label} size={24} /> : <NodeAvatar node={option.node} avatar={option.avatar} size={24} />}
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
      <div {...drop.bind} className={`chat-composer relative rounded-[22px] border bg-panel p-2 shadow-sm transition-colors focus-within:border-accent/50 ${privateNow ? "border-private/50" : "border-line"}`}>
        {drop.over ? <DropHint /> : null}
        {reply ? (
          <div className="mx-1 mb-1 flex items-start gap-2 rounded-2xl bg-bg/70 px-3 py-2 text-sm">
            <CornerUpLeft size={14} className="mt-0.5 shrink-0 text-accent" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-accent">
                Replying to {reply.author}
                {reply.private ? (
                  <span className="ml-1.5 inline-flex items-center gap-1 text-private">
                    <Lock size={10} /> private, so your reply is too
                  </span>
                ) : null}
              </span>
              <span className="line-clamp-1 text-muted">{reply.excerpt || "📎 Files"}</span>
            </span>
            <button type="button" onClick={onCancelReply} className="rounded-lg p-1 text-muted hover:bg-raised hover:text-ink" aria-label="Cancel reply">
              <X size={14} />
            </button>
          </div>
        ) : null}
        <AttachmentShelf attachments={attachments} />
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
          onPaste={canAttach ? (event) => pasteFiles(event, attachments.addFiles) : undefined}
          onKeyDown={(event) => {
            if (matches.length) {
              if (event.key === "ArrowDown") return (event.preventDefault(), setIndex((index + 1) % matches.length));
              if (event.key === "ArrowUp") return (event.preventDefault(), setIndex((index - 1 + matches.length) % matches.length));
              if (event.key === "Enter" || event.key === "Tab") return (event.preventDefault(), choose(matches[index]!.handle));
              if (event.key === "Escape") return setCursor(-1);
            }
            if (event.key === "Escape" && reply) {
              event.preventDefault();
              onCancelReply?.();
              return;
            }
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              send();
            }
          }}
          aria-label={placeholder}
          className="max-h-[220px] w-full resize-none bg-transparent px-3 py-2 text-[15px] outline-none placeholder:text-muted disabled:opacity-60"
        />
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex min-w-0 items-center gap-1">
            {attachHint ? <AttachButton attachments={attachments} hint={attachHint} disabled={disabled} /> : null}
            {canBePrivate || privateNow ? (
              <button
                type="button"
                onClick={() => setPrivate(!isPrivate)}
                disabled={lockedPrivate}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition disabled:cursor-not-allowed ${privateNow ? "bg-private/15 text-private" : "text-muted hover:bg-raised"}`}
                aria-pressed={privateNow}
                title={lockedPrivate ? "A reply to a private message stays private" : "Only you and your own nodes see it"}
              >
                <Lock size={12} /> Only me
              </button>
            ) : null}
            {blocker ? (
              <span id={blockerId} className="min-w-0 truncate text-xs text-warn" role="status" title={blocker}>
                {blocker}
              </span>
            ) : null}
          </div>
          {busy && !value.trim() && !attachments.items.length ? (
            <button type="button" onClick={onStop} className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-raised text-ink hover:bg-line" aria-label="Stop">
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              onClick={send}
              disabled={!canSend}
              title={blocker ?? undefined}
              aria-describedby={blocker ? blockerId : undefined}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition hover:brightness-110 disabled:opacity-40"
              aria-label="Send"
            >
              <ArrowUp size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
