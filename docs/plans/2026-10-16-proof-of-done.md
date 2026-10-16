# Proof of Done Implementation Plan

**Goal:** Ship the `groundwork` marketplace repo with its first plugin, `proof-of-done`, which stops Claude Code from ending a turn after code edits unless verification ran and passed after the last edit.

**Architecture:** Two hook scripts share a small, pure `lib/`. `record.mjs` (PostToolUse + PostToolUseFailure) appends evidence to a per-session JSON Lines ledger. `gate.mjs` (Stop + SubagentStop) reads the ledger and returns `{"decision":"block","reason":...}` when evidence is missing, failed, or masked. All decisions live in pure functions so they are unit-tested without spawning Claude.

**Tech Stack:** Node.js ESM (`.mjs`), zero npm dependencies, `node:test` for tests, GitHub Actions for CI.

**Spec:** `docs/specs/2026-10-16-proof-of-done-design.md`

## Global Constraints

- Runtime: Node.js 18+ for hook scripts; tests and CI use Node 22.
- No npm dependencies in plugins.
- Hooks are invoked in exec form: `"command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/<file>.mjs"]`.
- Every component path stays inside its plugin folder (Claude Code rejects `..`).
- Any internal hook error → allow the stop and write one line to stderr prefixed `proof-of-done: `.
- Honest skip line: `Verification: skipped — <reason>` with a reason of at least 10 characters.
- Config file: `.groundwork/proof-of-done.json` with keys `enabled`, `verify`, `ignore`.
- Ledger: `${CLAUDE_PLUGIN_DATA}/sessions/<session_id>.jsonl`, pruned after 7 days.
- Commits: author `Wageesha Tripathi`, no co-author trailers, no tool attribution anywhere.
- Line endings: LF (enforced by `.gitattributes`).

## Review Focus

1. **Failure hidden by a pipe or `|| true`** (`npm test 2>&1 | tail -20`): a person expects this not to count as proof. Pinned by `isMasked` tests in Task 2 and a gate test in Task 4.
2. **Windows paths** (`C:\Users\x\proj\src\a.ts` with `cwd` `c:\users\x\proj`): a person expects the edit to count as a project code edit. Pinned in Task 2.
3. **Edits outside the project** (`~/.claude/settings.json`): a person expects them to be ignored. Pinned in Task 2.
4. **Corrupt or half-written ledger line**: a person expects the gate to keep working on the valid lines. Pinned in Task 3.
5. **Unexpected payload shape** (missing `tool_input`, `notebook_path` instead of `file_path`, unknown tool): a person expects no crash and no entry. Pinned in Task 5.

---

## File Map

| File | Responsibility |
|---|---|
| `.claude-plugin/marketplace.json` | Marketplace registry |
| `package.json` | Root test script only |
| `tests/repo.test.mjs` | Marketplace ↔ plugin manifest consistency |
| `plugins/proof-of-done/.claude-plugin/plugin.json` | Plugin manifest |
| `plugins/proof-of-done/lib/classify.mjs` | Code-file, verify-command, masking and exit-code rules |
| `plugins/proof-of-done/lib/config.mjs` | Load `.groundwork/proof-of-done.json` |
| `plugins/proof-of-done/lib/detect.mjs` | Detect project verify commands |
| `plugins/proof-of-done/lib/ledger.mjs` | Append/read/prune JSONL ledgers |
| `plugins/proof-of-done/lib/decide.mjs` | Gate decision (pure) |
| `plugins/proof-of-done/lib/evidence.mjs` | Map a hook payload to a ledger entry (pure) |
| `plugins/proof-of-done/lib/receipt.mjs` | Format the `/proof` receipt (pure) |
| `plugins/proof-of-done/lib/hook-io.mjs` | stdin, data dir, warnings |
| `plugins/proof-of-done/scripts/record.mjs` | PostToolUse/PostToolUseFailure entry |
| `plugins/proof-of-done/scripts/gate.mjs` | Stop/SubagentStop entry |
| `plugins/proof-of-done/scripts/receipt.mjs` | `/proof` entry |
| `plugins/proof-of-done/hooks/hooks.json` | Hook wiring |
| `plugins/proof-of-done/commands/proof.md` | `/proof` command |
| `plugins/proof-of-done/skills/proof-of-done/SKILL.md` | Finishing-work guidance |
| `skills/proof-of-done-lite/SKILL.md` | Copy-paste version, no hooks |

---

### Task 1: Repo scaffold and manifests

**Files:**
- Create: `package.json`, `.gitattributes`, `.gitignore`, `LICENSE`
- Create: `.claude-plugin/marketplace.json`
- Create: `plugins/proof-of-done/.claude-plugin/plugin.json`
- Test: `tests/repo.test.mjs`

**Interfaces:**
- Produces: `npm test` runs `tests/*.test.mjs` and `plugins/*/tests/*.test.mjs`.

- [ ] **Step 1: Write the failing test**

`tests/repo.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));

test("every marketplace entry points at a plugin with a matching manifest", () => {
  const marketplace = readJson(".claude-plugin/marketplace.json");
  assert.equal(marketplace.name, "groundwork");
  assert.ok(marketplace.plugins.length > 0);
  for (const entry of marketplace.plugins) {
    assert.match(entry.source, /^\.\/plugins\/[a-z0-9-]+$/);
    const manifest = readJson(path.join(entry.source, ".claude-plugin/plugin.json"));
    assert.equal(manifest.name, entry.name);
    assert.equal(manifest.version, entry.version);
    assert.ok(fs.existsSync(path.join(root, entry.source, "CHANGELOG.md")), `${entry.name} needs a CHANGELOG.md`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/`
