import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { findUntested, untestedReason } from "../lib/untested.mjs";
import { tempDir, writeFiles } from "./helpers.mjs";

const git = (dir, ...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" }).stdout;

// Commits `before`, writes `after`, and returns the real `git diff -U0` between them, new files included.
function diffOf(t, before, after) {
  const dir = tempDir(t);
  git(dir, "init", "-q");
  writeFiles(dir, before);
  git(dir, "add", "-A");
  git(dir, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", "start");
  writeFiles(dir, after);
  git(dir, "add", "-N", ".");
  return git(dir, "diff", "--no-color", "-U0", "HEAD");
}

const lines = (n, word = "line") => Array.from({ length: n }, (_, i) => `export const ${word}${i} = ${i};`).join("\n") + "\n";
const files = (untested) => untested.map((f) => f.file);
const start = { "src/cart.js": lines(3), "src/cart.test.js": 'test("cart", () => {\n  expect(1).toBe(1);\n});\n' };

test("a new code file with no test is reported", (t) => {
  const diff = diffOf(t, start, { "src/coupon.js": lines(8) });
  assert.deepEqual(findUntested(diff), [{ file: "src/coupon.js", lines: 8, created: true }]);
});

test("a big change to existing code with no test is reported", (t) => {
  const diff = diffOf(t, start, { "src/cart.js": lines(25, "total") });
  assert.deepEqual(files(findUntested(diff)), ["src/cart.js"]);
});

test("a small change to existing code is left alone", (t) => {
  const diff = diffOf(t, start, { "src/cart.js": lines(3).replace("= 2;", "= 20;") });
  assert.deepEqual(findUntested(diff), []);
});

test("a tiny new file is left alone", (t) => {
  const diff = diffOf(t, start, { "src/index.js": 'export * from "./cart.js";\n' });
  assert.deepEqual(findUntested(diff), []);
});

test("nothing is reported when a test was added or changed too", (t) => {
  const changed = diffOf(t, start, { "src/coupon.js": lines(8), "src/cart.test.js": `${start["src/cart.test.js"]}test("coupon", () => {\n  expect(2).toBe(2);\n});\n` });
  assert.deepEqual(findUntested(changed), []);
  const added = diffOf(t, start, { "src/coupon.js": lines(8), "tests/test_coupon.py": "def test_coupon():\n    assert 1 == 1\n" });
  assert.deepEqual(findUntested(added), []);
});

test("styles, markup, config, docs and scripts need no test", (t) => {
  const diff = diffOf(t, start, {
    "src/cart.css": lines(30),
    "public/index.html": lines(30),
    "vite.config.ts": lines(30),
    ".eslintrc.cjs": lines(30),
    "tsconfig.json": "{}\n".repeat(30),
    "docs/guide.js": lines(30),
    "scripts/release.mjs": lines(30),
    "src/types.d.ts": lines(30),
  });
  assert.deepEqual(findUntested(diff), []);
});

test("ignored files and files the session did not edit are left out", (t) => {
  const diff = diffOf(t, start, { "src/coupon.js": lines(8), "generated/api.js": lines(30) });
  assert.deepEqual(files(findUntested(diff, (file) => file.startsWith("generated/"))), ["src/coupon.js"]);
  assert.deepEqual(findUntested(diff, () => false, (file) => file === "generated/api.js").map((f) => f.file), ["generated/api.js"]);
  assert.deepEqual(findUntested(diff, () => false, () => false), []);
});

test("ask mode tells the agent to ask the user once; strict mode asks for tests", () => {
  const untested = ["a.js", "b.js", "c.js", "d.js", "e.js", "f.js"].map((file) => ({ file: `src/${file}`, lines: 10, created: true }));
  const ask = untestedReason(untested, "ask");
  assert.match(ask, /^You changed src\/a\.js, src\/b\.js, src\/c\.js, src\/d\.js, src\/e\.js and 1 more, but no test was added or changed/);
  assert.match(ask, /Ask the user once whether you should add a test/);
  assert.match(ask, /"No new tests:"/);
  const strict = untestedReason(untested.slice(0, 1), "strict");
  assert.match(strict, /^You changed src\/a\.js, but/);
  assert.match(strict, /Add or update tests that cover this change and run them/);
  assert.doesNotMatch(strict, /Ask the user/);
});
