import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { SHELL_EDIT, isCodeFile, isMasked, isVerifyCommand, matchesGlob, parseExitCode, shellEditTargets, verifyKey } from "../lib/classify.mjs";

const cwd = path.resolve("/work/app");
const inApp = (rel) => path.join(cwd, rel);

test("source files are code", () => {
  assert.equal(isCodeFile(inApp("src/index.ts"), cwd), true);
  assert.equal(isCodeFile(inApp("Main.java"), cwd), true);
});

test("docs, assets and lockfiles are not code", () => {
  for (const rel of ["README.md", "docs/guide/setup.ts", "logo.png", "yarn.lock", "package-lock.json", "pnpm-lock.yaml"]) {
    assert.equal(isCodeFile(inApp(rel), cwd), false, rel);
  }
});

test("files outside the project are ignored", () => {
  assert.equal(isCodeFile(path.resolve("/home/me/.claude/settings.json"), cwd), false);
});

test("project ignore globs are honoured", () => {
  assert.equal(isCodeFile(inApp("generated/api.ts"), cwd, ["generated/**"]), false);
  assert.equal(isCodeFile(inApp("src/x.snap"), cwd, ["*.snap"]), false);
});

test("windows paths with different drive-letter case count as inside the project", { skip: process.platform !== "win32" }, () => {
  assert.equal(isCodeFile(String.raw`C:\Users\me\app\src\a.ts`, String.raw`c:\users\me\app`), true);
});

test("glob matching", () => {
  assert.equal(matchesGlob("docs/a/b.ts", "docs/**"), true);
  assert.equal(matchesGlob("src/a.test.ts", "**/*.test.ts"), true);
  assert.equal(matchesGlob("a.test.ts", "**/*.test.ts"), true);
  assert.equal(matchesGlob("src/a.ts", "docs/**"), false);
  assert.equal(matchesGlob("deep/x.md", "*.md"), true);
});

test("recognises common verification commands", () => {
  for (const command of [
    "npm test", "npm run build", "pnpm lint", "yarn typecheck", "bun run check",
    "cd app && npm run test -- --watch=false", "npx tsc --noEmit", "npx vitest run",
    "pytest -q", "go test ./...", "cargo clippy", "mvn test", "./gradlew build",
    "dotnet test", "make check",
  ]) {
    assert.equal(isVerifyCommand(command), true, command);
  }
});

test("ignores non-verification commands and bad input", () => {
  for (const command of ["git status", "npm install", "ls -la", "echo test", "", undefined, 42]) {
    assert.equal(isVerifyCommand(command), false, String(command));
  }
});

test("project commands count as verification", () => {
  assert.equal(isVerifyCommand("npm run check:all", ["npm run check:all"]), true);
});

test("masked runs are detected", () => {
  for (const command of ["npm test | tail -20", "npm test 2>&1 | Select-Object -Last 5", "npm test || true", "npm test || :", "npm test || exit 0", "npm test; true"]) {
    assert.equal(isMasked(command), true, command);
  }
});

test("plain and pipefail runs are not masked", () => {
  for (const command of ["npm test", "npm test && npm run build", "npm test || echo failed && exit 1", "set -o pipefail; npm test | tail -20"]) {
    assert.equal(isMasked(command), false, command);
  }
});

test("exit codes are parsed from failure text", () => {
  assert.equal(parseExitCode("Exit code 1\nError: boom"), 1);
  assert.equal(parseExitCode("Exit code 127"), 127);
  assert.equal(parseExitCode("something else"), null);
  assert.equal(parseExitCode(undefined), null);
});

test("redirect targets are returned as written files", () => {
  assert.deepEqual(shellEditTargets("printf 'export const add = (a, b) => a + b;' > src/add.mjs"), ["src/add.mjs"]);
  assert.deepEqual(shellEditTargets("echo hi >> notes.md"), ["notes.md"]);
});

test("other file-changing commands count as a shell edit", () => {
  for (const command of ["sed -i 's/a/b/' src/x.js", "cat a | tee out.ts", "Set-Content -Path a.ts -Value x", "git checkout -- src/a.ts", "git apply fix.patch", "mv a.ts b.ts", "rm src/old.ts"]) {
    assert.deepEqual(shellEditTargets(command), [SHELL_EDIT], command);
  }
});

test("reads, discarded output and stream merges are not edits", () => {
  for (const command of ["git status", "cat src/a.ts", "npm test", "npm test 2>&1 | tail", "npm test > /dev/null", "ls > $null", "dir > NUL"]) {
    assert.deepEqual(shellEditTargets(command), [], command);
  }
});

test("verify keys identify the check, not the surrounding command", () => {
  assert.equal(verifyKey("npm test"), "npm test");
  assert.equal(verifyKey("cd app && npm run test -- --watch=false"), "npm test");
  assert.equal(verifyKey("printf 'x' > a.js && npm test 2>&1 | tail -8"), "npm test");
  assert.equal(verifyKey("npx   tsc --noEmit"), "npx tsc");
  assert.equal(verifyKey("./gradlew build"), "gradlew build");
  assert.equal(verifyKey("npm run check:all", ["npm run check:all"]), "npm run check:all");
});
