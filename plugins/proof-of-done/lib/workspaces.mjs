import fs from "node:fs";
import path from "node:path";
import { globToRegExp, nativePath } from "./classify.mjs";
import { analyzeShell, splitCommand } from "./shell.mjs";

const MAX_LEVELS_UP = 8;
const MAX_GLOB_DEPTH = 4;
const SKIPPED_FOLDERS = new Set(["node_modules", ".git"]);
const ALL_WORKSPACES = new Set(["-ws", "--workspaces", "-r", "--recursive"]);
// Flags whose value names the package(s) a run is limited to. Folder flags take a path, the others a name or folder.
const TARGET_FLAGS = new Set(["-w", "--workspace", "--filter", "-F", "--scope", "--projects", "-p"]);
const FOLDER_FLAGS = new Set(["--prefix", "-C", "--dir", "--cwd"]);
const TASK_RUNNER = /^(?:(?:npx|bunx|npm\s+exec|pnpm(?:\s+(?:exec|dlx))?|yarn(?:\s+dlx)?|bun(?:\s+x)?)\s+)?(turbo|nx|lerna)\b/;
// A package script run (`npm test`, `pnpm lint`), as opposed to a tool started through one (`pnpm vitest`).
const PACKAGE_MANAGER = /^(npm|pnpm|yarn|bun)\s+(test|build|lint|typecheck|check)$/;
// nx commands whose first plain word is a project: `nx test api`, `nx run api:test`.
const NX_PROJECT = /\bnx\s+(?:test|build|lint|typecheck|run)$/;
const MAX_SCRIPT_DEPTH = 3;

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};
const posix = (rel) => rel.split(path.sep).join("/");
const trimFolder = (value) => value.replace(/^\.\//, "").replace(/\/+$/, "");

// The workspace globs of a folder: package.json "workspaces" (npm, yarn, bun) or pnpm-workspace.yaml.
function workspaceGlobs(dir) {
  const pkg = readJson(path.join(dir, "package.json"));
  const field = Array.isArray(pkg?.workspaces) ? pkg.workspaces : pkg?.workspaces?.packages;
  if (Array.isArray(field)) return field.filter((g) => typeof g === "string");
  let yaml;
  try {
    yaml = fs.readFileSync(path.join(dir, "pnpm-workspace.yaml"), "utf8");
  } catch {
    return null;
  }
  const unquote = (item) => item.trim().replace(/^['"]|['"]$/g, "");
  const inline = /^packages\s*:\s*\[([^\]]*)\]/m.exec(yaml);
  if (inline) return inline[1].split(",").map(unquote).filter(Boolean);
  const globs = [];
  let inPackages = false;
  for (const line of yaml.split(/\r?\n/)) {
    if (/^packages\s*:/.test(line)) inPackages = true;
    else if (/^\S/.test(line)) inPackages = false;
    else if (inPackages) {
      const item = /^\s*-\s*['"]?([^'"#]+?)['"]?\s*(?:#.*)?$/.exec(line);
      if (item) globs.push(item[1].trim());
    }
  }
  return globs;
}

// The fixed folder a glob starts from ("packages" for "packages/*"), so only that part of the repo is searched.
const globBase = (glob) => trimFolder(glob).split("/").filter((part, i, parts) => !/[*?[{]/.test(parts.slice(0, i + 1).join("/"))).join("/");

function packageFolders(root, rel = "", depth = 0) {
  const own = rel && fs.existsSync(path.join(root, rel, "package.json")) ? [rel] : [];
  if (depth > MAX_GLOB_DEPTH) return own;
  let names;
  try {
    names = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
  } catch {
    return own;
  }
  return [
    ...own,
    ...names
      .filter((d) => d.isDirectory() && !SKIPPED_FOLDERS.has(d.name))
      .flatMap((d) => packageFolders(root, rel ? `${rel}/${d.name}` : d.name, depth + 1)),
  ];
}

function manager(root) {
  const has = (name) => fs.existsSync(path.join(root, name));
  if (has("pnpm-workspace.yaml") || has("pnpm-lock.yaml")) return "pnpm";
  if (has("yarn.lock")) return "yarn";
  if (has("bun.lock") || has("bun.lockb")) return "bun";
  return "npm";
}

/** The monorepo that holds `startDir`: its root, package manager, root scripts and packages, or null. */
export function findWorkspaces(startDir) {
  let dir = path.resolve(nativePath(startDir));
  for (let level = 0; level <= MAX_LEVELS_UP; level++) {
    const globs = workspaceGlobs(dir);
    if (globs?.length) {
      // "x/**" also matches the folder x itself, as pnpm and npm read it.
      const include = globs
        .filter((g) => !g.startsWith("!"))
        .map(trimFolder)
        .flatMap((g) => (g.endsWith("/**") ? [g, g.slice(0, -3)] : [g]))
        .map(globToRegExp);
      const exclude = globs.filter((g) => g.startsWith("!")).map((g) => globToRegExp(trimFolder(g.slice(1))));
      const bases = [...new Set(globs.filter((g) => !g.startsWith("!")).map(globBase))];
      const packages = [...new Set(bases.flatMap((base) => packageFolders(dir, base)))]
        .filter((rel) => include.some((re) => re.test(rel)) && !exclude.some((re) => re.test(rel)))
        .sort()
        .map((rel) => {
          const pkg = readJson(path.join(dir, rel, "package.json")) ?? {};
          const name = typeof pkg.name === "string" ? pkg.name : rel;
          // nx can know a package by a shorter project name.
          const aliases = [name, pkg.nx?.name].filter((n) => typeof n === "string");
          return { dir: rel, name, aliases, scripts: pkg.scripts ?? {} };
        });
      return { root: dir, manager: manager(dir), scripts: readJson(path.join(dir, "package.json"))?.scripts ?? {}, packages };
    }
    const parent = path.dirname(dir);
    if (parent === dir || fs.existsSync(path.join(dir, ".git"))) break;
    dir = parent;
  }
  return null;
}

function relativeToRoot(absolute, ws) {
  const rel = path.relative(ws.root, absolute);
  return rel.startsWith("..") || path.isAbsolute(rel) ? null : posix(rel);
}

// Windows folder names ignore case. A nested package belongs to the innermost package folder.
const sameCase = (text) => (process.platform === "win32" ? text.toLowerCase() : text);
function inPackage(rel, ws) {
  const target = sameCase(rel);
  const holders = ws.packages.filter((p) => target === sameCase(p.dir) || target.startsWith(`${sameCase(p.dir)}/`));
  return holders.sort((a, b) => b.dir.length - a.dir.length)[0] ?? null;
}

/** The package an edited file belongs to, or null for files outside every package. */
export function packageOf(file, cwd, ws) {
  const rel = relativeToRoot(path.resolve(nativePath(cwd ?? ws.root), nativePath(file)), ws);
  return rel === null ? null : inPackage(rel, ws);
}

// Packages a --filter / -w / --scope value names: a name, a folder or a glob of either. null when nothing matches,
// or when the value also pulls in dependencies or dependents (`api...`, `...^api`) or excludes (`!web`), which
// needs the dependency graph to answer.
function matchTarget(value, ws) {
  if (/\.\.\.|[[\]{}^!]/.test(value)) return null;
  const target = trimFolder(value);
  if (!target) return null;
  const re = globToRegExp(target);
  const names = (p) => p.aliases ?? [p.name];
  const found = ws.packages.filter((p) => names(p).includes(target) || p.dir === target || names(p).some((n) => re.test(n)) || re.test(p.dir));
  return found.length ? found.map((p) => p.dir) : null;
}

const flagValues = (tokens, flags) =>
  tokens.flatMap((t, i) => {
    const [flag, inline] = t.split(/=(.*)/s);
    if (!flags.has(flag)) return [];
    return [inline ?? tokens[i + 1]].filter((v) => v !== undefined);
  });

const NONE = new Set();
// Checks that run tests (as opposed to lint, typecheck or build), when they are not package scripts or task runners.
const TEST_CHECK = /\b(?:jest|vitest|playwright test|pytest|go test|cargo test|dotnet test|mvnw? (?:test|verify)|gradlew? (?:test|check)|make (?:test|check))\b/;
// Words that make a step the parser cannot read look like a test run: a runner (`jest`, `mocha`…), node's `--test`, or
// a `test` / `test:unit` script. Words that only contain "test" (`tsconfig.test.json`, `build:tests`) do not count.
const TEST_RUNNERS = new Set(["jest", "vitest", "mocha", "ava", "tap", "playwright", "cypress", "uvu", "jasmine", "karma"]);
const looksLikeTests = (text) =>
  text.split(/\s+/).some((word) => TEST_RUNNERS.has(path.posix.basename(word)) || word === "--test" || /^test(?:[:_-]\S+)?$/.test(word));
// A turbo/nx/lerna task that runs tests: `test`, `test:ci`, or turbo's `pkg#test`.
const TEST_TASK = /^(?:\S+#)?test(?::\S+)?$/;

const union = (scopes) => {
  if (scopes.includes("all")) return "all";
  return new Set(scopes.flatMap((s) => [...s]));
};

// Where a run's words point: package folders, "all", or null when the run names no packages.
function namedPackages(check, tokens, baseRel, ws) {
  const folders = flagValues(tokens, FOLDER_FLAGS).map((v) => inPackage(posix(path.posix.join(baseRel, trimFolder(v))), ws));
  if (folders.length) return folders.every(Boolean) ? new Set(folders.map((p) => p.dir)) : "all";
  const targets = flagValues(tokens, TARGET_FLAGS);
  const runner = TASK_RUNNER.exec(check)?.[1];
  if (NX_PROJECT.test(check)) {
    const project = tokens.find((t) => !t.startsWith("-"));
    if (project) targets.push(project.split(":")[0]);
  }
  if (tokens[0] === "workspace" && tokens[1]) targets.push(tokens[1]);
  if (targets.length) {
    const dirs = targets.map((v) => matchTarget(v, ws));
    return dirs.every(Boolean) ? new Set(dirs.flat()) : "all";
  }
  // nx run-many / affected with --exclude: every package except the excluded ones.
  const excluded = runner === "nx" ? flagValues(tokens, new Set(["--exclude"])).flatMap((v) => v.split(",")) : [];
  if (excluded.length) {
    const dirs = excluded.map((v) => matchTarget(v, ws));
    const out = new Set(dirs.every(Boolean) ? dirs.flat() : []);
    return new Set(ws.packages.map((p) => p.dir).filter((d) => !out.has(d)));
  }
  if (runner || tokens.some((t) => ALL_WORKSPACES.has(t)) || tokens[0] === "workspaces") return "all";
  return null;
}

// A root package script covers the packages whose tests its steps run; a step that is not a test run covers none.
function scopeOfRootScript(name, ws, depth) {
  const script = ws.scripts[name];
  if (depth >= MAX_SCRIPT_DEPTH) return "all";
  if (typeof script !== "string") return name === "test" ? "all" : NONE;
  // A step the parser cannot read but that looks like a test run (`jest`, `node --test`, `npm run test:unit`) may
  // test every package.
  const unread = splitCommand(script).some((s) => !analyzeShell(s.text).some((e) => e.type === "verify") && looksLikeTests(s.text));
  if (unread) return "all";
  const runs = analyzeShell(script).filter((e) => e.type === "verify");
  return union(runs.map((event) => {
    const rel = relativeToRoot(path.resolve(ws.root, nativePath(event.dir ?? "")), ws);
    return rel === null ? "all" : scopeOfRun(event, rel, ws, depth + 1);
  }));
}

/**
 * The packages whose tests a run covers: "all" or a Set of package folders. Workspace flags win over the folder the
 * run started in. When the target cannot be worked out the run counts for every package, so the gate never blocks on
 * a guess; a run that is not a test run (lint, typecheck, build) covers no package.
 */
function scopeOfRun(entry, baseRel, ws, depth = 0) {
  // Read the run again from its full text: a command from the `verify` setting is stored whole
  // (`npm test -- --ci`). A command none of the patterns know (`make ci`, `npm run test:ci`) counts for every package.
  const run = analyzeShell(`${entry.check ?? entry.command ?? ""} ${entry.args ?? ""}`).find((e) => e.type === "verify");
  if (!run) return "all";
  const own = inPackage(baseRel, ws);
  // bun's own runner (`bun test`) runs every test file under the folder it starts in. Only the recorded entry knows
  // whether it was the runner: read again, `bun run test` looks the same.
  if (entry.runner) return own ? new Set([own.dir]) : "all";
  const { check } = run;
  // Words after `--` go to the test runner, and pnpm's -w means the workspace root.
  const words = run.args.split(/\s+/).filter(Boolean);
  const before = words.includes("--") ? words.slice(0, words.indexOf("--")) : words;
  const pnpmRoot = check.startsWith("pnpm ") && before.includes("-w");
  const tokens = pnpmRoot ? before.filter((t) => t !== "-w") : before;
  const script = PACKAGE_MANAGER.exec(check)?.[2];
  if (script) {
    const named = namedPackages(check, tokens, baseRel, ws);
    if (named) return script === "test" ? named : NONE;
    if (pnpmRoot || baseRel === "") return scopeOfRootScript(script, ws, depth);
    if (script !== "test") return NONE;
    return own ? new Set([own.dir]) : "all";
  }
  if (TASK_RUNNER.test(check)) {
    // The tasks are every plain word: `turbo run build test`, `nx test api`, `nx run-many -t test:ci`.
    const tasks = `${check} ${tokens.join(" ")}`.split(/[\s=,]+/).flatMap((t) => [t, t.slice(t.indexOf(":") + 1)]);
    return tasks.some((t) => TEST_TASK.test(t)) ? namedPackages(check, tokens, baseRel, ws) ?? "all" : NONE;
  }
  if (!TEST_CHECK.test(check)) return NONE;
  return own ? new Set([own.dir]) : "all";
}

const NPM_PLACEHOLDER_TEST = /no test specified/;
const hasTests = (pkg) => typeof pkg.scripts.test === "string" && !NPM_PLACEHOLDER_TEST.test(pkg.scripts.test);

/**
 * Packages with their own tests whose code changed, but that no passing run after their last edit covered.
 * `isPassing` decides which runs count, so this follows the same rules as the rest of the gate.
 */
export function uncoveredPackages(entries, ws, isPassing) {
  const lastEdit = new Map();
  entries.forEach((e, at) => {
    if (e.type !== "edit") return;
    const pkg = packageOf(e.file, e.cwd, ws);
    if (pkg && hasTests(pkg)) lastEdit.set(pkg, at);
  });
  return [...lastEdit]
    .filter(([pkg, at]) => !entries.slice(at + 1).some((e) => e.type === "verify" && isPassing(e) && covers(e, pkg, ws)))
    .map(([pkg]) => pkg);
}

/** The command that runs one package's tests with this monorepo's package manager. */
export function packageTestCommand(pkg, ws) {
  if (ws.manager === "pnpm") return `pnpm --filter ${pkg.name} test`;
  if (ws.manager === "yarn") return `yarn workspace ${pkg.name} test`;
  if (ws.manager === "bun") return `bun --filter ${pkg.name} test`;
  return `npm test -w ${pkg.dir}`;
}

/** Whether a verify entry ran the checks of `pkg` (a package from findWorkspaces). */
export function covers(entry, pkg, ws) {
  if (!entry.cwd) return true;
  const baseRel = relativeToRoot(path.resolve(nativePath(entry.cwd), nativePath(entry.dir ?? "")), ws);
  if (baseRel === null) return true;
  const scope = scopeOfRun(entry, baseRel, ws);
  // A run of a package's tests also counts for the packages nested inside it (test apps, examples, fixtures),
  // since its tests often run them.
  return scope === "all" || [...scope].some((dir) => pkg.dir === dir || pkg.dir.startsWith(`${dir}/`));
}
