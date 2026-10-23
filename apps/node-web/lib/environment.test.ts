import assert from "node:assert/strict";
import test from "node:test";
import { environmentProblems, nodeEnvironment } from "./environment";

const production = { NEXT_PUBLIC_ENSEMBLE_API: "https://api.ensemblework.com", NEXT_PUBLIC_ENSEMBLE_APP: "https://app.ensemblework.com" };
const testing = { NEXT_PUBLIC_ENSEMBLE_NODE_ENV: "testing", NEXT_PUBLIC_ENSEMBLE_API: "https://api-test.ensemblework.com/", NEXT_PUBLIC_ENSEMBLE_APP: "https://test.ensemblework.com" };

test("each website talks only to its own Ensemble", () => {
  assert.deepEqual(environmentProblems(production), []);
  assert.deepEqual(environmentProblems(testing), []);
  assert.equal(environmentProblems({ ...production, NEXT_PUBLIC_ENSEMBLE_API: testing.NEXT_PUBLIC_ENSEMBLE_API }).length, 1, "production refuses the testing API");
  assert.equal(environmentProblems({ ...production, NEXT_PUBLIC_ENSEMBLE_APP: testing.NEXT_PUBLIC_ENSEMBLE_APP }).length, 1, "and the testing Ensemble app");
  assert.equal(environmentProblems({ ...testing, NEXT_PUBLIC_ENSEMBLE_API: production.NEXT_PUBLIC_ENSEMBLE_API, NEXT_PUBLIC_ENSEMBLE_APP: production.NEXT_PUBLIC_ENSEMBLE_APP }).length, 2, "testing refuses production");
  assert.deepEqual(environmentProblems({ NEXT_PUBLIC_ENSEMBLE_NODE_ENV: "testing", NEXT_PUBLIC_ENSEMBLE_API: "http://localhost:4000", NEXT_PUBLIC_ENSEMBLE_APP: "http://localhost:3000" }), [], "local development is allowed");
});

test("anything but testing is production", () => {
  assert.equal(nodeEnvironment("testing"), "testing");
  assert.equal(nodeEnvironment(undefined), "production");
  assert.equal(nodeEnvironment("staging"), "production");
});
