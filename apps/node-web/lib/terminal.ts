/**
 * A live terminal on the owner's computer (Ensemble docs/35, live sessions): the node's shell in a
 * pseudo-terminal, streamed here as screens and typed into from here. The computer sends the latest
 * screen only, as a frame header `{t: "frame", kind: "terminal", cols, rows, cursor: {x, y}, title}`
 * and a UTF-8 JSON payload `{rows: [[{t, fg?, bg?, b?, i?, u?, dim?}, …], …]}` (runs of cells, secrets
 * already hidden on the computer). This page draws it with React (no HTML from the computer) and sends
 * keys back as `{t: "tty", text}` (literal characters), `{t: "tty-key", key}` (named keys and Ctrl+A…Z)
 * and `{t: "tty-size", cols, rows}`.
 */

export type TerminalRun = { t: string; fg?: string; bg?: string; b?: 1; i?: 1; u?: 1; dim?: 1 };

export type TerminalScreen = {
  cols: number;
  rows: number;
  /** Where the cursor is, in cells from the top left; null when the shell hides it. */
  cursor: { x: number; y: number } | null;
  title: string | null;
  lines: TerminalRun[][];
};

export type TerminalInput = { t: "tty"; text: string } | { t: "tty-key"; key: string } | { t: "tty-size"; cols: number; rows: number };

/** The terminal's own colours: a dark screen in both themes, as terminals are. */
export const TERMINAL_FG = "#e6e3da";
export const TERMINAL_BG = "#0b1315";

/** The 16 ANSI colours, readable on the dark screen. */
const ANSI = ["#1d2a2d", "#e06c6c", "#7cc68f", "#e5b766", "#6ea8e6", "#c48be0", "#5fc4c9", "#d6d3cb", "#6b7b7e", "#ff8a8a", "#9be3aa", "#f6d38a", "#93c2f5", "#dcaaf2", "#84e0e4", "#ffffff"];
const NAMES = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];

/** The xterm 256-colour palette: the 16 above, a 6×6×6 cube, then 24 greys. */
function xterm(index: number): string {
  if (index < 16) return ANSI[index]!;
  if (index < 232) {
    const value = index - 16;
    const level = (step: number) => (step ? 55 + step * 40 : 0).toString(16).padStart(2, "0");
    return `#${level(Math.floor(value / 36))}${level(Math.floor(value / 6) % 6)}${level(value % 6)}`;
  }
  const grey = (8 + (index - 232) * 10).toString(16).padStart(2, "0");
  return `#${grey}${grey}${grey}`;
}

/**
 * A colour as the computer names it, as CSS: "#rgb" or "#rrggbb", an ANSI name ("red", "brightRed",
 * "bright-red", "redBright", "grey"), or an xterm palette number (0–255). Anything else is the default.
 */
export function terminalColor(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255) return xterm(value);
  if (typeof value !== "string") return undefined;
  const raw = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(raw) || /^#[0-9a-f]{6}$/.test(raw)) return raw;
  if (/^\d{1,3}$/.test(raw) && Number(raw) <= 255) return xterm(Number(raw));
  if (raw === "grey" || raw === "gray") return ANSI[8];
  const plain = raw.replace(/[\s_-]/g, "");
  const bright = /^bright/.test(plain) ? plain.slice(6) : /bright$/.test(plain) ? plain.slice(0, -6) : null;
  const name = bright ?? plain;
  const at = NAMES.indexOf(name);
  if (at < 0) return undefined;
  return ANSI[bright === null ? at : at + 8];
}

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

/** A cell's text: control characters (which could move a real terminal) show as spaces. */
const cellText = (value: unknown): string => (typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ") : "");

function run(value: unknown): TerminalRun | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const text = cellText(row.t);
  if (!text) return null;
  const fg = terminalColor(row.fg);
  const bg = terminalColor(row.bg);
  return { t: text, ...(fg ? { fg } : {}), ...(bg ? { bg } : {}), ...(row.b ? { b: 1 as const } : {}), ...(row.i ? { i: 1 as const } : {}), ...(row.u ? { u: 1 as const } : {}), ...(row.dim ? { dim: 1 as const } : {}) };
}

/** A terminal frame from the computer, read and checked; null when it is not one. */
export function terminalScreen(header: Record<string, unknown>, payload: Uint8Array): TerminalScreen | null {
  if (header.kind !== "terminal") return null;
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return null;
  }
  const rows = clampInt(header.rows, 1, 300, 24);
  const cols = clampInt(header.cols, 1, 500, 80);
  const raw = body && typeof body === "object" && Array.isArray((body as { rows?: unknown }).rows) ? ((body as { rows: unknown[] }).rows) : [];
  const lines = raw.slice(0, rows).map((line) => (Array.isArray(line) ? line.map(run).filter((item): item is TerminalRun => item !== null) : []));
  const cursor = header.cursor && typeof header.cursor === "object" ? (header.cursor as Record<string, unknown>) : null;
  const title = typeof header.title === "string" && header.title.trim() ? cellText(header.title).trim().slice(0, 200) : null;
  return { cols, rows, cursor: cursor && Number.isFinite(Number(cursor.x)) && Number.isFinite(Number(cursor.y)) ? { x: clampInt(cursor.x, 0, cols, 0), y: clampInt(cursor.y, 0, rows - 1, 0) } : null, title, lines };
}

/** How a run looks: its colours, bold, italic, underline, dim. */
export type RunLook = { color?: string; backgroundColor?: string; fontWeight?: number; fontStyle?: "italic"; textDecoration?: "underline"; opacity?: number };

