import assert from "node:assert/strict";
import test from "node:test";
import { blocks, boldParts } from "./markdown";

test("node replies become headings, lists, code and paragraphs", () => {
  const parsed = blocks("## Plan\n1. Write tests\n2. Fix it\n\nThen:\n- docs\n- ship\n```\npnpm test\n```\n> note");
  assert.deepEqual(parsed, [
    { kind: "heading", level: 2, text: "Plan" },
    { kind: "list", ordered: true, items: ["Write tests", "Fix it"] },
    { kind: "paragraph", text: "Then:" },
    { kind: "list", ordered: false, items: ["docs", "ship"] },
    { kind: "code", text: "pnpm test", lang: null },
    { kind: "quote", text: "note" },
  ]);
  assert.deepEqual(blocks("```TypeScript title=a.ts\nconst a = 1;\n```"), [{ kind: "code", text: "const a = 1;", lang: "typescript" }]);
  assert.deepEqual(boldParts("a **b** c"), [{ text: "a ", bold: false }, { text: "b", bold: true }, { text: " c", bold: false }]);
});

test("GFM tables retain linked tasks and inline Markdown in their cells", () => {
  assert.deepEqual(blocks([
    "| Task | Owner |",
    "|---|---|",
    "| [Draft brief](/tasks/brief) | **@writer** |",
    "| [Review](https://example.com/review) | `team` |",
  ].join("\r\n")), [{
    kind: "table",
    header: ["Task", "Owner"],
    align: [null, null],
    rows: [
      ["[Draft brief](/tasks/brief)", "**@writer**"],
      ["[Review](https://example.com/review)", "`team`"],
    ],
  }]);
});

test("GFM tables support alignment, optional edge pipes and uneven body rows", () => {
  assert.deepEqual(blocks([
    "Task | Owner | Count",
    ":--- | :---: | ---:",
    "Draft | Writer | 2",
    "Review",
    "| Ship | Builder | 1 | ignored |",
    "|| Unassigned ||",
  ].join("\n")), [{
    kind: "table",
    header: ["Task", "Owner", "Count"],
    align: ["left", "center", "right"],
    rows: [["Draft", "Writer", "2"], ["Review", "", ""], ["Ship", "Builder", "1"], ["", "Unassigned", ""]],
  }]);
});

test("escaped pipes stay inside cells, including code, links and trailing pipes", () => {
  assert.deepEqual(blocks(String.raw`| Syntax | Value |
| --- | --- |
| a\|b | x\| |
| ` + "`" + String.raw`a\|b` + "`" + String.raw` | [a\|b](https://example.com/a\|b) |
| slash\\| next |
| slash\\\|pipe | end |`), [{
    kind: "table",
    header: ["Syntax", "Value"],
    align: [null, null],
    rows: [
      ["a|b", "x|"],
      ["`a|b`", "[a|b](https://example.com/a|b)"],
      [String.raw`slash\\`, "next"],
      [String.raw`slash\\|pipe`, "end"],
    ],
  }]);
  assert.deepEqual(blocks(String.raw`First | Second
--- | ---
last | escaped\|`), [{
    kind: "table", header: ["First", "Second"], align: [null, null], rows: [["last", "escaped|"]],
  }]);
});

test("tables preserve surrounding blocks and do not parse fenced examples", () => {
  const table = "| Task | Owner |\n| --- | --- |\n| Draft | Writer |";
  for (const [suffix, expected] of [
    ["\n\nAfter", { kind: "paragraph", text: "After" }],
    ["\n## After", { kind: "heading", level: 2, text: "After" }],
    ["\n- After", { kind: "list", ordered: false, items: ["After"] }],
    ["\n> After", { kind: "quote", text: "After" }],
    ["\n```ts\nconst after = true;\n```", { kind: "code", text: "const after = true;", lang: "ts" }],
  ]) {
    const parsed = blocks(`Before\n${table}${suffix}`);
    assert.deepEqual(parsed[0], { kind: "paragraph", text: "Before" });
    assert.equal(parsed[1]?.kind, "table");
    assert.deepEqual(parsed[2], expected);
  }
  assert.deepEqual(blocks(`\`\`\`markdown\n${table}\n\`\`\``), [{ kind: "code", text: table, lang: "markdown" }]);
});

test("invalid or unfinished table delimiters and ordinary pipes remain text", () => {
  for (const text of [
    "Task | Owner\n--- |",
    "Task | Owner\n--- | nope",
    "| Task | Owner |\n| --- | --- | --- |",
    "| Task | Owner |\n| --- | : |",
    "Task | Owner",
    "Task\n---",
    String.raw`Task \| Owner` + "\n---",
  ]) {
    assert.deepEqual(blocks(text), [{ kind: "paragraph", text }], text);
  }
});

test("single-column and header-only GFM tables are supported", () => {
  assert.deepEqual(blocks("| Task |\n| --- |"), [{ kind: "table", header: ["Task"], align: [null], rows: [] }]);
  assert.deepEqual(blocks("Task\n| :--: |"), [{ kind: "table", header: ["Task"], align: ["center"], rows: [] }]);
});
