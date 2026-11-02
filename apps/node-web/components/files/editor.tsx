"use client";

import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Columns2, Download, Eye, FileCode2, Files, Maximize2, Quote, RefreshCw, Save, X } from "lucide-react";
import { download, downloadData } from "@/lib/api";
import { fileName, selectionQuote } from "@/lib/original-files";
import { toastError } from "@/lib/toast";
import { useFileBuffer, useFileWorkspace, OpenFileTab } from "./workspace";
import { codeMirrorTheme } from "./codemirror-theme";
import { EditorThemePicker, useEditorTheme } from "./theme-picker";
import { Button, IconButton, Spinner } from "../ui";
import { useAppearance } from "../appearance-provider";

function language(path: string) {
  const extension = path.split(".").at(-1)?.toLowerCase();
  if (["ts", "tsx", "js", "jsx", "mjs", "cjs"].includes(extension ?? "")) return [javascript({ typescript: extension?.startsWith("t"), jsx: extension?.endsWith("x") })];
  if (extension === "py") return [python()];
  if (extension === "json" || extension === "jsonc") return [json()];
  if (extension === "md" || extension === "markdown" || extension === "mdx") return [markdown()];
  if (extension === "css") return [css()];
  if (extension === "html" || extension === "htm") return [html()];
  return [];
}
const baseTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px" },
  ".cm-scroller": { overflow: "auto", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", lineHeight: "1.7" },
  ".cm-content": { padding: "16px 0" },
  ".cm-gutters": { fontSize: "11px", paddingRight: "6px" },
  ".cm-line": { paddingLeft: "12px", paddingRight: "20px" },
  "&.cm-focused": { outline: "none" },
});
const blend = EditorView.theme({
  "&": { backgroundColor: "rgb(var(--bg))", color: "rgb(var(--ink))" },
  ".cm-gutters": { backgroundColor: "rgb(var(--bg))", color: "rgb(var(--muted))", borderRight: "1px solid rgb(var(--line))" },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "rgb(var(--raised) / 0.6)" },
  ".cm-cursor": { borderLeftColor: "rgb(var(--accent))" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "rgb(var(--accent) / 0.2) !important" },
});
const positions = new WeakMap<object, Map<string, { anchor: number; head: number; scroll: number }>>();

