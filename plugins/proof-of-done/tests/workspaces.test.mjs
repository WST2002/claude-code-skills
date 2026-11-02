import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { covers, findWorkspaces, packageOf } from "../lib/workspaces.mjs";
import { tempDir, writeFiles } from "./helpers.mjs";

const pkg = (name, scripts = { test: "node --test" }) => ({ name, scripts });

function monorepo(t, rootScripts = { test: "npm test -w packages/web" }, extra = {}) {
  const root = tempDir(t);
  writeFiles(root, {
    "package.json": { name: "shop", private: true, workspaces: ["packages/*"], scripts: rootScripts },
    "packages/api/package.json": pkg("api"),
    "packages/web/package.json": pkg("web"),
    "packages/notes/README.md": "not a package",
    ...extra,
  });
  return { root, ws: findWorkspaces(root) };
}

const run = (root, command, check, args = "", more = {}) => ({ type: "verify", command, check, args, cwd: root, ...more });
const covered = (ws, entry) => ws.packages.filter((p) => covers(entry, p, ws)).map((p) => p.name);

test("npm workspaces: packages with a package.json, sorted by folder", (t) => {
  const { root, ws } = monorepo(t);
  assert.equal(ws.root, root);
  assert.equal(ws.manager, "npm");
  assert.deepEqual(ws.packages.map((p) => [p.dir, p.name]), [["packages/api", "api"], ["packages/web", "web"]]);
});

test("found from inside a package folder", (t) => {
  const { root } = monorepo(t);
  assert.equal(findWorkspaces(path.join(root, "packages/api")).root, root);
});

test("yarn's object form and pnpm-workspace.yaml with an exclusion", (t) => {
  const yarnRoot = tempDir(t);
  writeFiles(yarnRoot, { "package.json": { workspaces: { packages: ["apps/*"] } }, "yarn.lock": "", "apps/site/package.json": pkg("site") });
  const yarn = findWorkspaces(yarnRoot);
  assert.equal(yarn.manager, "yarn");
  assert.deepEqual(yarn.packages.map((p) => p.dir), ["apps/site"]);

  const pnpmRoot = tempDir(t);
  writeFiles(pnpmRoot, {
    "package.json": { name: "mono" },
    "pnpm-workspace.yaml": "packages:\n  - 'packages/*'\n  - \"tools/cli\"\n  - '!packages/legacy'\n",
    "packages/core/package.json": pkg("@mono/core"),
    "packages/legacy/package.json": pkg("legacy"),
    "tools/cli/package.json": pkg("cli"),
  });
  const pnpm = findWorkspaces(pnpmRoot);
  assert.equal(pnpm.manager, "pnpm");
  assert.deepEqual(pnpm.packages.map((p) => p.dir), ["packages/core", "tools/cli"]);
});

test("a project without workspaces is not a monorepo", (t) => {
  const root = tempDir(t);
  writeFiles(root, { "package.json": pkg("app") });
  assert.equal(findWorkspaces(root), null);
});

test("an edited file belongs to the package whose folder holds it", (t) => {
  const { root, ws } = monorepo(t);
  assert.equal(packageOf(path.join(root, "packages/api/src/order.js"), root, ws).name, "api");
  assert.equal(packageOf("src/order.js", path.join(root, "packages/api"), ws).name, "api");
  assert.equal(packageOf(path.join(root, "scripts/release.js"), root, ws), null);
});

test("a root run covers only the packages its script runs", (t) => {
  const { root, ws } = monorepo(t);
  assert.deepEqual(covered(ws, run(root, "npm test", "npm test")), ["web"]);
});

test("a root script that runs every workspace, or a plain test runner, covers every package", (t) => {
  for (const script of ["npm test --workspaces", "pnpm -r test", "turbo run test", "npx nx run-many -t test", "node --test", "vitest run"]) {
    const { root, ws } = monorepo(t, { test: script });
    assert.deepEqual(covered(ws, run(root, "npm test", "npm test")), ["api", "web"], script);
  }
});

