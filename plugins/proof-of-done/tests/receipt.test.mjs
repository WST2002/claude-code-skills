import { test } from "node:test";
import assert from "node:assert/strict";
import { formatReceipt } from "../lib/receipt.mjs";

test("empty session", () => {
  const text = formatReceipt([]);
  assert.match(text, /Files edited \(0\)/);
  assert.match(text, /would allow stopping/);
});

test("lists files once, runs with status, and the gate verdict with the project's commands", () => {
  const text = formatReceipt([
    { type: "edit", file: "/p/a.ts", at: "t1" },
    { type: "edit", file: "/p/a.ts", at: "t2" },
    { type: "verify", command: "npm test", exitCode: 1, masked: false, at: "t3" },
    { type: "verify", command: "npm run lint | tail", exitCode: 0, masked: true, at: "t4" },
  ], { verifyCommands: ["npm run test"] });
  assert.match(text, /Files edited \(1\)/);
  assert.match(text, /`npm test` ✗ exit 1/);
  assert.match(text, /`npm run lint \| tail` ⚠ masked/);
  assert.match(text, /would block/);
});

test("a run that ran 0 tests is shown as such", () => {
  const text = formatReceipt([
    { type: "edit", file: "/p/a.ts", at: "t1" },
    { type: "verify", command: "npm test", exitCode: 0, masked: false, testsRun: 0, at: "t2" },
  ]);
  assert.match(text, /`npm test` ⚠ 0 tests ran/);
  assert.match(text, /would block/);
});

test("unverified edits name the project's commands", () => {
  assert.match(formatReceipt([{ type: "edit", file: "/p/a.ts", at: "t1" }], { verifyCommands: ["npm run test"] }), /`npm run test`/);
});

test("disabled projects say so instead of a verdict", () => {
  assert.match(formatReceipt([{ type: "edit", file: "/p/a.ts", at: "t1" }], { enabled: false }), /disabled for this project/);
});

test("code changed with no test shows in the gate verdict", () => {
  const text = formatReceipt([
    { type: "edit", file: "/p/src/coupon.js", at: "t1" },
    { type: "verify", command: "npm test", exitCode: 0, masked: false, at: "t2" },
  ], { untested: [{ file: "src/coupon.js", lines: 12, created: true }] });
  assert.match(text, /would block — You changed src\/coupon\.js, but no test was added or changed/);
});
