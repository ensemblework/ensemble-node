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
export function NodeCompanion({ node, avatar, size = 40, thinking = false, profile = false, lastActivity, visit = false, onActivate, compact = false }: {
  node?: { id: string; name: string; avatar: Avatar; status?: string };
  avatar?: Avatar;
  size?: number;
  thinking?: boolean;
  profile?: boolean;
  lastActivity?: string | null;
  visit?: boolean;
  onActivate?: () => void;
  compact?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { motion } = useAppearance();
  const visible = useVisibleMotion(ref, visit || profile || thinking);
  const life = useNodeVisits();
  const opened = useRef(false);
  const greeted = useRef(false);
  const clicks = useRef(0);
  const reaction = useRef<gsap.core.Timeline | null>(null);
  const idle = useRef<gsap.core.Timeline[]>([]);
  const gazeTo = useRef<{ x: ReturnType<typeof gsap.quickTo>; y: ReturnType<typeof gsap.quickTo> } | null>(null);
  const [entry, setEntry] = useState<"hello" | "wake" | null>(visit ? null : "hello");
  const paused = node?.status === "paused";
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
    if (!motion || paused) { reaction.current?.kill(); delete button.dataset.expression; return; }
    if (!visible) return;
    const eyes = button.querySelector(".node-eyes");
    if ((visit || profile) && entry && !greeted.current) {
      greeted.current = true;
      reaction.current = nodeExpression(button, entry);
    }
    const single = gsap.timeline({ paused: true }).to(eyes, { scaleY: .08, duration: .09 }).to(eyes, { scaleY: 1, duration: .17 });
    const double = gsap.timeline({ paused: true, repeat: 1, repeatDelay: .12 }).to(eyes, { scaleY: .08, duration: .09 }).to(eyes, { scaleY: 1, duration: .17 });
    const wink = gsap.timeline({ paused: true }).to(button.querySelector(".node-eye-left"), { scaleY: .08, duration: .1 }).to(button.querySelector(".node-eye-left"), { scaleY: 1, duration: .2 });
    idle.current = [single, double, wink];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => { timer = setTimeout(() => {
      if (!reaction.current?.isActive()) [single, double, wink][Math.floor(Math.random() * 3)]!.restart();
      schedule();
    }, 7500 + Math.random() * 7500); };
    if ((visit || profile) && !thinking) schedule();
    if (profile) {
      const gaze = button.querySelector(".node-gaze");
      gazeTo.current = { x: gsap.quickTo(gaze, "x", { duration: .3, ease: "power2.out" }), y: gsap.quickTo(gaze, "y", { duration: .3, ease: "power2.out" }) };
    }
    return () => { clearTimeout(timer); reaction.current?.kill(); delete button.dataset.expression; gazeTo.current = null; idle.current = []; };
  }, { scope: ref, dependencies: [visible, motion, paused, entry, profile, visit, thinking, look?.shape, look?.eyes], revertOnUpdate: true });

  const react = contextSafe(() => {
    if (motion && !paused && !document.hidden && ref.current) {
      reaction.current?.kill();
      for (const timeline of idle.current) timeline.pause(0);
      reaction.current = nodeExpression(ref.current, CLICK_EXPRESSIONS[clicks.current++ % CLICK_EXPRESSIONS.length]!);
    }
    onActivate?.();
  });
  const gaze = (x: number, y: number) => { gazeTo.current?.x(x); gazeTo.current?.y(y); };
  return (
    <button ref={ref} type="button" className={`node-companion ${profile ? "node-companion-profile" : visit ? "node-companion-header" : "node-companion-message"} ${compact ? "node-companion-compact" : ""} relative inline-flex shrink-0 items-center justify-center rounded-full`}
      aria-label={onActivate ? `${node?.name ?? "Node"}'s settings` : `Say hello to ${node?.name ?? "your node"}`}
      title={onActivate ? `${node?.name ?? "Node"}'s settings` : "A little hello"}
      onClick={react}
      onPointerMove={event => {
        if (!profile || event.pointerType !== "mouse" || !visible) return;
        const box = event.currentTarget.getBoundingClientRect();
        gaze(((event.clientX - box.left) / box.width - .5) * 5, ((event.clientY - box.top) / box.height - .5) * 4);
      }}
      onPointerLeave={() => gaze(0, 0)} onBlur={() => gaze(0, 0)}
      style={{ minWidth: compact ? size : Math.max(44, size), minHeight: compact ? size : Math.max(44, size) }}>
      <NodeAvatar node={node} avatar={avatar} size={size} thinking={visible && !paused && thinking} dim={paused} />
    </button>
  );
}
