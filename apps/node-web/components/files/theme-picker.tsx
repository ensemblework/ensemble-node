"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BUILTINS, convertExtensionThemes, convertTheme, ensembleDefaultTheme, loadBuiltinTheme, parseJsonc, sanitizeIdeTheme, type IdeTheme, type ThemeDirectoryExtension, type VsThemeDocument } from "@ensemble/ide-theme";
import { Palette, Search, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { toastError } from "@/lib/toast";
import { Button, Drawer, IconButton, Spinner } from "../ui";
import { useFileWorkspace } from "./workspace";

export function useEditorTheme() {
  const { accountId } = useFileWorkspace();
  const client = useQueryClient();
  const key = ["node-editor-theme", accountId];
  const current = useQuery({ queryKey: key, queryFn: ({ signal }) => api<{ theme: IdeTheme }>("/api/node/themes/current", { signal }), staleTime: 30_000 });
  const save = useMutation({
    mutationFn: (theme: IdeTheme) => api<{ theme: IdeTheme }>("/api/node/themes/current", { method: "PUT", body: { theme } }),
    onMutate: () => client.cancelQueries({ queryKey: key }),
    onSuccess: result => client.setQueryData(key, result),
  });
  useEffect(() => {
    if (current.error) toastError(current.error);
  }, [current.error]);
  return [current.data?.theme ?? ensembleDefaultTheme, async (theme: IdeTheme) => { await save.mutateAsync(theme); }, current.isPending] as const;
}

async function importedThemes(file: File): Promise<IdeTheme[]> {
  if (file.size > 12 * 1024 * 1024) throw new Error("Choose a theme package smaller than 12 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fingerprint = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(byte => byte.toString(16).padStart(2, "0")).join("");
  const decode = new TextDecoder();
  if (/\.jsonc?$/i.test(file.name)) {
    if (file.size > 512 * 1024) throw new Error("Choose a colour file smaller than 512 KB.");
    const document = parseJsonc(decode.decode(bytes)) as VsThemeDocument;
    if (!document || typeof document !== "object" || Array.isArray(document)) throw new Error("Choose a VS Code colour theme JSON object.");
    if (document.include) throw new Error("This theme includes other files. Import its VSIX package instead.");
    const result = convertTheme({ id: `import:${fingerprint}`, label: document.name || file.name.replace(/\.jsonc?$/i, ""), uiTheme: document.type === "light" ? "vs" : "vs-dark", document });
    if (!result.ok) throw new Error(result.reason);
    return [result.theme];
  }
  if (!/\.vsix$/i.test(file.name)) throw new Error("Choose a VSIX package or a VS Code colour theme JSON file.");
  const { unzipSync } = await import("fflate");
  let total = 0;
  const archive = unzipSync(bytes, { filter: entry => {
    const safe = entry.name.startsWith("extension/") && /\.json$/i.test(entry.name) && !entry.name.includes("..") && entry.originalSize <= 512 * 1024;
    if (safe) total += entry.originalSize;
    if (total > 2 * 1024 * 1024) throw new Error("This package contains too much theme data.");
    return safe;
  } });
  const files = new Map(Object.entries(archive).map(([name, value]) => [name.slice("extension/".length), decode.decode(value)]));
  const manifest = files.get("package.json");
  if (!manifest) throw new Error("This package has no theme manifest.");
  const result = convertExtensionThemes({ namespace: "imported", name: "theme", version: "1", packageJson: parseJsonc(manifest), files });
  const themes = result.themes.flatMap((entry, index) => entry.theme ? [{ ...entry.theme, id: `import:${fingerprint}:${index}` }] : []);
  if (!themes.length) throw new Error(result.note || result.themes[0]?.reason || "No supported JSON colour themes found.");
  return themes;
}

export function EditorThemePicker({ theme, onTheme }: { theme: IdeTheme; onTheme: (theme: IdeTheme) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [imported, setImported] = useState<IdeTheme[]>([]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { const timer = setTimeout(() => setSearch(query.trim()), 350); return () => clearTimeout(timer); }, [query]);
  const directory = useQuery({ queryKey: ["node-editor-themes", search], queryFn: ({ signal }) => api<{ extensions: ThemeDirectoryExtension[] }>(`/api/node/themes/search?q=${encodeURIComponent(search)}`, { signal }), enabled: open && search.length >= 2, staleTime: 300_000 });
  const choose = async (id: string, load: () => Promise<IdeTheme>) => {
    setBusy(id);
    try { await onTheme(await load()); setOpen(false); }
    catch (error) { toastError(error); }
    finally { setBusy(null); }
  };
  return <>
    <IconButton label="Editor theme" onClick={() => setOpen(true)}><Palette size={16} /></IconButton>
    <Drawer open={open} onClose={() => setOpen(false)} title="Editor theme" side="right">
      <p className="mb-4 text-sm leading-6 text-muted">The same colour themes as Ensemble. Theme data changes colours only; extension code never runs.</p>
      <div className="grid grid-cols-2 gap-2">{BUILTINS.map(item => <button key={item.id} type="button" disabled={Boolean(busy)} onClick={() => void choose(item.id, async () => { const result = await loadBuiltinTheme(item.id); if (!result) throw new Error("That theme could not be loaded."); return result; })} aria-pressed={theme.id === item.id} title={item.attribution} className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs ${theme.id === item.id ? "border-accent bg-accent/5" : "border-line hover:bg-raised"}`}>{busy === item.id ? <Spinner className="!size-3" /> : <span className={`size-2.5 shrink-0 rounded-full border border-line ${item.kind === "light" ? "bg-white" : "bg-slate-800"}`} />}{item.label}</button>)}</div>
      <div className="my-5 border-t border-line" />
      <label className="search-field flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-muted"><Search size={15} aria-hidden /><input name="theme-search" autoComplete="off" spellCheck={false} value={query} onChange={event => setQuery(event.target.value)} aria-label="Search editor themes" placeholder="Search Open VSX themes…" className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none md:text-sm" /></label>
      {directory.isFetching ? <p className="mt-4 text-sm text-muted"><Spinner /> Searching themes…</p> : null}
      {directory.error ? <p className="mt-4 text-sm text-danger" role="alert">{directory.error.message}</p> : null}
      {directory.data?.extensions.map(extension => <section key={`${extension.namespace}/${extension.name}`} className="mt-4"><h3 className="text-sm font-medium">{extension.displayName}</h3><p className="text-xs text-muted">{extension.publisher}</p><div className="mt-2 flex flex-wrap gap-2">{extension.themes.map(item => <Button key={item.id} size="sm" tone={theme.id === item.id ? "primary" : "ghost"} disabled={!item.supported || Boolean(busy)} busy={busy === item.id} title={item.reason} onClick={() => void choose(item.id, async () => { const loaded = await api<{ theme: IdeTheme | null; reason?: string }>(`/api/node/themes/openvsx?${new URLSearchParams({ namespace: extension.namespace, name: extension.name, version: extension.version, label: item.label })}`); const clean = sanitizeIdeTheme(loaded.theme); if (!clean) throw new Error(loaded.reason || "This extension has no supported colour theme."); return clean; })}>{item.label}</Button>)}</div>{extension.note ? <p className="mt-2 text-xs text-muted">{extension.note}</p> : null}</section>)}
      {search.length >= 2 && directory.data && !directory.data.extensions.length ? <p className="mt-4 text-sm text-muted">No matching colour themes.</p> : null}
      <div className="my-5 border-t border-line" />
      <input ref={input} type="file" accept=".json,.jsonc,.vsix" className="hidden" onChange={event => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (!file) return;
        setBusy("import");
        void importedThemes(file).then(async themes => { setImported(themes); if (themes.length === 1) { await onTheme(themes[0]!); setOpen(false); } }).catch(toastError).finally(() => setBusy(null));
      }} />
      <Button tone="ghost" busy={busy === "import"} disabled={Boolean(busy)} onClick={() => input.current?.click()}><Upload size={15} />Import JSON or VSIX</Button>
      {imported.length > 1 ? <div className="mt-3 flex flex-wrap gap-2">{imported.map(item => <Button key={item.id} tone="ghost" size="sm" disabled={Boolean(busy)} onClick={() => void choose(item.id, async () => item)}>{item.label}</Button>)}</div> : null}
      <p className="mt-4 text-xs leading-5 text-muted">Syntax and editor colours are supported. Icon packs and themes that need extension scripts are not.</p>
    </Drawer>
  </>;
}
