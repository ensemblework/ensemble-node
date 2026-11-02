"use client";
/** @jsxRuntime automatic */
/** @jsxImportSource react */

import { useId, useRef } from "react";
import type { Avatar } from "@/lib/types";
import { useVisibleMotion } from "./appearance-provider";

const SHAPES: Record<Avatar["shape"], string> = {
  orb: "M50 6a44 44 0 1 1 0 88a44 44 0 1 1 0-88z",
  square: "M22 8h56a14 14 0 0 1 14 14v56a14 14 0 0 1-14 14H22A14 14 0 0 1 8 78V22A14 14 0 0 1 22 8z",
  spark: "M50 4l11 24 25-6-14 22 20 18-26 3 2 26-18-18-18 18 2-26-26-3 20-18-14-22 25 6z",
  hex: "M50 5l39 22v46L50 95 11 73V27z",
  leaf: "M50 6c30 8 44 30 40 58-3 20-20 32-40 32S13 84 10 64C6 36 20 14 50 6z",
  compass: "M50 4l14 32 32 14-32 14-14 32-14-32L4 50l32-14z",
};
export const AVATAR_PATHS = SHAPES;
export const AVATAR_MORPHS: Record<Avatar["shape"], string> = {
  orb: "M50 14a46 36 0 1 1 0 72a46 36 0 1 1 0-72z",
  square: "M34 8h32a26 26 0 0 1 26 26v32a26 26 0 0 1-26 26H34A26 26 0 0 1 8 66V34A26 26 0 0 1 34 8z",
  spark: "M50 12l13 18 17-6-8 20 15 16-22 4 1 21-16-12-16 12 1-21-22-4 15-16-8-20 17 6z",
  hex: "M50 10l42 19v42L50 90 8 71V29z",
  leaf: "M50 12c34 2 44 26 37 52-5 18-18 25-37 25S17 80 13 64C6 38 16 17 50 12z",
  compass: "M50 10l18 22 22 18-22 18-18 22-18-22L10 50l22-18z",
};

/**
 * Where the eyes sit on each shape: the face's centre, half the distance between the eyes and their
 * scale. The spark's body is a ring about 19 units from its centre and the compass's a 28-unit square,
 * so their eyes are smaller and closer together to stay inside.
 */
const FACES: Record<Avatar["shape"], { x: number; y: number; gap: number; scale: number }> = {
  orb: { x: 50, y: 48, gap: 11, scale: 1 },
  square: { x: 50, y: 48, gap: 11, scale: 1 },
  spark: { x: 50, y: 50, gap: 9, scale: 0.85 },
  hex: { x: 50, y: 50, gap: 11, scale: 1 },
  leaf: { x: 50, y: 55, gap: 11, scale: 1 },
  compass: { x: 50, y: 50, gap: 8, scale: 0.66 },
};

const DEFAULT_LOOK: Avatar = { shape: "orb", color: "#D7B56F", eyes: "dot" };
const DARK_EYES = "#14110C";
const LIGHT_EYES = "#FBF8F1";

type Rgb = [number, number, number];

