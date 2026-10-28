import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RichText } from "../components/chat/rich-text";
import { ENSEMBLE_APP } from "./config";

const handles = new Set(["writer"]);
const render = (text: string, props: Partial<ComponentProps<typeof RichText>> = {}) =>
  renderToStaticMarkup(createElement(RichText, { text, handles, ...props }));

test("message tables render semantic headers, rows, links and inline formatting", () => {
  const html = render([
    "| Task | Owner |",
    "|---|---|",
    "| [Draft brief](/tasks/brief) | **@writer** |",
    "| [Review](https://example.com/review) | `team` |",
  ].join("\n"));
  assert.match(html, /<table\b/);
  assert.match(html, /<thead><tr><th[^>]*scope="col"[^>]*>Task<\/th><th[^>]*scope="col"[^>]*>Owner<\/th><\/tr><\/thead>/);
  assert.equal([...html.matchAll(/<tbody>/g)].length, 1);
  assert.equal([...html.matchAll(/<tr\b/g)].length, 3);
  assert.equal([...html.matchAll(/<td\b/g)].length, 4);
  assert.ok(html.includes(`href="${ENSEMBLE_APP}/tasks/brief"`));
  assert.match(html, /href="https:\/\/example.com\/review" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /<strong><span[^>]*>@writer<\/span><\/strong>/);
  assert.match(html, /<code[^>]*>team<\/code>/);
  assert.doesNotMatch(html, /\|---\|/);
});

test("table alignment applies to both headers and body cells in a keyboard-scrollable region", () => {
  const html = render("Left | Middle | Right\n:--- | :---: | ---:\na | b | c");
  assert.match(html, /class="[^"]*max-w-full[^"]*overflow-x-auto[^"]*"[^>]*role="region"[^>]*aria-label="Table"[^>]*tabindex="0"/);
  for (const align of ["left", "center", "right"]) {
    assert.match(html, new RegExp(`<th[^>]*style="text-align:${align}"`));
    assert.match(html, new RegExp(`<td[^>]*style="text-align:${align}"`));
  }
});

test("tables retain Node and Ensemble link destinations and record title formatting", () => {
  const id = "12345678-1234-1234-1234-123456789abc";
  const html = render(`Task | Room\n--- | ---\n[@Draft brief](ensemble://task/${id}) | [Launch](/r/launch)`, {
    refs: [{ kind: "task", id, label: "Draft brief" }],
  });
  assert.ok(html.includes(`href="${ENSEMBLE_APP}/tasks/${id}"`));
  assert.match(html, /href="\/r\/launch" class="[^"]*">Launch<\/a>/);
  assert.match(html, />Draft brief<\/a>/);
});

test("table content stays escaped and unsafe link schemes never become active links", () => {
  const html = render([
    "| Content | Link |",
    "| --- | --- |",
    '| <script>alert("x")</script> | [bad](javascript:alert) |',
    '| <img src=x onerror=alert(1)> | [bad](data:text/html,test) |',
    '| **Safe & sound** | [bad](//example.com) |',
  ].join("\n"));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /<strong>Safe &amp; sound<\/strong>/);
  assert.doesNotMatch(html, /<script|<img|<a\b|href="(?:javascript:|data:|\/\/)/);
});

test("other message Markdown and code-fenced table examples keep their rendering", () => {
  const html = render("## Plan\n1. **Draft**\n2. [Review](/tasks/review)\n\n> Ask @writer\n\n````\n| Task | Owner |\n| --- | --- |\n````\n\nDone with `code`.");
  assert.match(html, /<p class="font-semibold">Plan<\/p>/);
  assert.match(html, /<ol[^>]*><li><strong>Draft<\/strong><\/li><li><a /);
  assert.match(html, /<blockquote[^>]*>Ask <span[^>]*>@writer<\/span><\/blockquote>/);
  assert.match(html, /<pre[^>]*><code[^>]*>\| Task \| Owner \|/);
  assert.match(html, /Done with <code[^>]*>code<\/code>/);
  assert.doesNotMatch(html, /<table\b/);
});
