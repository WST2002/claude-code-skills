// Finds code changes made with no test change, in a unified diff (git diff -U0).
import { isTestFile, parseDiff } from "./tamper.mjs";

// Changes to these rarely need a test of their own: styles, markup, data, config, docs, assets and scripts.
const NO_TEST_NEEDED = [
  /\.(css|scss|sass|less|styl|html?|svg|json5?|jsonc|ya?ml|toml|ini|cfg|conf|env|xml|properties|md|mdx|txt|rst|lock|png|jpe?g|gif|webp|ico|pdf|snap|d\.ts)$/i,
  /(^|\/)\.[^/]+$/,
  /(^|\/)[^/]+\.config\.[cm]?[jt]s$/,
  /(^|\/)(Dockerfile|Makefile|LICENSE|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/,
  /(^|\/)(docs?|migrations?|fixtures?|scripts|\.github)\//,
];
// A new file with at least this many lines, or this many changed lines in all, is worth a test; less is a small change.
const NEW_FILE_LINES = 5;
const BIG_CHANGE_LINES = 20;
const MAX_FILES_LISTED = 5;

const needsTest = (file) => !isTestFile(file) && !NO_TEST_NEEDED.some((re) => re.test(file));
const changedLines = (file) => file.hunks.reduce((sum, h) => sum + [...h.added, ...h.removed].filter((l) => l.text.trim()).length, 0);

/**
 * Code files changed with no test file added or changed: [{ file, lines, created }], or [] when the change is small
 * or a test changed too. `ignore(file)` leaves a file out; `edited(file)` limits the check to files the session edited.
 */
export function findUntested(diff, ignore = () => false, edited = () => true) {
  const files = parseDiff(diff).filter((f) => !f.deleted && !ignore(f.path));
  if (files.some((f) => isTestFile(f.path) && f.hunks.some((h) => h.added.length))) return [];
  const code = files.filter((f) => needsTest(f.path) && edited(f.path)).map((f) => ({ file: f.path, lines: changedLines(f), created: f.created }));
  const big = code.some((f) => f.created && f.lines >= NEW_FILE_LINES) || code.reduce((sum, f) => sum + f.lines, 0) >= BIG_CHANGE_LINES;
  return big ? code.filter((f) => f.lines > 0) : [];
}

function fileList(untested) {
  const shown = untested.slice(0, MAX_FILES_LISTED).map((f) => f.file).join(", ");
  return untested.length > MAX_FILES_LISTED ? `${shown} and ${untested.length - MAX_FILES_LISTED} more` : shown;
}

export function untestedReason(untested, mode) {
  const changed = `You changed ${fileList(untested)}, but no test was added or changed in this session.`;
  if (mode === "strict") {
    return `${changed} Add or update tests that cover this change and run them. If a test really cannot be written, explain why in your report on a line starting "No new tests:".`;
  }
  return `${changed} Ask the user once whether you should add a test for it, then stop and wait for the answer. If they say yes, write the test and run it. If they say no, say so in your report on a line starting "No new tests:". Do not ask again about these files.`;
}
