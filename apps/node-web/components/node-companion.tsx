"use client";

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { useEffect, useRef, useState } from "react";
import { nodeIsResting } from "@/lib/node-life";
import type { Avatar } from "@/lib/types";
import { useVisibleMotion } from "./appearance-provider";
import { NodeAvatar } from "./node-avatar";
import { useNodeVisits } from "./node-life";

gsap.registerPlugin(useGSAP);

/** Only the open chat/profile gets a little personality; the rest of the cast stays still. */
export function NodeCompanion({ node, avatar, size = 40, thinking = false, profile = false, lastActivity, visit = false, onActivate }: {
  node?: { id: string; name: string; avatar: Avatar; status?: string };
  avatar?: Avatar;
  size?: number;
  thinking?: boolean;
  profile?: boolean;
  lastActivity?: string | null;
  visit?: boolean;
  onActivate?: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const visible = useVisibleMotion(ref);
  const life = useNodeVisits();
  const opened = useRef(false);
  const woke = useRef(false);
  const gazeTo = useRef<{ x: ReturnType<typeof gsap.quickTo>; y: ReturnType<typeof gsap.quickTo> } | null>(null);
  const [wake, setWake] = useState(false);
  const paused = node?.status === "paused";
  useEffect(() => {
    if (!visit || !node || !life.ready || opened.current) return;
    opened.current = true;
    setWake(!paused && nodeIsResting(lastActivity, life.visits[node.id], Date.now()));
    life.visit(node.id);
  }, [visit, node, life, lastActivity, paused]);
  const { contextSafe } = useGSAP(context => {
    const button = ref.current;
    if (!button || !visible || paused) return;
    const body = button.querySelector(".node-body");
    const eyes = button.querySelector(".node-eyes");
    if (wake && !woke.current) {
      woke.current = true;
      gsap.timeline().fromTo(body, { rotation: -7, y: 3, scale: .96 }, { rotation: 0, y: 0, scale: 1, duration: .85, ease: "back.out(1.7)" })
        .fromTo(eyes, { scaleY: .12 }, { scaleY: 1, duration: .4, ease: "power2.out" }, .2);
    }
    // One idle blink, not a blinking loop across every avatar in the conversation.
    const blink = gsap.delayedCall(18 + Math.random() * 16, () => {
      context.add(() => { gsap.timeline().to(eyes, { scaleY: .12, duration: .09 }).to(eyes, { scaleY: 1, duration: .17 }); });
    });
    if (profile) {
      const gaze = button.querySelector(".node-gaze");
      gazeTo.current = { x: gsap.quickTo(gaze, "x", { duration: .3, ease: "power2.out" }), y: gsap.quickTo(gaze, "y", { duration: .3, ease: "power2.out" }) };
    }
    return () => { blink.kill(); gazeTo.current = null; };
  }, { scope: ref, dependencies: [visible, paused, wake, profile], revertOnUpdate: true });

  const react = contextSafe(() => {
    if (visible && !paused && ref.current) {
      const body = ref.current.querySelector(".node-body");
      gsap.killTweensOf(body);
      gsap.timeline().to(body, { scaleX: 1.07, scaleY: .94, rotation: -5, y: 1, duration: .12, overwrite: true })
        .to(body, { scaleX: 1, scaleY: 1, rotation: 3, y: -2, duration: .18, ease: "power2.out" })
        .to(body, { rotation: 0, y: 0, duration: .35, ease: "back.out(2)" });
    }
    onActivate?.();
  });
  const gaze = (x: number, y: number) => { gazeTo.current?.x(x); gazeTo.current?.y(y); };
  return (
    <button ref={ref} type="button" className={`node-companion ${profile ? "node-companion-profile" : "node-companion-header"} inline-flex shrink-0 items-center justify-center rounded-full`}
      aria-label={onActivate ? `${node?.name ?? "Node"}'s settings` : `Say hello to ${node?.name ?? "your node"}`}
      title={onActivate ? `${node?.name ?? "Node"}'s settings` : "A little hello"}
      onClick={react}
      onPointerMove={event => {
        if (!profile || event.pointerType !== "mouse" || !visible) return;
        const box = event.currentTarget.getBoundingClientRect();
        gaze(((event.clientX - box.left) / box.width - .5) * 5, ((event.clientY - box.top) / box.height - .5) * 4);
      }}
      onPointerLeave={() => gaze(0, 0)} onBlur={() => gaze(0, 0)}
      style={{ minWidth: Math.max(44, size), minHeight: Math.max(44, size) }}>
      <NodeAvatar node={node} avatar={avatar} size={size} thinking={visible && !paused && thinking} dim={paused} />
    </button>
  );
}
