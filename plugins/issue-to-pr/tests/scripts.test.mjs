import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const scripts = path.resolve(import.meta.dirname, "../scripts");
const run = (script, args, cwd) => spawnSync(process.execPath, [path.join(scripts, script), ...args], { cwd, encoding: "utf8" });

test("ticket.mjs returns free text as-is", () => {
  const result = run("ticket.mjs", ["Checkout total ignores coupon"]);
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), { kind: "text", text: "Checkout total ignores coupon", title: "Checkout total ignores coupon" });
});

test("ticket.mjs explains invalid input", () => {
  const result = run("ticket.mjs", ["https://github.com/acme/shop/pull/7"]);
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).reason, "That is a pull request, not an issue.");
});

test("ticket.mjs passes Jira keys through for the Atlassian tools", () => {
  assert.deepEqual(JSON.parse(run("ticket.mjs", ["proj-12"]).stdout), { kind: "jira", key: "PROJ-12" });
});

test("branch.mjs avoids branches that already exist", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itp-branch-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: dir, stdio: "pipe" });
  git("init", "-q", "-b", "main");
  git("-c", "user.email=f@example.com", "-c", "user.name=F", "commit", "-q", "--allow-empty", "-m", "init");
  git("branch", "fix/5-broken-login");
  const result = run("branch.mjs", ["--id", "5", "--title", "Broken login", "--labels", "bug"], dir);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "fix/5-broken-login-2");
});
