# Benchmarks

How the skills were tested: the same task, on the same sample project, run once **without** the skill and once **with** it, in Claude Code (October 2026). Each sample project has seeded problems and an answer key.

> The code in these folders is **intentionally broken and insecure**. It exists only to test the skills. Do not run or deploy it.

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

## What this shows

- On these projects the model finds the same problems with or without the skills.
- The skills make the **output consistent and ready to use**: every finding has a location, evidence and a fix; every test case can be pasted into TestRail or a spreadsheet; every review starts with a verdict.
- Testing found and fixed real flaws in two skills (code-review severity, git-commit-writer author identity).

## Limits

One run per variant, on small sample projects written for these tests. Results on large real codebases will vary. Contributions of more fixtures are welcome.

---

Made by **Wageesha Tripathi** · [LinkedIn](https://www.linkedin.com/in/wst2002/) · [Email](mailto:tripathiwageesha2002@gmail.com) · [GitHub](https://github.com/WST2002)
