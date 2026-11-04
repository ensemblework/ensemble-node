import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const source = process.argv[2];
if (!source) throw new Error("Usage: node scripts/sync-brand.mjs /path/to/ensemble");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "packages/brand");
await mkdir(target, { recursive: true });
const files = ["index.js", "index.d.ts", "artwork.json", "geometry.js", "motion.js", "motion.d.ts", "motion-data.json", "motion.css"];
const provenance = { repository: "https://github.com/ensemblework/ensemble", commit: execFileSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), files: [] };
for (const name of files) {
  const path = `packages/brand/${name}`;
  const bytes = await readFile(join(source, path));
  await copyFile(join(source, path), join(target, name));
  provenance.files.push({ path, sha256: createHash("sha256").update(bytes).digest("hex") });
}
await copyFile(join(source, "LICENSE.md"), join(target, "LICENSE.md"));
const require = createRequire(join(source, "packages/brand/package.json"));
const { staticSVG } = require("./index.js");
await writeFile(join(root, "apps/node-web/public/brand/woven-micro-gold.svg"), staticSVG(20, { id: "node-micro", tone: "gold", micro: true }) + "\n");
await writeFile(join(target, "provenance.json"), JSON.stringify(provenance, null, 2) + "\n");
