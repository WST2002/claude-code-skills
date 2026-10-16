import { test } from "node:test";
import assert from "node:assert/strict";
import { detectVerifyCommands } from "../lib/detect.mjs";
import { tempDir, writeFiles } from "./helpers.mjs";

test("node scripts in a fixed order using the lockfile's package manager", (t) => {
  const dir = tempDir(t);
  writeFiles(dir, {
    "package.json": { scripts: { build: "next build", test: "vitest", lint: "eslint", dev: "next dev" } },
    "pnpm-lock.yaml": "",
  });
  assert.deepEqual(detectVerifyCommands(dir), ["pnpm run lint", "pnpm run test", "pnpm run build"]);
});

test("npm's placeholder test script is skipped", (t) => {
  const dir = tempDir(t);
  writeFiles(dir, { "package.json": { scripts: { test: 'echo "Error: no test specified" && exit 1' } } });
  assert.deepEqual(detectVerifyCommands(dir), []);
});

test("other ecosystems", (t) => {
  const dir = tempDir(t);
  writeFiles(dir, { "go.mod": "", "Cargo.toml": "", "pom.xml": "", "pyproject.toml": "", "build.gradle.kts": "", gradlew: "" });
  assert.deepEqual(detectVerifyCommands(dir), ["pytest", "go build ./...", "go test ./...", "cargo test", "mvn test", "./gradlew test"]);
});

test("empty project and broken package.json give nothing", (t) => {
  const dir = tempDir(t);
  assert.deepEqual(detectVerifyCommands(dir), []);
  writeFiles(dir, { "package.json": "{ broken" });
  assert.deepEqual(detectVerifyCommands(dir), []);
});
