export const APPEARANCE_KEY = "node.appearance.v1";
export const MODES = ["system", "light", "dark"] as const;
export const PALETTES = [
  { id: "ensemble", name: "Deep Petrol", light: ["250 248 244", "255 255 255", "243 240 233", "228 223 212", "28 26 22", "105 99 89"], dark: ["10 20 22", "14 26 28", "24 39 42", "38 55 58", "236 233 224", "155 171 168"] },
  { id: "graphite", name: "Graphite", light: ["244 246 248", "255 255 255", "237 240 244", "216 222 230", "24 33 47", "72 85 106"], dark: ["17 21 27", "23 28 36", "32 38 48", "48 57 70", "242 244 248", "176 186 201"] },
  { id: "juniper", name: "Juniper", light: ["244 245 236", "253 254 246", "236 240 228", "215 223 207", "40 55 42", "76 92 70"], dark: ["24 32 28", "29 42 34", "40 54 44", "55 72 59", "238 243 232", "195 207 185"] },
] as const;
export const ACCENTS = [
  { id: "gold", name: "Satin Gold", dark: "#D7B56F", light: "#876324" },
  { id: "indigo", name: "Indigo", dark: "#9E94FF", light: "#5346D6" },
  { id: "tide", name: "Tide", dark: "#5DCEC6", light: "#0F766E" },
  { id: "rose", name: "Rose", dark: "#F0A0B8", light: "#BE185D" },
  { id: "moss", name: "Moss", dark: "#A9CC7E", light: "#3F6B24" },
] as const;
export const DOODLES = [
  { id: "none", name: "Plain" },
  { id: "constellation", name: "Constellation" },
  { id: "orbits", name: "Orbits" },
  { id: "botanical", name: "Botanical" },
  { id: "jot", name: "Little things" },
] as const;

export type Appearance = {
  mode: typeof MODES[number];
  palette: typeof PALETTES[number]["id"];
  accent: typeof ACCENTS[number]["id"];
  doodle: typeof DOODLES[number]["id"];
  motion: "subtle" | "off";
};
export const DEFAULT_APPEARANCE: Appearance = { mode: "system", palette: "ensemble", accent: "gold", doodle: "none", motion: "subtle" };
const allowed = {
  mode: MODES,
  palette: PALETTES.map(row => row.id),
  accent: ACCENTS.map(row => row.id),
  doodle: DOODLES.map(row => row.id),
  motion: ["subtle", "off"],
};

export function normaliseAppearance(value: unknown): Appearance {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const result = { ...DEFAULT_APPEARANCE };
  for (const key of Object.keys(allowed) as (keyof Appearance)[]) {
    if ((allowed[key] as readonly unknown[]).includes(row[key])) Object.assign(result, { [key]: row[key] });
  }
  return result;
}

const rgb = (hex: string) => `${parseInt(hex.slice(1, 3), 16)} ${parseInt(hex.slice(3, 5), 16)} ${parseInt(hex.slice(5, 7), 16)}`;
export const APPEARANCE_STYLES = [
  ...PALETTES.flatMap(palette => (["light", "dark"] as const).map(mode =>
    `:root[data-palette="${palette.id}"][data-theme="${mode}"]{${["bg", "panel", "raised", "line", "ink", "muted"].map((key, index) => `--${key}:${palette[mode][index]}`).join(";")}}`)),
  ...ACCENTS.flatMap(accent => (["light", "dark"] as const).map(mode =>
    `:root[data-accent="${accent.id}"][data-theme="${mode}"]{--accent:${rgb(accent[mode])};--accent-ink:${mode === "light" ? "255 255 255" : "20 18 15"}}`)),
].join("\n");

// Paint saved preferences before hydration; the provider reports storage errors once mounted.
export const APPEARANCE_SCRIPT = `(()=>{let saved={};try{saved=JSON.parse(localStorage.getItem(${JSON.stringify(APPEARANCE_KEY)})||"{}")||{}}catch{console.warn("Node appearance could not be restored.")}const root=document.documentElement;const defaults=${JSON.stringify(DEFAULT_APPEARANCE)};const allowed=${JSON.stringify(allowed)};for(const key of Object.keys(defaults))root.dataset[key]=allowed[key].includes(saved[key])?saved[key]:defaults[key];root.dataset.theme=root.dataset.mode==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):root.dataset.mode})()`;
