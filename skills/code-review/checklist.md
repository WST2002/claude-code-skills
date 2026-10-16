# Code review checklist

## Correctness

- Off-by-one in loops, slices, pagination and ranges.
- Inverted or incomplete conditions (`&&` vs `||`, missing `else`, wrong comparison operator).
- `null` / `undefined` / `None` / empty collection paths, including values from callers that were not changed.
- Integer overflow, float comparison, rounding of money.
- Dates and time zones: local vs UTC, DST, end-of-month arithmetic.
- Changed default values or argument order that callers rely on.

## Async and concurrency

- Promises not awaited; errors from un-awaited calls lost.
- Shared mutable state across requests, threads or goroutines.
- Check-then-act races (read, decide, write without a lock or transaction).
- Retries without idempotency; timeouts missing on network calls.

## Error handling

- Errors swallowed (`catch {}`), logged and then continued as if successful.
- Wrong error type caught; broad catches hiding real failures.
- Partial writes with no rollback or transaction.

## Resources

- Files, connections, streams, listeners or timers opened but not closed or removed.
- Unbounded caches, queues or arrays that grow per request.

## Security

- User input reaching queries, shell, file paths, HTML or redirects without validation or escaping.
- Missing authorization or ownership checks on new endpoints.
- Secrets or personal data in code, logs or error messages.

## Contracts

- Public API, schema, event or config changes that break existing callers.
- Database migrations that lock tables or drop data.
- Feature flags and configuration defaults for new behavior.

## Tests

- New behavior without a test for its main path and its riskiest edge case.
- Assertions loosened, tests skipped or deleted to make the suite pass.
- Tests that pass for the wrong reason (mocks returning the expected value).

## Do not report as defects

- Formatting and naming preferences a linter or formatter handles.
- Alternative designs that are not clearly better for this change.
