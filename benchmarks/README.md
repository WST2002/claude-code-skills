# Benchmarks

How the skills were tested: the same task, on the same sample project, run once **without** the skill and once **with** it, in Claude Code (October 2026). Each sample project has seeded problems and an answer key.

> The code in these folders is **intentionally broken and insecure**. It exists only to test the skills. Do not run or deploy it. Credentials in them are fake.

## Summary

All 27 skills are benchmarked.

| Skill | Answer key covered (without → with skill) | What the skill added |
|---|---|---|
| [security-audit](#security-audit--fixture--answer-key) | 10/10 → 10/10 | Fix code, attack request and confidence for every finding |
| [code-review](#code-review--before--after--answer-key) | 7/7 → 7/7 | Verdict first, fewer nitpicks · severity rule fixed |
| [test-case-generator](#test-case-generator--story--answer-key) | 14/14 → 14/14 | Priority, type, preconditions, coverage table |
| [bug-debugger](#bug-debugger--fixture--answer-key) | root cause → root cause | Bug / cause / fix / proof report |
| [api-design-review](#api-design-review--fixture--answer-key) | 10/10 → 10/10 | Corrected endpoint table, migration plan |
| [database-schema-design](#database-schema-design--fixture--answer-key) | 9/9 → 9/9 | Full corrected schema, migration risk |
| [git-commit-writer](#git-commit-writer--setup-script--answer-key) | one commit → three commits | Split commands · identity rule fixed |
| [readme-writer](#readme-writer--fixture--answer-key) | facts correct → facts correct | `TODO` instead of invented URL, known issues |
| [web-performance-audit](web-performance-audit) | 9/9 → 9/9 | Expected gain per fix (LCP, CLS, KB) |
| [accessibility-audit](accessibility-audit) | 9/9 → 9/9 | WCAG criterion and affected users per finding |
| [seo-audit](seo-audit) | 9/9 → 9/9 | Fix per page template |
| [test-writer](test-writer) | all cases → all cases (13 → 18 tests) | Proved the tests catch bugs by breaking the code 5 times |
| [refactor-planner](refactor-planner) | tests first, behaviour kept → same | Tests that pin odd behaviour before refactoring |
| [playwright-e2e-tests](playwright-e2e-tests) | user-facing locators → same | Logs in once and reuses the session (`storageState`) |
| [api-test-writer](api-test-writer) | all endpoints → all endpoints | More status, header and auth assertions |
| [flaky-test-fixer](flaky-test-fixer) | both causes fixed, 10/10 runs → same | Fully controlled randomness instead of looser assertions |
| [dockerize-app](dockerize-app) | localhost bind + empty lockfile found → same | Pinned multi-stage build · secrets warning fixed |
| [github-actions-ci](github-actions-ci) | pnpm detected, all checks → same | Least-privilege `permissions: contents: read` |
| [bug-report-writer](bug-report-writer) | two reports → two reports | Only the relevant log line, unknowns marked |
| [test-plan-writer](test-plan-writer) | risks covered → same | Measurable entry and exit criteria |
| [prd-writer](prd-writer) | — (baseline produced a cloud doc) → full PRD | Baseline → target → time frame, "proposed" instead of invented numbers |
| [changelog-writer](changelog-writer) | 2.0.0 + migration → same | Same quality; consistent format |
| [codebase-onboarding](codebase-onboarding) | stale README caught, 6/6 flow → same | Ports and setup steps verified from config |
| [dependency-upgrade](dependency-upgrade) | breaking changes found → same | Warns against `--force` |
| [architecture-diagram](architecture-diagram) | text only, no diagram → Mermaid diagram | Subgraphs, labelled arrows, no invented parts |
| [figma-design-compare](#figma-design-compare--fixture--answer-key) | 10/10 → 10/10, 1 false alarm → 0 | `file:line` and fix for every mismatch, impact rating |
| [proof-of-done-lite](proof-of-done-lite) | change made, no receipt → change + test + receipt | `Verified: npm test ✓` receipt |

Fixtures and answer keys for each are in the linked folders. Detailed write-ups for the first eight and figma-design-compare follow.

## Results

### security-audit — [fixture](security-audit/fixture) · [answer key](security-audit/answer-key.md)

Prompt: *"Do a security review of this project."* · 10 real vulnerabilities, 3 safe decoys.

| | Without skill | With skill |
|---|---|---|
| Vulnerabilities found | 10 / 10 | 10 / 10 |
| False alarms on decoys | 0 | 0 |
| Fix code for every finding | Some | Every finding |
| Exact attack request per finding | Some | Every finding |
| Confidence per finding | No | Yes |
| "Checked and clean" list | Short | Every vulnerability class |

### code-review — [before](code-review/before) · [after](code-review/after) · [answer key](code-review/answer-key.md)

Prompt: *"Review the changes on this branch against main."* · 7 real defects, 4 style-only changes.

| | Without skill | With skill |
|---|---|---|
| Defects found | 7 / 7 | 7 / 7 |
| Style nitpicks | 2 | 1 |
| Verdict on the first line | No | Yes |
| Separate questions for the author | No | Yes |
| Removed null guard rated correctly | Major | Minor → **fixed in the skill** → Major |

The first run found a real weakness in the skill's severity rules (a crash reachable by real users was rated Minor). The rule now says that removing an existing guard is at least Major; the re-run rated it correctly.

### test-case-generator — [story](test-case-generator/story.md) · [answer key](test-case-generator/answer-key.md)

Prompt: *"Write test cases for the coupon feature described in story.md."* · 14 must-cover areas.

| | Without skill | With skill |
|---|---|---|
| Must-cover areas | 14 / 14 | 14 / 14 |
| Test cases | 73 | 65 |
| Priority and type per case | No | Yes |
| Preconditions, numbered steps, test data | Partial | Every case |
| Rule → test case coverage table | No | Yes |
| Open questions for the product owner | 10 | 14 |

### bug-debugger — [fixture](bug-debugger/fixture) · [answer key](bug-debugger/answer-key.md)

Prompt: *"npm test is failing. Find and fix the problem."* · The failing test is in `invoice`, the cause is in `parse` (a symptom patch would fail the benchmark).

| | Without skill | With skill |
|---|---|---|
| Fixed the root cause, not the symptom | Yes | Yes |
| Report: bug, cause with file:line, fix, proof (failed before, passes after) | Partial | Every part |

### api-design-review — [fixture](api-design-review/fixture) · [answer key](api-design-review/answer-key.md)

Prompt: *"Review the API design in routes.js."* · 10 design problems, 1 correct route as a decoy.

| | Without skill | With skill |
|---|---|---|
| Problems found | 10 / 10 | 10 / 10 |
| Decoy flagged | No | No |
| Corrected endpoint table (method, path, success, errors) | Code sketch | Full table |
| Migration plan for breaking fixes (`/v1`, deprecation headers) | No | Yes |
| Consistency summary (casing, error shape, pagination, versioning) | No | Yes |

### database-schema-design — [fixture](database-schema-design/fixture) · [answer key](database-schema-design/answer-key.md)

Prompt: *"Review my database schema in schema.prisma."* · 9 schema problems.

| | Without skill | With skill |
|---|---|---|
| Problems found | 9 / 9 | 9 / 9 |
| Findings grouped by risk (integrity → performance → design) | Partly | Yes |
| Complete corrected schema | Offered | Included |
| Migration-risk section for existing data | No | Yes |

### git-commit-writer — [setup script](git-commit-writer/fixture/setup.sh) · [answer key](git-commit-writer/answer-key.md)

Prompt: *"Write a commit message for my staged changes."* · Three unrelated staged changes in a Conventional Commits repository.

| | Without skill | With skill |
|---|---|---|
| Detected Conventional Commits | Yes | Yes |
| Default answer | One combined commit | Three separate commits with exact commands |
| Author identity | Suggested an `--author` from other instructions | First run: same → **fixed in the skill** → no `--author`; flags the identity mismatch instead |

### readme-writer — [fixture](readme-writer/fixture) · [answer key](readme-writer/answer-key.md)

Prompt: *"Write a README for this project."* · Traps: Apache-2.0 (not MIT) license, no `dev`/`start` script, unused `legacy/` folder, no repository URL.

| | Without skill | With skill |
|---|---|---|
| License, Node version, environment variables correct | Yes | Yes |
| Invented commands or badges | None | None |
| Missing repository URL | Used a local install instead | Left a visible `TODO` instead of inventing one |
| Known issues documented in the README | No | Yes |

The fixture's `src/convert.js` accidentally contains a syntax error; both runs found and reported it without touching the code.

### figma-design-compare — [fixture](figma-design-compare/fixture) · [answer key](figma-design-compare/answer-key.md)

Prompt: *"Check whether the built page matches its Figma design, and report every difference."* · Design: the open-source [Proffy](https://github.com/rocketseat-education/nlw-02-discovery) landing page by Rocketseat (MIT), [Figma frame "Home"](https://www.figma.com/design/GHGS126t7WYjnPZdRKChJF/Proffy-Web?node-id=81-666). The fixture is a static build of that frame that first matched it within 2 px, then got 10 seeded mismatches. One decoy: the counter shows real data ("200") where Figma shows "285".

| | Without skill | With skill |
|---|---|---|
| Seeded mismatches found | 10 / 10 | 10 / 10 |
| False alarms | 1 (reported the "200 vs 285" counter as a High defect) | 0 (listed it as content, not a design defect) |
| `file:line` for every mismatch | No | Yes |
| Exact fix for every mismatch | No | Yes (the CSS value, using the existing color tokens) |
| Summary line with mismatch count and impact | No | Yes |
| "Matches" list of what was checked and correct | Yes | Yes |

Both runs used the Figma MCP server and Playwright with Chrome at 1440×820.

## What this shows

- On these projects the model finds the same problems with or without the skills.
- The skills make the **output consistent and ready to use**: every finding has a location, evidence and a fix; every test case can be pasted into TestRail or a spreadsheet; every review starts with a verdict.
- Testing found and fixed real flaws in three skills (code-review severity, git-commit-writer author identity, dockerize-app secrets warning).

## Limits

One run per variant, on small sample projects written for these tests. Results on large real codebases will vary. Contributions of more fixtures are welcome.

---

Made by **Wageesha Tripathi** · [LinkedIn](https://www.linkedin.com/in/wst2002/) · [Email](mailto:tripathiwageesha2002@gmail.com) · [GitHub](https://github.com/WST2002)
