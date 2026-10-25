"use client";
/** @jsxRuntime automatic */

import { useState } from "react";
import { FileSpreadsheet, Plug } from "lucide-react";
import { connectorInitials, connectorLogo } from "@/lib/connector-logos";

export function ConnectorLogo({
  id,
  name,
  size = 36,
  decorative = false,
  className = "",
}: {
  id: string;
  name?: string;
  size?: number;
  decorative?: boolean;
  className?: string;
}) {
  const logo = connectorLogo(id);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const label = name?.trim() || logo?.name || (id === "csv" || id === "file" ? "CSV or spreadsheet" : id === "mcp" || id === "custom" ? "Custom connector" : id.trim() || "Unknown connector");
  const failed = Boolean(logo && failedSrc === logo.src);
  const image = logo && !failed ? logo : null;
  const a11y = decorative ? { "aria-hidden": true as const } : { role: "img", "aria-label": failed ? `${label} (logo unavailable)` : label };
  const inner = image?.padded ? Math.round(size * 0.7) : size;
  const Generic = id === "csv" || id === "file" ? FileSpreadsheet : id === "mcp" || id === "custom" ? Plug : null;
  return (
    <span
      {...a11y}
      title={failed ? `${label} (logo unavailable)` : undefined}
      className={`inline-flex shrink-0 select-none items-center justify-center overflow-hidden ${image ? "bg-white ring-1 ring-inset ring-black/10" : "border border-line bg-raised font-semibold text-muted"} ${className}`}
      style={{ width: size, height: size, borderRadius: Math.max(3, Math.round(size * 0.24)), fontSize: Math.max(8, Math.round(size * 0.38)), lineHeight: 1 }}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- local, optimised brand assets; SVGs need no image proxy.
        <img key={image.src} src={image.src} width={inner} height={inner} alt="" aria-hidden draggable={false} onError={() => setFailedSrc(image.src)} style={{ width: inner, height: inner, objectFit: "contain" }} />
      ) : Generic ? (
        <Generic size={Math.round(size * 0.55)} aria-hidden />
      ) : (
        connectorInitials(label)
      )}
    </span>
  );
}
