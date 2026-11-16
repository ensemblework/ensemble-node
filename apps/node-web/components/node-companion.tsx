"use client";

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { useEffect, useRef, useState } from "react";
import { nodeIsResting } from "@/lib/node-life";
import type { Avatar } from "@/lib/types";
import { useAppearance, useVisibleMotion } from "./appearance-provider";
import { NodeAvatar } from "./node-avatar";
import { CLICK_EXPRESSIONS, nodeExpression } from "./node-expressions";
import { useNodeVisits } from "./node-life";

gsap.registerPlugin(useGSAP);

/** Automatic personality belongs to the open chat; message portraits react only when pressed. */
export function NodeCompanion({ node, avatar, size = 40, thinking = false, profile = false, lastActivity, visit = false, onActivate, compact = false, workingMotion = true }: {
  node?: { id: string; name: string; avatar: Avatar; status?: string };
  avatar?: Avatar;
  size?: number;
  thinking?: boolean;
  profile?: boolean;
  lastActivity?: string | null;
  visit?: boolean;
  onActivate?: () => void;
  compact?: boolean;
  workingMotion?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { motion } = useAppearance();
  const visible = useVisibleMotion(ref, visit || profile || thinking);
  const life = useNodeVisits();
  const opened = useRef(false);
  const greeted = useRef(false);
  const clicks = useRef(0);
  const reaction = useRef<gsap.core.Timeline | null>(null);
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  const [entry, setEntry] = useState<"hello" | "wake" | null>(visit ? null : "hello");
  const paused = node?.status === "paused";
  const still = paused || thinking && !workingMotion;
  const look = avatar ?? node?.avatar;
  useEffect(() => {
    if (!visit || !node || !life.ready || opened.current) return;
    opened.current = true;
    setEntry(nodeIsResting(lastActivity, life.visits[node.id], Date.now()) ? "wake" : "hello");
    life.visit(node.id);
  }, [visit, node, life, lastActivity, paused]);
  const { contextSafe } = useGSAP(() => {
    const button = ref.current;
    if (!button) return;
    if (!motion || still) { reaction.current?.kill(); delete button.dataset.expression; return; }
    if (!visible) return;
    if ((visit || profile) && entry && !greeted.current) {
      greeted.current = true;
      reaction.current = nodeExpression(button, entry);
    }
    return () => { reaction.current?.kill(); delete button.dataset.expression; };
  }, { scope: ref, dependencies: [visible, motion, still, entry, profile, visit, thinking, look?.shape, look?.eyes], revertOnUpdate: true });

  const react = contextSafe(() => {
    if (motion && !still && !document.hidden && ref.current) {
      reaction.current?.kill();
      reaction.current = nodeExpression(ref.current, CLICK_EXPRESSIONS[clicks.current++ % CLICK_EXPRESSIONS.length]!);
    }
    onActivate?.();
  });
  const lookAt = (x: number, y: number) => setGaze({ x, y });
  return (
    <button ref={ref} type="button" className={`node-companion ${profile ? "node-companion-profile" : visit ? "node-companion-header" : "node-companion-message"} ${compact ? "node-companion-compact" : ""} relative inline-flex shrink-0 items-center justify-center rounded-full`}
      aria-label={onActivate ? `${node?.name ?? "Node"}'s settings` : `Say hello to ${node?.name ?? "your node"}`}
      title={onActivate ? `${node?.name ?? "Node"}'s settings` : "A little hello"}
      onClick={react}
      onPointerMove={event => {
        if (!profile || event.pointerType !== "mouse" || !visible) return;
        const box = event.currentTarget.getBoundingClientRect();
        lookAt(((event.clientX - box.left) / box.width - .5) * 2, ((event.clientY - box.top) / box.height - .5) * 2);
      }}
      onPointerLeave={() => lookAt(0, 0)} onBlur={() => lookAt(0, 0)}
      style={{ minWidth: compact ? size : Math.max(44, size), minHeight: compact ? size : Math.max(44, size) }}>
      <NodeAvatar node={node} avatar={avatar} size={size} thinking={visible && !still && thinking} workZone={compact ? "chat" : undefined} dim={paused} gaze={profile ? gaze : undefined} />
    </button>
  );
}
