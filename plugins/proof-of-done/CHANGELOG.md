# Changelog

## 0.4.2

- A check that failed before the last edit must run again: a different check passing (lint after a failing test) no longer clears it. The stop is blocked until that check runs again, or the report gives `Verification: skipped — <reason>`.

## 0.4.1

- `go test` where no package ran a test (`[no test files]`, `[no tests to run]`) and Jest or Vitest with `--passWithNoTests` that found nothing now count as 0 tests ran, so they no longer pass as proof.

## 0.4.0

- Asks about missing tests: when the session adds a code file or changes 20+ lines of code but adds or changes no test, Claude asks you once whether to add one. Say no and the report notes `No new tests: <reason>`. Small edits, styles, markup, config, docs and scripts are left alone, and subagents never ask.
- `tests` in `.claude/proof-of-done.json`: `"ask"` (default), `"strict"` (blocks until a test is added or a reason is given) or `"off"`.

## 0.3.0

- Catches test tampering: skipped or focused tests, weakened or always-true assertions, deleted tests, hidden errors (`@ts-ignore`, `eslint-disable`, `# noqa`) and lowered coverage thresholds, with file and line. An intended change is allowed when the report explains it on a `Test changes:` line.
- Records the commit each session starts from, so commits made during the session cannot hide a weakened test.
- `tamper: false` in `.claude/proof-of-done.json` turns these checks off.

## 0.2.0

- A test run that exits 0 but ran 0 tests (all skipped, or no test files found) no longer counts as proof.
- A check that fails and then passes with no edit in between is flagged as flaky; the stop is blocked until the report says so.
- `/proof` shows runs that ran 0 tests.

## 0.1.0

- First release: records verification evidence and blocks unverified stops.
