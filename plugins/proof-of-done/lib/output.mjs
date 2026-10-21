const ANSI = /\u001b\[[0-9;]*m/g;
// Summary lines of common test runners: node --test (TAP and spec), Jest, Vitest, pytest, Cargo, Mocha.
const SUMMARY_LINES = [
  /^(?:#|ℹ) (?:tests|pass|fail) \d+$/,
  /^Tests:\s.*\btotal$/,
  /^Tests\s{2,}.*\(\d+\)$/,
  /^=+ .* in [\d.]+s(?: \([^)]*\))? =+$/,
  /^test result: /,
  /^\d+ (?:passing|failing|pending)\b/,
];
const RAN = /^(?:#|ℹ) (?:pass|fail) (\d+)$|(\d+) (?:passed|failed|passing|failing)\b/g;

/** How many tests ran (passed + failed) according to the runner's summary, or null when no summary is found. */
export function testsRun(output) {
  if (typeof output !== "string") return null;
  const summary = output
    .replace(ANSI, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => SUMMARY_LINES.some((re) => re.test(line)));
  if (summary.length === 0) return null;
  return summary.reduce((sum, line) => sum + [...line.matchAll(RAN)].reduce((s, m) => s + Number(m[1] ?? m[2]), 0), 0);
}
