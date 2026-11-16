"use client";
/** @jsxRuntime automatic */
/** @jsxImportSource react */

import { useEffect, useRef } from "react";
import type { Avatar } from "@/lib/types";
import { FACE_COLORS, FACE_SHAPES, faceFromStatus, normalizeFace, paintNode, type FaceLook } from "@/lib/node-face";
import type { WorkingZone } from "@/lib/working-motion";
import { useAppearance, useVisibleMotion } from "./appearance-provider";

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
    eyes: luminance(rgb) > 0.179 ? DARK_EYES : LIGHT_EYES,
  };
}

const phaseOf = (look: FaceLook) => {
  let hash = 2166136261;
  const text = `${look.shape}${look.color}${look.eyes}`;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return ((hash >>> 0) / 4294967295) * 6;
};

export function NodeAvatar({ node, avatar, size = 36, thinking = false, resting = false, attention = false, dim = false, title, workZone, gaze }: {
  node?: { avatar: Avatar } | null;
  avatar?: Avatar | null;
  size?: number;
  thinking?: boolean;
  resting?: boolean;
  /** Something is waiting on this node. Draws the lab's raised-hand face. */
  attention?: boolean;
  dim?: boolean;
  title?: string;
  workZone?: WorkingZone;
  gaze?: { x: number; y: number };
}) {
  const wrap = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const { motion } = useAppearance();
  const visible = useVisibleMotion(wrap, true);
  const saved = avatar ?? node?.avatar;
  const look = normalizeFace(saved ?? DEFAULT_LOOK);
  const status = faceFromStatus({ thinking, resting, attention, workZone });
  const gazeRef = useRef(gaze);
  gazeRef.current = gaze;
  const press = useRef({ start: -10, until: -10 });
  const phase = phaseOf(look);

  useEffect(() => {
    const root = wrap.current;
    if (!root) return;
    const play = () => {
      const now = performance.now() / 1000;
      press.current = { start: now, until: now + 0.78 };
    };
    root.addEventListener("node-react", play);
    return () => root.removeEventListener("node-react", play);
  }, []);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const reduced = !motion || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let alive = true;
    const draw = (now: number) => {
      if (!alive) return;
      const ctx = el.getContext("2d");
      if (!ctx) return;
      const dpr = size >= 72 ? Math.min(1.5, window.devicePixelRatio || 1) : 1;
      const px = Math.max(1, Math.round(size * dpr));
      if (el.width !== px || el.height !== px) { el.width = px; el.height = px; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintNode(ctx, size, size, {
        shape: look.shape,
        color: look.color,
        eyes: look.eyes,
        state: status.state,
        think: status.think,
        work: status.work,
        time: reduced ? 0.8 : now / 1000,
        phase,
        reduced,
        intensity: reduced ? 0.15 : 0.7,
        press: "c2",
        pressStart: press.current.start,
        pressUntil: press.current.until,
        lookX: gazeRef.current?.x ?? 0,
        lookY: gazeRef.current?.y ?? 0,
      });
      if (visible && !reduced) frame = requestAnimationFrame(draw);
    };
    draw(performance.now());
    return () => { alive = false; cancelAnimationFrame(frame); };
  }, [visible, motion, size, look.shape, look.color, look.eyes, status.state, status.think, status.work, phase]);

  return (
    <span
      ref={wrap}
      data-node-avatar
      data-node-shape={look.shape}
      data-node-eyes={look.eyes}
      data-node-state={status.state}
      data-work-zone={workZone}
      data-resting={resting || undefined}
      className={`inline-flex shrink-0 ${thinking ? "node-thinking" : ""} ${dim ? "opacity-50 grayscale" : ""}`}
      style={{ width: size, height: size }}
    >
      <canvas ref={canvas} width={size} height={size} role="img" aria-label={title ?? "Node"} className="block h-full w-full" />
    </span>
  );
}

export const AVATAR_SHAPES = [...FACE_SHAPES] as Array<Exclude<Avatar["shape"], "puff" | "capsule">>;
export const AVATAR_COLORS = [...FACE_COLORS];
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
const EYES: Array<{ id: "dot" | "happy" | "sleepy"; label: string }> = [
  { id: "dot", label: "Dots" },
  { id: "happy", label: "Happy" },
  { id: "sleepy", label: "Sleepy" },
];
const SHAPE_NAMES: Record<string, string> = {
  orb: "Orb", square: "Square", spark: "Spark", hex: "Hex", leaf: "Leaf", compass: "Compass", pebble: "Pebble", bloom: "Bloom", gumdrop: "Gumdrop",
};

/** A colour's name in the picker, or its code for a colour outside the palette. */
export const colorName = (color: string): string => COLOR_NAMES[color.toUpperCase()] ?? color.toUpperCase();

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
  const shown = normalizeFace(value);
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
              <button key={shape} type="button" title={SHAPE_NAMES[shape]} onClick={() => onChange({ ...value, shape })} className={`rounded-xl p-1 transition ${shown.shape === shape ? PICKED : "hover:bg-raised"}`} aria-label={shape} aria-pressed={shown.shape === shape}>
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
              <button key={eyes.id} type="button" title={eyes.label} onClick={() => onChange({ ...value, eyes: eyes.id })} className={`rounded-xl p-1 transition ${shown.eyes === eyes.id ? PICKED : "hover:bg-raised"}`} aria-label={`${eyes.id} eyes`} aria-pressed={shown.eyes === eyes.id}>
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