const parse = (color: string): Rgb | null => {
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const value = parseInt(match[1]!, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};
const toHex = (rgb: Rgb) => `#${rgb.map((part) => part.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
const mix = (rgb: Rgb, target: number, amount: number): Rgb => rgb.map((part) => Math.round(part + (target - part) * amount)) as Rgb;
const luminance = (rgb: Rgb) => {
  const [r, g, b] = rgb.map((part) => {
    const c = part / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * The tones of a face from its one colour, all opaque: a lighter highlight and a slightly darker
 * shade of the same hue for the gradient, a darker edge, and the eyes in whichever of dark or light
 * contrasts more with the colour.
 */
export function avatarTones(color: string): { base: string; light: string; shade: string; edge: string; eyes: string } {
  const rgb = parse(color) ?? parse(DEFAULT_LOOK.color)!;
  return {
    base: color,
    light: toHex(mix(rgb, 255, 0.5)),
    shade: toHex(mix(rgb, 0, 0.1)),
    edge: toHex(mix(rgb, 0, 0.3)),
    // Black and white contrast equally with a colour of luminance 0.179.
    eyes: luminance(rgb) > 0.179 ? DARK_EYES : LIGHT_EYES,
  };
}

const r2 = (value: number) => Math.round(value * 100) / 100;

function Eyes({ look }: { look: Avatar }) {
  const { x, y, gap, scale } = FACES[look.shape];
  if (look.eyes === "line") {
    const width = 14 * scale;
    const height = 5 * scale;
    const spread = gap + scale;
    return (
      <>
        <rect className="node-eye-left" x={r2(x - spread - width / 2)} y={r2(y + 1.5 * scale - height / 2)} width={r2(width)} height={r2(height)} rx={r2(height / 2)} />
        <rect className="node-eye-right" x={r2(x + spread - width / 2)} y={r2(y + 1.5 * scale - height / 2)} width={r2(width)} height={r2(height)} rx={r2(height / 2)} />
      </>
    );
  }
  if (look.eyes === "wide") {
    const spread = gap + scale;
    return (
      <>
        <ellipse className="node-eye-left" cx={r2(x - spread)} cy={y} rx={r2(7 * scale)} ry={r2(9 * scale)} />
        <ellipse className="node-eye-right" cx={r2(x + spread)} cy={y} rx={r2(7 * scale)} ry={r2(9 * scale)} />
      </>
    );
  }
  return (
    <>
      <circle className="node-eye-left" cx={r2(x - gap)} cy={y} r={r2(5.5 * scale)} />
      <circle className="node-eye-right" cx={r2(x + gap)} cy={y} r={r2(5.5 * scale)} />
    </>
  );
}

export function NodeAvatar({ node, avatar, size = 36, thinking = false, resting = false, dim = false, title }: { node?: { avatar: Avatar } | null; avatar?: Avatar | null; size?: number; thinking?: boolean; resting?: boolean; dim?: boolean; title?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const motion = useVisibleMotion(ref, thinking);
  const saved = avatar ?? node?.avatar;
  const look: Avatar = saved && SHAPES[saved.shape] ? { ...saved, eyes: saved.eyes === "line" || saved.eyes === "wide" ? saved.eyes : "dot", color: parse(saved.color ?? "") ? saved.color : DEFAULT_LOOK.color } : DEFAULT_LOOK;
  const tones = avatarTones(look.color);
  const face = FACES[look.shape];
  // Each instance needs its own gradient, including avatars inside hidden drawers.
  const id = `node-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg ref={ref} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title ?? "Node"} data-node-avatar data-node-shape={look.shape} data-motion-active={motion || undefined} data-resting={resting || undefined} className={`${thinking ? "node-thinking" : ""} ${dim ? "opacity-50 grayscale" : ""} shrink-0`}>
      {title ? <title>{title}</title> : null}
      <defs>
        <radialGradient id={id} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor={tones.light} />
          <stop offset="0.42" stopColor={tones.base} />
          <stop offset="1" stopColor={tones.shade} />
        </radialGradient>
      </defs>
      <g className="node-work">
        <g className="node-body">
          <g className="node-form"><g className="node-pose">
            <path key={look.shape} className="node-silhouette" d={SHAPES[look.shape]} fill={`url(#${id})`} stroke={tones.edge} strokeWidth="2" strokeLinejoin="round" />
          </g></g>
          <g className="node-attention">
            <g className="node-gaze">
              <g className="node-eyes" fill={tones.eyes}><Eyes look={resting ? { ...look, eyes: "line" } : look} /></g>
              <g className="node-happy-eyes" fill="none" stroke={tones.eyes} strokeWidth={4 * face.scale} strokeLinecap="round" opacity="0">
                {[-1, 1].map(side => <path key={side} d={`M${face.x + side * face.gap - 5 * face.scale} ${face.y}q${5 * face.scale} ${-9 * face.scale} ${10 * face.scale} 0`} />)}
              </g>
              <path className="node-smile" d={`M${face.x - 6 * face.scale} ${face.y + 13 * face.scale}q${6 * face.scale} ${7 * face.scale} ${12 * face.scale} 0`} fill="none" stroke={tones.eyes} strokeWidth={3 * face.scale} strokeLinecap="round" opacity="0" />
            </g>
          </g>
        </g>
        <g fill={tones.base} stroke={tones.edge} strokeWidth="1" opacity="0" className="node-sparkles">
          <path className="node-sparkle" d="m13 7 2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />
          <path className="node-sparkle" d="m88 66 2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
        </g>
      </g>
    </svg>
  );
}