test("workspace flags pick packages by folder or name", (t) => {
  const { root, ws } = monorepo(t);
  for (const [command, check, args] of [
    ["npm test -w packages/api", "npm test", "-w packages/api"],
    ["npm test --workspace=api", "npm test", "--workspace=api"],
    ["npm --prefix packages/api test", "npm test", "--prefix packages/api"],
    ["pnpm --filter api test", "pnpm test", "--filter api"],
    ["pnpm --filter=./packages/api test", "pnpm test", "--filter=./packages/api"],
    ["yarn workspace api test", "yarn test", "workspace api"],
    ["npx turbo run test --filter=api", "npx turbo run test", "--filter=api"],
    ["npx nx test api", "npx nx test", "api"],
    ["npx lerna run test --scope api", "npx lerna run test", "--scope api"],
  ]) {
    assert.deepEqual(covered(ws, run(root, command, check, args)), ["api"], command);
  }
});

test("runs over every workspace cover every package", (t) => {
  const { root, ws } = monorepo(t);
  for (const [command, check, args] of [
    ["npm test --workspaces", "npm test", "--workspaces"], ["npm test -ws", "npm test", "-ws"], ["pnpm -r test", "pnpm test", "-r"],
    ["npx turbo run test", "npx turbo run test", ""], ["npx nx run-many -t test", "npx nx run-many", "-t test"],
    ["npx lerna run test", "npx lerna run test", ""], ["yarn workspaces foreach -A run test", "yarn test", "workspaces foreach -A"],
  ]) {
    assert.deepEqual(covered(ws, run(root, command, check, args)), ["api", "web"], command);
  }
});

test("a run inside a package folder covers that package", (t) => {
  const { root, ws } = monorepo(t);
  assert.deepEqual(covered(ws, run(path.join(root, "packages/api"), "npm test", "npm test")), ["api"]);
  assert.deepEqual(covered(ws, run(root, "cd packages/api && npm test", "npm test", "", { dir: "packages/api" })), ["api"]);
});

test("when the target cannot be worked out, the run counts for every package", (t) => {
  const { root, ws } = monorepo(t);
  assert.deepEqual(covered(ws, run(root, "pnpm --filter ...[origin/main] test", "pnpm test", "--filter ...[origin/main]")), ["api", "web"]);
  assert.deepEqual(covered(ws, run(path.dirname(root), "npm test", "npm test")), ["api", "web"]);
  assert.deepEqual(covered(ws, { type: "verify", command: "npm test", check: "npm test", args: "" }), ["api", "web"]);
});

test("flags after -- belong to the test runner, not to the workspace choice", (t) => {
  const { root, ws } = monorepo(t);
  assert.deepEqual(covered(ws, run(root, "npm test -- -w api", "npm test", "-- -w api")), ["web"]);
});

test("a root test script covers what its test runs cover, not what its lint step covers", (t) => {
  const { root, ws } = monorepo(t, { test: "npm run lint && npm test -w packages/web", lint: "eslint ." });
  assert.deepEqual(covered(ws, run(root, "npm test", "npm test")), ["web"]);
});

test("cd .. back to the root makes a plain root run", (t) => {
  const { root, ws } = monorepo(t);
  assert.deepEqual(covered(ws, run(root, "cd packages/api && cd ../.. && npm test", "npm test", "", { dir: "packages/api/../.." })), ["web"]);
});

test("pnpm -w runs the root script", (t) => {
  const { root, ws } = monorepo(t, { test: "pnpm --filter web test" }, { "pnpm-workspace.yaml": "packages:\n  - 'packages/*'\n" });
  assert.deepEqual(covered(ws, run(root, "pnpm -w test", "pnpm test", "-w")), ["web"]);
});

test("the search for a monorepo stops at the git root", (t) => {
  const outer = tempDir(t);
  writeFiles(outer, { "package.json": { workspaces: ["*"] }, "app/.git/HEAD": "ref: refs/heads/main\n", "app/package.json": pkg("app") });
  assert.equal(findWorkspaces(path.join(outer, "app")), null);
});

test("only the folders the workspace globs point at are searched", (t) => {
  const { root } = monorepo(t, undefined, { "data/a/b/package.json": pkg("not-a-workspace") });
  assert.deepEqual(findWorkspaces(root).packages.map((p) => p.dir), ["packages/api", "packages/web"]);
});
