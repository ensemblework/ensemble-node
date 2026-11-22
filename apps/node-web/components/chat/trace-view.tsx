"use client";

/**
 * A node turn's trace, for its owner only (Ensemble docs/35 §5.7): opened from a message's Trace action in
 * a right drawer. How the turn ended with its model, tokens and time on one line, its cost and how its loop
 * ran; then the parts of its instructions and their sizes, its tool calls, what it was given, the decisions
 * about it, the answer check and its report. A trace keeps sizes, names and timings only (lib/trace.ts).
 */
import { Check, CircleDashed, Clock3, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTurnTrace } from "@/lib/hooks";
import { callRows, callSummary, compactCount, costLine, decisionLine, droppedWords, givenLines, loopLine, modelLine, reportLines, sectionRows, summaryParts, traceOutcome, traceSummary, turnLive, verificationWords } from "@/lib/trace";
import type { TurnTraceView } from "@/lib/types";
import { ToolIcon } from "../tool-icon";
import { InfoTip, Pill, Spinner } from "../ui";

const CALLS_SHOWN = 20;
const TAG = "shrink-0 rounded border px-1 text-[10px] leading-4";

function Section({ title, aside, info, children }: { title: string; aside?: ReactNode; info?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-1.5 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {info ? <InfoTip text={info} label={`About ${title.toLowerCase()}`} /> : null}
        {aside ? <span className="ml-auto min-w-0 break-words text-right text-xs text-muted">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Lines({ lines }: { lines: string[] }) {
  return (
    <ul className="space-y-0.5 text-xs">
      {lines.map((line, at) => (
        <li key={at} className="break-words">
          {line}
        </li>
      ))}
    </ul>
  );
}

export function TraceView({ turnId }: { turnId: string }) {
  const query = useTurnTrace(turnId);
  if (query.isLoading) {
    return (
      <div className="flex justify-center py-6 text-muted">
        <Spinner />
      </div>
    );
  }
  if (!query.data) return <p className="text-sm text-muted">{query.error?.message ?? "That turn is not available."}</p>;
  return <TraceBody view={query.data} />;
}

function TraceBody({ view }: { view: TurnTraceView }) {
  const [allCalls, setAllCalls] = useState(false);
  const { turn, trace, decisions } = view;
  const outcome = traceOutcome(view);
  const models = modelLine(trace, turn.model);
  const effort = trace?.effort ? `${trace.effort} thinking` : null;
  const sections = sectionRows(trace?.sections);
  const calls = callRows(trace?.calls);
  const given = givenLines(trace?.selected);
  const verification = verificationWords(trace?.verification);
  const report = reportLines(trace?.report);
  const loop = loopLine(trace?.loop, trace?.placement ?? turn.placement);
  const error = trace?.error ?? turn.error;
  // The summary line has the model, tokens and time; these add what it leaves out.
  const rows: Array<[string, ReactNode]> = [
    ["Model", models.model && (effort || models.detail) ? <>{[models.model, effort].filter(Boolean).join(" · ")}{models.detail ? <span className="block text-muted">{models.detail}</span> : null}</> : null],
    ["Cost", costLine(trace)],
    ["Ran", loop],
  ];
  const facts = rows.filter(([, value]) => Boolean(value));
  const shownCalls = allCalls ? calls : calls.slice(0, CALLS_SHOWN);
  const hasGiven = given.skills.length || given.memories.length || given.context.length || given.left || given.terms;

  return (
    <div className="space-y-3 text-sm" data-trace={turn.id}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1" data-trace-summary title={traceSummary(view)}>
        <span className="flex items-center gap-1">
          <Pill tone={outcome.tone}>{outcome.label}</Pill>
          <InfoTip text="Only you see a turn's trace. It keeps sizes, names and timings, never what anyone wrote or what a tool returned, for as long as your history." label="About traces" />
        </span>
        <span className="min-w-0 break-words text-muted">{summaryParts(view).join(" · ")}</span>
      </div>
      {error ? (
        <p className="break-words text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {facts.length ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          {facts.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted">{label}</dt>
              <dd className="min-w-0 break-words">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {!trace ? (
        turnLive(turn) ? (
          <p className="flex items-center gap-2 text-xs text-muted" aria-live="polite">
            <Spinner /> Still running. Its trace is kept when it ends.
          </p>
        ) : (
          <p className="text-xs text-muted">No trace for this turn: it never reached a model, or its trace went with your history.</p>
        )
      ) : (
        <>
          <Section
            title="Instructions"
            aside={`${compactCount(sections.total)} tokens${trace.instructionVersion ? ` · version ${trace.instructionVersion.slice(0, 8)}` : ""}`}
            info="Each part of what the node was told this turn, in tokens (characters divided by four). Stable parts stay the same from turn to turn; context is this turn's room, skills, memories and workspace; volatile is what is new."
          >
            {sections.rows.length ? (
              <table className="w-full table-fixed text-xs" data-trace-sections>
                <colgroup>
                  <col />
                  <col className="w-[4.75rem]" />
                  <col className="w-[3.25rem]" />
                </colgroup>
                <thead className="text-left text-muted">
                  <tr>
                    <th className="pb-1 font-normal">Part</th>
                    <th className="pb-1 font-normal">Tier</th>
                    <th className="pb-1 text-right font-normal">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {sections.rows.map((row, at) => (
                    <tr key={`${row.name}-${at}`} className="border-t border-line/60">
                      <td className="truncate py-0.5 pr-2 font-mono text-[11px]" title={`${row.name} · ${row.chars} characters`}>
                        {row.name}
                      </td>
                      <td className="py-0.5 text-muted">{row.tier}</td>
                      <td className="py-0.5 text-right tabular-nums">{compactCount(row.tokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-muted">Not recorded.</p>
            )}
            {sections.tiers.length > 1 ? <p className="text-xs text-muted">{sections.tiers.map((row) => `${row.tier} ${compactCount(row.tokens)}`).join(" · ")}</p> : null}
            {sections.dropped.length ? <Lines lines={sections.dropped.map((row) => `Left out to fit: ${droppedWords(row)}`)} /> : null}
          </Section>

          <Section
            title="Tools"
            aside={callSummary(calls, trace.toolCount)}
            info="Each call, how long it took, and the size of its whole result next to what the model was told, in characters. Kept: the model saw the start and end of a long result and could read the rest. Own: your agent's own tool on your AI plan, with the size of what went in and came out; asked you means you allowed it on a card. A clock: held for your approval."
          >
            {calls.length ? (
              <table className="w-full table-fixed text-xs" data-trace-calls>
                <colgroup>
                  <col />
                  <col className="w-5" />
                  <col className="w-10" />
                  <col className="w-[6.75rem]" />
                </colgroup>
                <thead className="text-left text-muted">
                  <tr>
                    <th className="pb-1 font-normal">Call</th>
                    <th className="pb-1 font-normal">
                      <span className="sr-only">State</span>
                    </th>
                    <th className="pb-1 text-right font-normal">Time</th>
                    <th className="pb-1 text-right font-normal">Size</th>
                  </tr>
                </thead>
                <tbody>
                  {shownCalls.map((call, at) => (
                    <tr key={`${call.name}-${at}`} className="border-t border-line/60" title={call.name} data-own={call.own || undefined}>
                      <td className="py-0.5 pr-1.5">
                        <span className="flex min-w-0 items-center gap-1">
                          <ToolIcon name={call.name} size={14} />
                          <span className="min-w-0 truncate">{call.label}</span>
                          {call.own ? (
                            <span className={`${TAG} ${call.verdict === "refused" ? "border-danger/40 text-danger" : call.verdict === "asked you" ? "border-warn/40 text-warn" : "border-line text-muted"}`} title={`Your agent's own tool${call.verdict ? `: ${call.verdict}` : ""}`}>
                              own{call.verdict && call.verdict !== "allowed" ? ` · ${call.verdict}` : ""}
                            </span>
                          ) : null}
                          {call.offloaded ? (
                            <span className={`${TAG} border-accent/40 text-accent`} title="Kept whole: the model saw its start and end, and could read the rest">
                              kept
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="py-0.5">
                        {call.state === "ok" ? (
                          <Check size={13} className="text-ok" aria-label="Done" role="img" />
                        ) : call.state === "failed" ? (
                          <X size={13} className="text-danger" aria-label={call.stateText} role="img" />
                        ) : call.state === "held" ? (
                          <Clock3 size={13} className="text-warn" aria-label={call.stateText} role="img" />
                        ) : (
                          <CircleDashed size={13} className="text-muted" aria-label={call.stateText} role="img" />
                        )}
                      </td>
                      <td className="py-0.5 text-right tabular-nums text-muted">{call.time}</td>
                      <td className="whitespace-nowrap py-0.5 text-right tabular-nums text-muted">{call.sizes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {calls.length > shownCalls.length ? (
              <button type="button" onClick={() => setAllCalls(true)} className="text-xs text-accent hover:underline">
                Show all {calls.length}
              </button>
            ) : null}
          </Section>

          {hasGiven ? (
            <Section title="Given" info="What the node was given with this turn because it fit the request: skills (their scores), memories (and why), and items from your workspace.">
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                {given.skills.length ? (
                  <>
                    <dt className="text-muted">Skills</dt>
                    <dd className="min-w-0 break-words">{given.skills.join("; ")}</dd>
                  </>
                ) : null}
                {given.memories.length ? (
                  <>
                    <dt className="text-muted">Memories</dt>
                    <dd className="min-w-0 break-words">{given.memories.join("; ")}</dd>
                  </>
                ) : null}
                {given.context.length ? (
                  <>
                    <dt className="text-muted">Workspace</dt>
                    <dd className="min-w-0 break-words">{given.context.join("; ")}</dd>
                  </>
                ) : null}
                {given.terms ? (
                  <>
                    <dt className="text-muted">Searched</dt>
                    <dd className="min-w-0 break-words">{given.terms}</dd>
                  </>
                ) : null}
              </dl>
              {given.left ? <p className="text-xs text-muted">{given.left}</p> : null}
            </Section>
          ) : null}
        </>
      )}

      {decisions.length ? (
        <Section title="Decisions" info="What Node's own rules decided about this turn, such as who answers a message, with the version of the rules.">
          <ul className="space-y-1 text-xs">
            {decisions.map((decision) => {
              const line = decisionLine(decision);
              return (
                <li key={decision.id} className="break-words">
                  <span className="font-medium">{line.kind}</span> · {line.text}
                  {line.rules ? <span className="text-muted"> · rules {line.rules}</span> : null}
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      {trace ? (
        <>
          <Section title="Answer check">
            {verification ? (
              <>
                <p className={`text-xs ${verification.tone === "ok" ? "text-ok" : verification.tone === "warn" ? "text-warn" : ""}`}>{verification.line}</p>
                {verification.rounds.length ? <Lines lines={verification.rounds} /> : null}
              </>
            ) : (
              <p className="text-xs text-muted">Not checked.</p>
            )}
          </Section>
          {trace.report ? (
            <Section title="Report">
              {report.length ? <Lines lines={report} /> : <p className="text-xs text-muted">Nothing more to report.</p>}
            </Section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
