import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { tempDir, writeFiles } from "./helpers.mjs";

const scripts = path.resolve(import.meta.dirname, "../scripts");

function runHook(script, input, dataDir) {
  const result = spawnSync(process.execPath, [path.join(scripts, script)], {
    input: JSON.stringify(input),
    env: { ...process.env, CLAUDE_PLUGIN_DATA: dataDir },
    encoding: "utf8",
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

function setup(t) {
  const project = tempDir(t);
  const dataDir = tempDir(t);
  writeFiles(project, { "package.json": { scripts: { test: "node --test" } } });
  const base = { session_id: "sess-1", cwd: project };
  const record = (input) => runHook("record.mjs", { ...base, hook_event_name: "PostToolUse", ...input }, dataDir);
  const stop = (input = {}) => runHook("gate.mjs", { ...base, hook_event_name: "Stop", stop_hook_active: false, last_assistant_message: "Done.", ...input }, dataDir);
  return { project, record, stop };
}

const block = (result) => (result.stdout ? JSON.parse(result.stdout) : null);

test("nothing edited: stop allowed", (t) => {
  const { stop } = setup(t);
  const result = stop();
  assert.equal(result.code, 0);
  assert.equal(result.stdout, "");
});

test("edit then stop: blocked with the project's command", (t) => {
  const { project, record, stop } = setup(t);
  record({ tool_name: "Edit", tool_input: { file_path: path.join(project, "src/a.js") } });
  const verdict = block(stop());
  assert.equal(verdict.decision, "block");
  assert.match(verdict.reason, /`npm run test`/);
});

test("edit, failed test, stop: blocked with exit code", (t) => {
  const { project, record, stop } = setup(t);
  record({ tool_name: "Edit", tool_input: { file_path: path.join(project, "src/a.js") } });
  record({ hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_input: { command: "npm run test" }, error: "Exit code 1\nfail" });
  assert.match(block(stop()).reason, /exited with code 1/);
});

test("edit, passing test, stop: allowed", (t) => {
  const { project, record, stop } = setup(t);
  record({ tool_name: "Edit", tool_input: { file_path: path.join(project, "src/a.js") } });
  record({ tool_name: "Bash", tool_input: { command: "npm run test" } });
  assert.equal(stop().stdout, "");
});

test("code changed through a shell command, then stop: blocked", (t) => {
  const { record, stop } = setup(t);
  record({ tool_name: "Bash", tool_input: { command: "printf 'x' > src/add.mjs" } });
  assert.equal(block(stop()).decision, "block");
});

test("a commit message that mentions the test command is not verification", (t) => {
  const { project, record, stop } = setup(t);
  record({ tool_name: "Edit", tool_input: { file_path: path.join(project, "src/a.js") } });
  record({ tool_name: "Bash", tool_input: { command: 'git commit -m "fix npm test flake"' } });
  assert.equal(block(stop()).decision, "block");
});

test("the natural shorthand of a detected command supersedes a masked run", (t) => {
  const { project, record, stop } = setup(t);
  record({ tool_name: "Edit", tool_input: { file_path: path.join(project, "src/a.js") } });
  record({ tool_name: "Bash", tool_input: { command: "npm run test 2>&1 | tail" } });
  record({ tool_name: "Bash", tool_input: { command: "npm test" } });
  assert.equal(stop().stdout, "");
});

function realTestOutput(project, body) {
  writeFiles(project, { "a.test.mjs": `import { test } from "node:test";\n${body}\n` });
  const { NODE_TEST_CONTEXT: _, ...env } = process.env;
  return spawnSync(process.execPath, ["--test", "--test-reporter=tap", "a.test.mjs"], { cwd: project, env, encoding: "utf8" }).stdout;
}

test("edit, test run with every test skipped, stop: blocked", (t) => {
  const { project, record, stop } = setup(t);
  record({ tool_name: "Edit", tool_input: { file_path: path.join(project, "src/a.js") } });
  const stdout = realTestOutput(project, 'test("a", { skip: true }, () => {});');
  record({ tool_name: "Bash", tool_input: { command: "npm run test" }, tool_response: { stdout, stderr: "" } });
  assert.match(block(stop()).reason, /exited 0 but ran 0 tests/);
});

test("edit, test run with a real passing test, stop: allowed", (t) => {
  const { project, record, stop } = setup(t);
  record({ tool_name: "Edit", tool_input: { file_path: path.join(project, "src/a.js") } });
  const stdout = realTestOutput(project, 'test("a", () => {});');
  record({ tool_name: "Bash", tool_input: { command: "npm run test" }, tool_response: { stdout, stderr: "" } });
  assert.equal(stop().stdout, "");
});

test("edit, failed test, rerun passes with no edit, stop: flagged as flaky until the report says so", (t) => {
  const { project, record, stop } = setup(t);
  record({ tool_name: "Edit", tool_input: { file_path: path.join(project, "src/a.js") } });
  record({ hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_input: { command: "npm run test" }, error: "Exit code 1\nfail" });
  record({ tool_name: "Bash", tool_input: { command: "npm run test" } });
  assert.match(block(stop()).reason, /looks flaky/);
  assert.equal(stop({ last_assistant_message: "Done. npm run test is flaky: it failed once, then passed." }).stdout, "");
});

test("payloads without a session id are neither recorded nor gated", (t) => {
  const { project, record, stop } = setup(t);
  const result = record({ session_id: undefined, tool_name: "Edit", tool_input: { file_path: path.join(project, "src/a.js") } });
  assert.equal(result.code, 0);
  assert.equal(stop({ session_id: undefined }).stdout, "");
});

test("/proof shows the newest session of the current project, not another project's", (t) => {
  const dataDir = tempDir(t);
  const project = tempDir(t);
  const other = tempDir(t);
  writeFiles(project, { "package.json": { scripts: { test: "node --test" } } });
  runHook("record.mjs", { session_id: "mine", cwd: project, hook_event_name: "PostToolUse", tool_name: "Edit", tool_input: { file_path: path.join(project, "src/mine.js") } }, dataDir);
  runHook("record.mjs", { session_id: "theirs", cwd: other, hook_event_name: "PostToolUse", tool_name: "Edit", tool_input: { file_path: path.join(other, "src/theirs.js") } }, dataDir);
  const result = spawnSync(process.execPath, [path.join(scripts, "receipt.mjs")], { cwd: project, env: { ...process.env, CLAUDE_PLUGIN_DATA: dataDir }, encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /mine\.js/);
  assert.doesNotMatch(result.stdout, /theirs\.js/);
  assert.match(result.stdout, /`npm run test`/);
});

test("/proof with no evidence for this project says so", (t) => {
  const result = spawnSync(process.execPath, [path.join(scripts, "receipt.mjs")], { cwd: tempDir(t), env: { ...process.env, CLAUDE_PLUGIN_DATA: tempDir(t) }, encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /No evidence recorded yet for this project/);
});

test("second stop attempt is allowed", (t) => {
  const { project, record, stop } = setup(t);
  record({ tool_name: "Edit", tool_input: { file_path: path.join(project, "src/a.js") } });
  assert.equal(stop({ stop_hook_active: true }).stdout, "");
});

test("subagent stop uses the same gate", (t) => {
  const { project, record, stop } = setup(t);
  record({ tool_name: "Write", tool_input: { file_path: path.join(project, "src/b.js") } });
  assert.equal(block(stop({ hook_event_name: "SubagentStop" })).decision, "block");
});

test("disabled by config: never blocks", (t) => {
  const { project, record, stop } = setup(t);
  writeFiles(project, { ".claude/proof-of-done.json": { enabled: false } });
  record({ tool_name: "Edit", tool_input: { file_path: path.join(project, "src/a.js") } });
  assert.equal(stop().stdout, "");
});

test("invalid config: allows and explains on stderr", (t) => {
  const { project, stop } = setup(t);
  writeFiles(project, { ".claude/proof-of-done.json": "{ nope" });
  const result = stop();
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^proof-of-done: \.claude\/proof-of-done\.json is invalid JSON/);
});

test("garbage stdin: no crash, allows, warns", (t) => {
  const dataDir = tempDir(t);
  for (const script of ["record.mjs", "gate.mjs"]) {
    const result = spawnSync(process.execPath, [path.join(scripts, script)], { input: "not json", env: { ...process.env, CLAUDE_PLUGIN_DATA: dataDir }, encoding: "utf8" });
    assert.equal(result.status, 0, script);
    assert.equal(result.stdout, "", script);
    assert.match(result.stderr, /^proof-of-done: /, script);
  }
});
