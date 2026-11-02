import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { findUncovered, lineRanges, readCoverage, uncoveredReason } from "../lib/coverage.mjs";
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

test("istanbul: a small statement that never ran is not hidden by a bigger one listed after it", (t) => {
  const root = tempDir(t);
  const file = path.join(root, "src/order.js");
  writeFiles(root, {
    "coverage/coverage-final.json": {
      [file]: { statementMap: { 0: { start: { line: 4 }, end: { line: 5 } }, 1: { start: { line: 1 }, end: { line: 6 } } }, s: { 0: 0, 1: 1 } },
    },
  });
  assert.deepEqual(hits(readCoverage(root, [root], 0), root, "src/order.js"), { 1: 1, 2: 1, 3: 1, 4: 0, 5: 0, 6: 1 });
});

test("when two reports list the same line, a run in either one counts", (t) => {
  const root = tempDir(t);
  writeFiles(root, {
    "coverage/lcov.info": "SF:src/a.js\nDA:1,0\nDA:2,3\nend_of_record\n",
    "coverage/coverage-final.json": { [path.join(root, "src/a.js")]: { statementMap: { 0: { start: { line: 1 }, end: { line: 1 } }, 1: { start: { line: 2 }, end: { line: 2 } } }, s: { 0: 2, 1: 0 } } },
  });
  assert.deepEqual(hits(readCoverage(root, [root], 0), root, "src/a.js"), { 1: 2, 2: 3 });
});

test("cobertura file names are read from the report's source folder, not the report's folder", (t) => {
  const root = tempDir(t);
  writeFiles(root, { "reports/coverage.xml": `<coverage><sources><source>${path.join(root, "app")}</source></sources><packages><package><classes><class filename="order.py"><lines><line number="2" hits="0"/></lines></class></classes></package></packages></coverage>` });
  assert.deepEqual(hits(readCoverage(root, [path.join(root, "reports")], 0), root, "app/order.py"), { 2: 0 });
});

test("report paths match edited files whatever their case on Windows", { skip: process.platform !== "win32" }, (t) => {
  const root = tempDir(t);
  writeFiles(root, { "coverage/lcov.info": "SF:SRC/Order.JS\nDA:3,0\nend_of_record\n" });
  assert.deepEqual(findUncovered({ diff: diffOf("src/order.js", [3]), root, coverage: readCoverage(root, [root], 0) }), [{ file: "src/order.js", lines: [3] }]);
});

test("test files and non-code files are never reported, even when a report lists them", (t) => {
  const root = tempDir(t);
  writeFiles(root, { "coverage/lcov.info": "SF:test/order.test.js\nDA:1,0\nend_of_record\nSF:config/app.json\nDA:1,0\nend_of_record\n" });
  const diff = [diffOf("test/order.test.js", [1]), diffOf("config/app.json", [1])].join("\n");
  assert.deepEqual(findUncovered({ diff, root, coverage: readCoverage(root, [root], 0) }), []);
});

test("cobertura: every <source> is tried, relative ones from the report's folder, in any attribute order", (t) => {
  const root = tempDir(t);
  writeFiles(root, {
    "lib/util.py": "x\n",
    "coverage.xml": `<coverage><sources><source>${path.join(root, "src")}</source><source>${path.join(root, "lib")}</source></sources><packages><package><classes>
      <class filename="util.py"><lines><line hits="0" number="2"/></lines></class></classes></package></packages></coverage>`,
    "pkg/coverage.xml": `<coverage><sources><source>.</source></sources><packages><package><classes>
      <class name="mod" filename="mod.py"><lines><line number="2" hits="0"/></lines></class></classes></package></packages></coverage>`,
  });
  assert.deepEqual(hits(readCoverage(root, [root], 0), root, "lib/util.py"), { 2: 0 });
  assert.equal(readCoverage(root, [root], 0).lines(path.join(root, "src/util.py")), null);
  assert.deepEqual(hits(readCoverage(root, [path.join(root, "pkg")], 0), root, "pkg/mod.py"), { 2: 0 });
});

