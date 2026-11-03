"use client";

import { useEffect, useState } from "react";
import { Columns2, Download, Files, Maximize2, X } from "lucide-react";
import { download, evidenceHead } from "@/lib/api";
import { evidencePath } from "@/lib/evidence";
import { decodePreview, previewContent, textPreviewKind } from "@/lib/file-preview";
import type { EvidenceItem } from "@/lib/types";
import { toastError } from "@/lib/toast";
import { IconButton, Spinner } from "../ui";
import { RichText } from "../chat/rich-text";
import { DocumentPreview } from "./document-preview";
import { useFileWorkspace } from "./workspace";
import { CopyButton } from "../chat/code-block";

export function SharedFile({ item, messageId }: { item: EvidenceItem; messageId: string | null }) {
  const workspace = useFileWorkspace();
  const focus = workspace.mode === "editor";
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null);
  const [content, setContent] = useState<{ text: string; truncated: boolean } | { error: string } | null>(null);
  const kind = textPreviewKind(item);
  useEffect(() => {
    if (!kind) return;
    let active = true;
    setContent(null);
    void evidenceHead(item.id, 1024 * 1024, messageId).then(({ bytes, truncated }) => {
      if (active) setContent({ text: previewContent(kind, decodePreview(bytes), truncated), truncated });
    }).catch(error => { if (active) setContent({ error: error instanceof Error ? error.message : "The shared file could not be opened." }); });
    return () => { active = false; };
  }, [item.id, kind, messageId]);
  return <>
    <header data-reader-header className={`flex shrink-0 flex-wrap items-center gap-1 border-b border-line px-2 ${focus ? "min-h-10" : "min-h-[60px]"}`}>
      <div className="min-w-0 flex-1 px-2"><h2 className="truncate text-xs font-medium" title={item.name}>{item.name}</h2>{!focus ? <p className="text-[10px] text-muted">Shared copy · read only</p> : null}</div>
      {focus ? <div ref={setToolbar} className="document-reading-controls order-last flex min-h-9 w-full flex-wrap items-center gap-1 text-xs text-muted sm:order-none sm:w-auto" /> : null}
      {content && "text" in content && kind !== "markdown" ? <CopyButton text={content.text} label={`Copy ${item.name}`} /> : null}
      <IconButton label="Download shared file" onClick={() => void download(evidencePath(item.id, messageId), item.name).catch(toastError)}><Download size={15} /></IconButton>
      <IconButton label={workspace.filesOpen ? "Hide file list" : "Show file list"} onClick={workspace.toggleFiles}><Files size={15} /></IconButton>
      <IconButton label={focus ? "Restore chat and editor" : "Focus editor"} onClick={focus ? workspace.restore : workspace.focus}>{focus ? <Columns2 size={15} /> : <Maximize2 size={15} />}</IconButton>
      <IconButton label="Close editor panel" onClick={workspace.hide}><X size={15} /></IconButton>
    </header>
    <div className="min-h-0 flex-1 overflow-hidden">
      {!kind ? <DocumentPreview evidenceId={item.id} messageId={messageId} name={item.name} toolbar={focus ? toolbar : null} />
        : !content ? <div className="flex h-full items-center justify-center" role="status" aria-label="Opening shared file"><Spinner /></div>
          : "error" in content ? <p role="alert" className="p-5 text-sm text-danger">{content.error}</p>
            : <div className="scroll-thin h-full overflow-auto p-5">{content.truncated ? <p className="mb-3 text-xs text-muted">Showing the first 1 MB. Download the file for the rest.</p> : null}{kind === "markdown" ? <RichText text={content.text} handles={new Set()} document /> : <pre className="font-mono text-xs leading-6">{content.text}</pre>}</div>}
    </div>
  </>;
}
