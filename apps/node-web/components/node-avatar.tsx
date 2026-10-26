"use client";
/** @jsxRuntime automatic */
/** @jsxImportSource react */

import { createContext, useContext } from "react";
import type { Avatar } from "@/lib/types";
import { ModelLogo } from "./model-logo";

export const DefaultNodeModel = createContext<string | null>(null);

type Identity = { avatar?: Avatar; model?: string | null; provider?: string | null };

/** Model signature plus the node's own accent. Public nodes never reveal an unreported model. */
export function NodeAvatar({ node, avatar, size = 36, thinking = false, dim = false, title }: { node?: Identity | null; avatar?: Avatar | null; size?: number; thinking?: boolean; dim?: boolean; title?: string }) {
  const fallback = useContext(DefaultNodeModel);
  const model = node ? ("model" in node ? node.model ?? fallback : null) : fallback;
  const colour = (avatar ?? node?.avatar)?.color ?? "#D7B56F";
  return (
    <span title={title} role="img" aria-label={title ?? "Node"} data-node-avatar
      className={`relative inline-flex shrink-0 items-center justify-center rounded-2xl border bg-panel ${thinking ? "node-thinking" : ""} ${dim ? "opacity-50 grayscale" : ""}`}
      style={{ width: size, height: size, borderRadius: Math.max(6, Math.round(size * .3)), borderColor: `color-mix(in srgb, ${colour} 35%, rgb(var(--line)))`, backgroundColor: `color-mix(in srgb, ${colour} 8%, rgb(var(--panel)))` }}>
      <ModelLogo model={model} provider={node?.provider} size={Math.round(size * .58)} decorative />
      {thinking ? <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-accent ring-2 ring-panel" /> : null}
    </span>
  );
}

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
