import { test } from "node:test";
import assert from "node:assert/strict";
import { SHELL_EDIT, analyzeShell, splitCommand } from "../lib/shell.mjs";

const verifies = (command, projectCommands) =>
  analyzeShell(command, projectCommands).filter((e) => e.type === "verify").map(({ check, args, masked }) => ({ check, args, masked }));
const edits = (command) => analyzeShell(command).filter((e) => e.type === "edit").map((e) => e.target);

test("commands split on operators, ignoring operators inside quotes and stream merges", () => {
  assert.deepEqual(splitCommand(`cd app && npm test 2>&1 | tail -5; echo "a|b && c"`), [
    { text: "cd app", sep: "&&" },
    { text: "npm test 2>&1", sep: "|" },
    { text: "tail -5", sep: ";" },
    { text: 'echo ""', sep: "" },
  ]);
});

test("recognises common checks at the start of a segment", () => {
  for (const [command, check] of [
    ["npm test", "npm test"], ["npm run build", "npm build"], ["pnpm lint", "pnpm lint"], ["yarn typecheck", "yarn typecheck"],
    ["bun run check", "bun check"], ["CI=1 npm test", "npm test"], ["npx tsc --noEmit", "npx tsc"], ["npx vitest run", "npx vitest"],
    ["pytest -q", "pytest"], ["python -m pytest", "python -m pytest"], ["go test ./...", "go test"], ["cargo clippy", "cargo clippy"],
    ["mvn test", "mvn test"], ["./gradlew build", "gradlew build"], ["dotnet test", "dotnet test"], ["make check", "make check"],
  ]) {
    assert.equal(verifies(command)[0]?.check, check, command);
  }
});

test("mentioning a check is not running it", () => {
  for (const command of [`git commit -m "fix npm test flake"`, `echo "run npm test"`, `grep -r "cargo test" .`, "git status", "npm install", "npm run test:e2e"]) {
    assert.deepEqual(verifies(command), [], command);
  }
});

test("arguments are kept, redirections are not", () => {
  assert.deepEqual(verifies("npm test -- -t only-this"), [{ check: "npm test", args: "-- -t only-this", masked: false }]);
  assert.deepEqual(verifies("npm test 2>&1 > out.log"), [{ check: "npm test", args: "", masked: false }]);
});

test("project commands are canonicalised and matched exactly", () => {
  assert.equal(verifies("npm test", ["npm run test"])[0].check, "npm test");
  assert.equal(verifies("npm run check:all", ["npm run check:all"])[0].check, "npm run check:all");
  assert.deepEqual(verifies("npm run check:all-fast", ["npm run check:all"]), []);
});

test("masked: anything that can replace the check's exit code", () => {
  for (const command of [
    "npm test | tail -20", "npm test 2>&1 | Select-Object -Last 5", "npm test || true", "npm test || :", "npm test || exit 0",
    "npm test; true", "npm test; echo done", "npm test || echo failed", "npm test && echo ok; echo $?", "npm test & echo bg",
  ]) {
    assert.equal(verifies(command)[0].masked, true, command);
  }
});

test("not masked: the check's exit code reaches the shell", () => {
  for (const command of [
    "npm test", "cd app && npm test", "npm test && npm run build", "npm test || exit 1", "npm test && cat x | grep y",
    "set -o pipefail; npm test | tail -20", "set -euo pipefail; npm test | tail -20", "npm test -- -t 'a|b'",
  ]) {
    assert.equal(verifies(command)[0].masked, false, command);
  }
});

test("every check in a chain is reported", () => {
  assert.deepEqual(verifies("npm run lint && npm test").map((v) => v.check), ["npm lint", "npm test"]);
});

test("redirect targets are edits; quoted text and discarded output are not", () => {
  assert.deepEqual(edits("printf 'export const add = (a, b) => a + b;' > src/add.mjs"), ["src/add.mjs"]);
  assert.deepEqual(edits("echo hi >> notes.md"), ["notes.md"]);
  for (const command of [`node -e "console.log(1 > 0)"`, "npm test 2>&1 | tail", "npm test > /dev/null", "ls > $null", "dir > NUL"]) {
    assert.deepEqual(edits(command), [], command);
  }
});

test("file-changing commands report their file operands", () => {
  assert.deepEqual(edits("sed -i 's/a/b/' src/x.js"), ["src/x.js"]);
  assert.deepEqual(edits("cat a | tee out.ts"), ["out.ts"]);
  assert.deepEqual(edits("Set-Content -Path a.ts -Value x"), ["a.ts"]);
  assert.deepEqual(edits("mv a.ts b.ts"), ["a.ts", "b.ts"]);
  assert.deepEqual(edits("rm src/old.ts"), ["src/old.ts"]);
  assert.deepEqual(edits("git checkout -- src/a.ts"), ["src/a.ts"]);
  assert.deepEqual(edits("git restore src/a.ts"), ["src/a.ts"]);
  assert.deepEqual(edits("git apply fix.patch"), [SHELL_EDIT]);
});

test("branch switches and removing folders without extensions are not edits", () => {
  for (const command of ["git checkout -b feat", "git checkout main", "git switch dev", "rm -rf node_modules", "rm -rf dist"]) {
    assert.deepEqual(edits(command), [], command);
  }
});

test("in-place edits are found even when another segment redirects", () => {
  assert.deepEqual(edits("sed -i s/a/b/ src/a.js && echo ok > notes.md"), ["src/a.js", "notes.md"]);
});

test("events come out in command order", () => {
  assert.deepEqual(analyzeShell("npm test && printf x > src/a.js").map((e) => e.type), ["verify", "edit"]);
  assert.deepEqual(analyzeShell("printf x > src/a.js && npm test").map((e) => e.type), ["edit", "verify"]);
});