Expected: FAIL with `ENOENT` for `.claude-plugin/marketplace.json`.

- [ ] **Step 3: Create the scaffold**

`package.json`:
```json
{
  "name": "groundwork",
  "private": true,
  "description": "Claude Code plugins and skills that make AI coding agents prove their work.",
  "scripts": {
    "test": "node --test \"tests/*.test.mjs\" \"plugins/*/tests/*.test.mjs\""
  },
  "engines": {
    "node": ">=18"
  }
}
```

`.gitattributes`:
```
* text=auto eol=lf
```

`.gitignore`:
```
node_modules/
.DS_Store
```

`LICENSE`: the standard MIT text with `Copyright (c) 2026 Wageesha Tripathi`.

`.claude-plugin/marketplace.json`:
```json
{
  "name": "groundwork",
  "owner": {
    "name": "Wageesha Tripathi",
    "url": "https://github.com/WST2002"
  },
  "description": "Plugins and skills that make AI coding agents prove their work.",
  "plugins": [
    {
      "name": "proof-of-done",
      "source": "./plugins/proof-of-done",
      "description": "Blocks the agent from finishing after code changes until tests, build or lint have passed.",
      "version": "0.1.0",
      "category": "quality",
      "tags": ["verification", "testing", "hooks"]
    }
  ]
}
```

`plugins/proof-of-done/.claude-plugin/plugin.json`:
```json
{
  "name": "proof-of-done",
  "version": "0.1.0",
  "description": "Blocks the agent from finishing after code changes until tests, build or lint have passed.",
  "author": {
    "name": "Wageesha Tripathi",
    "url": "https://github.com/WST2002"
  },
  "homepage": "https://github.com/WST2002/groundwork/tree/main/plugins/proof-of-done",
  "repository": "https://github.com/WST2002/groundwork",
  "license": "MIT",
  "keywords": ["verification", "testing", "hooks", "quality"]
}
```

`plugins/proof-of-done/CHANGELOG.md`:
```markdown
# Changelog

## 0.1.0

- First release: records verification evidence and blocks unverified stops.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Scaffold groundwork marketplace with proof-of-done manifest"
```

---

### Task 2: Classification rules

**Files:**
- Create: `plugins/proof-of-done/lib/classify.mjs`
- Test: `plugins/proof-of-done/tests/classify.test.mjs`

**Interfaces:**
- Produces:
  - `isCodeFile(filePath: string, cwd: string, ignore?: string[]): boolean`
  - `matchesGlob(relPath: string, glob: string): boolean`
  - `isVerifyCommand(command: unknown, projectCommands?: string[]): boolean`
  - `isMasked(command: string): boolean`
  - `parseExitCode(error: unknown): number | null`

- [ ] **Step 1: Write the failing tests**

`plugins/proof-of-done/tests/classify.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { isCodeFile, isMasked, isVerifyCommand, matchesGlob, parseExitCode } from "../lib/classify.mjs";

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
  assert.equal(isCodeFile("C:\\Users\\me\\app\\src\\a.ts", "c:\\users\\me\\app"), true);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test plugins/proof-of-done/tests/classify.test.mjs`
Expected: FAIL with `Cannot find module '../lib/classify.mjs'`.

- [ ] **Step 3: Implement**

`plugins/proof-of-done/lib/classify.mjs`:
```js
import path from "node:path";

const NON_CODE_EXTENSIONS = new Set([
  ".md", ".mdx", ".txt", ".rst",
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".pdf",
  ".lock", ".lockb",
]);
const NON_CODE_FILES = new Set(["package-lock.json", "pnpm-lock.yaml", "LICENSE"]);
const DEFAULT_IGNORE = ["docs/**"];

const VERIFY_PATTERNS = [
  /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(test|build|lint|typecheck|check)\b/,
  /\bnpx\s+(tsc|vitest|jest|eslint|playwright\s+test)\b/,
  /\bpytest\b/,
  /\bgo\s+(test|build)\b/,
  /\bcargo\s+(test|build|check|clippy)\b/,
  /\bmvnw?\s+(test|verify|package)\b/,
  /\bgradlew?\s+(test|build|check)\b/,
  /\bdotnet\s+(test|build)\b/,
  /\bmake\s+(test|check)\b/,
];

const SWALLOWED_EXIT = [
  /\|\|\s*(true|:|exit\s+0)(?=\s|$|;|&|\))/,
  /;\s*(true|exit\s+0)\s*$/,
];
const PIPE = /(^|[^|])\|(?!\|)/;
const PIPEFAIL = /set\s+-o\s+pipefail/;

function toProjectPath(filePath, cwd) {
  const rel = path.relative(cwd, path.resolve(cwd, filePath));
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join("/");
}

export function globToRegExp(glob) {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === "*" && glob[i + 1] === "*") {
      if (glob[i + 2] === "/") {
        source += "(?:.*/)?";
        i += 2;
      } else {
        source += ".*";
        i += 1;
      }
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

export function matchesGlob(relPath, glob) {
  const re = globToRegExp(glob);
  return re.test(relPath) || (!glob.includes("/") && re.test(path.posix.basename(relPath)));
}

export function isCodeFile(filePath, cwd, ignore = []) {
  const rel = toProjectPath(filePath, cwd);
  if (rel === null) return false;
  const base = path.posix.basename(rel);
  if (NON_CODE_FILES.has(base)) return false;
  if (NON_CODE_EXTENSIONS.has(path.posix.extname(base).toLowerCase())) return false;
  return ![...DEFAULT_IGNORE, ...ignore].some((glob) => matchesGlob(rel, glob));
}

export function isVerifyCommand(command, projectCommands = []) {
  if (typeof command !== "string" || !command.trim()) return false;
  return projectCommands.some((c) => command.includes(c)) || VERIFY_PATTERNS.some((re) => re.test(command));
}

export function isMasked(command) {
  if (SWALLOWED_EXIT.some((re) => re.test(command))) return true;
  return PIPE.test(command) && !PIPEFAIL.test(command);
}

export function parseExitCode(error) {
  const match = typeof error === "string" ? /^Exit code (-?\d+)/.exec(error) : null;
  return match ? Number(match[1]) : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test plugins/proof-of-done/tests/classify.test.mjs`
