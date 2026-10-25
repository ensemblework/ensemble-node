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
