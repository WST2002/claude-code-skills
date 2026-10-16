import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { appendEntry, ledgerPath, pruneOldLedgers, readLedger } from "../lib/ledger.mjs";
import { tempDir } from "./helpers.mjs";

test("entries round-trip in order and the directory is created", (t) => {
  const file = ledgerPath(tempDir(t), "abc-123");
  appendEntry(file, { type: "edit", file: "a.ts" });
  appendEntry(file, { type: "verify", command: "npm test", exitCode: 0 });
  assert.deepEqual(readLedger(file).map((e) => e.type), ["edit", "verify"]);
});

test("missing ledger reads as empty", (t) => {
  assert.deepEqual(readLedger(ledgerPath(tempDir(t), "none")), []);
});

test("corrupt lines are skipped", (t) => {
  const file = ledgerPath(tempDir(t), "s");
  appendEntry(file, { type: "edit", file: "a.ts" });
  fs.appendFileSync(file, '{"type":"verify","comm\n');
  appendEntry(file, { type: "edit", file: "b.ts" });
  assert.deepEqual(readLedger(file).map((e) => e.file), ["a.ts", "b.ts"]);
});

test("session ids cannot escape the sessions folder", (t) => {
  const dataDir = tempDir(t);
  assert.equal(path.dirname(ledgerPath(dataDir, "../../evil")), path.join(dataDir, "sessions"));
});

test("ledgers older than 7 days are pruned", (t) => {
  const dataDir = tempDir(t);
  const oldFile = ledgerPath(dataDir, "old");
  const newFile = ledgerPath(dataDir, "new");
  appendEntry(oldFile, { type: "edit" });
  appendEntry(newFile, { type: "edit" });
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  fs.utimesSync(oldFile, eightDaysAgo, eightDaysAgo);
  pruneOldLedgers(dataDir);
  assert.equal(fs.existsSync(oldFile), false);
  assert.equal(fs.existsSync(newFile), true);
});
