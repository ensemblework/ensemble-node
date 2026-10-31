import assert from "node:assert/strict";
import test from "node:test";
import { loginPath, safeNext } from "./next-path";

test("after signing in, Node goes back only to a page of its own, with its question and hash", () => {
  assert.equal(safeNext("/c/0c1d2e3f-4a5b"), "/c/0c1d2e3f-4a5b");
  assert.equal(safeNext("/r/dm-lead?remote=1#m-c-login"), "/r/dm-lead?remote=1#m-c-login");
  for (const bad of ["https://evil.example/x", "//evil.example", "/\\evil.example", "javascript:alert(1)", "/login", "/login?next=/x", "/", "/welcome", "", " ", null, 42, `/${"x".repeat(600)}`, "/r/a\nb"]) assert.equal(safeNext(bad), null, String(bad));
  assert.equal(loginPath("/r/dm-lead?remote=1#m-c-login"), "/login?next=%2Fr%2Fdm-lead%3Fremote%3D1%23m-c-login");
  assert.equal(loginPath("https://evil.example"), "/login");
  assert.equal(loginPath(null), "/login");
});
