import assert from "node:assert/strict";
import test from "node:test";
import { runLook, terminalColor, terminalFit, terminalFontSize, terminalKey, terminalLine, terminalScreen, terminalText, terminalTyping, TERMINAL_BG, TERMINAL_FG } from "./terminal";

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

test("a terminal frame is read and checked: runs of cells, their colours and looks, the cursor and title", () => {
  const screen = terminalScreen(
    { t: "frame", kind: "terminal", cols: 80, rows: 3, cursor: { x: 9, y: 1 }, title: "bash — ~/work" },
    bytes({
      rows: [
        [{ t: "mira@studio", fg: "green", b: 1 }, { t: ":" }, { t: "~/work", fg: "#6EA8E6" }, { t: "$ ls" }],
        [{ t: "README.md", u: 1 }, { t: "  " }, { t: "src", fg: "brightBlue", bg: "236", i: 1, dim: 1 }],
        [{ t: "evil\u001b[2Jx", fg: "url(javascript:1)" }, { nope: true }, { t: "" }],
      ],
    }),
  );
  assert.ok(screen);
  assert.deepEqual([screen.cols, screen.rows, screen.cursor, screen.title], [80, 3, { x: 9, y: 1 }, "bash — ~/work"]);
  assert.deepEqual(screen.lines[0]![0], { t: "mira@studio", fg: "#7cc68f", b: 1 });
  assert.deepEqual(screen.lines[1]![2], { t: "src", fg: "#93c2f5", bg: "#303030", i: 1, dim: 1 });
  assert.deepEqual(screen.lines[2], [{ t: "evil [2Jx" }], "control characters show as spaces; an unknown colour is the default; empty runs go");
  assert.equal(terminalText(screen), "mira@studio:~/work$ ls\nREADME.md  src\nevil [2Jx");
  assert.equal(terminalScreen({ t: "frame", kind: "terminal" }, new TextEncoder().encode("not json")), null);
  assert.equal(terminalScreen({ t: "frame", w: 1280, h: 800 }, bytes({ rows: [] })), null, "a browser's frame is not a terminal's");
  const odd = terminalScreen({ kind: "terminal", cols: 99999, rows: -4, cursor: { x: "a" } }, bytes({ rows: "x" }));
  assert.deepEqual(odd && [odd.cols, odd.rows, odd.cursor, odd.lines], [500, 1, null, []], "sizes kept in bounds; a bad cursor is none");
});

test("colours: hex, ANSI names in their spellings, xterm palette numbers; nothing else", () => {
  assert.equal(terminalColor("#ABC"), "#abc");
  assert.equal(terminalColor("red"), "#e06c6c");
  for (const name of ["brightRed", "bright-red", "bright_red", "redBright", "Bright Red"]) assert.equal(terminalColor(name), "#ff8a8a", name);
  assert.equal(terminalColor("grey"), terminalColor(8));
  assert.equal(terminalColor(196), "#ff0000");
  assert.equal(terminalColor("21"), "#0000ff");
  assert.equal(terminalColor(232), "#080808");
  assert.equal(terminalColor(256), undefined);
  assert.equal(terminalColor("default"), undefined);
  assert.equal(terminalColor("red;background:url(x)"), undefined);
});

test("a line is drawn as its runs, with the cursor's cell split out and its colours swapped", () => {
  const runs = [{ t: "$ ", fg: "#7cc68f" }, { t: "git status", b: 1 as const }];
  const pieces = terminalLine(runs, 4);
  assert.deepEqual(
    pieces.map((piece) => [piece.text, piece.cursor ?? false]),
    [
      ["$ ", false],
      ["gi", false],
      ["t", true],
      [" status", false],
    ],
  );
  assert.deepEqual(pieces[2]!.look, { color: TERMINAL_BG, backgroundColor: TERMINAL_FG, fontWeight: 700 });
  assert.deepEqual(terminalLine(runs, null).map((piece) => piece.text), ["$ ", "git status"], "no cursor on this line");
  assert.deepEqual(terminalLine([{ t: "$" }], 3).map((piece) => [piece.text, piece.cursor ?? false]), [["$", false], ["  ", false], [" ", true]], "past the text: on a space");
  assert.deepEqual(terminalLine([], 0).map((piece) => piece.text), [" "]);
  assert.deepEqual(runLook({ fg: "#111111", bg: "#eeeeee", u: 1, dim: 1 }), { color: "#111111", backgroundColor: "#eeeeee", textDecoration: "underline", opacity: 0.6 });
});

test("keys on the terminal: letters as they are, named keys and Ctrl+letters by name, Alt as Esc first; ⌘ stays with the page", () => {
  assert.deepEqual(terminalKey({ key: "a" }), { t: "tty", text: "a" });
  assert.deepEqual(terminalKey({ key: "é" }), { t: "tty", text: "é" });
  assert.deepEqual(terminalKey({ key: " " }), { t: "tty", text: " " });
  assert.deepEqual(terminalKey({ key: "Enter" }), { t: "tty-key", key: "Enter" });
  assert.deepEqual(terminalKey({ key: "ArrowUp" }), { t: "tty-key", key: "Up" });
  assert.deepEqual(terminalKey({ key: "F5" }), { t: "tty-key", key: "F5" });
  assert.deepEqual(terminalKey({ key: "c", ctrlKey: true }), { t: "tty-key", key: "Ctrl+C" });
  assert.deepEqual(terminalKey({ key: "[", ctrlKey: true }), { t: "tty-key", key: "Escape" });
  assert.deepEqual(terminalKey({ key: "b", altKey: true }), { t: "tty", text: "\u001bb" });
  assert.equal(terminalKey({ key: "v", metaKey: true }), null, "paste is the page's");
  assert.equal(terminalKey({ key: "Shift" }), null);
  assert.equal(terminalKey({ key: "a", isComposing: true }), null);
  assert.equal(terminalKey({ key: "F13" }), null);
  assert.equal(terminalKey({ key: "1", ctrlKey: true }), null);
});

test("the phone's box types into the terminal as it changes, a Backspace per character gone", () => {
  assert.deepEqual(terminalTyping("", "ls -la"), [{ t: "tty", text: "ls -la" }]);
  assert.deepEqual(terminalTyping("gti", "git"), [{ t: "tty-key", key: "Backspace" }, { t: "tty-key", key: "Backspace" }, { t: "tty", text: "it" }]);
  assert.deepEqual(terminalTyping("same", "same"), []);
});

test("fitting: columns and rows for a box, and a font that shows the whole width when it can", () => {
  assert.deepEqual(terminalFit({ width: 390, height: 500 }, { width: 7.2, height: 16 }), { cols: 54, rows: 31 });
  assert.deepEqual(terminalFit({ width: 50, height: 20 }, { width: 8, height: 16 }), { cols: 20, rows: 5 }, "never smaller than a usable terminal");
  assert.equal(terminalFit({ width: 0, height: 10 }, { width: 8, height: 16 }), null);
  assert.equal(terminalFontSize(80, 1200), 15, "a laptop: as large as it reads well");
  assert.equal(terminalFontSize(80, 600), 12.5);
  assert.equal(terminalFontSize(120, 390), 9, "a phone: readable, scrolling sideways");
});
