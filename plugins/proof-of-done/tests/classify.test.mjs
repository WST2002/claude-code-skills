import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { isCodeFile, matchesGlob, parseExitCode } from "../lib/classify.mjs";

const cwd = path.resolve("/work/app");
const inApp = (rel) => path.join(cwd, rel);

test("source files are code", () => {
  assert.equal(isCodeFile(inApp("src/index.ts"), cwd), true);
  assert.equal(isCodeFile(inApp("Main.java"), cwd), true);
  assert.equal(isCodeFile("src/relative.ts", cwd), true);
});

test("docs, assets, logs and lockfiles are not code", () => {
  for (const rel of ["README.md", "docs/guide/setup.ts", "logo.png", "yarn.lock", "package-lock.json", "pnpm-lock.yaml", "build.log", "run.out"]) {
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

test("git bash style absolute paths count as inside the project on windows", { skip: process.platform !== "win32" }, () => {
  assert.equal(isCodeFile("/c/Users/me/app/src/a.ts", String.raw`C:\Users\me\app`), true);
});

test("glob matching", () => {
  assert.equal(matchesGlob("docs/a/b.ts", "docs/**"), true);
  assert.equal(matchesGlob("src/a.test.ts", "**/*.test.ts"), true);
  assert.equal(matchesGlob("a.test.ts", "**/*.test.ts"), true);
  assert.equal(matchesGlob("src/a.ts", "docs/**"), false);
  assert.equal(matchesGlob("deep/x.md", "*.md"), true);
});

test("exit codes are parsed from failure text", () => {
  assert.equal(parseExitCode("Exit code 1\nError: boom"), 1);
  assert.equal(parseExitCode("Exit code 127"), 127);
  assert.equal(parseExitCode("something else"), null);
  assert.equal(parseExitCode(undefined), null);
});
