import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { entryFor } from "../lib/evidence.mjs";

const cwd = path.resolve("/work/app");
const config = { enabled: true, verify: null, ignore: [], error: null };
const payload = (overrides) => ({ cwd, session_id: "s", hook_event_name: "PostToolUse", ...overrides });

test("edit of a code file", () => {
  const entry = entryFor(payload({ tool_name: "Edit", tool_input: { file_path: path.join(cwd, "src/a.ts") } }), config, []);
  assert.equal(entry.type, "edit");
  assert.equal(entry.file, path.join(cwd, "src/a.ts"));
});

test("notebook edits use notebook_path", () => {
  const entry = entryFor(payload({ tool_name: "NotebookEdit", tool_input: { notebook_path: path.join(cwd, "a.ipynb") } }), config, []);
  assert.equal(entry.type, "edit");
});

test("edit of a doc is ignored", () => {
  assert.equal(entryFor(payload({ tool_name: "Write", tool_input: { file_path: path.join(cwd, "README.md") } }), config, []), null);
});

test("successful verification run", () => {
  const entry = entryFor(payload({ tool_name: "Bash", tool_input: { command: "npm test" } }), config, []);
  assert.deepEqual({ ...entry, at: undefined }, { type: "verify", command: "npm test", exitCode: 0, masked: false, at: undefined });
});

test("failed verification run takes the exit code from the error text", () => {
  const entry = entryFor(payload({ hook_event_name: "PostToolUseFailure", tool_name: "PowerShell", tool_input: { command: "npm test" }, error: "Exit code 2\nboom" }), config, []);
  assert.equal(entry.exitCode, 2);
});

test("interrupted run has unknown exit code", () => {
  const entry = entryFor(payload({ hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_input: { command: "npm test" }, error: "Exit code 1", is_interrupt: true }), config, []);
  assert.equal(entry.exitCode, null);
});

test("masked run is flagged", () => {
  assert.equal(entryFor(payload({ tool_name: "Bash", tool_input: { command: "npm test | tail" } }), config, []).masked, true);
});

test("unexpected payloads produce no entry", () => {
  for (const input of [
    payload({ tool_name: "Edit" }),
    payload({ tool_name: "Bash", tool_input: {} }),
    payload({ tool_name: "Bash", tool_input: { command: "git status" } }),
    payload({ tool_name: "Read", tool_input: { file_path: path.join(cwd, "a.ts") } }),
    payload({ hook_event_name: "PostToolUseFailure", tool_name: "Edit", tool_input: { file_path: path.join(cwd, "a.ts") } }),
  ]) {
    assert.equal(entryFor(input, config, []), null);
  }
});
