import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { testsRun } from "../lib/output.mjs";
import { tempDir, writeFiles } from "./helpers.mjs";

function nodeTest(t, files, args) {
  const dir = tempDir(t);
  writeFiles(dir, files);
  // Without NODE_TEST_CONTEXT the child prints its own report instead of streaming to this test run.
  const { NODE_TEST_CONTEXT: _, ...env } = process.env;
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", ...args], { cwd: dir, env, encoding: "utf8" });
  return result.stdout;
}

test("node --test with every test skipped ran 0 tests", (t) => {
  const output = nodeTest(t, { "a.test.mjs": 'import { test } from "node:test";\ntest("a", { skip: true }, () => {});\n' }, ["a.test.mjs"]);
  assert.equal(testsRun(output), 0);
});

test("node --test that found no test files ran 0 tests", (t) => {
  assert.equal(testsRun(nodeTest(t, {}, [path.join("test", "*.test.mjs")])), 0);
});

test("node --test with a passing test", (t) => {
  assert.equal(testsRun(nodeTest(t, { "a.test.mjs": 'import { test } from "node:test";\ntest("a", () => {});\n' }, ["a.test.mjs"])), 1);
});

test("node --test spec reporter summary", () => {
  assert.equal(testsRun("ℹ tests 3\nℹ suites 0\nℹ pass 0\nℹ fail 0\nℹ skipped 3"), 0);
  assert.equal(testsRun("ℹ tests 3\nℹ pass 2\nℹ fail 1"), 3);
});

test("Jest summary", () => {
  assert.equal(testsRun("Tests:       4 skipped, 4 total\nSnapshots:   0 total"), 0);
  assert.equal(testsRun("Tests:       1 failed, 2 skipped, 3 passed, 6 total"), 4);
});

test("Vitest summary, with colours", () => {
  assert.equal(testsRun(" Test Files  1 skipped (1)\n      Tests  5 skipped (5)"), 0);
  assert.equal(testsRun("\u001b[2m      Tests \u001b[22m \u001b[1m\u001b[32m2 passed\u001b[39m\u001b[22m | 3 skipped (5)"), 2);
});

test("pytest summary", () => {
  assert.equal(testsRun("============================= 5 skipped in 0.02s =============================="), 0);
  assert.equal(testsRun("========= 1 failed, 2 passed, 1 skipped in 0.31s (0:00:00) ========="), 3);
});

test("Cargo summaries are added up", () => {
  const output = "test result: ok. 0 passed; 0 failed; 2 ignored; 0 measured\n\ntest result: ok. 0 passed; 0 failed; 0 ignored; 0 measured";
  assert.equal(testsRun(output), 0);
  assert.equal(testsRun("test result: ok. 4 passed; 0 failed; 1 ignored"), 4);
});

test("Mocha summary", () => {
  assert.equal(testsRun("  0 passing (4ms)\n  3 pending"), 0);
  assert.equal(testsRun("  2 passing (9ms)\n  1 failing"), 3);
});

test("Jest and Vitest with --passWithNoTests ran 0 tests", () => {
  assert.equal(testsRun("No tests found, exiting with code 0"), 0);
  assert.equal(testsRun("\nfilter:  src\ninclude: **/*.test.ts\n\nNo test files found, exiting with code 0\n"), 0);
});

test("go test where no package has tests ran 0 tests", () => {
  assert.equal(testsRun("?   \tshop/cart\t[no test files]\n?   \tshop/coupon\t[no test files]"), 0);
  assert.equal(testsRun("ok  \tshop/cart\t0.004s [no tests to run]\n?   \tshop/coupon\t[no test files]"), 0);
});

test("go test where a package ran tests is not counted as 0", () => {
  assert.equal(testsRun("?   \tshop/coupon\t[no test files]\nok  \tshop/cart\t0.004s"), null);
  assert.equal(testsRun("ok  \tshop/cart\t(cached)"), null);
  assert.equal(testsRun("--- FAIL: TestTotal (0.00s)\nFAIL\nFAIL\tshop/cart\t0.003s"), null);
});

test("output without a test summary is unknown", () => {
  for (const output of ["vite v5 building for production...\n✓ built in 1.2s", "", undefined, "Found 0 errors."]) {
    assert.equal(testsRun(output), null, String(output));
  }
});
