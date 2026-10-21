# Changelog

## 0.2.0

- A test run that exits 0 but ran 0 tests (all skipped, or no test files found) no longer counts as proof.
- A check that fails and then passes with no edit in between is flagged as flaky; the stop is blocked until the report says so.
- `/proof` shows runs that ran 0 tests.

## 0.1.0

- First release: records verification evidence and blocks unverified stops.
