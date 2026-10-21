import type { Credits } from "@/lib/types";

/** The account's included credits this month, shared by Ensemble, the CLI and Node. */
export function CreditsMeter({ credits, compact = false }: { credits: Credits; compact?: boolean }) {
  if (!credits?.available) return compact ? null : <p className="text-sm text-muted">Included AI is not set up on this server.</p>;
  const left = Math.max(0, Math.floor(credits.remaining));
  const share = credits.limit ? Math.min(1, left / credits.limit) : 0;
  const tone = credits.paused || share < 0.1 ? "bg-danger" : share < 0.3 ? "bg-warn" : "bg-accent";
  return (
    <div className="space-y-1.5" title={`Resets ${new Date(credits.resetsAt).toLocaleDateString()}`}>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted">Credits</span>
        <span className="font-medium tabular-nums">
          {left.toLocaleString()} <span className="text-muted">/ {Math.floor(credits.limit).toLocaleString()}</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-raised">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${share * 100}%` }} />
      </div>
      {!compact ? (
        <p className="text-xs text-muted">
          Shared by Ensemble, the CLI and Node. Resets {new Date(credits.resetsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}.
          {credits.paused ? " Included AI is paused for everyone until then." : ""}
        </p>
      ) : null}
    </div>
  );
}
