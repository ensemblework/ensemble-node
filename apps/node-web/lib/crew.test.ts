import assert from "node:assert/strict";
import test from "node:test";
import { crewDraft, nameProblems, pickLead, titleTaken, uniqueName } from "./crew";
import type { NodeTemplate } from "./types";

const template = (id: string, name: string, role: string): NodeTemplate => ({ id, name, slug: id, role, summary: "", charter: "", avatar: { shape: "orb", color: "#D7B56F", eyes: "dot" } });
const templates = [template("manager", "Manager", "manager"), template("tester", "Tester", "tester"), template("docs-writer", "Docs writer", "docs")];

test("names get a number when they are taken, as the server does", () => {
  assert.equal(uniqueName("Manager", new Set(["assistant"])), "Manager");
  assert.equal(uniqueName("Manager", new Set(["manager", "manager 2"])), "Manager 3");
});

test("a crew suggestion proposes new nodes that clash with nothing, led by its lead", () => {
  const { rows, leadKey } = crewDraft({ id: "t", title: "Team", summary: "", nodes: ["manager", "tester", "unknown"], lead: "manager" }, templates, ["Manager"]);
  assert.deepEqual(rows.map((row) => [row.name, row.role, row.templateId]), [
    ["Manager 2", "manager", "manager"],
    ["Tester", "tester", "tester"],
  ]);
  assert.equal(leadKey, rows[0]!.key);
});

test("name problems point at the row: empty, already mine, or twice in the crew", () => {
  const rows = [
    { key: "a", templateId: null, name: " ", role: "x", avatar: templates[0]!.avatar, provider: null, model: null },
    { key: "b", templateId: null, name: "assistant", role: "x", avatar: templates[0]!.avatar, provider: null, model: null },
    { key: "c", templateId: null, name: "Scout", role: "x", avatar: templates[0]!.avatar, provider: null, model: null },
    { key: "d", templateId: null, name: "scout", role: "x", avatar: templates[0]!.avatar, provider: null, model: null },
    { key: "e", templateId: null, name: "Assistant", role: "x", avatar: templates[0]!.avatar, provider: null, model: null, createdId: "n1" },
  ];
  const problems = nameProblems(rows, ["Assistant"]);
  assert.equal(problems.a, "Give it a name.");
  assert.match(problems.b!, /already have a node/);
  assert.match(problems.c!, /Two new nodes/);
  assert.match(problems.d!, /Two new nodes/);
  assert.equal(problems.e, undefined);
});

test("the lead falls back to the first node left", () => {
  const rows = [{ key: "a", templateId: null, name: "A", role: "x", avatar: templates[0]!.avatar, provider: null, model: null }];
  assert.equal(pickLead("new:a", rows, ["n1"]), "new:a");
  assert.equal(pickLead("new:gone", rows, ["n1"]), "new:a");
  assert.equal(pickLead("new:gone", [], ["n1"]), "node:n1");
  assert.equal(pickLead(null, [], []), null);
  assert.equal(titleTaken(" software TEAM ", ["Software team"]), true);
});