export function runLook(item: Omit<TerminalRun, "t">, cursor = false): RunLook {
  const look: RunLook = {};
  // The cursor's cell swaps its colours, as a block cursor does.
  const color = cursor ? (item.bg ?? TERMINAL_BG) : item.fg;
  const background = cursor ? (item.fg ?? TERMINAL_FG) : item.bg;
  if (color) look.color = color;
  if (background) look.backgroundColor = background;
  if (item.b) look.fontWeight = 700;
  if (item.i) look.fontStyle = "italic";
  if (item.u) look.textDecoration = "underline";
  if (item.dim && !cursor) look.opacity = 0.6;
  return look;
}

export type TerminalPiece = { text: string; look: RunLook; cursor?: true };

/**
 * One line as pieces to draw: its runs, with the cursor's cell split out when the cursor is on this
 * line (`cursorX`, in cells). A cursor past the end of the line's text sits on a space after it.
 */
export function terminalLine(runs: readonly TerminalRun[], cursorX: number | null): TerminalPiece[] {
  const pieces: TerminalPiece[] = [];
  let at = 0;
  let placed = cursorX === null;
  for (const item of runs) {
    const { t, ...style } = item;
    const cells = Array.from(t);
    if (!placed && cursorX !== null && cursorX >= at && cursorX < at + cells.length) {
      const offset = cursorX - at;
      if (offset) pieces.push({ text: cells.slice(0, offset).join(""), look: runLook(style) });
      pieces.push({ text: cells[offset]!, look: runLook(style, true), cursor: true });
      if (offset + 1 < cells.length) pieces.push({ text: cells.slice(offset + 1).join(""), look: runLook(style) });
      placed = true;
    } else {
      pieces.push({ text: t, look: runLook(style) });
    }
    at += cells.length;
  }
  if (!placed && cursorX !== null) {
    if (cursorX > at) pieces.push({ text: " ".repeat(cursorX - at), look: {} });
    pieces.push({ text: " ", look: runLook({}, true), cursor: true });
  }
  return pieces;
}

/** The screen's plain text, line by line (copying, tests, and what a screen reader is given). */
export const terminalText = (screen: Pick<TerminalScreen, "lines">): string => screen.lines.map((line) => line.map((item) => item.t).join("").replace(/\s+$/, "")).join("\n").replace(/\n+$/, "");

const NAMED: Record<string, string> = {
  Enter: "Enter",
  Backspace: "Backspace",
  Tab: "Tab",
  Escape: "Escape",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Delete: "Delete",
};

type KeyLike = { key: string; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; isComposing?: boolean };

/**
 * A key pressed on the terminal, as the computer takes it: letters and symbols as they are, named keys
 * (Enter, arrows, F1–F12…) and Ctrl+A…Z by name, Alt+x as Esc then x. Keys this page keeps (⌘ shortcuts
 * such as copy and paste, a keyboard still composing) give null.
 */
export function terminalKey(event: KeyLike): TerminalInput | null {
  const key = event.key;
  if (event.isComposing || key === "Process" || key === "Dead" || key === "Unidentified") return null;
  if (event.metaKey) return null;
  if (NAMED[key]) return { t: "tty-key", key: NAMED[key]! };
  if (/^F([1-9]|1[0-2])$/.test(key)) return { t: "tty-key", key };
  if (event.ctrlKey) {
    if (/^[a-z]$/i.test(key)) return { t: "tty-key", key: `Ctrl+${key.toUpperCase()}` };
    if (key === "[") return { t: "tty-key", key: "Escape" };
    return null;
  }
  if (Array.from(key).length !== 1) return null;
  return { t: "tty", text: event.altKey ? `\u001b${key}` : key };
}

/** What the phone's box sends as it changes: a Backspace for each character that went, then the new text. */
export function terminalTyping(before: string, after: string): TerminalInput[] {
  const was = Array.from(before);
  const now = Array.from(after);
  let same = 0;
  while (same < was.length && same < now.length && was[same] === now[same]) same += 1;
  const out: TerminalInput[] = [];
  for (let gone = same; gone < was.length; gone += 1) out.push({ t: "tty-key", key: "Backspace" });
  const added = now.slice(same).join("");
  if (added) out.push({ t: "tty", text: added });
  return out;
}

/** The keys under the terminal on a phone, which its keyboard does not have. */
export const TERMINAL_KEYS: ReadonlyArray<{ key: string; label: string; name: string }> = [
  { key: "Escape", label: "Esc", name: "Escape key" },
  { key: "Tab", label: "Tab", name: "Tab key" },
  { key: "Ctrl+C", label: "Ctrl+C", name: "Control C" },
  { key: "Left", label: "←", name: "Left arrow" },
  { key: "Up", label: "↑", name: "Up arrow" },
  { key: "Down", label: "↓", name: "Down arrow" },
  { key: "Right", label: "→", name: "Right arrow" },
  { key: "Enter", label: "Enter", name: "Enter key" },
];

/** How many columns and rows fit in a box, for "Fit to this screen" (`tty-size`). */
export function terminalFit(box: { width: number; height: number }, cell: { width: number; height: number }): { cols: number; rows: number } | null {
  if (box.width <= 0 || box.height <= 0 || cell.width <= 0 || cell.height <= 0) return null;
  return { cols: Math.min(400, Math.max(20, Math.floor(box.width / cell.width))), rows: Math.min(200, Math.max(5, Math.floor(box.height / cell.height))) };
}

/**
 * The font size that shows a screen's full width in a box: as large as fits up to 15 px, never under 9
 * px (narrower boxes scroll sideways). `ratio` is a character's width for each pixel of font size.
 */
export function terminalFontSize(cols: number, boxWidth: number, ratio = 0.6): number {
  if (cols <= 0 || boxWidth <= 0 || ratio <= 0) return 13;
  return Math.max(9, Math.min(15, Math.floor((boxWidth / (cols * ratio)) * 10) / 10));
}
