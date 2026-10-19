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

## What this shows

- On these projects the model finds the same problems with or without the skills.
- The skills make the **output consistent and ready to use**: every finding has a location, evidence and a fix; every test case can be pasted into TestRail or a spreadsheet; every review starts with a verdict.
- Testing found and fixed a real flaw in one skill.

## Limits

One run per variant, on small sample projects written for these tests. Results on large real codebases will vary. Contributions of more fixtures are welcome.

---

Made by **Wageesha Tripathi** · [LinkedIn](https://www.linkedin.com/in/wst2002/) · [Email](mailto:tripathiwageesha2002@gmail.com) · [GitHub](https://github.com/WST2002)
