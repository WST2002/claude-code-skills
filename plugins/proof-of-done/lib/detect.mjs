import fs from "node:fs";
import path from "node:path";

const SCRIPT_ORDER = ["typecheck", "lint", "test", "build"];
const NPM_PLACEHOLDER_TEST = /no test specified/;

const exists = (dir, name) => fs.existsSync(path.join(dir, name));

function packageManager(dir) {
  if (exists(dir, "pnpm-lock.yaml")) return "pnpm";
  if (exists(dir, "yarn.lock")) return "yarn";
  if (exists(dir, "bun.lockb") || exists(dir, "bun.lock")) return "bun";
  return "npm";
}

function nodeCommands(dir) {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  } catch {
    return [];
  }
  const scripts = pkg.scripts ?? {};
  const pm = packageManager(dir);
  return SCRIPT_ORDER
    .filter((name) => typeof scripts[name] === "string" && !NPM_PLACEHOLDER_TEST.test(scripts[name]))
    .map((name) => `${pm} run ${name}`);
}

export function detectVerifyCommands(dir) {
  const commands = nodeCommands(dir);
  if (exists(dir, "pyproject.toml") || exists(dir, "pytest.ini")) commands.push("pytest");
  if (exists(dir, "go.mod")) commands.push("go build ./...", "go test ./...");
  if (exists(dir, "Cargo.toml")) commands.push("cargo test");
  if (exists(dir, "pom.xml")) commands.push("mvn test");
  if (exists(dir, "build.gradle") || exists(dir, "build.gradle.kts")) {
    commands.push(exists(dir, "gradlew") ? "./gradlew test" : "gradle test");
  }
  return commands;
}
