"use client";

import { Pin, PinOff } from "lucide-react";
import { useEffect, useState } from "react";
import { plainPreview } from "@/lib/chat";
import { readableBody } from "@/lib/entity-text";
import { usePin, usePins } from "@/lib/hooks";
import { ago } from "@/lib/text";
import type { Message, Room } from "@/lib/types";
import { Drawer, Spinner } from "../ui";
import { authorLabel, type MessageContext } from "./message";

const excerpt = (message: Message) => plainPreview(message.kind === "run" ? `Run: ${message.body}` : readableBody(message)).slice(0, 140);

/** The newest pin under the header; each click goes to the next one, like a chat app's pinned bar. */
export function PinnedBar({ room, ctx, onAll }: { room: Room; ctx: MessageContext; onAll: () => void }) {
  const pins = usePins(room.id, room.pinned.length > 0);
  const [at, setAt] = useState(0);
  const list = pins.data ?? [];
  useEffect(() => setAt(0), [room.pinned.length]);
  if (!room.pinned.length || !list.length) return null;
  const current = list[at % list.length]!;
  return (
    <div className="flex items-center gap-2 border-b border-line bg-panel/70 px-3 py-1.5 md:px-5">
      <button
        type="button"
        onClick={() => {
          ctx.onJump(current.id);
          setAt((at + 1) % list.length);
        }}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-0.5 text-left hover:bg-raised"
        title="Go to the pinned message"
      >
        <span className="flex shrink-0 flex-col gap-0.5" aria-hidden>
          {list.slice(0, 4).map((row, index) => (
            <span key={row.id} className={`h-2 w-[3px] rounded-full ${index === at % Math.min(4, list.length) ? "bg-accent" : "bg-line"}`} />
          ))}
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-medium text-accent">
            Pinned{list.length > 1 ? ` · ${(at % list.length) + 1} of ${list.length}` : ""}
          </span>
          <span className="block truncate text-sm">
            <span className="text-muted">{authorLabel(current, ctx)}: </span>
            {excerpt(current)}
          </span>
        </span>
      </button>
      <button type="button" onClick={onAll} className="shrink-0 rounded-lg px-2 py-1 text-xs text-muted hover:bg-raised hover:text-ink" aria-label="All pinned messages">
        <Pin size={14} />
      </button>
    </div>
  );
}

export function PinsDrawer({ room, ctx, open, onClose, max }: { room: Room; ctx: MessageContext; open: boolean; onClose: () => void; max: number }) {
  const pins = usePins(room.id, open);
  const pin = usePin(room.id);
  return (
    <Drawer open={open} onClose={onClose} title="Pinned messages">
      <p className="mb-3 text-xs text-muted">Everyone in this conversation sees these. Up to {max}; only messages everyone here can read.</p>
      {pins.isLoading ? (
        <div className="flex justify-center py-6 text-muted">
          <Spinner />
        </div>
      ) : (pins.data ?? []).length ? (
        <ul className="space-y-2">
          {(pins.data ?? []).map((message) => (
            <li key={message.id} className="rounded-xl border border-line bg-bg p-3">
              <button
                type="button"
                className="block w-full text-left"
                onClick={() => {
                  onClose();
                  ctx.onJump(message.id);
                }}
              >
                <span className="flex items-center justify-between gap-2 text-xs text-muted">
                  <span className="font-medium text-ink">{authorLabel(message, ctx)}</span>
                  <span>{ago(message.createdAt)}</span>
                </span>
                <span className="mt-1 line-clamp-3 block text-sm">{excerpt(message)}</span>
              </button>
              <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs text-muted hover:text-danger" onClick={() => pin.mutate({ messageId: message.id, pinned: false })}>
                <PinOff size={12} /> Unpin
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Nothing is pinned. Pin a message from its menu (hover it, or press and hold on a phone).</p>
      )}
    </Drawer>
  );
}