test("cobertura: a self-closing class has no lines of its own", (t) => {
  const root = tempDir(t);
  writeFiles(root, { "coverage.xml": `<coverage><sources><source>${root}</source></sources><packages><package><classes><class filename="src/empty.js" line-rate="1"/><class filename="src/b.js"><lines><line number="2" hits="0"/></lines></class></classes></package></packages></coverage>` });
  const coverage = readCoverage(root, [root], 0);
  assert.equal(coverage.lines(path.join(root, "src/empty.js")), null);
  assert.deepEqual(hits(coverage, root, "src/b.js"), { 2: 0 });
});

test("istanbul: a statement with no count is not listed", (t) => {
  const root = tempDir(t);
  writeFiles(root, { "coverage/coverage-final.json": { [path.join(root, "src/c.js")]: { statementMap: { 0: { start: { line: 1 }, end: { line: 1 } }, 1: { start: { line: 2 }, end: { line: 2 } } }, s: { 0: 1 } } } });
  assert.deepEqual(hits(readCoverage(root, [root], 0), root, "src/c.js"), { 1: 1 });
});

test("lcov paths: Git Bash /c/..., file:// URLs and links to the same folder all match", (t) => {
  const root = tempDir(t);
  const abs = path.join(root, "src/a.js");
  const gitBash = abs.replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`).split(path.sep).join("/");
  const link = path.join(path.dirname(root), `${path.basename(root)}-link`);
  fs.symlinkSync(root, link, "junction");
  t.after(() => fs.rmSync(link, { force: true }));
  writeFiles(root, { "src/a.js": "x\n" });
  for (const sf of [process.platform === "win32" ? gitBash : abs, `file://${abs.startsWith("/") ? "" : "/"}${abs.split(path.sep).join("/")}`, path.join(link, "src/a.js")]) {
    writeFiles(root, { "coverage/lcov.info": `SF:${sf}\nDA:3,0\nend_of_record\n` });
    assert.deepEqual(hits(readCoverage(root, [root], 0), root, "src/a.js"), { 3: 0 }, sf);
  }
});

test("a file changed after the report was written is not judged by it", (t) => {
  const root = tempDir(t);
  writeFiles(root, { "src/a.js": "x\n", "coverage/lcov.info": "SF:src/a.js\nDA:1,0\nend_of_record\n" });
  const report = fs.statSync(path.join(root, "coverage/lcov.info")).mtimeMs;
  fs.utimesSync(path.join(root, "src/a.js"), new Date(report + 5000), new Date(report + 5000));
  assert.deepEqual(findUncovered({ diff: diffOf("src/a.js", [1]), root, coverage: readCoverage(root, [root], 0) }), []);
});

test("a renamed file is judged only on lines that are new, not on the code it brought along", (t) => {
  const root = tempDir(t);
  writeFiles(root, { "coverage/lcov.info": "SF:src/new.js\nDA:1,1\nDA:2,0\nDA:3,0\nend_of_record\n" });
  const diff = [
    "diff --git a/src/old.js b/src/old.js", "deleted file mode 100644", "--- a/src/old.js", "+++ /dev/null", "@@ -1,2 +0,0 @@", "-const a = 1;", "-legacy();",
    "diff --git a/src/new.js b/src/new.js", "new file mode 100644", "--- /dev/null", "+++ b/src/new.js", "@@ -0,0 +1,3 @@", "+const a = 1;", "+legacy();", "+added();",
  ].join("\n");
  assert.deepEqual(findUncovered({ diff, root, coverage: readCoverage(root, [root], 0) }), [{ file: "src/new.js", lines: [3] }]);
});

test("the message says the lines did not run in the latest coverage run, and how to fix a partial run", (t) => {
  const root = tempDir(t);
  const reason = uncoveredReason([{ file: "src/a.js", lines: [5] }], [path.join(root, "coverage/lcov.info")], root, "ask");
  assert.match(reason, /latest coverage run/);
  assert.match(reason, /only part of the tests/);
  assert.doesNotMatch(reason, /never ran in any test/);
});

test("reading a large report stays fast", (t) => {
  const root = tempDir(t);
  const body = Array.from({ length: 3000 }, (_, f) => `SF:src/f${f}.js\n${Array.from({ length: 300 }, (_, l) => `DA:${l + 1},1`).join("\n")}\nend_of_record`).join("\n");
  writeFiles(root, { "coverage/lcov.info": body });
  const started = performance.now();
  readCoverage(root, [root], 0);
  assert.ok(performance.now() - started < 4000, `took ${Math.round(performance.now() - started)} ms`);
});
