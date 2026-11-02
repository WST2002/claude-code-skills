import path from "node:path";
import { tamperReason } from "./tamper.mjs";
import { uncoveredReason } from "./coverage.mjs";
import { untestedReason } from "./untested.mjs";
import { packageTestCommand, uncoveredPackages } from "./workspaces.mjs";

const SKIP_LINE = /Verification:\s*skipped\s*[—–-]+\s*(.+)/i;
const TEST_CHANGES_LINE = /^\s*Test changes:\s*(.+)$/im;
const NO_NEW_TESTS_LINE = /^\s*No new tests:\s*(.+)$/im;
const UNCOVERED_LINE = /^\s*Uncovered lines:\s*(.+)$/im;
const FLAKY_MENTION = /\bflak(?:y|e[sd]?|iness)\b/i;
const MIN_SKIP_REASON = 10;
const MAX_FILES_LISTED = 5;
const SKIP_HINT = 'If verification is impossible, end your message with "Verification: skipped — <reason>".';

export const isPassing = (entry) => entry.exitCode === 0 && !entry.masked && entry.testsRun !== 0;

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
    const rerun = entry.check ? `${entry.check} ${entry.args ?? ""}`.trim() : entry.command;
    return `\`${entry.command}\` ran with its exit code hidden, so it does not count as proof. Run \`${rerun}\` again as a command on its own: no pipe, no \`;\`, \`||\` or \`&\` after it. Then report the result.`;
  }
  if (entry.testsRun === 0) {
    return `\`${entry.command}\` exited 0 but ran 0 tests (every test was skipped, or none were found), so it does not count as proof. Run tests that cover your change, or report honestly that none ran. ${SKIP_HINT}`;
  }
  return `\`${entry.command}\` was interrupted, so its result is unknown. Run it again and report the result.`;
}

const hasFailed = (entry) => entry.exitCode !== 0 && entry.exitCode !== null;

function flakyReason(entry) {
  return `\`${entry.command}\` passed, but the same check failed (exit ${entry.earlierFailure.exitCode}) after your last edit with no code change in between, so it looks flaky or something outside the code changed. Say in your report that the check is flaky and what you know about why, or fix the cause.`;
}

// The latest run of each check. A run without arguments also replaces earlier runs of the same check
// with arguments. Each run remembers a failure it replaced: with no edit in between, that is a flaky pass.
function latestRunPerCheck(runs) {
  const latest = new Map();
  for (const run of runs) {
    const check = run.check ?? run.command;
    const args = run.args ?? "";
    const key = `${check}\u0000${args}`;
    const replaced = [...latest].filter(([k, previous]) => k === key || (args === "" && (previous.check ?? previous.command) === check));
    for (const [k] of replaced) latest.delete(k);
    const failure = replaced.map(([, previous]) => (hasFailed(previous) ? previous : previous.earlierFailure)).find(Boolean);
    latest.set(key, failure ? { ...run, earlierFailure: failure } : run);
  }
  return latest;
}

function staleFailureReason(entry) {
  return `\`${entry.command}\` failed (exit ${entry.exitCode}) before your last edit and has not run since, so the failure may still be there. Run it again and report the result. ${SKIP_HINT}`;
}

// A check whose latest run in the session failed before the last edit: a different check passing does not clear it.
function staleFailure(entries, lastEdit) {
  const runs = entries.map((e, at) => ({ ...e, at })).filter((e) => e.type === "verify");
  return [...latestRunPerCheck(runs).values()].find((e) => e.at < lastEdit && hasFailed(e));
}

const explained = (pattern, message) => {
  const match = pattern.exec(message ?? "");
  return Boolean(match && match[1].trim().length >= MIN_SKIP_REASON);
};

// In a monorepo, a run at the root can test some packages and not others: each changed package with tests needs
// a passing run after its last edit that covers it.
function packagesReason(packages, ws, runs) {
  const changed = packages.map((p) => p.dir).join(", ");
  const ran = [...new Set(runs.map((e) => `\`${e.command}\``))].join(", ");
  const commands = packages.map((p) => `\`${packageTestCommand(p, ws)}\``).join(", ");
  return `You changed code in ${changed}, but the checks after your last edit there (${ran}) did not run ${packages.length === 1 ? "that package's" : "those packages'"} tests. Run: ${commands}. Then report the results. ${SKIP_HINT}`;
}

