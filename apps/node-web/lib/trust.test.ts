import assert from "node:assert/strict";
import test from "node:test";
import { acceptLine, budgetLine, mergeTrust, ownSettings, TRUST_DEFAULTS, trustPatch, trustSummary } from "./trust";

test("settings apply in layers: the defaults, everyone in the room, then one person", () => {
  assert.deepEqual(mergeTrust(), TRUST_DEFAULTS);
  const everyone = mergeTrust({ statusDetail: "details", shareOther: "never" });
  assert.equal(everyone.statusDetail, "details");
  assert.equal(everyone.status, "answer", "what is not set keeps its default");
  const ben = mergeTrust({ statusDetail: "details", shareOther: "never" }, { workRequests: "accept", acceptKinds: ["review"] });
  assert.deepEqual([ben.statusDetail, ben.workRequests, ben.acceptKinds], ["details", "accept", ["review"]]);
  assert.deepEqual(mergeTrust(null, undefined), TRUST_DEFAULTS);
  assert.notEqual(mergeTrust().acceptKinds, TRUST_DEFAULTS.acceptKinds, "never shares the defaults' list");
});

test("only what changed is sent back; one person's own settings are set apart", () => {
  const before = mergeTrust();
  assert.deepEqual(trustPatch(before, before), {});
  assert.deepEqual(trustPatch(before, { ...before, status: "ask", statusDetail: "nothing" }), { status: "ask", statusDetail: "nothing" });
  assert.deepEqual(trustPatch({ ...before, acceptKinds: ["work", "review"] }, { ...before, acceptKinds: ["review", "work"] }), {}, "the same kinds in another order");
  assert.deepEqual(trustPatch(before, { ...before, workRequests: "accept", acceptKinds: ["work"] }), { workRequests: "accept", acceptKinds: ["work"] });
  assert.deepEqual(ownSettings({ status: "ask", shareOther: undefined }), ["status"]);
  assert.deepEqual(ownSettings(null), []);
});

test("a person's row says what differs from everyone's; work and the budget read in a line", () => {
  const everyone = mergeTrust();
  assert.equal(trustSummary(everyone, everyone), "As for everyone");
  assert.equal(trustSummary(mergeTrust({ status: "ask" }), everyone), "status questions: ask me first");
  assert.equal(trustSummary(mergeTrust({ workRequests: "accept", acceptKinds: ["review"] }), everyone), "requests for work and reviews: accept on its own · accepts reviews on its own");
  assert.equal(acceptLine({ workRequests: "accept", acceptKinds: ["review", "work"] }), "Accepts reviews and work on its own");
  assert.equal(acceptLine({ workRequests: "accept", acceptKinds: [] }), "Asks you about work");
  assert.equal(acceptLine({ workRequests: "ask", acceptKinds: ["work"] }), "Asks you about work");
  assert.equal(budgetLine({ credits: null, usedThisMonth: 0 }), "No limit");
  assert.equal(budgetLine({ credits: null, usedThisMonth: 12.4 }), "No limit · 12 credits used this month");
  assert.equal(budgetLine({ credits: 500, usedThisMonth: 120 }), "120 of 500 credits used this month");
});
