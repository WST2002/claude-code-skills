# Issue to PR — Design

- **Status:** Approved
- **Date:** 2026-10-16
- **Plugin:** `plugins/issue-to-pr`

## 1. Problem

Turning a ticket into a reviewed pull request is the most repeated task in a developer's week: read the ticket, branch, reproduce, write a test, fix, run checks, commit, push, write the PR description. Agents can do each step, but without a fixed process they skip reproduction, skip tests, invent context, or open PRs that do not build.

## 2. Goal

One command takes a ticket to a draft pull request whose fix is proven by a test and by the project's checks.

```
/fix-issue 123
/fix-issue https://github.com/owner/repo/issues/123
/fix-issue PROJ-45
/fix-issue "Login returns 500 when the email has a plus sign"
```

**Success criteria**
1. Refuses to start on a dirty working tree, outside a git repo, or without a remote; says exactly how to fix it.
2. Reads the ticket (GitHub via `gh`; Jira via a connected Atlassian MCP server; free text as given).
3. Works on a new branch named from the ticket, created from the up-to-date default branch.
4. Bugs: reproduces and writes a failing test before the fix. Features: writes tests from the acceptance criteria.
5. Runs the project's lint, typecheck, tests and build; does not commit if any fail.
6. Commits in the repository's convention with only the user's identity; no tool attribution.
7. Opens a **draft** PR with summary, root cause, changes, verification and the closing reference. `--no-pr` stops after the commit.
8. Asks the user when the ticket is ambiguous instead of guessing.

**Non-goals (v1):** GitLab/Bitbucket PRs, auto-merging, multi-repo changes.

## 3. Components

```
plugins/issue-to-pr/
├── .claude-plugin/plugin.json
├── commands/fix-issue.md     # the workflow the agent follows
├── scripts/
│   ├── preflight.mjs         # git/gh readiness as JSON
│   └── ticket.mjs            # parse the argument, fetch GitHub issues as JSON
├── lib/
│   ├── ticket-ref.mjs        # parse number / URL / Jira key / text
│   ├── branch-name.mjs       # fix/123-short-slug
│   └── preflight.mjs         # pure checks over git state
├── templates/pr-body.md
├── tests/
├── README.md
└── CHANGELOG.md
```

Deterministic parts (argument parsing, branch naming, readiness checks) are scripts with tests. Judgment parts (reproducing, fixing, reviewing) are in the command prompt.

## 4. Behaviour details

**Ticket reference parsing**

| Input | Kind |
|---|---|
| `123`, `#123` | GitHub issue in the current repo |
| `https://github.com/o/r/issues/123` | GitHub issue in `o/r` |
| `https://github.com/o/r/pull/123` | rejected: "That is a pull request, not an issue." |
| `ABC-123` (letters, dash, digits) | Jira key |
| anything else | free-text description |

**Branch name:** `<type>/<id>-<slug>` — type `fix` for bugs (label `bug` or text says error/fails/broken/crash), `feat` otherwise; slug from the title, lowercase, ASCII, hyphenated, max 40 characters; `<id>` omitted for free text. If the branch exists, append `-2`, `-3`.

**Preflight** (`node scripts/preflight.mjs`) prints JSON `{ ok, problems: [{ what, fix }], defaultBranch, currentBranch, remote, gh }`. Problems: not a git repo; uncommitted changes; no `origin` remote; `gh` missing or not logged in (only a problem when a PR will be opened or the ticket is a GitHub issue).

**Verification:** the command runs the project's checks itself; if the `proof-of-done` plugin is installed its gate also applies.

## 5. Testing

- Unit tests for `ticket-ref`, `branch-name`, `preflight` with real temporary git repositories.
- `claude plugin validate --strict`.
- Manual end-to-end: a sandbox GitHub repo with a seeded bug issue; run `/fix-issue <n>` and confirm branch, failing-then-passing test, commit, draft PR.
