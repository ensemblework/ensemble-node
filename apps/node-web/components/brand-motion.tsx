"use client";

import { useEffect, useRef } from "react";
import { useVisibleMotion } from "./appearance-provider";
import { toastError } from "@/lib/toast";
import type { MorphController, MorphKind } from "@ensemble-node/brand/motion";

export function BrandMotion({ size = 24, kind = "infinity", className = "" }: { size?: number; kind?: MorphKind; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const controller = useRef<MorphController | null>(null);
  const visible = useVisibleMotion(ref);
  const activeMotion = useRef(visible);
  activeMotion.current = visible;
  useEffect(() => {
    let active = true;
    void import("@ensemble-node/brand/motion").then(module => {
      if (!active || !ref.current) return;
      controller.current = module.mount(ref.current, { size, kind });
      if (activeMotion.current) controller.current.loop({ delay: 180, kind });
    }).catch(toastError);
    return () => { active = false; controller.current?.destroy(); controller.current = null; };
  }, [size, kind]);
  useEffect(() => {
    if (visible) controller.current?.loop({ delay: 180, kind });
    else controller.current?.idle();
  }, [visible, kind]);
  return <span ref={ref} aria-hidden className={`inline-flex shrink-0 ${className}`} style={{ width: size, height: size }}><img src="/brand/woven-satin.svg" width={size} height={size} alt="" /></span>;
}
