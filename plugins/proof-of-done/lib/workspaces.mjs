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

function packageFolders(root, depth = 0, rel = "") {
  if (depth > MAX_GLOB_DEPTH) return [];
  let names;
  try {
    names = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
  } catch {
    return [];
  }
  return names
    .filter((d) => d.isDirectory() && !SKIPPED_FOLDERS.has(d.name))
    .flatMap((d) => {
      const child = rel ? `${rel}/${d.name}` : d.name;
      const own = fs.existsSync(path.join(root, child, "package.json")) ? [child] : [];
      return [...own, ...packageFolders(root, depth + 1, child)];
    });
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
      const packages = packageFolders(dir)
        .filter((rel) => include.some((re) => re.test(rel)) && !exclude.some((re) => re.test(rel)))
        .sort()
        .map((rel) => {
          const pkg = readJson(path.join(dir, rel, "package.json")) ?? {};
          return { dir: rel, name: typeof pkg.name === "string" ? pkg.name : rel, scripts: pkg.scripts ?? {} };
        });
      return { root: dir, manager: manager(dir), scripts: readJson(path.join(dir, "package.json"))?.scripts ?? {}, packages };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function relativeToRoot(absolute, ws) {
  const rel = path.relative(ws.root, absolute);
  return rel.startsWith("..") || path.isAbsolute(rel) ? null : posix(rel);
}

const inPackage = (rel, ws) => ws.packages.find((p) => rel === p.dir || rel.startsWith(`${p.dir}/`)) ?? null;

/** The package an edited file belongs to, or null for files outside every package. */
export function packageOf(file, cwd, ws) {
  const rel = relativeToRoot(path.resolve(nativePath(cwd ?? ws.root), nativePath(file)), ws);
  return rel === null ? null : inPackage(rel, ws);
}

// Packages a --filter / -w / --scope value names: a name, a folder or a glob of either. null when nothing matches.
function matchTarget(value, ws) {
  const target = trimFolder(value.replace(/^\.\.\.|\.\.\.$/g, ""));
  if (!target || /[[\]{}^]/.test(target)) return null;
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

/**
 * What a check run covers: "all", a Set of package folders, or "plain" for a package script run at the root with no
 * workspace flags (its root script decides). Unknown targets count as "all" so a run is never wrongly rejected.
 */
function scopeOfCommand(check, args, baseRel, ws) {
  const tokens = args.split(/\s+/).filter(Boolean);
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
  return PACKAGE_MANAGER.test(check) ? "plain" : "all";
}

// A package script run at the root covers what its root script runs; a plain test runner there covers everything.
function scopeOfRootScript(check, ws, depth) {
  const script = ws.scripts[PACKAGE_MANAGER.exec(check)[2]];
  if (typeof script !== "string" || depth >= MAX_SCRIPT_DEPTH) return "all";
  const runs = analyzeShell(script).filter((e) => e.type === "verify");
  if (!runs.length) return "all";
  const dirs = new Set();
  for (const event of runs) {
    const scope = scopeOfRun(event.check, event.args, event.dir ?? "", ws, depth + 1);
    if (scope === "all") return "all";
    for (const d of scope) dirs.add(d);
  }
  return dirs;
}

function scopeOfRun(check, args, baseRel, ws, depth = 0) {
  const own = inPackage(baseRel, ws);
  if (own) return new Set([own.dir]);
  if (baseRel !== "") return "all";
  const scope = scopeOfCommand(check, args ?? "", baseRel, ws);
  return scope === "plain" ? scopeOfRootScript(check, ws, depth) : scope;
}

/** Whether a verify entry ran the checks of `pkg` (a package from findWorkspaces). */
export function covers(entry, pkg, ws) {
  if (!entry.cwd) return true;
  const baseRel = relativeToRoot(path.resolve(nativePath(entry.cwd), entry.dir ?? ""), ws);
  if (baseRel === null) return true;
  const scope = scopeOfRun(entry.check ?? entry.command, entry.args, baseRel, ws);
  return scope === "all" || scope.has(pkg.dir);
}
