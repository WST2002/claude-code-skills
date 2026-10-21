import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { findTampering, isTestFile, tamperReason } from "../lib/tamper.mjs";
import { tempDir, writeFiles } from "./helpers.mjs";

const git = (dir, ...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" }).stdout;

// Commits `before`, writes `after`, and returns the real `git diff -U0` between them.
function diffOf(t, before, after) {
  const dir = tempDir(t);
  git(dir, "init", "-q");
  writeFiles(dir, before);
  git(dir, "add", "-A");
  git(dir, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", "start");
  for (const [name, content] of Object.entries(after)) {
    if (content === null) fs.rmSync(path.join(dir, name));
    else writeFiles(dir, { [name]: content });
  }
  return git(dir, "diff", "--no-color", "-U0", "HEAD");
}

const kinds = (findings) => findings.map((f) => `${f.kind}@${f.file}${f.line ? `:${f.line}` : ""}`);

test("recognises test files across languages", () => {
  for (const file of ["src/cart.test.ts", "src/cart.spec.jsx", "tests/test_cart.py", "cart_test.go", "test/unit/a.js", "src/__tests__/a.js", "src/CartTest.java"]) {
    assert.ok(isTestFile(file), file);
  }
  for (const file of ["src/cart.ts", "src/testing-utils.ts", "README.md"]) assert.ok(!isTestFile(file), file);
});

test("a newly skipped or focused test is caught with its line", (t) => {
  const before = 'test("adds", () => {\n  expect(add(1, 2)).toBe(3);\n});\n';
  const diff = diffOf(t, { "src/add.test.js": before }, { "src/add.test.js": before.replace('test("adds"', 'test.skip("adds"') });
  assert.deepEqual(kinds(findTampering(diff)), ["skipped@src/add.test.js:1"]);
});

test("pytest skips and an assertion that cannot fail are caught", (t) => {
  const before = "def test_total():\n    assert total([1, 2]) == 3\n";
  const after = "import pytest\n\n@pytest.mark.skip(reason='later')\ndef test_total():\n    assert True\n";
  assert.deepEqual(kinds(findTampering(diffOf(t, { "tests/test_cart.py": before }, { "tests/test_cart.py": after }))), [
    "skipped@tests/test_cart.py:3",
    "always-passes@tests/test_cart.py:5",
  ]);
});

test("an exact assertion swapped for a weak one is caught", (t) => {
  const before = 'it("totals", () => {\n  expect(total(cart)).toBe(250);\n});\n';
  const diff = diffOf(t, { "src/cart.test.ts": before }, { "src/cart.test.ts": before.replace("toBe(250)", "toBeDefined()") });
  assert.deepEqual(kinds(findTampering(diff)), ["weakened@src/cart.test.ts:2"]);
});

test("a new weak assertion next to the old one is not weakening", (t) => {
  const before = 'it("totals", () => {\n  expect(total(cart)).toBe(250);\n});\n';
  const after = 'it("totals", () => {\n  expect(total(cart)).toBe(250);\n  expect(cart.id).toBeDefined();\n});\n';
  assert.deepEqual(findTampering(diffOf(t, { "src/cart.test.ts": before }, { "src/cart.test.ts": after })), []);
});

test("removed tests and deleted test files are counted", (t) => {
  const before = 'test("a", () => {});\ntest("b", () => {});\ntest("c", () => {});\n';
  const diff = diffOf(t, { "src/a.test.js": before, "src/old.test.js": 'test("x", () => {});\n' }, { "src/a.test.js": 'test("a", () => {});\n', "src/old.test.js": null });
  const findings = findTampering(diff);
  assert.deepEqual(kinds(findings), ["removed-tests@src/a.test.js", "deleted-file@src/old.test.js"]);
  assert.match(tamperReason(findings), /src\/a\.test\.js removes 2 tests/);
});

test("suppressing errors in any code file is caught, docs are not", (t) => {
  const diff = diffOf(t, { "src/a.ts": "const x: number = f();\n", "README.md": "# a\n" }, {
    "src/a.ts": "// @ts-ignore\nconst x: number = f();\n",
    "README.md": "# a\nUse // @ts-ignore sparingly.\n",
  });
  assert.deepEqual(kinds(findTampering(diff)), ["suppressed@src/a.ts:1"]);
});

test("a lowered coverage threshold is caught, a raised one is not", (t) => {
  const before = "export default { test: { coverage: { thresholds: { lines: 90, branches: 80 } } } };\n";
  const lower = diffOf(t, { "vitest.config.ts": before }, { "vitest.config.ts": before.replace("lines: 90", "lines: 60") });
  assert.deepEqual(kinds(findTampering(lower)), ["threshold@vitest.config.ts:1"]);
  const raise = diffOf(t, { "vitest.config.ts": before }, { "vitest.config.ts": before.replace("lines: 90", "lines: 95") });
  assert.deepEqual(findTampering(raise), []);
});

test("ordinary code and test changes raise nothing", (t) => {
  const before = 'test("adds", () => {\n  expect(add(1, 2)).toBe(3);\n});\n';
  const after = 'test("adds", () => {\n  expect(add(1, 2)).toBe(3);\n});\ntest("adds negatives", () => {\n  expect(add(-1, -2)).toBe(-3);\n});\n';
  const diff = diffOf(t, { "src/add.test.js": before, "src/add.js": "export const add = (a, b) => a + b;\n" }, {
    "src/add.test.js": after,
    "src/add.js": "export const add = (a, b) => Number(a) + Number(b);\n",
  });
  assert.deepEqual(findTampering(diff), []);
});

test("ignored files are left out", (t) => {
  const diff = diffOf(t, { "legacy/a.test.js": 'test("a", () => {});\n' }, { "legacy/a.test.js": 'test.skip("a", () => {});\n' });
  assert.deepEqual(findTampering(diff, (file) => file.startsWith("legacy/")), []);
});

test("the reason lists at most six findings and how to explain a real change", () => {
  const findings = Array.from({ length: 8 }, (_, i) => ({ file: `t${i}.test.js`, line: i + 1, kind: "skipped", text: "it.skip(" }));
  const reason = tamperReason(findings);
  assert.match(reason, /^These changes can make checks pass without fixing anything:/);
  assert.match(reason, /- t0\.test\.js:1 skips or focuses tests: `it\.skip\(`/);
  assert.match(reason, /- and 2 more/);
  assert.match(reason, /on a line starting "Test changes:"/);
});
