import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { findUncovered, lineRanges, readCoverage } from "../lib/coverage.mjs";
import { tempDir, writeFiles } from "./helpers.mjs";

const hits = (coverage, root, file) => Object.fromEntries(coverage.lines(path.join(root, file)) ?? []);
const diffOf = (file, lines) => [`diff --git a/${file} b/${file}`, `--- a/${file}`, `+++ b/${file}`, `@@ -${lines[0]},0 +${lines[0]},${lines.length} @@`, ...lines.map(() => "+x")].join("\n");

test("lcov: line hits, with paths relative to the folder that holds coverage/", (t) => {
  const root = tempDir(t);
  writeFiles(root, { "coverage/lcov.info": "TN:\nSF:src/order.js\nDA:1,3\nDA:2,0\nDA:5,1\nend_of_record\nSF:" + path.join(root, "src/cart.js") + "\nDA:4,0\nend_of_record\n" });
  const coverage = readCoverage(root, [root], 0);
  assert.deepEqual(hits(coverage, root, "src/order.js"), { 1: 3, 2: 0, 5: 1 });
  assert.deepEqual(hits(coverage, root, "src/cart.js"), { 4: 0 });
  assert.deepEqual(coverage.reports.map((r) => path.relative(root, r)), [path.join("coverage", "lcov.info")]);
});

test("istanbul JSON: each line takes the count of the smallest statement on it", (t) => {
  const root = tempDir(t);
  const file = path.join(root, "src/order.js");
  writeFiles(root, {
    "coverage/coverage-final.json": {
      [file]: {
        statementMap: { 0: { start: { line: 1 }, end: { line: 6 } }, 1: { start: { line: 2 }, end: { line: 2 } }, 2: { start: { line: 4 }, end: { line: 5 } } },
        s: { 0: 1, 1: 1, 2: 0 },
      },
    },
  });
  assert.deepEqual(hits(readCoverage(root, [root], 0), root, "src/order.js"), { 1: 1, 2: 1, 3: 1, 4: 0, 5: 0, 6: 1 });
});

test("cobertura XML (pytest-cov, coverage.py): file names are relative to the source folder", (t) => {
  const root = tempDir(t);
  writeFiles(root, {
    "coverage.xml": `<?xml version="1.0" ?><coverage><sources><source>${root}</source></sources><packages><package><classes>
      <class filename="shop/order.py"><lines><line number="3" hits="2"/><line number="7" hits="0"/></lines></class>
    </classes></package></packages></coverage>`,
  });
  assert.deepEqual(hits(readCoverage(root, [root], 0), root, "shop/order.py"), { 3: 2, 7: 0 });
});

test("reports older than the last edit are not read", (t) => {
  const root = tempDir(t);
  writeFiles(root, { "coverage/lcov.info": "SF:src/a.js\nDA:1,0\nend_of_record\n" });
  const mtime = fs.statSync(path.join(root, "coverage/lcov.info")).mtimeMs;
  assert.equal(readCoverage(root, [root], mtime + 1000).reports.length, 0);
  assert.equal(readCoverage(root, [root], mtime - 1000).reports.length, 1);
});

test("a broken report is skipped, not fatal", (t) => {
  const root = tempDir(t);
  writeFiles(root, { "coverage/coverage-final.json": "{ not json", "coverage.xml": "<coverage" });
  assert.equal(readCoverage(root, [root], 0).lines(path.join(root, "src/a.js")), null);
});

test("changed code lines that a report lists with 0 hits are uncovered; others are not", (t) => {
  const root = tempDir(t);
  writeFiles(root, { "coverage/lcov.info": "SF:src/order.js\nDA:10,4\nDA:11,0\nDA:12,0\nDA:14,0\nend_of_record\nSF:src/other.js\nDA:1,0\nend_of_record\n" });
  const coverage = readCoverage(root, [root], 0);
  const diff = [diffOf("src/order.js", [10, 11, 12, 13, 14]), diffOf("src/fresh.js", [1, 2]), diffOf("test/order.test.js", [1])].join("\n");
  // Line 13 is not in the report (a comment or a blank line), and src/fresh.js is not in it at all: neither is flagged.
  assert.deepEqual(findUncovered({ diff, root, coverage }), [{ file: "src/order.js", lines: [11, 12, 14] }]);
});

test("only files the session edited and that are not ignored are checked", (t) => {
  const root = tempDir(t);
  writeFiles(root, { "coverage/lcov.info": "SF:src/a.js\nDA:1,0\nend_of_record\nSF:gen/b.js\nDA:1,0\nend_of_record\n" });
  const coverage = readCoverage(root, [root], 0);
  const diff = [diffOf("src/a.js", [1]), diffOf("gen/b.js", [1])].join("\n");
  assert.deepEqual(findUncovered({ diff, root, coverage, ignore: (f) => f.startsWith("gen/") }).map((u) => u.file), ["src/a.js"]);
  assert.deepEqual(findUncovered({ diff, root, coverage, edited: () => false }), []);
});

test("line lists are shortened to ranges", () => {
  assert.equal(lineRanges([3, 4, 5, 9, 11, 12]), "3–5, 9, 11–12");
  assert.equal(lineRanges([1, 3, 5, 7, 9, 11, 13, 15, 17, 19]), "1, 3, 5, 7, 9, 11, 13, 15 and 2 more");
});

test("a real lcov report from node's test runner is read", (t) => {
  const root = tempDir(t);
  writeFiles(root, {
    "src/price.js": "exports.total = (items, coupon) => {\n  const sum = items.reduce((s, i) => s + i, 0);\n  if (coupon === 'FLAT50') {\n    return Math.max(0, sum - 50);\n  }\n  return sum;\n};\n",
    "test/price.test.js": "const { test } = require('node:test');\nconst assert = require('node:assert');\nconst { total } = require('../src/price.js');\ntest('sum', () => assert.equal(total([1, 2]), 3));\n",
    "coverage/.keep": "",
  });
  const run = spawnSync(process.execPath, ["--test", "--experimental-test-coverage", "--test-reporter=lcov", "--test-reporter-destination=coverage/lcov.info", "test/price.test.js"], {
    cwd: root,
    encoding: "utf8",
    // Inside `node --test`, a child test run would report to the parent instead of writing its own lcov file.
    env: Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== "NODE_TEST_CONTEXT")),
  });
  assert.equal(run.status, 0, run.stderr);
  const coverage = readCoverage(root, [root], 0);
  const lines = hits(coverage, root, "src/price.js");
  assert.ok(lines[2] > 0, "line 2 ran");
  assert.equal(lines[4], 0, "the FLAT50 branch never ran");
  // Node marks the closing brace of the branch that never ran as not run too.
  assert.deepEqual(findUncovered({ diff: diffOf("src/price.js", [3, 4, 5]), root, coverage }), [{ file: "src/price.js", lines: [4, 5] }]);
});
