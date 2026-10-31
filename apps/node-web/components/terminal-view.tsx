"use client";

import { memo, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { CornerDownLeft, Maximize2 } from "lucide-react";
import { terminalFit, terminalFontSize, terminalKey, terminalLine, terminalText, terminalTyping, TERMINAL_BG, TERMINAL_FG, TERMINAL_KEYS, type TerminalInput, type TerminalRun, type TerminalScreen } from "@/lib/terminal";
import { Button } from "./ui";

/** Line height for each pixel of font size. */
const LINE = 1.3;

/** A monospace character's width for each pixel of font size, measured once in this browser. */
function useCharRatio(): number {
  const [ratio, setRatio] = useState(0.6);
  useEffect(() => {
    const probe = document.createElement("span");
    probe.textContent = "M".repeat(20);
    probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font-size:100px;";
    probe.className = "font-mono";
    document.body.appendChild(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    if (width > 0) setRatio(width / 2000);
  }, []);
  return ratio;
}

const Row = memo(
  function Row({ runs, cursorX, height }: { runs: readonly TerminalRun[]; cursorX: number | null; sig: string; height: number }) {
    return (
      <div className="whitespace-pre" style={{ height, lineHeight: `${height}px` }}>
        {terminalLine(runs, cursorX).map((piece, index) => (
          <span key={index} style={piece.look} data-terminal-cursor={piece.cursor ? "" : undefined} className={piece.cursor ? "motion-safe:animate-pulse" : undefined}>
            {piece.text}
          </span>
        ))}
      </div>
    );
  },
  (before, after) => before.sig === after.sig && before.height === after.height,
);

/**
 * A live terminal's screen, drawn from the computer's frames with React (never HTML from the
 * computer): its lines as coloured runs, bold, italic, underlined or dim, and the cursor. Its whole
 * width shows when the font can stay readable (9 px or more), else it scrolls sideways. Keys pressed on
 * it go to the shell (lib/terminal.ts `terminalKey`), and so does a paste.
 */
export function TerminalStage({ screen, computer, onInput, dimmed = false }: { screen: TerminalScreen | null; computer: string; onInput: (events: TerminalInput[]) => void; dimmed?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const ratio = useCharRatio();
  useEffect(() => {
    const element = box.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const size = screen ? terminalFontSize(screen.cols, Math.max(0, width - 16), ratio) : 13;
  const height = Math.round(size * LINE);
  const rows = useMemo(() => {
    if (!screen) return [];
    return Array.from({ length: screen.rows }, (_, y) => {
      const runs = screen.lines[y] ?? [];
      const cursorX = screen.cursor && screen.cursor.y === y ? screen.cursor.x : null;
      return { runs, cursorX, sig: `${cursorX ?? ""}|${JSON.stringify(runs)}` };
    });
  }, [screen]);
  const plain = useMemo(() => (screen ? terminalText(screen) : ""), [screen]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const input = terminalKey(event.nativeEvent);
    if (!input) return;
    event.preventDefault();
    onInput([input]);
  };
  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    const chunks: TerminalInput[] = [];
    for (let at = 0; at < text.length && at < 20_000; at += 1000) chunks.push({ t: "tty", text: text.slice(at, at + 1000) });
    onInput(chunks);
  };

  return (
    <div
      ref={box}
      tabIndex={0}
      role="textbox"
      aria-multiline="true"
      aria-readonly="false"
      aria-label={`The terminal on ${computer}. Type here: it goes to the shell.`}
      data-terminal-screen={screen ? `${screen.cols}x${screen.rows}` : "waiting"}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      className={`h-full w-full overflow-auto p-2 font-mono outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60 ${dimmed ? "opacity-60" : ""}`}
      style={{ background: TERMINAL_BG, color: TERMINAL_FG, fontSize: size }}
    >
      {screen ? (
        <div style={{ width: `${screen.cols}ch`, minWidth: "100%" }} aria-hidden>
          {rows.map((row, y) => (
            <Row key={y} runs={row.runs} cursorX={row.cursorX} sig={row.sig} height={height} />
          ))}
        </div>
      ) : null}
      <span className="sr-only" data-terminal-text>
        {plain}
      </span>
    </div>
  );
}

/**
 * Under the terminal: a box that types into the shell as you type (a phone's keyboard; a correction
 * goes as Backspaces, Enter sends the line), the keys a phone has not (Esc, Tab, Ctrl+C, arrows,
 * Enter), and "Fit to this screen", which asks the shell for as many columns and rows as fit here.
 */
export function TerminalKeys({ onInput, disabled, stage }: { onInput: (events: TerminalInput[]) => void; disabled: boolean; stage: { current: HTMLElement | null } }) {
  // The box is the browser's own (not redrawn by React on each key), so what is typed shows at once.
  const typedRef = useRef("");
  const box = useRef<HTMLInputElement>(null);
  const ratio = useCharRatio();
  const set = (value: string) => {
    typedRef.current = value;
    if (box.current && box.current.value !== value) box.current.value = value;
  };
  const fit = () => {
    const element = stage.current;
    if (!element) return;
    const font = window.innerWidth < 768 ? 12 : 13;
    const rect = element.getBoundingClientRect();
    const size = terminalFit({ width: rect.width - 16, height: rect.height - 16 }, { width: font * ratio, height: Math.round(font * LINE) });
    if (size) onInput([{ t: "tty-size", ...size }]);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          ref={box}
          defaultValue=""
          onChange={(event) => {
            const next = event.target.value;
            onInput(terminalTyping(typedRef.current, next));
            set(next);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter") {
              event.preventDefault();
              onInput([{ t: "tty-key", key: "Enter" }]);
              set("");
            } else if (event.key === "Backspace" && !typedRef.current) {
              onInput([{ t: "tty-key", key: "Backspace" }]);
            } else if (event.key === "Tab") {
              event.preventDefault();
              onInput([{ t: "tty-key", key: "Tab" }]);
            }
          }}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="send"
          data-1p-ignore
          data-lpignore="true"
          aria-label="Type into the terminal"
          placeholder="Type here: it goes to the shell"
          disabled={disabled}
          className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-2 font-mono text-base outline-none placeholder:font-sans focus:border-accent sm:text-sm"
        />
        <Button size="sm" tone="ghost" disabled={disabled} aria-label="Enter key" onClick={() => (onInput([{ t: "tty-key", key: "Enter" }]), set(""))}>
          <CornerDownLeft size={14} />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Keys">
        {TERMINAL_KEYS.filter((row) => row.key !== "Enter").map((row) => (
          <Button key={row.key} size="sm" tone="ghost" disabled={disabled} aria-label={row.name} title={row.name} className="min-w-9 font-mono" onClick={() => onInput([{ t: "tty-key", key: row.key }])}>
            {row.label}
          </Button>
        ))}
        <Button size="sm" tone="quiet" disabled={disabled} onClick={fit} title="Ask the shell for as many columns and rows as fit on this screen">
          <Maximize2 size={13} /> Fit to this screen
        </Button>
      </div>
    </div>
  );
}
