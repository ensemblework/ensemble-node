import assert from "node:assert/strict";
import test from "node:test";
import { askBeforeBrowsing, QUICK_PROFILE, runProfileFor, runProfileLine } from "./owner-settings";

const copilot = { id: "copilot", name: "Copilot", engine: "copilot-cli", model: "gpt-6.1-sol", effort: "medium", context: "long_context" };
const claude = { id: "claude", name: "Claude", engine: "claude-code", model: "", effort: "default" };

test("a node's agent sessions use its own profile, else the default, else the first, else Quick", () => {
  assert.equal(runProfileFor({ runProfiles: [claude, copilot], defaultRunProfileId: "copilot" }, "claude").id, "claude");
  assert.equal(runProfileFor({ runProfiles: [claude, copilot], defaultRunProfileId: "copilot" }, "CLAUDE").id, "claude", "by name or id, any case");
  assert.equal(runProfileFor({ runProfiles: [claude, copilot], defaultRunProfileId: "copilot" }, "gone").id, "copilot");
  assert.equal(runProfileFor({ runProfiles: [claude, copilot], defaultRunProfileId: null }, null).id, "claude");
  assert.equal(runProfileFor({ runProfiles: [], defaultRunProfileId: null }), QUICK_PROFILE);
  assert.equal(runProfileFor(undefined), QUICK_PROFILE);
});

test("a profile reads as engine, model, thinking and context", () => {
  assert.equal(runProfileLine(copilot), "GitHub Copilot · gpt-6.1-sol · medium thinking · long context");
  assert.equal(runProfileLine(claude), "Claude Code · its default model");
  assert.equal(runProfileLine(QUICK_PROFILE), "Ensemble's agent · its default model");
  assert.equal(runProfileLine({ id: "e", name: "E", engine: "ensemble", model: "azure-included::gpt-6-luna", effort: "low" }), "Ensemble's agent · gpt-6-luna · low thinking");
});

test("asking before opening a new website is off unless set, and unknown on an Ensemble without Node's settings", () => {
  assert.equal(askBeforeBrowsing({ node: { askBeforeBrowsing: true } }), true);
  assert.equal(askBeforeBrowsing({ node: { askBeforeBrowsing: false } }), false);
  assert.equal(askBeforeBrowsing({ node: {} }), false);
  assert.equal(askBeforeBrowsing({ runProfiles: [] }), null);
  assert.equal(askBeforeBrowsing(null), null);
});
