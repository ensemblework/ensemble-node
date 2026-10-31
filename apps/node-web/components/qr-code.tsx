"use client";

import { useMemo } from "react";
import { qrEncode, qrPath } from "@/lib/qr";

/** A QR code of `text`, dark on white whatever the theme, with its quiet zone. Loaded only when shown. */
export default function QrCode({ text, label, size = 168 }: { text: string; label: string; size?: number }) {
  const code = useMemo(() => {
    try {
      return qrEncode(text, "M");
    } catch {
      return null;
    }
  }, [text]);
  if (!code) return null;
  const side = code.size + 8;
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${side} ${side}`} width={size} height={size} shapeRendering="crispEdges" className="shrink-0 rounded-lg" data-qr-version={code.version}>
      <rect width={side} height={side} fill="#fff" />
      <path d={qrPath(code)} fill="#000" />
    </svg>
  );
}
