import assert from "node:assert/strict";
import test from "node:test";
import { filterModels, modelDetail, modelName, modelSections, shortModelName } from "./models";
import type { ModelOption } from "./types";

const options: ModelOption[] = [
  { provider: "ensemble", model: "gpt-5-mini", label: "GPT-5 mini (2025-08-07)", group: "included", vendor: "openai", role: "everyday", relativeCost: 1, default: true },
  { provider: "ensemble", model: "gpt-6.1-sol", label: "GPT-6.1 Sol (2026-09-29)", group: "included", vendor: "openai", role: "step-up", relativeCost: 20, default: false },
  { provider: "anthropic", model: "claude-x", label: "claude-x", group: "keys", vendor: "anthropic", default: false },
  { provider: "claude-code", model: "sonnet", label: "Sonnet", group: "plans", vendor: "Claude Code", computer: "Mira's MacBook", default: false },
];

test("the picker groups included (everyday, step-up), own keys and AI plans per computer", () => {
  assert.deepEqual(
    modelSections(options).map((row) => [row.title, row.sub ?? "", row.options.map((option) => option.model)]),
    [
      ["Included with Ensemble", "Everyday", ["gpt-5-mini"]],
      ["Included with Ensemble", "Step-up: harder work, more credits", ["gpt-6.1-sol"]],
      ["Your API keys", "anthropic", ["claude-x"]],
      ["Your AI plans on Mira's MacBook", "", ["sonnet"]],
    ],
  );
});

test("a node's model reads by name, default included", () => {
  assert.equal(modelName(options, null, null, "gpt-5-mini"), "Default (GPT-5 mini)");
  assert.equal(modelName(options, "ensemble", "gpt-6.1-sol", "x"), "GPT-6.1 Sol (2026-09-29)");
  assert.equal(modelName(options, null, "gpt-6.1-sol", "x"), "GPT-6.1 Sol (2026-09-29)");
  assert.equal(modelName(options, "claude-code", "sonnet", "x"), "Sonnet");
  assert.equal(modelName(options, "openai", "unknown", "x"), "unknown (openai)");
  assert.equal(modelName(options, "ensemble", "retired", "x"), "retired");
  assert.equal(shortModelName("GPT-6 Luna (2026-09-22)"), "GPT-6 Luna");
});

test("each model says where it runs and what it costs", () => {
  assert.equal(modelDetail(options[0]!), "Everyday · 1× credits");
  assert.equal(modelDetail(options[1]!), "Step-up · 20× credits");
  assert.equal(modelDetail(options[2]!), "Your anthropic key");
  assert.equal(modelDetail(options[3]!), "Claude Code on Mira's MacBook");
  assert.deepEqual(filterModels(options, "macbook").map((row) => row.model), ["sonnet"]);
});
