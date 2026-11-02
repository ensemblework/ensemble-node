"use client";

import { useEffect, useRef, useState } from "react";
import type { Room } from "@/lib/types";
import { useVisibleMotion } from "./appearance-provider";
import { NodeAvatar } from "./node-avatar";

const POINTS = [[18, 24], [80, 19], [84, 78], [17, 81]] as const;
const EMPTY: ReadonlySet<string> = new Set();

export function RoomAvatar({ room, size = 40, busy = EMPTY, rotate = false }: { room: Room; size?: number; busy?: ReadonlySet<string>; rotate?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const visible = useVisibleMotion(ref, rotate);
  const [turn, setTurn] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const nodes = room.members.flatMap(member => member.kind === "node" ? [member.node] : []);
  const active = nodes.filter(node => node.status !== "paused" && busy.has(node.id));
  const activeKey = active.map(node => node.id).join(":");
  useEffect(() => {
    const button = ref.current?.closest("button");
    if (!rotate || !button) return;
    const focus = () => setFocused(true);
    const blur = () => setFocused(false);
    button.addEventListener("focus", focus);
    button.addEventListener("blur", blur);
    return () => { button.removeEventListener("focus", focus); button.removeEventListener("blur", blur); };
  }, [rotate]);
  useEffect(() => {
    if (!rotate || !visible || hovered || focused || activeKey.split(":").length < 2) return;
    const timer = setInterval(() => setTurn(value => value + 1), 7000);
    return () => clearInterval(timer);
  }, [rotate, visible, hovered, focused, activeKey]);
  const focus = active.length ? active[(rotate && visible ? turn : 0) % active.length] : nodes.find(node => room.leadNodeIds.includes(node.id)) ?? nodes[0];
  const satellites = nodes.filter(node => node.id !== focus?.id).slice(0, 4);
  return (
    <span ref={ref} className="room-avatar relative inline-block shrink-0" role="img" aria-label={`${room.kind === "crew" ? "Crew" : "Room"} graph${active.length ? ` · ${focus?.name} working` : ""}`}
      style={{ width: size, height: size }} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden fill="none" stroke="currentColor">
        {(satellites.length ? satellites : [null, null]).map((_, index) => <path key={index} d={`M50 50 ${POINTS[index]![0]} ${POINTS[index]![1]}`} className="text-muted/45" strokeWidth="2" />)}
      </svg>
      {(satellites.length ? satellites : [null, null]).map((node, index) => <span key={node?.id ?? index} aria-hidden className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${POINTS[index]![0]}%`, top: `${POINTS[index]![1]}%` }}>
        {node ? <NodeAvatar node={node} size={size * .29} /> : <span className="block rounded-full bg-muted/40" style={{ width: size * .14, height: size * .14 }} />}
      </span>)}
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" aria-hidden>
        <NodeAvatar key={focus?.id ?? "empty"} node={focus} size={size * .64} thinking={rotate && visible && Boolean(focus && busy.has(focus.id))} />
      </span>
    </span>
  );
}
