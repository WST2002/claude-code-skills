import fs from "node:fs";
import path from "node:path";
import { globToRegExp, nativePath } from "./classify.mjs";
import { analyzeShell } from "./shell.mjs";

const MAX_LEVELS_UP = 8;
const MAX_GLOB_DEPTH = 4;
const SKIPPED_FOLDERS = new Set(["node_modules", ".git"]);
const ALL_WORKSPACES = new Set(["-ws", "--workspaces", "-r", "--recursive"]);
// Flags whose value names the package(s) a run is limited to. Folder flags take a path, the others a name or folder.
const TARGET_FLAGS = new Set(["-w", "--workspace", "--filter", "-F", "--scope", "--projects", "-p"]);
const FOLDER_FLAGS = new Set(["--prefix", "-C", "--dir", "--cwd"]);
const TASK_RUNNER = /^(?:npx\s+)?(turbo|nx|lerna)\b/;
const PACKAGE_MANAGER = /^(npm|pnpm|yarn|bun)\s+(\S+)$/;
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
      const include = globs.filter((g) => !g.startsWith("!")).map((g) => globToRegExp(trimFolder(g)));
      const exclude = globs.filter((g) => g.startsWith("!")).map((g) => globToRegExp(trimFolder(g.slice(1))));
      const bases = [...new Set(globs.filter((g) => !g.startsWith("!")).map(globBase))];
      const packages = [...new Set(bases.flatMap((base) => packageFolders(dir, base)))]
        .filter((rel) => include.some((re) => re.test(rel)) && !exclude.some((re) => re.test(rel)))
        .sort()
        .map((rel) => {
          const pkg = readJson(path.join(dir, rel, "package.json")) ?? {};
          return { dir: rel, name: typeof pkg.name === "string" ? pkg.name : rel, scripts: pkg.scripts ?? {} };
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
  const found = ws.packages.filter((p) => p.name === target || p.dir === target || re.test(p.name) || re.test(p.dir));
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
// A script that the parser cannot read but that looks like it runs tests (`node --test`, `mocha`, `ava`…).
const TEST_LIKE_SCRIPT = /\b(?:test|tests|jest|vitest|mocha|ava|tap|playwright|cypress|uvu)\b/i;

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
  if (runner === "nx" && !/run-many$/.test(check)) {
    const project = tokens.find((t) => !t.startsWith("-"));
    if (project) targets.push(project);
  }
  if (tokens[0] === "workspace" && tokens[1]) targets.push(tokens[1]);
  if (targets.length) {
    const dirs = targets.map((v) => matchTarget(v, ws));
    return dirs.every(Boolean) ? new Set(dirs.flat()) : "all";
  }
  if (runner || tokens.some((t) => ALL_WORKSPACES.has(t)) || (tokens[0] === "workspaces" && tokens[1] === "foreach")) return "all";
  return null;
}

// A root package script covers the packages whose tests its steps run; a step that is not a test run covers none.
function scopeOfRootScript(name, ws, depth) {
  const script = ws.scripts[name];
  if (depth >= MAX_SCRIPT_DEPTH) return "all";
  if (typeof script !== "string") return name === "test" ? "all" : NONE;
  const runs = analyzeShell(script).filter((e) => e.type === "verify");
  if (!runs.length) return TEST_LIKE_SCRIPT.test(script) ? "all" : NONE;
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
function scopeOfRun(run, baseRel, ws, depth = 0) {
  if (run.runner) return "all";
  const check = run.check ?? run.command ?? "";
  // Words after `--` go to the test runner, and pnpm's -w means the workspace root.
  const words = (run.args ?? "").split(/\s+/).filter(Boolean);
  const before = words.includes("--") ? words.slice(0, words.indexOf("--")) : words;
  const pnpmRoot = check.startsWith("pnpm ") && before.includes("-w");
  const tokens = pnpmRoot ? before.filter((t) => t !== "-w") : before;
  const own = inPackage(baseRel, ws);
  const script = PACKAGE_MANAGER.exec(check)?.[2];
  if (script) {
    const named = namedPackages(check, tokens, baseRel, ws);
    if (named) return script === "test" ? named : NONE;
    if (pnpmRoot || baseRel === "") return scopeOfRootScript(script, ws, depth);
    if (own) return script === "test" ? new Set([own.dir]) : NONE;
    return "all";
  }
  if (TASK_RUNNER.test(check)) {
    const isTest = /\btest$/.test(check) || (/run-many$/.test(check) && /(?:^|[\s=,])test(?:$|[\s,])/.test(tokens.join(" ")));
    return isTest ? namedPackages(check, tokens, baseRel, ws) ?? "all" : NONE;
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
  return scope === "all" || scope.has(pkg.dir);
}
