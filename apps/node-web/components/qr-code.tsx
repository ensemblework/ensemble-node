"use client";

import { useEffect, useMemo, useState } from "react";
import { qrEncode, qrPixels, qrScale, type QrLevel } from "@/lib/qr";

/**
 * A QR code of `text` that phones read from a screen: black modules on white with the standard's
 * 4-module quiet zone, whatever the theme; a whole number of the screen's pixels per module, at least
 * `minSize` CSS pixels across; level Q (a quarter of it may be lost to glare). Drawn as a picture, so
 * dark-mode extensions and forced colours do not invert it. Loaded only when shown.
 */
export default function QrCode({ text, label, minSize = 200, level = "Q" }: { text: string; label: string; minSize?: number; level?: QrLevel }) {
  const code = useMemo(() => {
    try {
      return qrEncode(text, level);
    } catch {
      return null;
    }
  }, [text, level]);
  const [picture, setPicture] = useState<{ src: string; size: number } | null>(null);
  useEffect(() => {
    if (!code) return;
    const draw = () => {
      const scale = qrScale(code.size, minSize, window.devicePixelRatio || 1);
      const { width, data } = qrPixels(code, scale.modulePx);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = width;
      canvas.getContext("2d")?.putImageData(new ImageData(data, width, width), 0, 0);
      setPicture({ src: canvas.toDataURL("image/png"), size: scale.cssSize });
    };
    draw();
    // Moved to a screen with another pixel ratio (or zoomed): drawn again for it.
    const query = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    query?.addEventListener?.("change", draw);
    return () => query?.removeEventListener?.("change", draw);
  }, [code, minSize]);
  if (!code) return null;
  return (
    <span className="inline-block shrink-0 rounded-lg bg-white [color-scheme:light] [forced-color-adjust:none]" style={{ width: picture?.size ?? minSize, height: picture?.size ?? minSize }} data-qr-version={code.version} data-qr-level={code.level}>
      {picture ? <img src={picture.src} alt={label} width={picture.size} height={picture.size} className="block rounded-lg" style={{ imageRendering: "pixelated" }} draggable={false} /> : null}
    </span>
  );
}
