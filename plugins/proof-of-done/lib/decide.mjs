import path from "node:path";

const SKIP_LINE = /Verification:\s*skipped\s*[—–-]+\s*(.+)/i;
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

export function decide({ entries, lastMessage = "", stopHookActive = false, verifyCommands = [] }) {
  if (stopHookActive) return { allow: true };
  const lastEdit = entries.findLastIndex((e) => e.type === "edit");
  if (lastEdit === -1) return { allow: true };
  const skip = SKIP_LINE.exec(lastMessage ?? "");
  if (skip && skip[1].trim().length >= MIN_SKIP_REASON) return { allow: true };

  const runs = entries.slice(lastEdit + 1).filter((e) => e.type === "verify");
  if (runs.length === 0) return { allow: false, reason: unverifiedReason(entries, verifyCommands) };

  const latest = [...latestRunPerCheck(runs).values()];
  const failing = latest.find((e) => !isPassing(e));
  if (failing) return { allow: false, reason: failedReason(failing) };
  const flaky = latest.find((e) => e.earlierFailure);
  return flaky && !FLAKY_MENTION.test(lastMessage ?? "") ? { allow: false, reason: flakyReason(flaky) } : { allow: true };
}