Expected: PASS (Windows-only test skipped on other OSes).

- [ ] **Step 5: Commit**

```bash
git add plugins/proof-of-done/lib/classify.mjs plugins/proof-of-done/tests/classify.test.mjs
git commit -m "Add code-file, verify-command and masking rules"
```

---

### Task 3: Config, command detection and ledger

**Files:**
- Create: `plugins/proof-of-done/lib/config.mjs`, `lib/detect.mjs`, `lib/ledger.mjs`
- Test: `plugins/proof-of-done/tests/config.test.mjs`, `tests/detect.test.mjs`, `tests/ledger.test.mjs`

**Interfaces:**
- Produces:
  - `CONFIG_PATH = ".groundwork/proof-of-done.json"`
  - `loadConfig(projectDir: string): { enabled: boolean, verify: string[] | null, ignore: string[], error: string | null }`
  - `detectVerifyCommands(projectDir: string): string[]`
  - `ledgerPath(dataDir: string, sessionId: string): string`
  - `appendEntry(file: string, entry: object): void`
  - `readLedger(file: string): object[]`
  - `pruneOldLedgers(dataDir: string, now?: number): void`
- Ledger entry shapes: `{ type: "edit", file, at }` and `{ type: "verify", command, exitCode: number | null, masked: boolean, at }`.

- [ ] **Step 1: Write the failing tests**

`plugins/proof-of-done/tests/helpers.mjs`:
```js
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pod-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

export function writeFiles(dir, files) {
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
  }
}
```

`plugins/proof-of-done/tests/config.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONFIG_PATH, loadConfig } from "../lib/config.mjs";
import { tempDir, writeFiles } from "./helpers.mjs";

test("missing config gives defaults", (t) => {
  assert.deepEqual(loadConfig(tempDir(t)), { enabled: true, verify: null, ignore: [], error: null });
});

test("valid config is read", (t) => {
  const dir = tempDir(t);
  writeFiles(dir, { [CONFIG_PATH]: { enabled: false, verify: ["npm test"], ignore: ["gen/**"] } });
  assert.deepEqual(loadConfig(dir), { enabled: false, verify: ["npm test"], ignore: ["gen/**"], error: null });
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
  assert.deepEqual(loadConfig(dir), { enabled: true, verify: null, ignore: ["a/**"], error: null });
});
```

`plugins/proof-of-done/tests/detect.test.mjs`:
```js
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
```

`plugins/proof-of-done/tests/ledger.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { appendEntry, ledgerPath, pruneOldLedgers, readLedger } from "../lib/ledger.mjs";
import { tempDir } from "./helpers.mjs";

test("entries round-trip in order and the directory is created", (t) => {
  const file = ledgerPath(tempDir(t), "abc-123");
  appendEntry(file, { type: "edit", file: "a.ts" });
  appendEntry(file, { type: "verify", command: "npm test", exitCode: 0 });
  assert.deepEqual(readLedger(file).map((e) => e.type), ["edit", "verify"]);
});

test("missing ledger reads as empty", (t) => {
  assert.deepEqual(readLedger(ledgerPath(tempDir(t), "none")), []);
});

test("corrupt lines are skipped", (t) => {
  const file = ledgerPath(tempDir(t), "s");
  appendEntry(file, { type: "edit", file: "a.ts" });
  fs.appendFileSync(file, '{"type":"verify","comm\n');
  appendEntry(file, { type: "edit", file: "b.ts" });
  assert.deepEqual(readLedger(file).map((e) => e.file), ["a.ts", "b.ts"]);
});

test("session ids cannot escape the sessions folder", (t) => {
  const dataDir = tempDir(t);
  assert.equal(path.dirname(ledgerPath(dataDir, "../../evil")), path.join(dataDir, "sessions"));
});

test("ledgers older than 7 days are pruned", (t) => {
  const dataDir = tempDir(t);
  const oldFile = ledgerPath(dataDir, "old");
  const newFile = ledgerPath(dataDir, "new");
  appendEntry(oldFile, { type: "edit" });
  appendEntry(newFile, { type: "edit" });
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  fs.utimesSync(oldFile, eightDaysAgo, eightDaysAgo);
  pruneOldLedgers(dataDir);
  assert.equal(fs.existsSync(oldFile), false);
  assert.equal(fs.existsSync(newFile), true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test plugins/proof-of-done/tests/`
Expected: FAIL with `Cannot find module` for `config.mjs`, `detect.mjs`, `ledger.mjs`.

- [ ] **Step 3: Implement**

`plugins/proof-of-done/lib/config.mjs`:
```js
import fs from "node:fs";
import path from "node:path";

export const CONFIG_PATH = ".groundwork/proof-of-done.json";

const strings = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === "string") : null);

export function loadConfig(projectDir) {
  const defaults = { enabled: true, verify: null, ignore: [], error: null };
  let raw;
  try {
    raw = fs.readFileSync(path.join(projectDir, CONFIG_PATH), "utf8");
  } catch {
    return defaults;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { ...defaults, error: `${CONFIG_PATH} is invalid JSON: ${error.message}. Fix the file or delete it.` };
  }
  return {
    enabled: parsed.enabled !== false,
    verify: strings(parsed.verify),
    ignore: strings(parsed.ignore) ?? [],
    error: null,
  };
}
```

