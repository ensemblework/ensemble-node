import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DefaultNodeModel, NodeAvatar } from "../components/node-avatar";
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

test("owned default nodes use the actual default model; public nodes do not invent or disclose a model", () => {
  const avatar = { shape: "orb" as const, color: "#D7B56F", eyes: "dot" as const };
  const render = (node: { avatar: typeof avatar; model?: string | null; provider?: string | null }) =>
    renderToStaticMarkup(createElement(DefaultNodeModel.Provider, { value: "gpt-5-mini" }, createElement(NodeAvatar, { node })));
  assert.match(render({ avatar, model: null, provider: null }), /data-model-brand="openai"/);
  assert.match(render({ avatar }), /data-model-brand="ensemble"/);
  assert.doesNotMatch(render({ avatar }), /data-model-brand="openai"/);
});
