import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = process.argv[2];
if (!source) throw new Error("Usage: node scripts/sync-document-viewers.mjs /path/to/ensemble");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = join(root, "packages/document-viewers/src");
await mkdir(destination, { recursive: true });
const files = [
  ...["docx-viewer.tsx", "pdf-viewer.tsx", "pptx-viewer.tsx", "present.tsx"].map(name => [`apps/hub-web/components/files/viewers/${name}`, name]),
  ...["pptx.ts", "pdfjs.ts", "pdf-worker.ts", "stream-iteration.ts"].map(name => [`apps/hub-web/lib/files/${name}`, name]),
];
const manifest = { repository: "https://github.com/ensemblework/ensemble", commit: execFileSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), files: [] };
for (const [path, name] of files) {
  const original = await readFile(join(source, path), "utf8");
  let content = original.replaceAll('"../../ui"', '"./ui"').replaceAll('"@/lib/files/pptx"', '"./pptx"').replaceAll('"@/lib/files/pdfjs"', '"./pdfjs"');
  content = content.replaceAll("text-faint", "text-muted").replaceAll("bg-accent-soft", "bg-accent/10").replaceAll("hover:bg-hover", "hover:bg-raised").replaceAll("shadow-pop", "shadow-xl");
  if (name === "docx-viewer.tsx") content = content.replace('<meta charset="utf-8">', `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data: blob:;">`);
  if (name === "pdf-viewer.tsx") {
    content = content.replace('const [drawn, setDrawn] = useState(false);', 'const [drawn, setDrawn] = useState(false);\n  const [error, setError] = useState<string | null>(null);');
    content = content.replace('.catch(() => undefined);', '.catch((problem: unknown) => { if (live && !(problem instanceof Error && problem.name === "RenderingCancelledException")) setError(pdfError(problem)); });');
    content = content.replace('<canvas ref={canvas}', '{error ? <p role="alert" className="absolute inset-0 bg-white p-4 text-sm text-red-700">{error}</p> : null}\n      <canvas ref={canvas}');
  }
  await writeFile(join(destination, name), content);
  manifest.files.push({ path, sha256: createHash("sha256").update(original).digest("hex") });
}
await copyFile(join(source, "LICENSE.md"), join(root, "packages/document-viewers/LICENSE.md"));
await writeFile(join(root, "packages/document-viewers/provenance.json"), JSON.stringify(manifest, null, 2) + "\n");
