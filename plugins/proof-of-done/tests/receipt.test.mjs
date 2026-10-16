import { test } from "node:test";
import assert from "node:assert/strict";
import { formatReceipt } from "../lib/receipt.mjs";

test("empty session", () => {
  const text = formatReceipt([]);
  assert.match(text, /Files edited \(0\)/);
  assert.match(text, /would allow stopping/);
});

test("lists files once, runs with status, and the gate verdict", () => {
  const text = formatReceipt([
    { type: "edit", file: "/p/a.ts", at: "t1" },
    { type: "edit", file: "/p/a.ts", at: "t2" },
    { type: "verify", command: "npm test", exitCode: 1, masked: false, at: "t3" },
    { type: "verify", command: "npm run lint | tail", exitCode: 0, masked: true, at: "t4" },
  ]);
  assert.match(text, /Files edited \(1\)/);
  assert.match(text, /`npm test` ✗ exit 1/);
  assert.match(text, /`npm run lint \| tail` ⚠ masked/);
  assert.match(text, /would block/);
});
