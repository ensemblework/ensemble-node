"use client";
/** @jsxRuntime automatic */
/** @jsxImportSource react */

import { useId } from "react";
import type { Avatar } from "@/lib/types";

const SHAPES: Record<Avatar["shape"], string> = {
  orb: "M50 6a44 44 0 1 1 0 88a44 44 0 1 1 0-88z",
  square: "M22 8h56a14 14 0 0 1 14 14v56a14 14 0 0 1-14 14H22A14 14 0 0 1 8 78V22A14 14 0 0 1 22 8z",
  spark: "M50 4l11 24 25-6-14 22 20 18-26 3 2 26-18-18-18 18 2-26-26-3 20-18-14-22 25 6z",
  hex: "M50 5l39 22v46L50 95 11 73V27z",
  leaf: "M50 6c30 8 44 30 40 58-3 20-20 32-40 32S13 84 10 64C6 36 20 14 50 6z",
  compass: "M50 4l14 32 32 14-32 14-14 32-14-32L4 50l32-14z",
};

export function NodeAvatar({ node, avatar, size = 36, thinking = false, dim = false, title }: { node?: { avatar: Avatar } | null; avatar?: Avatar | null; size?: number; thinking?: boolean; dim?: boolean; title?: string }) {
  const saved = avatar ?? node?.avatar;
  const look: Avatar = saved && SHAPES[saved.shape] ? saved : { shape: "orb", color: "#D7B56F", eyes: "dot" };
  // Each instance needs its own gradient, including avatars inside hidden drawers.
  const id = `node-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title ?? "Node"} data-node-avatar className={`${thinking ? "node-thinking" : ""} ${dim ? "opacity-50 grayscale" : ""} shrink-0`}>
      {title ? <title>{title}</title> : null}
      <defs>
        <radialGradient id={id} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.35" stopColor={look.color} stopOpacity="1" />
          <stop offset="1" stopColor={look.color} stopOpacity="0.75" />
        </radialGradient>
      </defs>
      <path d={SHAPES[look.shape]} fill={`url(#${id})`} />
      <g className="node-eyes" fill="#14110c">
        {look.eyes === "line" ? (
          <>
            <rect x="31" y="47" width="14" height="5" rx="2.5" />
            <rect x="55" y="47" width="14" height="5" rx="2.5" />
          </>
        ) : look.eyes === "wide" ? (
          <>
            <ellipse cx="38" cy="48" rx="7" ry="9" />
            <ellipse cx="62" cy="48" rx="7" ry="9" />
          </>
        ) : (
          <>
            <circle cx="39" cy="48" r="5.5" />
            <circle cx="61" cy="48" r="5.5" />
          </>
        )}
      </g>
    </svg>
  );
}

export const AVATAR_SHAPES = Object.keys(SHAPES) as Avatar["shape"][];
export const AVATAR_COLORS = ["#D7B56F", "#7FB3D5", "#E07A5F", "#81B29A", "#B39DDB", "#F2CC8F", "#5FB4A2", "#E8A3B5"];

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
