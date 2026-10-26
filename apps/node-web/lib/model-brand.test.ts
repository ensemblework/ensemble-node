import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AVATAR_SHAPES, NodeAvatar } from "../components/node-avatar";
import { ModelLogo } from "../components/model-logo";
import { MODEL_BRANDS, modelBrand } from "./model-brand";
import manifest from "../public/providers/manifest.json";

test("real model signatures take precedence over the provider or agent that routed them", () => {
  for (const [model, brand] of [["gpt-6.1-sol", "openai"], ["claude-sonnet-4-6", "claude"], ["grok-4.7", "grok"], ["gemini-3-pro", "gemini"], ["mai-code-2-flash", "microsoft"], ["deepseek-r1", "deepseek"], ["qwen3-coder", "qwen"], ["kimi-k2", "kimi"], ["codestral", "mistral"]]) {
    assert.equal(modelBrand(model, "copilot-cli"), brand);
  }
  assert.equal(modelBrand(null, "copilot-cli"), "copilot");
  assert.equal(modelBrand(null, "cursor-agent"), "cursor");
  assert.equal(modelBrand("my-custom-model", "private-provider"), null);
});

test("each signature is a local canonical vector with provenance, not a placeholder or remote script", () => {
  for (const key of Object.keys(MODEL_BRANDS)) {
    const provenance = manifest.marks[key as keyof typeof manifest.marks];
    assert.ok(provenance?.source, key);
    const svg = readFileSync(new URL(`../public/providers/${key}.svg`, import.meta.url), "utf8");
    assert.match(svg, /<svg/);
    assert.match(svg, /viewBox=/);
    assert.doesNotMatch(svg, /<script|<foreignObject|(?:href|src)=["']https?:/i);
  }
  const icon = renderToStaticMarkup(createElement(ModelLogo, { model: "gpt-5-mini" }));
  assert.match(icon, /aria-label="OpenAI"/);
  assert.match(icon, /providers\/openai\.svg/);
});

test("nodes keep their saved signature face independently of their model or provider", () => {
  const avatar = { shape: "hex" as const, color: "#B39DDB", eyes: "wide" as const };
  const render = (node: { avatar: typeof avatar; model?: string | null; provider?: string | null }) =>
    renderToStaticMarkup(createElement(NodeAvatar, { node }));
  const signature = render({ avatar });
  assert.match(signature, /<svg[^>]+data-node-avatar/);
  assert.match(signature, /d="M50 5l39 22v46L50 95 11 73V27z"/);
  assert.match(signature, /stop-color="#B39DDB"/);
  assert.equal([...signature.matchAll(/<ellipse /g)].length, 2);
  assert.doesNotMatch(signature, /data-model-brand|providers\//);
  assert.equal(render({ avatar, model: "gpt-5-mini", provider: "ensemble" }), signature);
  assert.equal(render({ avatar, model: "claude-sonnet-4-6", provider: "anthropic" }), signature);
  assert.equal(render({ avatar, model: null, provider: null }), signature);
});

test("signature shape and eyes remain editable without sharing SVG gradients", () => {
  const faces = AVATAR_SHAPES.map((shape, index) => createElement(NodeAvatar, {
    key: shape, avatar: { shape, color: "#7FB3D5", eyes: (["dot", "line", "wide"] as const)[index % 3]! },
  }));
  const markup = renderToStaticMarkup(createElement(Fragment, null, ...faces));
  const gradients = [...markup.matchAll(/<radialGradient id="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(gradients).size, faces.length);
  assert.equal(new Set([...markup.matchAll(/<path d="([^"]+)"/g)].map(match => match[1])).size, faces.length);
  for (const id of gradients) assert.ok(markup.includes(`fill="url(#${id})"`));
  for (const element of ["circle", "rect", "ellipse"]) assert.equal([...markup.matchAll(new RegExp(`<${element} `, "g"))].length, 4);
});

test("an unspecified node keeps the original default face and status styling", () => {
  const markup = renderToStaticMarkup(createElement(NodeAvatar, { thinking: true, dim: true, title: "Scout" }));
  assert.match(markup, /aria-label="Scout"/);
  assert.match(markup, /node-thinking/);
  assert.match(markup, /opacity-50 grayscale/);
  assert.match(markup, /stop-color="#D7B56F"/);
  assert.equal([...markup.matchAll(/<circle /g)].length, 2);
  assert.doesNotMatch(markup, /data-model-brand|providers\//);
});
