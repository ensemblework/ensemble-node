"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";
import { downloadData } from "@/lib/api";
import type { OriginalSource } from "@/lib/original-files";
import { Spinner } from "../ui";
import { ToolbarTarget } from "@ensemble-node/document-viewers/controls";
import { evidenceBlob } from "@/lib/api";

const loading = () => <div className="flex h-full items-center justify-center" role="status" aria-label="Loading document preview"><Spinner /></div>;
const Pdf = dynamic(() => import("@ensemble-node/document-viewers/pdf"), { ssr: false, loading });
const Word = dynamic(() => import("@ensemble-node/document-viewers/docx"), { ssr: false, loading });
const Slides = dynamic(() => import("@ensemble-node/document-viewers/pptx"), { ssr: false, loading });
const Sheet = dynamic(() => import("./sheet-preview"), { ssr: false, loading });

class PreviewBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state: { error: string | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error: error.message || "This preview could not be displayed." }; }
  render() {
    return this.state.error ? <p role="alert" className="p-6 text-sm text-danger">{this.state.error} Download the original to open it on your computer.</p> : this.props.children;
  }
}
export type PreviewSource = { source: OriginalSource } | { evidenceId: string; messageId: string | null };
export function DocumentPreview({ name, toolbar, ...input }: PreviewSource & { name: string; toolbar?: HTMLElement | null }) {
  const [state, setState] = useState<{ bytes: ArrayBuffer; mime: string; url: string } | { error: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const sourceKey = JSON.stringify(input);
  useEffect(() => {
    let active = true, objectUrl: string | null = null;
    setState(null);
    const target = JSON.parse(sourceKey) as PreviewSource;
    const download = "source" in target ? downloadData("/api/node/files/open", { body: { source: target.source, action: "download" } }) : evidenceBlob(target.evidenceId, undefined, target.messageId).then(blob => ({ blob }));
    void download.then(async ({ blob }) => {
      const bytes = await blob.arrayBuffer();
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setState({ bytes, mime: blob.type, url: objectUrl });
    }).catch(error => { if (active) setState({ error: error instanceof Error ? error.message : "The original could not be read." }); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [sourceKey, attempt]);
  if (!state) return loading();
  if ("error" in state) return <div role="alert" className="p-6 text-sm leading-6 text-danger">{state.error}<button type="button" className="mt-3 block rounded-lg border border-line px-3 py-1 text-ink hover:bg-raised" onClick={() => setAttempt(value => value + 1)}>Retry preview</button></div>;
  const extension = name.split(".").at(-1)?.toLowerCase();
  const props = { file: { filename: name }, bytes: state.bytes, compact: false };
  return <PreviewBoundary><ToolbarTarget value={toolbar ?? null}><div className="document-preview h-full min-h-0" aria-label={`Preview ${name}`}>
    {extension === "docx" ? <Word {...props} /> : extension === "pptx" ? <Slides {...props} /> : extension === "pdf" ? <Pdf {...props} />
      : ["xlsx", "xls", "xlsm", "ods"].includes(extension ?? "") ? <Sheet bytes={state.bytes} />
        : /^image\/(?:png|jpeg|gif|webp|avif|bmp)$/.test(state.mime) ? <img src={state.url} alt={name} className="h-full w-full object-contain p-4" />
          : state.mime.startsWith("video/") ? <video src={state.url} controls playsInline aria-label={name} className="h-full w-full object-contain" />
            : state.mime.startsWith("audio/") ? <div className="flex h-full items-center justify-center"><audio src={state.url} controls aria-label={name} /></div>
              : <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"><h3 className="text-sm font-medium">{name}</h3><p className="max-w-sm text-xs leading-6 text-muted">This format has no safe browser preview. Download the original from the file header to open it on your computer. Legacy .doc and .ppt files must be converted to .docx or .pptx first.</p></div>}
  </div></ToolbarTarget></PreviewBoundary>;
}
