# issue-to-pr

One command from a ticket to a draft pull request with a tested fix.

```
/fix-issue 123
/fix-issue https://github.com/owner/repo/issues/123
/fix-issue PROJ-45
/fix-issue "Login returns 500 when the email has a plus sign"
/fix-issue 123 --no-pr
```

## What it does

1. Checks the repository is ready: git repo, no uncommitted changes, an `origin` remote, GitHub CLI login.
2. Reads the ticket: GitHub issue (title, body, labels, comments), Jira ticket (with the Atlassian tools connected), or your description. Asks you when the ticket is unclear.
3. Creates a branch from the up-to-date default branch: `fix/123-login-returns-500` or `feat/77-csv-export`.
4. Finds the code involved and proves the problem with a test that fails first. Features get tests from the acceptance criteria.
5. Makes the smallest change that fixes the root cause.
6. Runs your project's lint, typecheck, tests and build until they pass.
7. Reviews its own diff.
8. Commits in your repository's convention with `Fixes #123`, using your git identity only.
9. Pushes and opens a **draft** pull request with summary, root cause, changes and verification.

`--no-pr` stops after the commit.

## Install

```
/plugin marketplace add WST2002/claude-code-skills
/plugin install issue-to-pr@claude-code-skills
```

Works best together with [proof-of-done](../proof-of-done), which blocks finishing until checks pass.

## Requirements

- Node.js 18 or newer
- Git
- [GitHub CLI](https://cli.github.com) logged in (`gh auth login`) for GitHub issues and pull requests
- For Jira tickets: the Atlassian/Jira tools connected in Claude Code, or paste the ticket text

---

Made by **Wageesha Tripathi** · [LinkedIn](https://www.linkedin.com/in/wst2002/) · [Email](mailto:tripathiwageesha2002@gmail.com) · [More skills](https://github.com/WST2002/claude-code-skills)
