"use client";

import { useEffect, useRef, useState } from "react";
import type { Room } from "@/lib/types";
import type { WorkingZone } from "@/lib/working-motion";
import { useVisibleMotion } from "./appearance-provider";
import { NodeAvatar } from "./node-avatar";

const POINTS = [[18, 24], [80, 19], [84, 78], [17, 81]] as const;
const EMPTY: ReadonlySet<string> = new Set();

export function RoomAvatar({ room, size = 40, busy = EMPTY, rotate = false, workZone }: { room: Room; size?: number; busy?: ReadonlySet<string>; rotate?: boolean; workZone?: WorkingZone }) {
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
  const focus = active.length ? active[(rotate ? turn : 0) % active.length] : nodes.find(node => room.leadNodeIds.includes(node.id)) ?? nodes[0];
  const satellites = nodes.filter(node => node.id !== focus?.id).slice(0, 4);
  const shown = nodes.filter(node => node.id === focus?.id || satellites.some(other => other.id === node.id));
  const faceSize = size * .64;
  return (
    <span ref={ref} className="room-avatar relative inline-block shrink-0" role="img" aria-label={`${room.kind === "crew" ? "Crew" : "Room"} graph${active.length ? ` · ${focus?.name} working` : ""}`}
      data-animated={rotate && visible || undefined} style={{ width: size, height: size }} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden fill="none" stroke="currentColor">
        {(satellites.length ? satellites : [null, null]).map((_, index) => <path key={index} d={`M50 50 ${POINTS[index]![0]} ${POINTS[index]![1]}`} className="text-muted/45" strokeWidth="2" />)}
      </svg>
      {shown.map(node => {
        const centre = node.id === focus?.id;
        const point = centre ? [50, 50] : POINTS[satellites.findIndex(row => row.id === node.id)]!;
        return <span key={node.id} className="graph-node absolute left-0 top-0 origin-center" data-graph-node={node.id} data-focused={centre || undefined} aria-hidden
          style={{ width: faceSize, height: faceSize, zIndex: centre ? 2 : 1, transform: `translate(${point[0]! * size / 100 - faceSize / 2}px, ${point[1]! * size / 100 - faceSize / 2}px) scale(${centre ? 1 : .45})` }}>
          <NodeAvatar node={node} size={faceSize} thinking={centre && busy.has(node.id)} workZone={workZone} />
        </span>;
      })}
      {!satellites.length ? POINTS.slice(0, 2).map((point, index) => <span key={index} aria-hidden className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted/40" style={{ left: `${point[0]}%`, top: `${point[1]}%`, width: size * .14, height: size * .14 }} />) : null}
      {!shown.length ? <span className="absolute inset-0 flex items-center justify-center" aria-hidden><NodeAvatar size={faceSize} /></span> : null}
    </span>
  );
}
