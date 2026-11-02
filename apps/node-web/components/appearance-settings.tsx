"use client";

import { Check, Moon, Monitor, Sun } from "lucide-react";
import { ACCENTS, DOODLES, PALETTES, type Appearance } from "@/lib/appearance";
import { useAppearance } from "./appearance-provider";
import { Switch } from "./ui";

export function AppearanceSettings() {
  const { appearance, update } = useAppearance();
  const choice = <K extends keyof Appearance>(key: K, id: Appearance[K]) => ({
    "aria-pressed": appearance[key] === id,
    onClick: () => update({ [key]: id }),
  });
  return (
    <section id="appearance" className="scroll-mt-6 space-y-6 rounded-2xl border border-line bg-panel p-5" aria-labelledby="appearance-heading">
      <div>
        <h2 id="appearance-heading" className="font-semibold">Appearance</h2>
        <p className="mt-1 text-sm text-muted">Ensemble colours, a quieter canvas. Saved in this browser.</p>
      </div>
      <div role="group" aria-label="Mode" className="grid grid-cols-3 gap-2">
        {([{ id: "system", name: "System", icon: Monitor }, { id: "light", name: "Light", icon: Sun }, { id: "dark", name: "Dark", icon: Moon }] as const).map(({ id, name, icon: Icon }) =>
          <button type="button" key={id} {...choice("mode", id)} className="appearance-choice flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-2 text-sm"><Icon size={16} aria-hidden />{name}</button>)}
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium">Colour theme</h3>
        <div role="group" aria-label="Colour theme" className="grid grid-cols-3 gap-2">
          {PALETTES.map(palette => <button type="button" key={palette.id} {...choice("palette", palette.id)} className="appearance-choice min-w-0 overflow-hidden rounded-xl border border-line text-left">
            <span className="flex h-14 items-end gap-1 p-2" style={{ background: `rgb(${palette.dark[0]})` }} aria-hidden>
              <span className="h-full w-4 rounded" style={{ background: `rgb(${palette.dark[2]})` }} />
              <span className="mb-1 h-3 w-12 rounded" style={{ background: `rgb(${palette.dark[5]} / .4)` }} />
            </span>
            <span className="flex min-h-11 items-center justify-between gap-1 px-2 text-xs sm:text-sm">{palette.name}{appearance.palette === palette.id ? <Check size={13} className="shrink-0" aria-hidden /> : null}</span>
          </button>)}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium">Accent</h3>
        <div role="group" aria-label="Accent" className="flex flex-wrap gap-2">
          {ACCENTS.map(accent => <button type="button" key={accent.id} {...choice("accent", accent.id)} title={accent.name} aria-label={accent.name} className="appearance-choice flex size-11 items-center justify-center rounded-full border border-line">
            <span className="flex size-6 items-center justify-center rounded-full" style={{ background: accent.dark, color: "#14120f" }}>{appearance.accent === accent.id ? <Check size={14} aria-hidden /> : null}</span>
          </button>)}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-medium">Chat background</h3>
        <p className="mb-3 mt-1 text-xs text-muted">Spacious, faint doodles. Just in your conversations.</p>
        <div role="group" aria-label="Chat background" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DOODLES.map(doodle => <button type="button" key={doodle.id} {...choice("doodle", doodle.id)} className="appearance-choice overflow-hidden rounded-xl border border-line text-left">
            <span className="chat-wallpaper relative isolate flex h-20 items-center justify-center bg-bg" data-doodle={doodle.id} aria-hidden>
              <span className="relative flex w-3/5 flex-col gap-1.5 rounded-lg border border-line bg-panel p-2"><span className="h-1 w-3/4 rounded bg-muted/40" /><span className="h-1 w-1/2 rounded bg-muted/20" /></span>
            </span>
            <span className="flex min-h-11 items-center justify-between px-3 text-xs">{doodle.name}{appearance.doodle === doodle.id ? <Check size={13} aria-hidden /> : null}</span>
          </button>)}
        </div>
      </div>
      <Switch label="Quiet mode" hint="Keep node expressions still. Your device's reduced-motion preference is always respected." checked={appearance.motion === "off"} onChange={off => update({ motion: off ? "off" : "subtle" })} />
    </section>
  );
}
