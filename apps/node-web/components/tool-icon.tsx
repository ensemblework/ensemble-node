/** @jsxRuntime automatic */

import { Wrench } from "lucide-react";
import { toolConnectorId } from "@/lib/connector-logos";
import { ConnectorLogo } from "./connector-logo";

export function ToolIcon({ name, size = 16, className = "" }: { name: string; size?: number; className?: string }) {
  const connector = toolConnectorId(name);
  return connector ? <ConnectorLogo id={connector} size={size} className={className} /> : <Wrench size={size} className={`shrink-0 text-accent ${className}`} aria-hidden />;
}
