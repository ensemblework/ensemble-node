import { TESTING } from "@/lib/config";

/** Ensemble's Woven Chorus mark in Satin Gold, and the product name. */
export function Mark({ size = 28, className = "" }: { size?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={size <= 20 ? "/brand/woven-micro.svg" : "/brand/woven-satin.svg"} width={size} height={size} alt="" aria-hidden className={className} />;
}

export function Wordmark({ size = 26 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Mark size={size} />
      <span className="font-semibold tracking-tight">
        Ensemble <span className="text-accent">Node</span>
      </span>
      {TESTING ? (
        <span className="rounded-full border border-amber-400/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400" title="The testing website, connected to Ensemble's testing environment">
          Testing
        </span>
      ) : null}
    </span>
  );
}
