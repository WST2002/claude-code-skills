import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { SHELL_EDIT } from "../lib/classify.mjs";
import { entriesFor } from "../lib/evidence.mjs";

const cwd = path.resolve("/work/app");
const config = { enabled: true, verify: null, ignore: [], error: null };
const payload = (overrides) => ({ cwd, session_id: "s", hook_event_name: "PostToolUse", ...overrides });
const shapes = (entries) => entries.map(({ at, ...rest }) => rest);

test("edit of a code file", () => {
  const [entry] = entriesFor(payload({ tool_name: "Edit", tool_input: { file_path: path.join(cwd, "src/a.ts") } }), config, []);
  assert.equal(entry.type, "edit");
  assert.equal(entry.file, path.join(cwd, "src/a.ts"));
});

test("notebook edits use notebook_path", () => {
  const [entry] = entriesFor(payload({ tool_name: "NotebookEdit", tool_input: { notebook_path: path.join(cwd, "a.ipynb") } }), config, []);
  assert.equal(entry.type, "edit");
});

test("edit of a doc is ignored", () => {
  assert.deepEqual(entriesFor(payload({ tool_name: "Write", tool_input: { file_path: path.join(cwd, "README.md") } }), config, []), []);
});

test("successful verification run", () => {
  assert.deepEqual(shapes(entriesFor(payload({ tool_name: "Bash", tool_input: { command: "npm test" } }), config, [])), [
    { type: "verify", command: "npm test", key: "npm test", exitCode: 0, masked: false },
  ]);
});

test("failed verification run takes the exit code from the error text", () => {
  const [entry] = entriesFor(payload({ hook_event_name: "PostToolUseFailure", tool_name: "PowerShell", tool_input: { command: "npm test" }, error: "Exit code 2\nboom" }), config, []);
  assert.equal(entry.exitCode, 2);
});

test("interrupted run has unknown exit code", () => {
  const [entry] = entriesFor(payload({ hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_input: { command: "npm test" }, error: "Exit code 1", is_interrupt: true }), config, []);
  assert.equal(entry.exitCode, null);
});

test("masked run is flagged", () => {
  assert.equal(entriesFor(payload({ tool_name: "Bash", tool_input: { command: "npm test | tail" } }), config, [])[0].masked, true);
});

test("shell write to a code file then a test in one command records both, in order", () => {
  const command = "printf 'x' > src/add.mjs && npm test 2>&1 | tail -15";
  assert.deepEqual(shapes(entriesFor(payload({ tool_name: "Bash", tool_input: { command } }), config, [])), [
    { type: "edit", file: "src/add.mjs" },
    { type: "verify", command, key: "npm test", exitCode: 0, masked: true },
  ]);
});

test("shell write to a doc is ignored", () => {
  assert.deepEqual(entriesFor(payload({ tool_name: "Bash", tool_input: { command: "echo hi > notes.md" } }), config, []), []);
});

test("in-place edits without a parseable target are recorded as a shell edit, even when the command fails", () => {
  const [entry] = entriesFor(payload({ hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_input: { command: "sed -i s/a/b/ src/a.js" }, error: "Exit code 1" }), config, []);
  assert.deepEqual({ type: entry.type, file: entry.file }, { type: "edit", file: SHELL_EDIT });
});

test("unexpected payloads produce no entries", () => {
  for (const input of [
    payload({ tool_name: "Edit" }),
    payload({ tool_name: "Bash", tool_input: {} }),
    payload({ tool_name: "Bash", tool_input: { command: "git status" } }),
    payload({ tool_name: "Read", tool_input: { file_path: path.join(cwd, "a.ts") } }),
    payload({ hook_event_name: "PostToolUseFailure", tool_name: "Edit", tool_input: { file_path: path.join(cwd, "a.ts") } }),
  ]) {
    assert.deepEqual(entriesFor(input, config, []), []);
  }
});
