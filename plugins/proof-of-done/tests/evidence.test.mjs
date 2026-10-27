import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { entriesFor } from "../lib/evidence.mjs";
import { SHELL_EDIT } from "../lib/shell.mjs";

const cwd = path.resolve("/work/app");
const config = { enabled: true, verify: null, ignore: [], error: null };
const payload = (overrides) => ({ cwd, session_id: "s", hook_event_name: "PostToolUse", ...overrides });
const shapes = (entries) => entries.map(({ at, cwd: _cwd, ...rest }) => rest);

test("edit of a code file records the file and the project", () => {
  const [entry] = entriesFor(payload({ tool_name: "Edit", tool_input: { file_path: path.join(cwd, "src/a.ts") } }), config, []);
  assert.equal(entry.type, "edit");
  assert.equal(entry.file, path.join(cwd, "src/a.ts"));
  assert.equal(entry.cwd, cwd);
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
    { type: "verify", command: "npm test", check: "npm test", args: "", exitCode: 0, masked: false },
  ]);
});

test("a run's output records how many tests ran", () => {
  const skipped = payload({ tool_name: "Bash", tool_input: { command: "npm test" }, tool_response: { stdout: "# tests 2\n# pass 0\n# fail 0\n# skipped 2", stderr: "" } });
  assert.equal(entriesFor(skipped, config, [])[0].testsRun, 0);
  const passed = payload({ tool_name: "PowerShell", tool_input: { command: "npx jest" }, tool_response: "Tests:       3 passed, 3 total" });
  assert.equal(entriesFor(passed, config, [])[0].testsRun, 3);
});

test("go test and jest --passWithNoTests that found nothing record 0 tests", () => {
  const go = payload({ tool_name: "Bash", tool_input: { command: "go test ./..." }, tool_response: { stdout: "?   \tshop/cart\t[no test files]\n", stderr: "" } });
  assert.equal(entriesFor(go, config, [])[0].testsRun, 0);
  const jest = payload({ tool_name: "Bash", tool_input: { command: "npx jest --passWithNoTests" }, tool_response: { stdout: "", stderr: "No tests found, exiting with code 0\n" } });
  assert.equal(entriesFor(jest, config, [])[0].testsRun, 0);
});

test("output without a test summary records no test count", () => {
  const [entry] = entriesFor(payload({ tool_name: "Bash", tool_input: { command: "npm run build" }, tool_response: { stdout: "built in 1s" } }), config, []);
  assert.equal("testsRun" in entry, false);
});

test("failed verification run takes the exit code from the error text", () => {
  const [entry] = entriesFor(payload({ hook_event_name: "PostToolUseFailure", tool_name: "PowerShell", tool_input: { command: "npm test" }, error: "Exit code 2\nboom" }), config, []);
  assert.equal(entry.exitCode, 2);
});

test("interrupted run has unknown exit code", () => {
  const [entry] = entriesFor(payload({ hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_input: { command: "npm test" }, error: "Exit code 1", is_interrupt: true }), config, []);
  assert.equal(entry.exitCode, null);
});

test("shell write to a code file then a masked test records both, in order", () => {
  const command = "printf 'x' > src/add.mjs && npm test 2>&1 | tail -15";
  assert.deepEqual(shapes(entriesFor(payload({ tool_name: "Bash", tool_input: { command } }), config, [])), [
    { type: "edit", file: "src/add.mjs" },
    { type: "verify", command, check: "npm test", args: "", exitCode: 0, masked: true },
  ]);
});

test("shell writes to docs, logs or folders are ignored", () => {
  for (const command of ["echo hi > notes.md", "npm test > out.log", "rm -rf node_modules"]) {
    assert.deepEqual(entriesFor(payload({ tool_name: "Bash", tool_input: { command } }), config, []).filter((e) => e.type === "edit"), [], command);
  }
});

test("unknown-target edits are recorded even when the command fails", () => {
  const [entry] = entriesFor(payload({ hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_input: { command: "git apply fix.patch" }, error: "Exit code 1" }), config, []);
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
