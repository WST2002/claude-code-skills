import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { covers, findWorkspaces, packageOf, uncoveredPackages } from "../lib/workspaces.mjs";
import { tempDir, writeFiles } from "./helpers.mjs";
import { entriesFor } from "../lib/evidence.mjs";

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

test("a cd inside a root script is resolved, so ../web means packages/web", (t) => {
  const { root, ws } = monorepo(t, { test: "cd packages/api && npm test && cd ../web && npm test" });
  assert.deepEqual(covered(ws, run(root, "npm test", "npm test")), ["api", "web"]);
});

test("workspace flags win over the folder the run started in", (t) => {
  const { root, ws } = monorepo(t);
  assert.deepEqual(covered(ws, run(path.join(root, "packages/api"), "pnpm --filter web test", "pnpm test", "--filter web")), ["web"]);
  const pnpm = monorepo(t, { test: "pnpm -r test" }, { "pnpm-workspace.yaml": "packages:\n  - 'packages/*'\n" });
  assert.deepEqual(covered(pnpm.ws, run(pnpm.root, "cd packages/api && pnpm -w test", "pnpm test", "-w", { dir: "packages/api" })), ["api", "web"]);
});

test("a nested package belongs to the innermost package folder", (t) => {
  const root = tempDir(t);
  writeFiles(root, {
    "package.json": { workspaces: ["packages/*", "packages/*/examples/*"] },
    "packages/ui/package.json": pkg("ui"),
    "packages/ui/examples/demo/package.json": pkg("demo"),
  });
  const ws = findWorkspaces(root);
  assert.equal(packageOf(path.join(root, "packages/ui/examples/demo/src/x.js"), root, ws).name, "demo");
  assert.deepEqual(covered(ws, run(root, "npm test -w packages/ui/examples/demo", "npm test", "-w packages/ui/examples/demo")), ["demo"]);
  // The outer package's tests often run the packages inside it (test apps, examples), so they count for them too.
  assert.deepEqual(covered(ws, run(root, "npm test -w packages/ui", "npm test", "-w packages/ui")), ["ui", "demo"]);
});

test("dependency selectors (api..., ...api, api^...) count for every package", (t) => {
  const { root, ws } = monorepo(t);
  for (const filter of ["api...", "...api", "api^...", "...^api"]) {
    assert.deepEqual(covered(ws, run(root, `pnpm --filter ${filter} test`, "pnpm test", `--filter ${filter}`)), ["api", "web"], filter);
  }
});

test("bun's own test runner covers every package", (t) => {
  const { root, ws } = monorepo(t, { test: "bun --filter api test" });
  assert.deepEqual(covered(ws, run(root, "bun test", "bun test", "", { runner: true })), ["api", "web"]);
});

