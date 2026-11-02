import assert from "node:assert/strict";
import test from "node:test";
import { crewDraft, draftNode, handleForName, handleFrom, handleInput, handleProblem, handleProblems, nameProblems, pickLead, refusedField, renameDraft, titleTaken, uniqueName, type DraftNode } from "./crew";
import type { NodeTemplate } from "./types";

const template = (id: string, name: string, role: string, slug = id): NodeTemplate => ({ id, name, slug, role, summary: "", charter: `You are the ${role}.`, avatar: { shape: "orb", color: "#D7B56F", eyes: "dot" } });
const templates = [template("manager", "Manager", "manager"), template("tester", "Tester", "tester"), template("developer", "Software developer", "developer")];
const row = (key: string, patch: Partial<DraftNode> = {}): DraftNode => ({ key, templateId: null, name: key, slug: key, role: "x", charter: "", avatar: templates[0]!.avatar, provider: null, model: null, ...patch });

test("names get a number when they are taken, as the server does", () => {
  assert.equal(uniqueName("Manager", new Set(["assistant"])), "Manager");
  assert.equal(uniqueName("Manager", new Set(["manager", "manager 2"])), "Manager 3");
});

test("a handle follows the name as Ensemble makes one, and the template's handle while the name is the template's", () => {
  assert.equal(handleFrom("TEST-E1"), "test-e1");
  assert.equal(handleFrom("  Zoë's   research bot! "), "zoe-s-research-bot");
  assert.equal(handleFrom("A very long name for a node indeed"), "a-very-long-name-for-a-n");
  assert.equal(handleFrom("Twenty three characters- and more"), "twenty-three-characters");
  assert.equal(handleFrom("日本"), "");
  assert.equal(handleForName("Software developer", templates[2], new Set()), "developer");
  assert.equal(handleForName("TEST-E1", templates[0], new Set()), "test-e1");
  assert.equal(handleForName("Manager", templates[0], new Set(["manager", "manager-2"])), "manager-3");
  assert.equal(handleForName("Everyone", null, new Set()), "everyone-2");
  assert.equal(handleForName("日本", null, new Set()), "node");
  assert.equal(handleForName("  ", templates[0], new Set()), "");
  assert.equal(handleInput(" @Release Bot"), "release-bot");
});

test("a typed handle is checked against my nodes and the mentions that mean every node", () => {
  const taken = new Set(["assistant"]);
  assert.equal(handleProblem("", taken), "Give it a handle.");
  assert.match(handleProblem("-scout", taken)!, /lowercase letters, digits and dashes/);
  assert.match(handleProblem("scout_1", taken)!, /lowercase letters, digits and dashes/);
  assert.equal(handleProblem("everyone", taken), "@everyone mentions every node. Pick another handle.");
  assert.equal(handleProblem("all", taken), "@all mentions every node. Pick another handle.");
  assert.equal(handleProblem("assistant", taken), "Another of your nodes is already @assistant. Pick another handle.");
  assert.equal(handleProblem("scout-2", taken), null);
  assert.equal(refusedField(409, "Another of your nodes is already @scout. Pick another handle."), "slug");
  assert.equal(refusedField(400, "@everyone mentions every node. Pick another handle."), "slug");
  assert.equal(refusedField(409, "You already have a node called “Scout”. Pick another name."), "name");
  assert.equal(refusedField(409, "You have 24 nodes, the most one account can have."), null);
});

test("a crew suggestion proposes new nodes that clash with nothing, with their template's handle, look and instructions, led by its lead", () => {
  const { rows, leadKey } = crewDraft({ id: "t", title: "Team", summary: "", nodes: ["manager", "tester", "unknown"], lead: "manager" }, templates, ["Manager"], ["manager", "tester"]);
  assert.deepEqual(rows.map((row) => [row.name, row.slug, row.role, row.templateId, row.charter]), [
    ["Manager 2", "manager-2", "manager", "manager", "You are the manager."],
    ["Tester", "tester-2", "tester", "tester", "You are the tester."],
  ]);
  assert.equal(leadKey, rows[0]!.key);
  const blank = draftNode(undefined, new Set(["new node"]), 2, new Set(["new-node-2"]));
  assert.deepEqual([blank.name, blank.slug, blank.charter, blank.templateId, blank.avatar.shape], ["New node 2", "new-node-2-2", "", null, "spark"]);
});

test("a row's handle follows its name until the owner edits it, and stays unique among the rows", () => {
  const rows = [row("a", { templateId: "manager", name: "Manager", slug: "manager" }), row("b", { name: "Scout", slug: "scout" })];
  const renamed = renameDraft(rows, "a", "Scout", ["lead"], templates);
  assert.equal(renamed[0]!.slug, "scout-2");
  assert.equal(renameDraft(rows, "a", "Manager", ["lead"], templates)[0]!.slug, "manager");
  const edited = renameDraft([{ ...rows[0]!, slug: "boss", slugEdited: true }, rows[1]!], "a", "Planner", [], templates);
  assert.deepEqual([edited[0]!.name, edited[0]!.slug], ["Planner", "boss"]);
});

test("handle problems point at the row: invalid, already mine, special, or twice in the crew", () => {
  const problems = handleProblems([row("a", { slug: "Bad" }), row("b", { slug: "lead" }), row("c", { slug: "nodes" }), row("d", { slug: "scout" }), row("e", { slug: "scout" }), row("f", { slug: "lead", createdId: "n1" })], ["lead"]);
  assert.match(problems.a!, /lowercase/);
  assert.match(problems.b!, /already @lead/);
  assert.match(problems.c!, /mentions every node/);
  assert.equal(problems.d, "Two new nodes are @scout.");
  assert.equal(problems.e, "Two new nodes are @scout.");
  assert.equal(problems.f, undefined);
});

test("name problems point at the row: empty, already mine, or twice in the crew", () => {
  const rows = [row("a", { name: " " }), row("b", { name: "assistant" }), row("c", { name: "Scout" }), row("d", { name: "scout" }), row("e", { name: "Assistant", createdId: "n1" })];
  const problems = nameProblems(rows, ["Assistant"]);
  assert.equal(problems.a, "Give it a name.");
  assert.match(problems.b!, /already have a node/);
  assert.match(problems.c!, /Two new nodes/);
  assert.match(problems.d!, /Two new nodes/);
  assert.equal(problems.e, undefined);
});

test("the lead falls back to the first node left", () => {
  const rows = [row("a", { name: "A" })];
  assert.equal(pickLead("new:a", rows, ["n1"]), "new:a");
  assert.equal(pickLead("new:gone", rows, ["n1"]), "new:a");
  assert.equal(pickLead("new:gone", [], ["n1"]), "node:n1");
  assert.equal(pickLead(null, [], []), null);
  assert.equal(titleTaken(" software TEAM ", ["Software team"]), true);
});
