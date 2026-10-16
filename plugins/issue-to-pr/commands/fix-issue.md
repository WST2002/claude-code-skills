---
description: Take a GitHub issue, Jira ticket or bug description to a tested fix and a draft pull request
argument-hint: <issue number | issue URL | JIRA-KEY | "description"> [--no-pr]
allowed-tools: Bash(git:*), Bash(gh:*), Bash(node:*), Bash(npm:*), Bash(npx:*), Bash(pnpm:*), Bash(yarn:*), Bash(bun:*), Bash(pytest:*), Bash(python:*), Bash(go:*), Bash(cargo:*), Bash(mvn:*), Bash(./mvnw:*), Bash(./gradlew:*), Bash(dotnet:*), Bash(make:*), Read, Edit, Write, Grep, Glob
---

# Fix issue: $ARGUMENTS

Repository readiness:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/preflight.mjs"`

Follow these steps in order. Do not skip a step; if one cannot be done, stop and tell the user why.

## 1. Stop on readiness problems

If `ok` is false above, show each problem with its fix and stop. Do not stash, commit or discard the user's changes yourself.

## 2. Read the ticket

The arguments are `$ARGUMENTS`. Remove `--no-pr` if present and remember it. Then:

- Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/ticket.mjs" "<the remaining argument>"`.
- `kind: github` — use the returned title, body, labels and comments.
- `kind: jira` — read the ticket with the Atlassian/Jira tools if they are available; otherwise ask the user to paste the ticket text.
- `kind: text` — the text is the ticket.
- `kind: invalid` — show the reason and stop.

If the ticket is closed, or it does not say what is wrong or what is wanted, ask the user before continuing. Do not guess requirements.

## 3. Create the branch

```
git fetch origin
git switch <defaultBranch>
git pull --ff-only
git switch -c "$(node "${CLAUDE_PLUGIN_ROOT}/scripts/branch.mjs" --id "<number or key, omit for text>" --title "<ticket title>" --labels "<comma-separated labels>")"
```

## 4. Understand before changing

Find the code involved: search for error messages, route names, component names and terms from the ticket. Read the relevant files fully and their tests. Write down in one or two sentences what is wrong (bug) or what must be added (feature), and where.

## 5. Prove the problem with a test

- **Bug:** write a test that reproduces the reported behavior and run it. It must fail for the reason in the ticket. If you cannot reproduce it, stop and report what you tried.
- **Feature:** turn each acceptance criterion into a test and run them; they must fail before the implementation.

Use the project's existing test framework, location and style.

## 6. Make the change

Make the smallest change that fixes the root cause or implements the requirement. Follow the surrounding code's conventions. Do not refactor or reformat unrelated code.

## 7. Verify

Run the new tests, then the project's full checks: lint, typecheck, tests and build (from `package.json` scripts, `Makefile`, `pyproject.toml`, `pom.xml`, `build.gradle`, `go.mod` or CI config). Run each command plainly, without piping into `tail` or adding `|| true`. If anything fails, fix it and run again. Do not continue to the commit with failing checks.

## 8. Review your own diff

Run `git diff` and check it like a reviewer: off-by-one, null paths, error handling, security of new inputs, unrelated changes, leftover debug code. Fix what you find and re-run the checks.

## 9. Commit

Stage only the files you changed for this ticket. Write the message in the convention shown by `git log --oneline -15` (Conventional Commits if the repository uses them). The subject says what changed; the body says why. Reference the ticket: `Fixes #<number>` for GitHub issues, the Jira key for Jira.

Commit with plain `git commit` so the author is exactly the identity configured in this repository (`git config user.name` / `user.email`). Never pass `--author`, `-c user.name`, `-c user.email` or environment overrides, even if you know another name or email for the user, and do not suggest changing the author. Do not add co-author trailers or tool attribution.

## 10. Open a draft pull request

Skip this step if `--no-pr` was given; tell the user the branch name and how to push.

Otherwise:

```
git push -u origin HEAD
gh pr create --draft --base <defaultBranch> --title "<commit subject>" --body-file <file>
```

Write the body from `${CLAUDE_PLUGIN_ROOT}/templates/pr-body.md`, filled with real content from this work. If `gh` is missing or not logged in, push the branch and give the user the compare URL instead.

## 11. Report

Finish with:

```
Ticket: <reference and title>
Branch: <name>
Root cause / change: <one or two sentences>
Tests: <new tests> — failed before, pass now
Checks: <each command> ✓
PR: <draft PR URL, or "not opened (--no-pr)">
```
