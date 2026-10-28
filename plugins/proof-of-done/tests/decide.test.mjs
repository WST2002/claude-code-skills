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

test("a fail then a pass with no edit in between is flagged as flaky", () => {
  const verdict = decide({ entries: [edit(), run("npm test", 1), run("npm test")] });
  assert.equal(verdict.allow, false);
  assert.match(verdict.reason, /`npm test` passed, but the same check failed \(exit 1\) after your last edit/);
  assert.match(verdict.reason, /looks flaky/);
});

test("a flaky pass is allowed once the report says it is flaky", () => {
  const lastMessage = "Fixed the parser. Note: npm test is flaky, it failed once on a timeout.";
  assert.deepEqual(decide({ entries: [edit(), run("npm test", 1), run("npm test")], lastMessage }), { allow: true });
});

test("a failure before the last edit is not flaky", () => {
  assert.deepEqual(decide({ entries: [edit(), run("npm test", 1), edit(), run("npm test")] }), { allow: true });
});

test("a masked run before a pass is not flaky", () => {
  const entries = [edit(), checked(run("npm test | tail", 0, true), "npm test"), checked(run("npm test"), "npm test")];
  assert.deepEqual(decide({ entries }), { allow: true });
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

test("a run that passed with 0 tests does not count", () => {
  const verdict = decide({ entries: [edit(), { ...run("npm test"), testsRun: 0 }] });
  assert.equal(verdict.allow, false);
  assert.match(verdict.reason, /`npm test` exited 0 but ran 0 tests/);
});

test("a run that passed with tests counts", () => {
  assert.deepEqual(decide({ entries: [edit(), { ...run("npm test"), testsRun: 4 }] }), { allow: true });
});

test("a later run with tests clears an earlier empty run", () => {
  const entries = [edit(), checked({ ...run("npm test"), testsRun: 0 }, "npm test"), checked({ ...run("npm test"), testsRun: 4 }, "npm test")];
  assert.deepEqual(decide({ entries }), { allow: true });
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

test("a plain passing run supersedes an earlier failing run with arguments, as a flaky pass", () => {
  const entries = [edit(), checked(run("npm test -- --ci", 1), "npm test", "-- --ci"), checked(run("npm test"), "npm test")];
  assert.match(decide({ entries }).reason, /looks flaky/);
  assert.deepEqual(decide({ entries, lastMessage: "npm test -- --ci flaked once" }), { allow: true });
});

test("a flaky failure is remembered across later passes", () => {
  const entries = [edit(), checked(run("npm test", 1), "npm test"), checked(run("npm test"), "npm test"), checked(run("npm test"), "npm test")];
  assert.match(decide({ entries }).reason, /looks flaky/);
});

test("a filtered passing run does not clear a failing full run", () => {
  const entries = [edit(), checked(run("npm test", 1), "npm test"), checked(run("npm test -- -t only-this"), "npm test", "-- -t only-this")];
  const verdict = decide({ entries });
  assert.equal(verdict.allow, false);
  assert.match(verdict.reason, /`npm test` exited with code 1/);
});

test("a failing check is not cleared by a different check passing after a later edit", () => {
  const entries = [edit(), checked(run("npm test", 1), "npm test"), edit(), checked(run("npm run lint"), "npm lint")];
  const verdict = decide({ entries });
  assert.equal(verdict.allow, false);
  assert.match(verdict.reason, /`npm test` failed \(exit 1\) before your last edit and has not run since/);
});

test("a failing check run again and passing after the last edit: allow", () => {
  const entries = [edit(), checked(run("npm test", 1), "npm test"), edit(), checked(run("npm run lint"), "npm lint"), checked(run("npm test"), "npm test")];
  assert.deepEqual(decide({ entries }), { allow: true });
});

test("a failing filtered run is cleared by a full run of the same check after the last edit", () => {
  const entries = [edit(), checked(run("npm test -- a.test.js", 1), "npm test", "-- a.test.js"), edit(), checked(run("npm test"), "npm test")];
  assert.deepEqual(decide({ entries }), { allow: true });
});

test("a check that failed and then passed before the last edit is not stale", () => {
  const entries = [edit(), checked(run("npm test", 1), "npm test"), edit(), checked(run("npm test"), "npm test"), edit(), checked(run("npm run lint"), "npm lint")];
  assert.deepEqual(decide({ entries }), { allow: true });
});

test("a masked or interrupted run before the last edit is not stale", () => {
  const entries = [edit(), checked(run("npm test | tail", 0, true), "npm test"), checked(run("npm run build", null), "npm build"), edit(), checked(run("npm run lint"), "npm lint")];
  assert.deepEqual(decide({ entries }), { allow: true });
});

test("a stale failure is allowed with an honest skip line", () => {
  const entries = [edit(), checked(run("npm test", 1), "npm test"), edit(), checked(run("npm run lint"), "npm lint")];
  const lastMessage = "Fixed lint.\n\nVerification: skipped — npm test needs the staging database";
  assert.deepEqual(decide({ entries, lastMessage }), { allow: true });
});

const skipped = [{ file: "src/a.test.js", line: 3, kind: "skipped", text: 'it.skip("adds")' }];

test("passing checks with a skipped test still block, naming the line", () => {
  const verdict = decide({ entries: [edit(), run("npm test")], tampering: skipped });
  assert.equal(verdict.allow, false);
  assert.match(verdict.reason, /src\/a\.test\.js:3 skips or focuses tests: `it\.skip\("adds"\)`/);
});

test("a stated reason for a test change allows the stop", () => {
  const lastMessage = "Done.\nTest changes: skipped the coupon test until the API returns the new field (ticket 42).";
  assert.deepEqual(decide({ entries: [edit(), run("npm test")], tampering: skipped, lastMessage }), { allow: true });
});

test("a too-short test change reason does not count", () => {
  assert.equal(decide({ entries: [edit(), run("npm test")], tampering: skipped, lastMessage: "Test changes: ok" }).allow, false);
});

test("missing verification and test tampering are reported together", () => {
  const verdict = decide({ entries: [edit()], tampering: skipped });
  assert.match(verdict.reason, /ran no verification after your last edit/);
  assert.match(verdict.reason, /\n\nThese changes can make checks pass without fixing anything:/);
});

test("skipping verification honestly does not excuse test tampering", () => {
  const lastMessage = "Verification: skipped — no test runner installed on this machine";
  assert.equal(decide({ entries: [edit()], tampering: skipped, lastMessage }).allow, false);
});

const untested = [{ file: "src/coupon.js", lines: 12, created: true }];

test("code with no test change: ask the user once, naming the file", () => {
  const verdict = decide({ entries: [edit(), run("npm test")], untested });
  assert.equal(verdict.allow, false);
  assert.match(verdict.reason, /You changed src\/coupon\.js, but no test was added or changed/);
  assert.match(verdict.reason, /Ask the user once/);
  assert.deepEqual(verdict.askedAbout, ["src/coupon.js"]);
});

test("files the user was already asked about are not asked about again", () => {
  const entries = [edit(), run("npm test"), { type: "tests-asked", files: ["src/coupon.js"] }];
  assert.deepEqual(decide({ entries, untested }), { allow: true });
  const more = [...untested, { file: "src/cart.js", lines: 30, created: false }];
  const verdict = decide({ entries, untested: more });
  assert.match(verdict.reason, /You changed src\/cart\.js, but/);
  assert.deepEqual(verdict.askedAbout, ["src/cart.js"]);
});

test("a stated reason for no new tests allows the stop", () => {
  const lastMessage = "Done.\nNo new tests: the user said this is a throwaway prototype.";
  assert.deepEqual(decide({ entries: [edit(), run("npm test")], untested, lastMessage }), { allow: true });
  assert.equal(decide({ entries: [edit(), run("npm test")], untested, lastMessage: "No new tests: no" }).allow, false);
});

test("strict mode asks for tests every time and never records a question", () => {
  const entries = [edit(), run("npm test"), { type: "tests-asked", files: ["src/coupon.js"] }];
  const verdict = decide({ entries, untested, testsMode: "strict" });
  assert.match(verdict.reason, /Add or update tests that cover this change/);
  assert.equal(verdict.askedAbout, undefined);
});

test("tests mode off never asks", () => {
  assert.deepEqual(decide({ entries: [edit(), run("npm test")], untested, testsMode: "off" }), { allow: true });
});

test("missing verification and missing tests are reported together", () => {
  const verdict = decide({ entries: [edit()], untested });
  assert.match(verdict.reason, /ran no verification after your last edit/);
  assert.match(verdict.reason, /\n\nYou changed src\/coupon\.js/);
});