function verificationProblem(entries, lastEdit, lastMessage, verifyCommands, workspaces) {
  if (explained(SKIP_LINE, lastMessage)) return null;
  const runs = entries.slice(lastEdit + 1).filter((e) => e.type === "verify");
  if (runs.length === 0) return unverifiedReason(entries, verifyCommands);
  const latest = [...latestRunPerCheck(runs).values()];
  const failing = latest.find((e) => !isPassing(e));
  if (failing) return failedReason(failing);
  const stale = staleFailure(entries, lastEdit);
  if (stale) return staleFailureReason(stale);
  const uncovered = workspaces ? uncoveredPackages(entries, workspaces, isPassing) : [];
  if (uncovered.length) return packagesReason(uncovered, workspaces, runs);
  const flaky = latest.find((e) => e.earlierFailure);
  return flaky && !FLAKY_MENTION.test(lastMessage ?? "") ? flakyReason(flaky) : null;
}

// In "ask" mode the user is asked about each file once; in "strict" mode only a stated reason lets it through.
function untestedProblem(entries, untested, testsMode, lastMessage) {
  if (testsMode === "off" || explained(NO_NEW_TESTS_LINE, lastMessage)) return null;
  const asked = new Set(entries.filter((e) => e.type === "tests-asked").flatMap((e) => e.files));
  const files = testsMode === "strict" ? untested : untested.filter((f) => !asked.has(f.file));
  return files.length ? { reason: untestedReason(files, testsMode), files: files.map((f) => f.file) } : null;
}

// Changed lines that a fresh coverage report shows never ran: asked about once per file, like missing tests.
function uncoveredProblem(entries, coverage, lastMessage) {
  if (!coverage || coverage.mode === "off" || !coverage.uncovered.length || explained(UNCOVERED_LINE, lastMessage)) return null;
  const asked = new Set(entries.filter((e) => e.type === "coverage-asked").flatMap((e) => e.files));
  const files = coverage.mode === "strict" ? coverage.uncovered : coverage.uncovered.filter((u) => !asked.has(u.file));
  return files.length ? { reason: uncoveredReason(files, coverage.reports, coverage.root, coverage.mode), files: files.map((u) => u.file) } : null;
}

/**
 * `tampering`: test changes from findTampering that can make checks pass without a fix.
 * `untested`: code changed with no test change, from findUntested; `testsMode` is "ask", "strict" or "off".
 * `workspaces`: the monorepo from findWorkspaces, or null; then each changed package's tests must have run.
 * `coverage`: { uncovered, reports, root, mode } from a fresh coverage report, or null.
 * A block that asks the user about untested files returns them as `askedAbout`, and about uncovered lines as
 * `askedCoverage`, so they are not asked about again.
 */
export function decide({ entries, lastMessage = "", stopHookActive = false, verifyCommands = [], tampering = [], untested = [], testsMode = "ask", workspaces = null, coverage = null }) {
  if (stopHookActive) return { allow: true };
  const lastEdit = entries.findLastIndex((e) => e.type === "edit");
  if (lastEdit === -1) return { allow: true };
  const missingTests = untestedProblem(entries, untested, testsMode, lastMessage);
  const verification = verificationProblem(entries, lastEdit, lastMessage, verifyCommands, workspaces);
  // Uncovered lines only matter once the tests ran and passed after the last edit.
  const uncovered = verification ? null : uncoveredProblem(entries, coverage, lastMessage);
  const problems = [
    verification,
    tampering.length && !explained(TEST_CHANGES_LINE, lastMessage) ? tamperReason(tampering) : null,
    missingTests?.reason,
    uncovered?.reason,
  ].filter(Boolean);
  if (!problems.length) return { allow: true };
  const verdict = { allow: false, reason: problems.join("\n\n") };
  if (missingTests && testsMode === "ask") verdict.askedAbout = missingTests.files;
  if (uncovered && coverage.mode === "ask") verdict.askedCoverage = uncovered.files;
  return verdict;
}
