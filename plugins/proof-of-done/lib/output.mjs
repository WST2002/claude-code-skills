const ANSI = /\u001b\[[0-9;]*m/g;
// Summary lines of common test runners: node --test (TAP and spec), Jest, Vitest, pytest, Cargo, Mocha; go test package lines.
const SUMMARY_LINES = [
  /^(?:#|ℹ) (?:tests|pass|fail) \d+$/,
  /^Tests:\s.*\btotal$/,
  /^Tests\s{2,}.*\(\d+\)$/,
  /^=+ .* in [\d.]+s(?: \([^)]*\))? =+$/,
  /^test result: /,
  /^\d+ (?:passing|failing|pending)\b/,
];
const RAN = /^(?:#|ℹ) (?:pass|fail) (\d+)$|(\d+) (?:passed|failed|passing|failing)\b/g;
// Jest and Vitest with --passWithNoTests exit 0 with only this line.
const NONE_FOUND = /^No tests? (?:files )?found, exiting with code 0$/;
// go test prints one line per package and no count: "?  pkg [no test files]", "ok  pkg 0.01s [no tests to run]", "ok  pkg 0.01s", "FAIL pkg".
const GO_PACKAGE = /^(ok|FAIL|\?)\s+\S+\s+(.*)$/;
const GO_NOTHING_RAN = /\[no test files\]|\[no tests to run\]/;

/** go test ran 0 tests when it printed package lines and none of them ran a test; otherwise the count is unknown. */
function goTestsRun(lines) {
  const packages = lines.map((line) => line.match(GO_PACKAGE)).filter(Boolean);
  if (packages.length === 0) return null;
  return packages.every(([, , rest]) => GO_NOTHING_RAN.test(rest)) ? 0 : null;
}

/** How many tests ran (passed + failed) according to the runner's summary, or null when no summary is found. */
export function testsRun(output) {
  if (typeof output !== "string") return null;
  const lines = output
    .replace(ANSI, "")
    .split(/\r?\n/)
    .map((line) => line.trim());
  if (lines.some((line) => NONE_FOUND.test(line))) return 0;
  const summary = lines.filter((line) => SUMMARY_LINES.some((re) => re.test(line)));
  if (summary.length === 0) return goTestsRun(lines);
  return summary.reduce((sum, line) => sum + [...line.matchAll(RAN)].reduce((s, m) => s + Number(m[1] ?? m[2]), 0), 0);
}
