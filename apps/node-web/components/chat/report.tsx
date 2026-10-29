"use client";

/**
 * What a worker reported (Ensemble's node/report.ts): its outcome, its checks with their verdicts, and
 * the candidate it built or tested. Used by run cards (`data.report`) and by a plan step's attempts.
 */
import { CircleCheck, CircleDashed, CircleSlash, CircleX, GitCommitHorizontal } from "lucide-react";
import { blockedReason, candidateLabel, checkTally, outcomeBadge, verdictLabel } from "@/lib/plan";
import { candidateWords } from "@/lib/plan-facts";
import type { Candidate, Check, StepReport } from "@/lib/types";
import { External, Pill } from "../ui";
import { RichText } from "./rich-text";

export function VerdictIcon({ verdict }: { verdict: string }) {
  const label = verdictLabel(verdict);
  const props = { size: 14, role: "img" as const, "aria-label": label, className: "mt-0.5 shrink-0" };
  if (verdict === "pass") return <CircleCheck {...props} className={`${props.className} text-ok`} />;
  if (verdict === "fail") return <CircleX {...props} className={`${props.className} text-danger`} />;
  if (verdict === "blocked") return <CircleSlash {...props} className={`${props.className} text-warn`} />;
  return <CircleDashed {...props} className={`${props.className} text-muted`} />;
}

export function CheckList({ checks }: { checks: readonly Check[] }) {
  if (!checks.length) return null;
  return (
    <ul className="space-y-1" aria-label="Checks">
      {checks.map((check, at) => (
        <li key={`${check.id ?? check.name}-${at}`} className="flex items-start gap-1.5 text-[13px]">
          <VerdictIcon verdict={check.verdict} />
          <span className="min-w-0 flex-1">
            <span className="font-medium">{check.name}</span>
            {check.detail ? <span className="block whitespace-pre-wrap break-words text-xs text-muted">{check.detail}</span> : null}
            {check.rerun ? (
              <code className="mt-0.5 block truncate font-mono text-[11px] text-muted" title={check.rerun.command}>
                $ {check.rerun.command}
              </code>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The commit or content a build produced or a verification tested, short, with the rest in its tooltip.
 * With `verb` it reads as an attempt's line: "built 1a2b3c4 on feature-x", "tested 1a2b3c4".
 */
export function CandidateTag({ candidate, label = "Candidate", verb }: { candidate: Candidate | null | undefined; label?: string; verb?: "built" | "tested" }) {
  const shown = candidateLabel(candidate);
  if (!shown) return null;
  const tag = (
    <span className="inline-flex max-w-full items-center gap-1 font-mono text-[11px] text-muted" title={`${label}: ${shown.full}`}>
      <GitCommitHorizontal size={12} className="shrink-0" aria-hidden />
      {verb ? null : <span className="sr-only">{label}: </span>}
      <span className="truncate">{verb ? candidateWords(candidate, verb) : shown.short}</span>
    </span>
  );
  return candidate?.url && /^https?:\/\//.test(candidate.url) ? (
    <External href={candidate.url} className="max-w-full hover:text-ink">
      {tag}
    </External>
  ) : (
    tag
  );
}

/** A run's structured report: outcome, checks, what it built or tested, links it gave. */
export function ReportView({ report, handles }: { report: StepReport; handles: ReadonlySet<string> }) {
  const badge = outcomeBadge(report.outcome);
  const tally = checkTally(report.checks);
  const reason = report.outcome === "blocked" ? blockedReason(report.blockedBy) : null;
  const links = (report.evidence ?? []).filter((row) => row.kind === "url" && /^https?:\/\//.test(row.ref));
  return (
    <section className="mt-3 space-y-2 rounded-xl border border-line bg-bg/60 px-2.5 py-2" aria-label="Report">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="font-semibold uppercase tracking-wide text-muted">Report</span>
        {badge ? <Pill tone={badge.tone}>{badge.label}</Pill> : null}
        {tally ? <span className="text-muted">{tally}</span> : null}
        {reason ? <span className="text-warn">{reason}</span> : null}
        <span className="ml-auto min-w-0">
          <CandidateTag candidate={report.subject} />
        </span>
      </div>
      {report.summary ? <RichText text={report.summary} handles={handles} small kindLinks /> : null}
      <CheckList checks={report.checks ?? []} />
      {links.length ? (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {links.map((row) => (
            <li key={row.ref} className="min-w-0">
              <External href={row.ref} className="text-accent hover:underline" icon>
                {row.caption || row.ref.replace(/^https?:\/\//, "")}
              </External>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