export function OriginalEditor({ fileKey }: { fileKey: string }) {
  const { appearance } = useAppearance();
  const [systemLight, setSystemLight] = useState(false);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: light)");
    const update = () => setSystemLight(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const workspace = useFileWorkspace();
  const file = useFileBuffer(fileKey);
  const [theme, setTheme] = useEditorTheme();
  const editor = useRef<ReactCodeMirrorRef>(null);
  const [selection, setSelection] = useState({ from: 0, to: 0, line: 1, column: 1 });
  const [progress, setProgress] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ url: string; mime: string } | null>(null);
  const onSave = useCallback(() => { void workspace.store.save(fileKey); }, [workspace.store, fileKey]);
  const path = file?.entry.source.path ?? "";
  const custom = useMemo(() => codeMirrorTheme(theme), [theme]);
  const extensions = useMemo(() => [
    ...language(path), baseTheme, ...(theme.editor ? custom : [blend]),
    EditorView.contentAttributes.of({ "aria-label": `File contents: ${fileName(path)}`, "aria-multiline": "true", translate: "no" }),
    EditorView.domEventHandlers({ keydown(event) { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); onSave(); return true; } return false; } }),
  ], [path, custom, theme.editor, onSave]);
  useEffect(() => {
    const ref = editor.current;
    void document.fonts.ready.then(() => { if (ref?.view?.dom.isConnected) ref.view.requestMeasure(); });
    return () => {
      const view = ref?.view;
      if (!view) return;
      const cache = positions.get(workspace.store) ?? new Map();
      cache.set(fileKey, { anchor: view.state.selection.main.anchor, head: view.state.selection.main.head, scroll: view.scrollDOM.scrollTop });
      positions.set(workspace.store, cache);
    };
  }, [workspace.store, fileKey, Boolean(file?.data)]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  const updateSelection = useCallback((update: ViewUpdate) => {
    if (!update.selectionSet && !update.docChanged) return;
    const selected = update.state.selection.main;
    const line = update.state.doc.lineAt(selected.head);
    setSelection({ from: selected.from, to: selected.to, line: line.number, column: selected.head - line.from + 1 });
  }, []);
  if (!file) return null;
  const data = file.data;
  const dirty = workspace.store.dirty(fileKey);
  const status = file.status === "saving" ? "Saving…" : file.status === "modified" ? "Unsaved" : file.status === "conflict" ? "Changed on computer" : file.status === "error" ? dirty ? "Not saved" : "Unavailable" : data?.readOnly ? "Read only" : "Saved";
  const selected = selectionQuote(file.entry.source, file.text, selection.from, selection.to, file.hash, dirty);
  const quote = selected ? { ...selected, location: data?.location } : null;
  const tooMuch = Boolean(quote && quote.text.length > 12_000);
  const getFile = async (asPreview = false) => {
    setProgress(0);
    const init = { body: { source: file.entry.source, action: "download" } };
    try {
      if (asPreview) {
        const result = await downloadData("/api/node/files/open", init, setProgress, data?.size);
        const supported = /^image\/(?:png|jpeg|gif|webp|avif|bmp)$|^application\/pdf$|^(?:audio|video)\//.test(result.blob.type);
        if (!supported) throw new Error("This format has no safe browser preview. Use Download to open it on your computer.");
        setPreview({ url: URL.createObjectURL(result.blob), mime: result.blob.type });
      } else await download("/api/node/files/open", fileName(path), setProgress, data?.size, init);
    } catch (error) { toastError(error); }
    finally { setProgress(null); }
  };
  return <>
    <header className="flex min-h-[60px] shrink-0 items-center gap-1 border-b border-line px-2.5">
      <FileCode2 size={17} className="mx-1.5 shrink-0 text-accent/80" />
      <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-medium">{fileName(path)}</h2><p className="truncate text-[10px] text-muted" title={data?.location ?? path}>{data?.location ?? path}</p></div>
      <EditorThemePicker theme={theme} onTheme={setTheme} />
      <IconButton label="Download original" disabled={progress !== null} onClick={() => void getFile()}><Download size={16} /></IconButton>
      <IconButton label={workspace.filesOpen ? "Hide file list" : "Show file list"} aria-pressed={workspace.filesOpen} onClick={workspace.toggleFiles}><Files size={16} /></IconButton>
      <IconButton label={workspace.mode === "editor" ? "Restore chat and editor" : "Focus editor"} onClick={workspace.mode === "editor" ? workspace.restore : workspace.focus}>{workspace.mode === "editor" ? <Columns2 size={16} /> : <Maximize2 size={16} />}</IconButton>
      <IconButton label="Close editor panel" onClick={workspace.hide}><X size={16} /></IconButton>
    </header>
    <div role="tablist" aria-label="Open files" className="scroll-thin flex shrink-0 overflow-x-auto border-b border-line bg-panel">{workspace.tabs.map(key => <OpenFileTab key={key} fileKey={key} />)}</div>
    {file.error ? <div className="shrink-0 border-b border-danger/20 bg-danger/5 px-4 py-3 text-xs leading-5 text-danger" role="alert">{file.error}<div className="mt-2 flex flex-wrap gap-2"><Button size="sm" tone="ghost" onClick={() => void (dirty ? workspace.store.save(fileKey) : workspace.store.refresh(fileKey))}>Retry</Button>{dirty ? <Button size="sm" tone="ghost" onClick={() => void workspace.store.compare(fileKey)}>Compare computer version</Button> : null}</div></div> : null}
    {file.latest ? <section className="shrink-0 border-b border-warn/30 bg-warn/5 px-4 py-3 text-xs" aria-label="File conflict">
      <p className="font-medium">The computer has a different version. Your draft is still in the editor.</p>
      <details className="mt-2"><summary className="cursor-pointer text-muted">Compare latest computer version</summary><pre className="scroll-thin mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-bg p-3 font-mono text-[11px]">{file.latest.content ?? file.latest.readOnly ?? "Binary file"}</pre></details>
      <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" tone="ghost" onClick={() => workspace.store.useComputer(fileKey)}>Use computer version</Button><Button size="sm" disabled={Boolean(file.latest.readOnly)} onClick={() => void workspace.store.keepDraft(fileKey)}>Save my draft over this version</Button></div>
    </section> : null}
    {data?.readOnly ? <p className="shrink-0 border-b border-line bg-panel px-4 py-2 text-[11px] leading-5 text-muted">{data.readOnly}</p> : null}
    {progress !== null ? <div className="shrink-0 px-4 py-2 text-xs text-muted" role="status">Receiving original… {progress}%<progress className="mt-1 h-1 w-full accent-accent" value={progress} max={100} /></div> : null}
    <div id="node-file-panel" role="tabpanel" aria-label={fileName(path)} className="relative min-h-0 flex-1 overflow-hidden" style={theme.editor ? { background: theme.editor.background } : undefined}>
      {file.status === "loading" && !data ? <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted"><Spinner />Opening original on your computer…</div>
        : data?.binary ? <div className="flex h-full min-h-0 flex-col">
          {preview ? <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
            {preview.mime.startsWith("image/") ? <img src={preview.url} alt={fileName(path)} className="h-full w-full object-contain" />
              : preview.mime === "application/pdf" ? <iframe title={`Preview ${fileName(path)}`} sandbox="" src={preview.url} className="h-full w-full border-0" />
                : preview.mime.startsWith("video/") ? <video src={preview.url} controls playsInline className="max-h-full max-w-full" /> : <audio src={preview.url} controls />}
          </div> : <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"><FileCode2 size={36} strokeWidth={1} className="text-muted/60" /><h3 className="text-sm font-medium">{fileName(path)}</h3><p className="max-w-xs text-xs leading-6 text-muted">Preview supported images, media and PDFs, or download the original. This format is not edited as text.</p><div className="flex gap-2"><Button tone="ghost" size="sm" disabled={progress !== null} onClick={() => void getFile(true)}><Eye size={14} />Preview</Button><Button size="sm" disabled={progress !== null} onClick={() => void getFile()}><Download size={14} />Download</Button></div></div>}
        </div> : data ? <CodeMirror ref={editor} value={file.text} height="100%" theme={theme.editor ? "none" : appearance.mode === "light" || (appearance.mode === "system" && systemLight) ? "light" : "dark"} extensions={extensions} readOnly={Boolean(data.readOnly)} editable={!data.readOnly} indentWithTab={false}
          basicSetup={{ foldGutter: true, highlightActiveLine: true, lineNumbers: true, autocompletion: false }}
          onChange={value => workspace.store.change(fileKey, value)} onUpdate={updateSelection}
          onCreateEditor={view => {
            const position = positions.get(workspace.store)?.get(fileKey);
            if (position) {
              const length = view.state.doc.length;
              view.dispatch({ selection: { anchor: Math.min(position.anchor, length), head: Math.min(position.head, length) } });
              requestAnimationFrame(() => { if (view.dom.isConnected) view.scrollDOM.scrollTop = position.scroll; });
            }
          }} className="h-full min-h-0" /> : <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">The original could not be opened. Your computer may need to reconnect.</div>}
    </div>
    <footer className="flex min-h-10 shrink-0 items-center gap-2 border-t border-line bg-panel px-3 text-[11px] text-muted">
      <span className={`inline-flex items-center gap-1.5 ${file.status === "error" || file.status === "conflict" ? "text-danger" : ""}`} role="status">{file.status === "saving" ? <Spinner className="!size-3" /> : status === "Saved" ? <Check size={12} /> : null}{status}</span>
      {data && !data.readOnly ? <IconButton label="Save file (Ctrl or Cmd S)" className="!size-7" disabled={!dirty || file.status === "saving"} onClick={onSave}><Save size={13} /></IconButton> : null}
      {data ? <IconButton label="Refresh original (compare if unsaved)" className="!size-7" disabled={file.refreshing} onClick={() => void workspace.store.refresh(fileKey)}>{file.refreshing ? <Spinner className="!size-3" /> : <RefreshCw size={12} />}</IconButton> : null}
      <span className="ml-auto hidden shrink-0 tabular-nums sm:inline">Ln {selection.line}, Col {selection.column}</span>
      <button type="button" disabled={!quote || tooMuch} title={tooMuch ? "Select at most 12,000 characters" : "Include selected file lines in this chat"} onMouseDown={event => event.preventDefault()} onClick={() => { if (quote && !tooMuch) workspace.quote(quote); }} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs text-accent hover:bg-raised disabled:text-muted disabled:opacity-50"><Quote size={14} />Quote selection</button>
    </footer>
  </>;
}