test("a Git Bash absolute cd is read as a Windows path", { skip: process.platform !== "win32" }, (t) => {
  const { root, ws } = monorepo(t);
  const gitBash = path.join(root, "packages/web").replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`).split(path.sep).join("/");
  assert.deepEqual(covered(ws, run(root, `cd ${gitBash} && npm test`, "npm test", "", { dir: gitBash })), ["web"]);
});

test("pnpm-workspace.yaml with an inline list", (t) => {
  const root = tempDir(t);
  writeFiles(root, { "package.json": {}, "pnpm-workspace.yaml": "packages: ['packages/*', \"tools/*\"]\n", "packages/a/package.json": pkg("a"), "tools/b/package.json": pkg("b") });
  assert.deepEqual(findWorkspaces(root).packages.map((p) => p.dir), ["packages/a", "tools/b"]);
});

test("only test runs cover a package: a root script of another name covers the tests it runs, lint covers none", (t) => {
  const { root, ws } = monorepo(t, { check: "npm test -w packages/api", lint: "eslint .", test: "node --test" });
  assert.deepEqual(covered(ws, run(root, "npm run check", "npm check")), ["api"]);
  assert.deepEqual(covered(ws, run(root, "npm run lint", "npm lint")), []);
  assert.deepEqual(covered(ws, run(root, "npx tsc --noEmit", "npx tsc")), []);
  assert.deepEqual(covered(ws, run(root, "npm run lint -w packages/api", "npm lint", "-w packages/api")), []);
  assert.deepEqual(covered(ws, run(root, "npx vitest run", "npx vitest", "run")), ["api", "web"]);
});

test("folder names are compared without case on Windows", { skip: process.platform !== "win32" }, (t) => {
  const { root, ws } = monorepo(t);
  assert.equal(packageOf(path.join(root, "PACKAGES/WEB/src/x.js"), root, ws).name, "web");
});

test("a configured check stored whole is read again; an unrecognised one counts for every package", (t) => {
  const { root, ws } = monorepo(t);
  assert.deepEqual(covered(ws, run(root, "npm test -- --ci", "npm test -- --ci", "")), ["web"]);
  for (const command of ["npm run test:ci", "make ci"]) {
    assert.deepEqual(covered(ws, run(root, command, command, "")), ["api", "web"], command);
  }
});

test("a root script that mixes lint or build steps with test steps the parser cannot read covers every package", (t) => {
  for (const scripts of [
    { test: "npm run lint && npm run test:unit", lint: "eslint .", "test:unit": "npm test --workspaces" },
    { test: "npm run build && jest", build: "tsc" },
    { test: "npx tsc --noEmit && node --test packages" },
  ]) {
    const { root, ws } = monorepo(t, scripts);
    assert.deepEqual(covered(ws, run(root, "npm test", "npm test")), ["api", "web"], scripts.test);
  }
});

test("turbo with several tasks and nx test targets with a suffix are test runs", (t) => {
  const { root, ws } = monorepo(t);
  assert.deepEqual(covered(ws, run(root, "npx turbo run build test", "npx turbo run build", "test")), ["api", "web"]);
  assert.deepEqual(covered(ws, run(root, "turbo run lint test --filter=api", "turbo run lint", "test --filter=api")), ["api"]);
  assert.deepEqual(covered(ws, run(root, "npx nx run-many -t test:ci", "npx nx run-many", "-t test:ci")), ["api", "web"]);
  assert.deepEqual(covered(ws, run(root, "npx turbo run build lint", "npx turbo run build", "lint")), []);
});

test("a non-test script run in a folder outside every package covers no package", (t) => {
  const { root, ws } = monorepo(t);
  assert.deepEqual(covered(ws, run(root, "cd tools && npm run lint", "npm lint", "", { dir: "tools" })), []);
  assert.deepEqual(covered(ws, run(root, "cd tools && npm run build", "npm build", "", { dir: "tools" })), []);
});

test("words that only contain 'test' do not make a script look like tests", (t) => {
  for (const scripts of [{ test: "tsc -p tsconfig.test.json" }, { test: "npm run build:tests", "build:tests": "tsc" }, { test: "tsc -p tsconfig.test.json && echo ok" }]) {
    const { root, ws } = monorepo(t, scripts);
    assert.deepEqual(covered(ws, run(root, "npm test", "npm test")), [], scripts.test);
  }
});

test("a root script that calls itself stops instead of looping", (t) => {
  const { root, ws } = monorepo(t, { test: "npm test" });
  assert.deepEqual(covered(ws, run(root, "npm test", "npm test")), ["api", "web"]);
});

test("a package whose test script is npm's placeholder has no tests to run", (t) => {
  const { root, ws } = monorepo(t, undefined, { "packages/api/package.json": pkg("api", { test: 'echo "Error: no test specified" && exit 1' }) });
  const entries = [{ type: "edit", file: path.join(root, "packages/api/src/a.js"), cwd: root }, { ...run(root, "npm test", "npm test"), exitCode: 0, masked: false }];
  assert.deepEqual(uncoveredPackages(entries, ws, () => true), []);
});

test("a root script with no script of that name counts for every package only for test", (t) => {
  const { root, ws } = monorepo(t, { lint: "eslint ." });
  assert.deepEqual(covered(ws, run(root, "npm test", "npm test")), ["api", "web"]);
});

test("a root script that moves outside the repo counts for every package", (t) => {
  const { root, ws } = monorepo(t, { test: "cd /elsewhere && npm test -w packages/web" });
  assert.deepEqual(covered(ws, run(root, "npm test", "npm test")), ["api", "web"]);
});

test("bun: a script run is not bun's runner, and the runner in a package folder covers that package", (t) => {
  const { root, ws } = monorepo(t, { test: "bun --filter api test" }, { "bun.lock": "" });
  const at = (cwd, command) => entriesFor({ cwd, session_id: "s", hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command } }, { enabled: true, verify: null, ignore: [], error: null }, [])[0];
  assert.deepEqual(covered(ws, at(path.join(root, "packages/web"), "bun run test")), ["web"]);
  assert.deepEqual(covered(ws, at(root, "bun --filter web test")), ["web"]);
  assert.deepEqual(covered(ws, at(path.join(root, "packages/web"), "bun test")), ["web"]);
  assert.deepEqual(covered(ws, at(root, "bun test")), ["api", "web"]);
});

test("a folder/** workspace glob includes the folder itself", (t) => {
  const root = tempDir(t);
  writeFiles(root, { "package.json": { workspaces: ["packages/kit/test/**"] }, "packages/kit/test/package.json": pkg("kit-tests"), "packages/kit/test/apps/a/package.json": pkg("app-a") });
  assert.deepEqual(findWorkspaces(root).packages.map((p) => p.dir), ["packages/kit/test", "packages/kit/test/apps/a"]);
});

test("a run that covers a package also covers the packages nested inside it", (t) => {
  const root = tempDir(t);
  writeFiles(root, {
    "pnpm-workspace.yaml": "packages:\n  - 'packages/*'\n  - 'packages/kit/test/apps/*'\n",
    "package.json": {},
    "packages/kit/package.json": pkg("@sveltejs/kit", { test: "pnpm -r --filter=./test/** test" }),
    "packages/kit/test/apps/basics/package.json": pkg("test-basics"),
    "packages/other/package.json": pkg("other"),
  });
  const ws = findWorkspaces(root);
  assert.deepEqual(covered(ws, run(root, "pnpm --filter @sveltejs/kit test", "pnpm test", "--filter @sveltejs/kit")), ["@sveltejs/kit", "test-basics"]);
});

test("hyphenated test steps in a root script look like tests", (t) => {
  const { root, ws } = monorepo(t, { test: "pnpm test-unit && pnpm test-serve" });
  assert.deepEqual(covered(ws, run(root, "pnpm test", "pnpm test")), ["api", "web"]);
});

test("nx: project names from package.json nx.name, project:target runs, affected and --exclude", (t) => {
  const root = tempDir(t);
  writeFiles(root, {
    "package.json": { workspaces: ["packages/*"] },
    "packages/eslint-plugin/package.json": { name: "@typescript-eslint/eslint-plugin", nx: { name: "eslint-plugin" }, scripts: { test: "vitest" } },
    "packages/parser/package.json": pkg("@typescript-eslint/parser"),
    "packages/integration-tests/package.json": pkg("integration-tests"),
  });
  const ws = findWorkspaces(root);
  assert.deepEqual(covered(ws, run(root, "npx nx test eslint-plugin", "npx nx test", "eslint-plugin")), ["@typescript-eslint/eslint-plugin"]);
  assert.deepEqual(covered(ws, run(root, "npx nx run eslint-plugin:test", "npx nx run", "eslint-plugin:test")), ["@typescript-eslint/eslint-plugin"]);
  assert.deepEqual(covered(ws, run(root, "npx nx run eslint-plugin:build", "npx nx run", "eslint-plugin:build")), []);
  assert.deepEqual(covered(ws, run(root, "npx nx affected -t test", "npx nx affected", "-t test")).length, 3);
  assert.deepEqual(covered(ws, run(root, "nx run-many -t test --exclude integration-tests", "nx run-many", "-t test --exclude integration-tests")), ["@typescript-eslint/eslint-plugin", "@typescript-eslint/parser"]);
});

test("yarn 1 workspaces run test covers every package", (t) => {
  const { root, ws } = monorepo(t);
  assert.deepEqual(covered(ws, run(root, "yarn workspaces run test", "yarn test", "workspaces")), ["api", "web"]);
});
