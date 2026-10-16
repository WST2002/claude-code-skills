import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkRepo } from "../lib/preflight.mjs";

const script = path.resolve(import.meta.dirname, "../scripts/preflight.mjs");

function tempRepo(t, { commit = true, remote = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itp-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: dir, stdio: "pipe" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "fixture@example.com");
  git("config", "user.name", "Fixture");
  if (commit) {
    fs.writeFileSync(path.join(dir, "a.txt"), "a\n");
    git("add", "a.txt");
    git("commit", "-qm", "init");
  }
  if (remote) git("remote", "add", "origin", "https://github.com/acme/shop.git");
  return dir;
}

test("a clean repo with a remote is ready", (t) => {
  const result = checkRepo(tempRepo(t));
  assert.equal(result.ok, true);
  assert.deepEqual(result.problems, []);
  assert.equal(result.currentBranch, "main");
  assert.equal(result.remote, "https://github.com/acme/shop.git");
});

test("uncommitted changes are a problem with a fix", (t) => {
  const dir = tempRepo(t);
  fs.writeFileSync(path.join(dir, "a.txt"), "changed\n");
  const result = checkRepo(dir);
  assert.equal(result.ok, false);
  assert.match(result.problems[0].what, /uncommitted changes/);
  assert.match(result.problems[0].fix, /git stash/);
});

test("a missing origin remote is a problem", (t) => {
  const result = checkRepo(tempRepo(t, { remote: false }));
  assert.equal(result.ok, false);
  assert.match(result.problems.map((p) => p.what).join(" "), /no "origin" remote/);
});

test("outside a git repository", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itp-plain-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const result = checkRepo(dir);
  assert.equal(result.ok, false);
  assert.match(result.problems[0].what, /not a git repository/);
});

test("the script prints JSON and always exits 0", (t) => {
  const dir = tempRepo(t);
  const run = spawnSync(process.execPath, [script], { cwd: dir, encoding: "utf8" });
  assert.equal(run.status, 0);
  const result = JSON.parse(run.stdout);
  assert.equal(result.currentBranch, "main");
  assert.ok(["ok", "missing", "not-logged-in"].includes(result.gh));
});