export const AVATAR_SHAPES = Object.keys(SHAPES) as Avatar["shape"][];
export const AVATAR_COLORS = ["#D7B56F", "#7FB3D5", "#E07A5F", "#81B29A", "#B39DDB", "#F2CC8F", "#5FB4A2", "#E8A3B5"];
const COLOR_NAMES: Record<string, string> = {
  "#D7B56F": "Gold",
  "#7FB3D5": "Blue",
  "#E07A5F": "Coral",
  "#81B29A": "Sage",
  "#B39DDB": "Lavender",
  "#F2CC8F": "Sand",
  "#5FB4A2": "Teal",
  "#E8A3B5": "Pink",
};
const EYES: Array<{ id: Avatar["eyes"]; label: string }> = [
  { id: "dot", label: "Dot eyes" },
  { id: "line", label: "Line eyes" },
  { id: "wide", label: "Wide eyes" },
];
const SHAPE_NAMES: Record<Avatar["shape"], string> = { orb: "Orb", square: "Square", spark: "Spark", hex: "Hex", leaf: "Leaf", compass: "Compass" };

/** A colour's name in the picker, or its code for a colour outside the palette. */
export const colorName = (color: string): string => COLOR_NAMES[color.toUpperCase()] ?? color.toUpperCase();

// A neutral ring with a gap shows on every swatch and face, whatever its colour.
const PICKED = "bg-raised outline outline-2 outline-offset-1 outline-ink";

/**
 * The look of a node: its shape, colour and eyes, with a live preview. Used when creating a node, for
 * each new node of a crew and in a node's settings.
 */
export function AppearancePicker({ value, onChange, preview = true, compact = false, label = "Appearance" }: { value: Avatar; onChange: (next: Avatar) => void; preview?: boolean; compact?: boolean; label?: string }) {
  const colors = AVATAR_COLORS.some((color) => color.toUpperCase() === value.color.toUpperCase()) ? AVATAR_COLORS : [...AVATAR_COLORS, value.color];
  const face = compact ? 26 : 30;
  const line = "flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2";
  const caption = "text-xs text-muted sm:w-14 sm:shrink-0";
  return (
    <div className="flex items-start gap-3" data-appearance-picker>
      {preview ? (
        <div className="shrink-0 rounded-2xl border border-line bg-bg p-1.5 sm:p-2" aria-hidden>
          <NodeAvatar avatar={value} size={compact ? 40 : 52} />
        </div>
      ) : null}
      <div className="min-w-0 flex-1 space-y-2">
        <div className={line} role="group" aria-label={`${label}: shape`}>
          <span className={caption}>Shape</span>
          <div className="flex flex-wrap items-center gap-1">
            {AVATAR_SHAPES.map((shape) => (
              <button key={shape} type="button" title={SHAPE_NAMES[shape]} onClick={() => onChange({ ...value, shape })} className={`rounded-xl p-1 transition ${value.shape === shape ? PICKED : "hover:bg-raised"}`} aria-label={shape} aria-pressed={value.shape === shape}>
                <NodeAvatar avatar={{ ...value, shape }} size={face} />
              </button>
            ))}
          </div>
        </div>
        <div className={line} role="group" aria-label={`${label}: colour`}>
          <span className={caption}>Colour</span>
          <div className="flex flex-wrap items-center gap-2 px-1 py-1 sm:gap-2.5">
            {colors.map((color) => {
              const on = value.color.toUpperCase() === color.toUpperCase();
              return (
                <button
                  key={color}
                  type="button"
                  title={colorName(color)}
                  onClick={() => onChange({ ...value, color })}
                  className={`${compact ? "h-6 w-6" : "h-6 w-6 sm:h-7 sm:w-7"} rounded-full transition ${on ? "outline outline-2 outline-offset-2 outline-ink" : "hover:scale-110"}`}
                  style={{ background: color, boxShadow: `inset 0 0 0 1.5px ${avatarTones(color).edge}` }}
                  aria-label={colorName(color)}
                  aria-pressed={on}
                />
              );
            })}
          </div>
        </div>
        <div className={line} role="group" aria-label={`${label}: eyes`}>
          <span className={caption}>Eyes</span>
          <div className="flex flex-wrap items-center gap-1">
            {EYES.map((eyes) => (
              <button key={eyes.id} type="button" title={eyes.label} onClick={() => onChange({ ...value, eyes: eyes.id })} className={`rounded-xl p-1 transition ${value.eyes === eyes.id ? PICKED : "hover:bg-raised"}`} aria-label={`${eyes.id} eyes`} aria-pressed={value.eyes === eyes.id}>
                <NodeAvatar avatar={{ ...value, eyes: eyes.id }} size={face - 4} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PersonAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-raised font-semibold text-muted ring-1 ring-line" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>
      {initials || "?"}
    </span>
  );
}
