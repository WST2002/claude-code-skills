import { test } from "node:test";
import assert from "node:assert/strict";
import { CONFIG_PATH, loadConfig } from "../lib/config.mjs";
import { tempDir, writeFiles } from "./helpers.mjs";

test("missing config gives defaults", (t) => {
  assert.deepEqual(loadConfig(tempDir(t)), { enabled: true, verify: null, ignore: [], tamper: true, error: null });
});

test("valid config is read", (t) => {
  const dir = tempDir(t);
  writeFiles(dir, { [CONFIG_PATH]: { enabled: false, verify: ["npm test"], ignore: ["gen/**"], tamper: false } });
  assert.deepEqual(loadConfig(dir), { enabled: false, verify: ["npm test"], ignore: ["gen/**"], tamper: false, error: null });
});

test("invalid JSON reports what failed and how to fix it", (t) => {
  const dir = tempDir(t);
  writeFiles(dir, { [CONFIG_PATH]: "{ nope" });
  const config = loadConfig(dir);
  assert.equal(config.enabled, true);
  assert.match(config.error, /proof-of-done\.json is invalid JSON: .+ Fix the file or delete it\./);
});

test("wrong value types fall back to defaults", (t) => {
  const dir = tempDir(t);
  writeFiles(dir, { [CONFIG_PATH]: { verify: "npm test", ignore: [1, "a/**"] } });
  assert.deepEqual(loadConfig(dir), { enabled: true, verify: null, ignore: ["a/**"], tamper: true, error: null });
});
