"use client";

import { ExternalLink, Lock } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { fileOriginal } from "@/lib/api";
import { fileChipView, kindLabel, messageFiles, sizeLabel } from "@/lib/attachments";
import type { Message, MessageFile } from "@/lib/types";
import { External } from "../ui";
import { FileKindIcon } from "./attachments";

/** A picture from my own Files, read once its chip is near the screen; null until then, or when it cannot be read. */
function useThumbnail(id: string, enabled: boolean, ref: RefObject<HTMLElement | null>): string | null {
  const [near, setNear] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || near) return;
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setNear(true);
        observer.disconnect();
      },
      { rootMargin: "300px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, near, ref]);
  useEffect(() => {
    if (!enabled || !near) return;
    const controller = new AbortController();
    let made: string | null = null;
    fileOriginal(id, controller.signal).then(
      (blob) => {
        if (controller.signal.aborted || !blob.type.startsWith("image/")) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      },
      () => undefined,
    );
    return () => {
      controller.abort();
      if (made) URL.revokeObjectURL(made);
      setUrl(null);
    };
  }, [enabled, near, id]);
  return url;
}

function FileChip({ file, message, meId, sender }: { file: MessageFile; message: Message; meId: string; sender?: string }) {
  const view = fileChipView(message, file, meId);
  const ref = useRef<HTMLLIElement>(null);
  const thumbnail = useThumbnail(file.id, view.thumbnail, ref);
  const [broken, setBroken] = useState(false);
  const content = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-raised text-muted">
        {thumbnail && !broken ? <img src={thumbnail} alt="" onError={() => setBroken(true)} className="h-full w-full object-cover" /> : <FileKindIcon kind={file.kind} size={17} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{file.name}</span>
        <span className="block truncate text-[11px] text-muted">
          {kindLabel(file.kind)} · {sizeLabel(file.size)}
        </span>
      </span>
      {view.href ? <ExternalLink size={12} className="shrink-0 text-muted" aria-hidden /> : <Lock size={11} className="shrink-0 text-muted" aria-hidden />}
    </>
  );
  const style = "flex w-60 max-w-full items-center gap-2.5 rounded-xl border border-line bg-bg/70 p-1.5 pr-2.5 text-left";
  return (
    <li ref={ref} className="flex max-w-full">
      {view.href ? (
        <External href={view.href} className={`${style} transition hover:border-accent`} title="Open in your Ensemble Files" aria-label={`${file.name}, ${kindLabel(file.kind)}, ${sizeLabel(file.size)}. Open in your Ensemble Files`}>
          {content}
        </External>
      ) : (
        <span className={style} title={`Only ${sender ?? "the sender"} can open this file; your nodes see its name only.`}>
          {content}
        </span>
      )}
    </li>
  );
}

/** The files on a message, under its words. The sender's open in Ensemble's Files; everyone else sees names only. */
export function MessageFiles({ message, meId, sender, align = "start" }: { message: Message; meId: string; sender?: string; align?: "start" | "end" }) {
  const files = messageFiles(message);
  if (!files.length) return null;
  return (
    <ul className={`mt-1.5 flex flex-wrap gap-1.5 ${align === "end" ? "justify-end" : ""}`} aria-label={files.length === 1 ? "1 attached file" : `${files.length} attached files`}>
      {files.map((file) => (
        <FileChip key={file.id} file={file} message={message} meId={meId} sender={sender} />
      ))}
    </ul>
  );
}