`plugins/proof-of-done/lib/detect.mjs`:
```js
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
```

`plugins/proof-of-done/lib/ledger.mjs`:
```js
import fs from "node:fs";
import path from "node:path";

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const sessionsDir = (dataDir) => path.join(dataDir, "sessions");

export function ledgerPath(dataDir, sessionId) {
  const safeId = String(sessionId).replace(/[^A-Za-z0-9_-]/g, "_");
  return path.join(sessionsDir(dataDir), `${safeId}.jsonl`);
}

export function appendEntry(file, entry) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(entry)}\n`);
}

export function readLedger(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  return text.split("\n").flatMap((line) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

export function pruneOldLedgers(dataDir, now = Date.now()) {
  let names;
  try {
    names = fs.readdirSync(sessionsDir(dataDir));
  } catch {
    return;
  }
  for (const name of names) {
    const file = path.join(sessionsDir(dataDir), name);
    try {
      if (now - fs.statSync(file).mtimeMs > MAX_AGE_MS) fs.rmSync(file);
    } catch {
      continue;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test plugins/proof-of-done/tests/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/proof-of-done/lib plugins/proof-of-done/tests
git commit -m "Add config loading, command detection and session ledger"
```

---

### Task 4: Gate decision

**Files:**
- Create: `plugins/proof-of-done/lib/decide.mjs`
- Test: `plugins/proof-of-done/tests/decide.test.mjs`

**Interfaces:**
- Consumes: ledger entry shapes from Task 3.
- Produces: `decide({ entries, lastMessage?, stopHookActive?, verifyCommands? }): { allow: true } | { allow: false, reason: string }` and `isPassing(entry): boolean`.

- [ ] **Step 1: Write the failing tests**

`plugins/proof-of-done/tests/decide.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { decide } from "../lib/decide.mjs";

const edit = (file = "/p/src/a.ts") => ({ type: "edit", file });
const run = (command, exitCode = 0, masked = false) => ({ type: "verify", command, exitCode, masked });

test("no edits: allow", () => {
  assert.deepEqual(decide({ entries: [run("npm test", 1)] }), { allow: true });
});

test("second stop attempt is always allowed", () => {
  assert.deepEqual(decide({ entries: [edit()], stopHookActive: true }), { allow: true });
});

test("edit with no verification after it: block with files and commands", () => {
  const verdict = decide({ entries: [run("npm test"), edit("/p/src/a.ts"), edit("/p/src/b.ts")], verifyCommands: ["npm run lint", "npm test"] });
  assert.equal(verdict.allow, false);
  assert.match(verdict.reason, /2 code files \(a\.ts, b\.ts\)/);
  assert.match(verdict.reason, /`npm run lint`, `npm test`/);
  assert.match(verdict.reason, /Verification: skipped — <reason>/);
});

test("more than five files are summarised", () => {
  const entries = ["a", "b", "c", "d", "e", "f", "g"].map((n) => edit(`/p/${n}.ts`));
  assert.match(decide({ entries }).reason, /7 code files \(a\.ts, b\.ts, c\.ts, d\.ts, e\.ts and 2 more\)/);
});

test("no detected commands: generic instruction", () => {
  assert.match(decide({ entries: [edit()] }).reason, /the checks that prove this change works/);
});

test("passing run after the last edit: allow", () => {
  assert.deepEqual(decide({ entries: [edit(), run("npm test")] }), { allow: true });
});

test("failing run after the last edit: block with exit code", () => {
  const verdict = decide({ entries: [edit(), run("npm test", 1)] });
  assert.equal(verdict.allow, false);
  assert.match(verdict.reason, /`npm test` exited with code 1/);
});

test("a command that failed earlier but passed later is fine", () => {
  assert.deepEqual(decide({ entries: [edit(), run("npm test", 1), run("npm test")] }), { allow: true });
});

test("a different command passing does not hide a failure", () => {
  const verdict = decide({ entries: [edit(), run("npm test", 1), run("npm run lint")] });
  assert.equal(verdict.allow, false);
  assert.match(verdict.reason, /`npm test` exited with code 1/);
});

test("masked run does not count", () => {
  const verdict = decide({ entries: [edit(), run("npm test | tail", 0, true)] });
  assert.equal(verdict.allow, false);
  assert.match(verdict.reason, /exit code hidden/);
});

test("interrupted run does not count", () => {
  assert.match(decide({ entries: [edit(), run("npm test", null)] }).reason, /interrupted/);
});

test("verification before the last edit does not count", () => {
  assert.equal(decide({ entries: [edit(), run("npm test"), edit()] }).allow, false);
});

test("honest skip line allows the stop", () => {
  const lastMessage = "Changed the parser.\n\nVerification: skipped — no test runner in this repo";
  assert.deepEqual(decide({ entries: [edit()], lastMessage }), { allow: true });
});

test("skip line with a too-short reason does not count", () => {
  assert.equal(decide({ entries: [edit()], lastMessage: "Verification: skipped — n/a" }).allow, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test plugins/proof-of-done/tests/decide.test.mjs`
Expected: FAIL with `Cannot find module '../lib/decide.mjs'`.

- [ ] **Step 3: Implement**

`plugins/proof-of-done/lib/decide.mjs`:
```js
import path from "node:path";

const SKIP_LINE = /Verification:\s*skipped\s*[—–-]+\s*(.+)/i;
const MIN_SKIP_REASON = 10;
const MAX_FILES_LISTED = 5;
const SKIP_HINT = 'If verification is impossible, end your message with "Verification: skipped — <reason>".';

export const isPassing = (entry) => entry.exitCode === 0 && !entry.masked;

function fileList(entries) {
  const lastVerify = entries.findLastIndex((e) => e.type === "verify");
  const files = [...new Set(entries.slice(lastVerify + 1).filter((e) => e.type === "edit").map((e) => path.basename(e.file)))];
  const shown = files.slice(0, MAX_FILES_LISTED).join(", ");
  const extra = files.length > MAX_FILES_LISTED ? ` and ${files.length - MAX_FILES_LISTED} more` : "";
  return `${files.length} code file${files.length === 1 ? "" : "s"} (${shown}${extra})`;
}

function unverifiedReason(entries, verifyCommands) {
  const commands = verifyCommands.length
    ? verifyCommands.map((c) => `\`${c}\``).join(", ")
    : "the checks that prove this change works (build, tests, lint)";
  return `You changed ${fileList(entries)} but ran no verification after your last edit. Run: ${commands}. Then report the results. ${SKIP_HINT}`;
}

function failedReason(entry) {
  if (entry.exitCode !== 0 && entry.exitCode !== null) {
    return `\`${entry.command}\` exited with code ${entry.exitCode} after your last edit. Fix the failure, or report it honestly. ${SKIP_HINT}`;
  }
  if (entry.masked) {
    return `\`${entry.command}\` ran with its exit code hidden (a pipe or "|| true"), so it does not count as proof. Run it again without masking and report the result.`;
  }
  return `\`${entry.command}\` was interrupted, so its result is unknown. Run it again and report the result.`;
}

export function decide({ entries, lastMessage = "", stopHookActive = false, verifyCommands = [] }) {
  if (stopHookActive) return { allow: true };
  const lastEdit = entries.findLastIndex((e) => e.type === "edit");
  if (lastEdit === -1) return { allow: true };
  const skip = SKIP_LINE.exec(lastMessage ?? "");
  if (skip && skip[1].trim().length >= MIN_SKIP_REASON) return { allow: true };

  const runs = entries.slice(lastEdit + 1).filter((e) => e.type === "verify");
  if (runs.length === 0) return { allow: false, reason: unverifiedReason(entries, verifyCommands) };

  const latestByCommand = new Map(runs.map((e) => [e.command, e]));
  const failing = [...latestByCommand.values()].find((e) => !isPassing(e));
  return failing ? { allow: false, reason: failedReason(failing) } : { allow: true };
}
```

Note: `new Map(runs.map(...))` keeps the last value for duplicate keys, so each command maps to its latest run.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test plugins/proof-of-done/tests/decide.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/proof-of-done/lib/decide.mjs plugins/proof-of-done/tests/decide.test.mjs
git commit -m "Add stop gate decision logic"
```

---

### Task 5: Hook scripts and wiring

**Files:**
- Create: `plugins/proof-of-done/lib/evidence.mjs`, `lib/hook-io.mjs`
- Create: `plugins/proof-of-done/scripts/record.mjs`, `scripts/gate.mjs`
- Create: `plugins/proof-of-done/hooks/hooks.json`
- Test: `plugins/proof-of-done/tests/evidence.test.mjs`, `tests/hooks.test.mjs`

**Interfaces:**
- Consumes: everything from Tasks 2–4.
- Produces:
  - `entryFor(input: object, config: object, projectCommands: string[]): object | null`
  - `readHookInput(): object`, `pluginDataDir(): string`, `warn(message: string): void`

- [ ] **Step 1: Write the failing tests**

`plugins/proof-of-done/tests/evidence.test.mjs`:
```js
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
```

`plugins/proof-of-done/tests/hooks.test.mjs`:
```js
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
  writeFiles(project, { ".groundwork/proof-of-done.json": { enabled: false } });
  record({ tool_name: "Edit", tool_input: { file_path: path.join(project, "src/a.js") } });
  assert.equal(stop().stdout, "");
});

test("invalid config: allows and explains on stderr", (t) => {
  const { project, stop } = setup(t);
  writeFiles(project, { ".groundwork/proof-of-done.json": "{ nope" });
  const result = stop();
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^proof-of-done: \.groundwork\/proof-of-done\.json is invalid JSON/);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test plugins/proof-of-done/tests/evidence.test.mjs plugins/proof-of-done/tests/hooks.test.mjs`
Expected: FAIL (`Cannot find module '../lib/evidence.mjs'`; hook spawns exit non-zero).

- [ ] **Step 3: Implement**

`plugins/proof-of-done/lib/evidence.mjs`:
```js
import { isCodeFile, isMasked, isVerifyCommand, parseExitCode } from "./classify.mjs";

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const SHELL_TOOLS = new Set(["Bash", "PowerShell"]);

function exitCodeOf(input) {
  if (input.hook_event_name !== "PostToolUseFailure") return 0;
  return input.is_interrupt ? null : parseExitCode(input.error);
}

export function entryFor(input, config, projectCommands) {
  const toolInput = input.tool_input ?? {};
  const at = new Date().toISOString();
  if (EDIT_TOOLS.has(input.tool_name)) {
    if (input.hook_event_name !== "PostToolUse") return null;
    const file = toolInput.file_path ?? toolInput.notebook_path;
    return typeof file === "string" && isCodeFile(file, input.cwd, config.ignore) ? { type: "edit", file, at } : null;
  }
  if (SHELL_TOOLS.has(input.tool_name) && isVerifyCommand(toolInput.command, projectCommands)) {
    return { type: "verify", command: toolInput.command, exitCode: exitCodeOf(input), masked: isMasked(toolInput.command), at };
  }
  return null;
}
```

`plugins/proof-of-done/lib/hook-io.mjs`:
```js
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const readHookInput = () => JSON.parse(fs.readFileSync(0, "utf8"));

export const pluginDataDir = () =>
  process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), ".claude", "plugins", "data", "proof-of-done");

export const warn = (message) => process.stderr.write(`proof-of-done: ${message}\n`);
```

`plugins/proof-of-done/scripts/record.mjs`:
```js
import { loadConfig } from "../lib/config.mjs";
import { detectVerifyCommands } from "../lib/detect.mjs";
import { entryFor } from "../lib/evidence.mjs";
import { pluginDataDir, readHookInput, warn } from "../lib/hook-io.mjs";
import { appendEntry, ledgerPath, pruneOldLedgers } from "../lib/ledger.mjs";

function main() {
  const input = readHookInput();
  const config = loadConfig(input.cwd);
  if (!config.enabled) return;
  const entry = entryFor(input, config, config.verify ?? detectVerifyCommands(input.cwd));
  if (!entry) return;
  const dataDir = pluginDataDir();
  appendEntry(ledgerPath(dataDir, input.session_id), entry);
  pruneOldLedgers(dataDir);
}

try {
  main();
} catch (error) {
  warn(`could not record evidence: ${error.message}`);
}
```

`plugins/proof-of-done/scripts/gate.mjs`:
```js
import { loadConfig } from "../lib/config.mjs";
import { decide } from "../lib/decide.mjs";
import { detectVerifyCommands } from "../lib/detect.mjs";
import { pluginDataDir, readHookInput, warn } from "../lib/hook-io.mjs";
import { ledgerPath, readLedger } from "../lib/ledger.mjs";

function main() {
  const input = readHookInput();
  const config = loadConfig(input.cwd);
  if (config.error) {
    warn(config.error);
    return;
  }
  if (!config.enabled) return;
  const verdict = decide({
    entries: readLedger(ledgerPath(pluginDataDir(), input.session_id)),
    lastMessage: input.last_assistant_message,
    stopHookActive: input.stop_hook_active === true,
    verifyCommands: config.verify ?? detectVerifyCommands(input.cwd),
  });
  if (!verdict.allow) process.stdout.write(JSON.stringify({ decision: "block", reason: verdict.reason }));
}

try {
  main();
} catch (error) {
  warn(`gate skipped after an internal error: ${error.message}`);
}
```

`plugins/proof-of-done/hooks/hooks.json`:
```json
{
  "description": "Record verification evidence and block unverified stops.",
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash|PowerShell|Edit|Write|MultiEdit|NotebookEdit",
        "hooks": [{ "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/record.mjs"], "timeout": 10 }]
      }
    ],
    "PostToolUseFailure": [
      {
        "matcher": "Bash|PowerShell",
        "hooks": [{ "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/record.mjs"], "timeout": 10 }]
      }
    ],
    "Stop": [
      {
        "hooks": [{ "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs"], "timeout": 15 }]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [{ "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs"], "timeout": 15 }]
      }
    ]
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, all suites.

- [ ] **Step 5: Commit**

```bash
git add plugins/proof-of-done
git commit -m "Add record and gate hooks with wiring"
```

---

### Task 6: `/proof` receipt command

**Files:**
- Create: `plugins/proof-of-done/lib/receipt.mjs`, `scripts/receipt.mjs`, `commands/proof.md`
- Test: `plugins/proof-of-done/tests/receipt.test.mjs`

**Interfaces:**
- Consumes: `decide`, `readLedger` (Tasks 3–4).
- Produces: `formatReceipt(entries: object[]): string`.

- [ ] **Step 1: Write the failing test**

`plugins/proof-of-done/tests/receipt.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatReceipt } from "../lib/receipt.mjs";

test("empty session", () => {
  const text = formatReceipt([]);
  assert.match(text, /Files edited \(0\)/);
  assert.match(text, /would allow stopping/);
});

test("lists files once, runs with status, and the gate verdict", () => {
  const text = formatReceipt([
    { type: "edit", file: "/p/a.ts", at: "t1" },
    { type: "edit", file: "/p/a.ts", at: "t2" },
    { type: "verify", command: "npm test", exitCode: 1, masked: false, at: "t3" },
    { type: "verify", command: "npm run lint | tail", exitCode: 0, masked: true, at: "t4" },
  ]);
  assert.match(text, /Files edited \(1\)/);
  assert.match(text, /`npm test` ✗ exit 1/);
  assert.match(text, /`npm run lint \| tail` ⚠ masked/);
  assert.match(text, /would block/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test plugins/proof-of-done/tests/receipt.test.mjs`
Expected: FAIL with `Cannot find module '../lib/receipt.mjs'`.

- [ ] **Step 3: Implement**

`plugins/proof-of-done/lib/receipt.mjs`:
```js
import { decide } from "./decide.mjs";

function status(entry) {
  if (entry.exitCode !== 0 && entry.exitCode !== null) return `✗ exit ${entry.exitCode}`;
  if (entry.masked) return "⚠ masked";
  return entry.exitCode === 0 ? "✓ passed" : "? interrupted";
}

export function formatReceipt(entries) {
  const files = [...new Set(entries.filter((e) => e.type === "edit").map((e) => e.file))];
  const runs = entries.filter((e) => e.type === "verify");
  const verdict = decide({ entries });
  const lines = [
    "## Proof of Done receipt",
    "",
    `**Files edited (${files.length}):**`,
    ...(files.length ? files.map((f) => `- ${f}`) : ["- none"]),
    "",
    `**Verification runs (${runs.length}):**`,
    ...(runs.length ? runs.map((e) => `- \`${e.command}\` ${status(e)} (${e.at})`) : ["- none"]),
    "",
    verdict.allow ? "**Gate:** ✅ would allow stopping" : `**Gate:** ⛔ would block — ${verdict.reason}`,
  ];
  return `${lines.join("\n")}\n`;
}
```

`plugins/proof-of-done/scripts/receipt.mjs`:
```js
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readLedger } from "../lib/ledger.mjs";
import { formatReceipt } from "../lib/receipt.mjs";

function dataDirs() {
  if (process.env.CLAUDE_PLUGIN_DATA) return [process.env.CLAUDE_PLUGIN_DATA];
  const root = path.join(os.homedir(), ".claude", "plugins", "data");
  try {
    return fs.readdirSync(root).filter((name) => name.includes("proof-of-done")).map((name) => path.join(root, name));
  } catch {
    return [];
  }
}

function newestLedger() {
  const files = dataDirs().flatMap((dir) => {
    const sessions = path.join(dir, "sessions");
    try {
      return fs.readdirSync(sessions).filter((n) => n.endsWith(".jsonl")).map((n) => path.join(sessions, n));
    } catch {
      return [];
    }
  });
  return files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

const file = newestLedger();
process.stdout.write(file ? formatReceipt(readLedger(file)) : "No evidence recorded yet in this session.\n");
```

`plugins/proof-of-done/commands/proof.md`:
```markdown
---
description: Show what was edited and verified in this session, and whether the stop gate would pass
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/receipt.mjs"`

Show the receipt above to the user exactly as printed. If the gate would block, say what to run next.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/proof-of-done
git commit -m "Add /proof receipt command"
```

---

### Task 7: Skills, docs and CI

**Files:**
- Create: `plugins/proof-of-done/skills/proof-of-done/SKILL.md`, `skills/proof-of-done-lite/SKILL.md`
- Create: `README.md`, `plugins/proof-of-done/README.md`, `CONTRIBUTING.md`
- Create: `.github/workflows/ci.yml`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/bug_report.md`, `.github/ISSUE_TEMPLATE/plugin_idea.md`
- Test: extend `tests/repo.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/repo.test.mjs`:
```js
test("every skill has a SKILL.md with name and description", () => {
  const skillFiles = [
    ...fs.readdirSync(path.join(root, "skills")).map((n) => path.join("skills", n, "SKILL.md")),
    ...fs.readdirSync(path.join(root, "plugins")).flatMap((p) => {
      const dir = path.join(root, "plugins", p, "skills");
      return fs.existsSync(dir) ? fs.readdirSync(dir).map((n) => path.join("plugins", p, "skills", n, "SKILL.md")) : [];
    }),
  ];
  assert.ok(skillFiles.length >= 2);
  for (const file of skillFiles) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    const frontmatter = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
    assert.match(frontmatter, /^name: [a-z0-9-]+$/m, file);
    assert.match(frontmatter, /^description: .{20,}$/m, file);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/`
Expected: FAIL with `ENOENT` for `skills`.

- [ ] **Step 3: Write the skills, docs and CI**

`plugins/proof-of-done/skills/proof-of-done/SKILL.md`:
```markdown
---
name: proof-of-done
description: Use before saying work is done, fixed, or complete after changing code. Run the project's checks, show their results, and end with a short verification receipt.
---

# Proof of Done

Never say work is finished because the code looks right. Finish with evidence.

1. After your last code change, run the checks that prove it works: the project's
   typecheck, lint, tests and build, or the commands listed in
   `.groundwork/proof-of-done.json`.
2. Run each check plainly. Do not pipe it into `tail`, `head` or `Select-Object`,
   and do not add `|| true`. A hidden exit code is not proof.
3. If a check fails, fix it and run it again. If you cannot fix it, say so plainly.
4. End your message with a receipt:

   Verified:
   - npm run lint ✓
   - npm test ✓ (42 passed)

5. If no check can run (no test runner, missing credentials, hardware needed), end
   with one line that states why:

   Verification: skipped — <the specific reason>

Use `/proof` to see what has been recorded in this session.
```

`skills/proof-of-done-lite/SKILL.md`:
```markdown
---
name: proof-of-done-lite
description: Use before saying work is done, fixed, or complete after changing code. Run the project's checks, show their results, and end with a short verification receipt.
---

# Proof of Done (lite)

This is the instructions-only version. For enforcement that blocks the agent until
checks pass, install the `proof-of-done` plugin from the groundwork marketplace.

1. After your last code change, run the checks that prove it works: typecheck, lint,
   tests and build.
2. Run each check plainly. Do not pipe it into `tail`, `head` or `Select-Object`, and
   do not add `|| true`. A hidden exit code is not proof.
3. If a check fails, fix it and run it again. If you cannot fix it, say so plainly.
4. End your message with a receipt:

   Verified:
   - npm run lint ✓
   - npm test ✓ (42 passed)

5. If no check can run, end with one line that states why:

   Verification: skipped — <the specific reason>
```

`README.md`:
````markdown
# groundwork

Claude Code plugins and skills that make AI coding agents prove their work.

> "Done!" — but nothing was built, tested, or run. groundwork makes the agent show
> evidence before it is allowed to say that.

## Install

```
/plugin marketplace add WST2002/groundwork
/plugin install proof-of-done@groundwork
```

## What's inside

| Name | Type | What it does | Install |
|---|---|---|---|
| [proof-of-done](plugins/proof-of-done) | Plugin | Blocks the agent from finishing after code changes until tests, build or lint have passed after the last edit. | `/plugin install proof-of-done@groundwork` |
| [proof-of-done-lite](skills/proof-of-done-lite) | Skill | The same habits as instructions only, no enforcement. | Copy the folder into `~/.claude/skills/` |

## Plugins vs skills

- **Plugins** can enforce behaviour with hooks. Install them with `/plugin install`.
- **Skills** are instruction files. Copy a skill's folder into `~/.claude/skills/`
  (Windows: `%USERPROFILE%\.claude\skills\`) and it is available in every project.

## Requirements

Node.js 18 or newer on your `PATH`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT © Wageesha Tripathi
````

`plugins/proof-of-done/README.md`:
````markdown
# proof-of-done

Stops Claude Code from ending its turn after changing code until verification has
run and passed after the last edit.

## How it works

1. Every code edit and every verification command (tests, build, lint, typecheck)
   is recorded for the session.
2. When the agent tries to stop:
   - no code edits → allowed
   - edits but no verification after the last edit → blocked, with the exact
     commands to run
   - the latest run of any check failed, was interrupted, or had its exit code
     hidden (`| tail`, `|| true`) → blocked, with the reason
   - every check's latest run passed → allowed
3. If verification is genuinely impossible, the agent can end with
   `Verification: skipped — <reason>` and say so honestly.

The agent is blocked at most once per stop attempt, so it can never loop forever.

## Install

```
/plugin marketplace add WST2002/groundwork
/plugin install proof-of-done@groundwork
```

## Commands

- `/proof` — show what was edited and verified in this session, and whether the
  gate would pass.

## Configuration (optional)

Create `.groundwork/proof-of-done.json` in your project:

```json
{
  "enabled": true,
  "verify": ["npm run lint", "npm test"],
  "ignore": ["generated/**", "*.snap"]
}
```

- `verify` replaces auto-detection.
- `ignore` adds file globs that never count as code edits.
- `enabled: false` turns the gate off for this project.

Auto-detection covers npm/pnpm/yarn/bun scripts (`typecheck`, `lint`, `test`,
`build`), pytest, Go, Cargo, Maven and Gradle.

## Requirements

Node.js 18 or newer on your `PATH`.
````

`CONTRIBUTING.md`:
````markdown
# Contributing

## Layout

- `plugins/<name>/` — anything that needs hooks, commands or enforcement. Each
  plugin is self-contained: its own `.claude-plugin/plugin.json`, `README.md`,
  `CHANGELOG.md` and `tests/`. Plugins cannot import files outside their folder.
- `skills/<name>/SKILL.md` — instruction-only skills that users install by copying
  the folder.
- `.claude-plugin/marketplace.json` — add every new plugin here with the same
  `name` and `version` as its `plugin.json`.

## Rules

- Hook scripts are Node.js ESM with no npm dependencies, invoked as
  `"command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/<file>.mjs"]`.
- A hook that fails internally must never block the user.
- Bump the plugin `version` in both manifests and add a `CHANGELOG.md` entry for
  every user-visible change.

## Checks

```
npm test
claude plugin validate . --strict
```

Tests need Node.js 22 or newer.
````

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm test

  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install -g @anthropic-ai/claude-code
      - run: claude plugin validate . --strict
```

`.github/PULL_REQUEST_TEMPLATE.md`:
```markdown
## What changed

## Why

## Checks

- [ ] `npm test` passes
- [ ] `claude plugin validate . --strict` passes
- [ ] Plugin version and CHANGELOG updated (if user-visible)
```

`.github/ISSUE_TEMPLATE/bug_report.md`:
```markdown
---
name: Bug report
about: Something in a plugin or skill does not work as described
labels: bug
---

**Plugin or skill:**

**What happened:**

**What you expected:**

**Steps to reproduce:**

**OS, Node.js version, Claude Code version:**
```

`.github/ISSUE_TEMPLATE/plugin_idea.md`:
```markdown
---
name: Plugin or skill idea
about: Suggest something that would make AI coding agents more reliable
labels: idea
---

**The problem you hit:**

**What the plugin or skill would do:**
```

- [ ] **Step 4: Run tests and validation**

Run: `npm test`
Expected: PASS.
Run: `claude plugin validate . --strict`
Expected: `Validation passed`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add skills, documentation and CI"
```

---

### Task 8: End-to-end check in real Claude Code

**Files:** none changed unless a payload field name differs from the plan. If one does, fix it in `lib/evidence.mjs`, add a test with the real payload shape to `tests/evidence.test.mjs`, and commit.

- [ ] **Step 1: Create a sample project outside the repo**

```bash
mkdir -p ~/personal/pod-sandbox/src && cd ~/personal/pod-sandbox
printf '{ "name": "pod-sandbox", "scripts": { "test": "node --test" } }' > package.json
printf 'export const add = (a, b) => a + b;\n' > src/add.mjs
printf 'import { test } from "node:test";\nimport assert from "node:assert";\nimport { add } from "./src/add.mjs";\ntest("add", () => assert.equal(add(1, 2), 3));\n' > add.test.mjs
```

- [ ] **Step 2: Install the local marketplace**

In a Claude Code session started in `~/personal/pod-sandbox`:
```
/plugin marketplace add ../groundwork
/plugin install proof-of-done@groundwork
```

- [ ] **Step 3: Exercise the gate**

Ask Claude: "Change add to also accept a third optional argument. Don't run anything, just say done."
Expected: the stop is blocked once with a message naming `npm run test`; Claude then runs the tests and finishes with a receipt.

- [ ] **Step 4: Inspect the recorded ledger**

Run `/proof`.
Expected: the edited file, `npm run test` ✓ passed, gate ✅.

- [ ] **Step 5: Exercise a failure**

Ask Claude to break the test on purpose and then stop. Expected: blocked with `exited with code 1`, or Claude reports the failure honestly with the skip line.

- [ ] **Step 6: Clean up**

```
/plugin uninstall proof-of-done@groundwork
/plugin marketplace remove groundwork
```
Delete `~/personal/pod-sandbox`.
