"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkBook } from "xlsx";
import { Spinner } from "../ui";

const ROW = 28, LIMIT = 50_000, COLUMNS = 100;
export default function SheetPreview({ bytes }: { bytes: ArrayBuffer }) {
  const [book, setBook] = useState<WorkBook | null>(null);
  const [grids, setGrids] = useState<Record<string, string[][]>>({});
  const [sheet, setSheet] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [top, setTop] = useState(0);
  const scroll = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(600);
  useEffect(() => {
    let active = true;
    void import("xlsx").then(XLSX => {
      const parsed = XLSX.read(bytes, { type: "array", sheetRows: LIMIT + 1, cellHTML: false, cellFormula: false });
      const next: Record<string, string[][]> = {};
      for (const name of parsed.SheetNames) {
        const range = XLSX.utils.decode_range(parsed.Sheets[name]?.["!ref"] ?? "A1");
        range.e.r = Math.min(range.e.r, LIMIT - 1); range.e.c = Math.min(range.e.c, COLUMNS - 1);
        next[name] = XLSX.utils.sheet_to_json<string[]>(parsed.Sheets[name]!, { header: 1, raw: false, defval: "", range });
      }
      if (active) { setBook(parsed); setGrids(next); }
    }).catch(problem => { if (active) setError(problem instanceof Error ? problem.message : "The spreadsheet could not be read."); });
    return () => { active = false; };
  }, [bytes]);
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setHeight(element.clientHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, [book]);
  const name = book?.SheetNames[sheet];
  const rows = name ? grids[name] ?? [] : [];
  const columns = useMemo(() => Math.min(COLUMNS, rows.reduce((max, row) => Math.max(max, row.length), 0)), [rows]);
  const start = Math.max(0, Math.floor(top / ROW) - 8), end = Math.min(rows.length, Math.ceil((top + height) / ROW) + 8);
  if (error) return <p role="alert" className="p-6 text-sm text-danger">{error} Download the original to inspect it.</p>;
  if (!book) return <div className="flex h-full items-center justify-center"><Spinner /></div>;
  return <div className="flex h-full min-h-0 flex-col">
    <div className="flex shrink-0 flex-wrap gap-1 border-b border-line p-2" role="group" aria-label="Worksheets">{book.SheetNames.map((name, index) => <button key={name} type="button" aria-pressed={sheet === index} onClick={() => { setSheet(index); setTop(0); if (scroll.current) scroll.current.scrollTop = 0; }} className={`rounded-lg px-3 py-2 text-xs ${sheet === index ? "bg-raised text-ink" : "text-muted hover:bg-raised"}`}>{name}</button>)}</div>
    <div ref={scroll} className="scroll-thin min-h-0 flex-1 overflow-auto" onScroll={event => setTop(event.currentTarget.scrollTop)}>
      <table className="border-collapse text-left text-xs" aria-label={name}>
        <tbody>
          {start ? <tr aria-hidden><td style={{ height: start * ROW }} colSpan={columns + 1} /></tr> : null}
          {rows.slice(start, end).map((row, index) => <tr key={start + index} style={{ height: ROW }}><th className="sticky left-0 border border-line bg-panel px-2 font-normal tabular-nums text-muted">{start + index + 1}</th>{Array.from({ length: columns }, (_, column) => <td key={column} className="max-w-80 min-w-24 truncate border border-line px-3" title={String(row[column] ?? "")}>{row[column]}</td>)}</tr>)}
          {end < rows.length ? <tr aria-hidden><td style={{ height: (rows.length - end) * ROW }} colSpan={columns + 1} /></tr> : null}
        </tbody>
      </table>
    </div>
    <p className="shrink-0 border-t border-line px-3 py-2 text-[11px] text-muted">Read-only preview · up to {LIMIT.toLocaleString()} rows and {COLUMNS} columns. Formulas and macros are not executed.</p>
  </div>;
}
