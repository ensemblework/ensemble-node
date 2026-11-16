import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AVATAR_SHAPES, avatarTones, NodeAvatar } from "../components/node-avatar";
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
  assert.match(signature, /data-node-avatar/);
  assert.match(signature, /data-node-shape="hex"/);
  assert.match(signature, /data-node-eyes="dot"/, "wide eyes from an older save draw as dots");
  assert.match(signature, /<canvas/);
  assert.doesNotMatch(signature, /data-model-brand|providers\//);
  assert.equal(render({ avatar, model: "gpt-5-mini", provider: "ensemble" }), signature);
  assert.equal(render({ avatar, model: "claude-sonnet-4-6", provider: "anthropic" }), signature);
  assert.equal(render({ avatar, model: null, provider: null }), signature);
});

test("each kept shape is offered once, and older eyes still render", () => {
  const faces = AVATAR_SHAPES.map((shape, index) => createElement(NodeAvatar, {
    key: shape, avatar: { shape, color: "#7FB3D5", eyes: (["dot", "happy", "sleepy", "line", "wide"] as const)[index % 5]! },
  }));
  const markup = renderToStaticMarkup(createElement(Fragment, null, ...faces));
  assert.equal([...markup.matchAll(/data-node-avatar/g)].length, AVATAR_SHAPES.length);
  assert.equal(new Set([...markup.matchAll(/data-node-shape="([^"]+)"/g)].map(match => match[1])).size, AVATAR_SHAPES.length);
  assert.ok(markup.includes('data-node-shape="gumdrop"'));
  assert.ok(markup.includes('data-node-eyes="sleepy"'), "line eyes draw sleepy");
});

test("an unspecified node keeps the original default face and status styling", () => {
  const markup = renderToStaticMarkup(createElement(NodeAvatar, { thinking: true, dim: true, title: "Scout" }));
  assert.match(markup, /aria-label="Scout"/);
  assert.match(markup, /node-thinking/);
  assert.match(markup, /opacity-50 grayscale/);
  assert.match(markup, /data-node-shape="orb"/);
  assert.match(markup, /data-node-state="thinking"/);
  assert.match(markup, /aria-label="Scout"/);
  assert.doesNotMatch(markup, /data-model-brand|providers\//);
});

test("a face is shaded in its own hue, opaque, with a darker edge and eyes that contrast with it", () => {
  const gold = avatarTones("#D7B56F");
  assert.deepEqual([gold.light, gold.shade, gold.edge, gold.eyes], ["#EBDAB7", "#C2A364", "#977F4E", "#14110C"]);
  assert.equal(avatarTones("#2B3A67").eyes, "#FBF8F1", "light eyes on a dark colour");
});
