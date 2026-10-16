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
  assert.match(verdict.reason, /Run `npm test \| tail` again as a command on its own/);
  assert.match(verdict.reason, /no pipe, no `;`, `\|\|` or `&` after it/);
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

const checked = (entry, check, args = "") => ({ ...entry, check, args });

test("a plain passing run supersedes an earlier masked run of the same check", () => {
  const entries = [edit(), checked(run("printf x > a.js && npm test | tail", 0, true), "npm test"), checked(run("npm test"), "npm test")];
  assert.deepEqual(decide({ entries }), { allow: true });
});

test("a plain passing run supersedes an earlier failing run with arguments", () => {
  const entries = [edit(), checked(run("npm test -- --ci", 1), "npm test", "-- --ci"), checked(run("npm test"), "npm test")];
  assert.deepEqual(decide({ entries }), { allow: true });
});

test("a filtered passing run does not clear a failing full run", () => {
  const entries = [edit(), checked(run("npm test", 1), "npm test"), checked(run("npm test -- -t only-this"), "npm test", "-- -t only-this")];
  const verdict = decide({ entries });
  assert.equal(verdict.allow, false);
  assert.match(verdict.reason, /`npm test` exited with code 1/);
});
