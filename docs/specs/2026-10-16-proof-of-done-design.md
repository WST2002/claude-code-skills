# Proof of Done — Design

- **Status:** Draft for review
- **Date:** 2026-10-16
- **Repo:** `groundwork` (Claude Code plugin marketplace + standalone skills)

## 1. Problem

Developers' top complaint about AI coding agents in 2026 is trust: agents say "done"
when the code was never built, tested, or checked. Existing skills only *ask* the
agent to verify; the agent can ignore them.

## 2. Goal

An agent using Claude Code cannot end its turn after changing code unless it has
evidence that the change works, or it honestly says verification was skipped and why.

**Success criteria**
1. After editing code, if the agent stops without a passing verification run after
   its last edit, the stop is blocked and the agent is told exactly which commands to run.
2. If the latest verification run failed, the stop is blocked with the failing
   command and its exit code.
3. An agent that has nothing to verify (no edits, or only docs) is never blocked.
4. The agent cannot loop forever: the hook gives up after one block per stop attempt
   (`stop_hook_active`), and Claude Code's built-in cap applies.
5. Works on Windows, macOS and Linux with only Node.js (no npm dependencies).

**Non-goals for v1:** visual/screenshot verification, Figma comparison, support for
agents other than Claude Code, judging test quality.

## 3. Repository layout

```
groundwork/
├── .claude-plugin/
│   └── marketplace.json            # registry of every plugin in this repo
├── plugins/
│   └── proof-of-done/
│       ├── .claude-plugin/plugin.json
│       ├── hooks/hooks.json        # PostToolUse + Stop wiring
│       ├── scripts/
│       │   ├── record.mjs          # PostToolUse entry point
│       │   └── gate.mjs            # Stop entry point
│       ├── lib/                    # pure logic, unit-tested
│       │   ├── ledger.mjs          # per-session evidence store
│       │   ├── classify.mjs        # is this command a verification? is this file code?
│       │   ├── detect.mjs          # which verification commands this project has
│       │   └── config.mjs          # project overrides
│       ├── commands/proof.md       # /proof — show the evidence receipt
│       ├── skills/proof-of-done/SKILL.md
│       ├── tests/
│       ├── README.md
│       └── CHANGELOG.md
├── skills/
│   └── proof-of-done-lite/SKILL.md # copy-paste skill, no enforcement
├── docs/
│   ├── specs/
│   └── plans/
├── .github/
│   ├── workflows/ci.yml
│   ├── ISSUE_TEMPLATE/
│   └── PULL_REQUEST_TEMPLATE.md
├── CONTRIBUTING.md
├── LICENSE                         # MIT
└── README.md
```

**Conventions every future addition follows**
- Anything that needs hooks, commands or enforcement is a plugin under `plugins/`.
  Anything that is only instructions is a standalone skill under `skills/`, installable
  by copying the folder into `~/.claude/skills/`.
- Plugins are self-contained. Claude Code rejects component paths outside a plugin's
  folder, so shared code lives in the plugin's own `lib/`. When a second plugin needs
  the same logic, we extract it into `packages/` with a build step that bundles it
  into each plugin. Not before.
- Each plugin has its own `version` in `plugin.json` and its own `CHANGELOG.md`.
- Hook scripts are Node.js ESM (`.mjs`), invoked in exec form
  (`"command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/x.mjs"]`) so they behave
  the same on every OS and avoid Bash/PowerShell differences.

## 4. How Proof of Done works

### 4.1 Recording evidence (PostToolUse + PostToolUseFailure)

`record.mjs` runs after every `Bash`, `PowerShell`, `Edit`, `Write`, `MultiEdit` and
`NotebookEdit` tool call. Successful calls arrive as `PostToolUse`; a shell command
that exits non-zero arrives as `PostToolUseFailure`, whose `error` field starts with
`Exit code N`. The script appends one line to the session ledger at
`${CLAUDE_PLUGIN_DATA}/sessions/<session_id>.jsonl`:

| Tool call | Entry |
|---|---|
| Edit/Write on a **code file** | `{ type: "edit", file, at }` |
| Bash command classified as **verification** | `{ type: "verify", command, exitCode, at }` |
| Anything else | nothing |

- **Code file:** any file except docs and assets (`.md`, `.txt`, images, `.lock`
  files, anything under `docs/`). Configurable.
- **Shell commands are parsed, not searched.** A command is split on `&&`, `||`,
  `;`, `|`, `&` and newlines, with quoted text ignored. A check counts only when a
  segment *starts* with it (after `VAR=x` prefixes), so `git commit -m "fix npm test"`
  is not a verification. Each check is recorded as `check` + `args`
  (`npm test` + `-- -t foo`); redirections are not part of `args`.
- **Verification command:** a segment that starts with one of the project's
  detected commands (4.3, canonicalised so `npm run test` ≡ `npm test`) or a
  built-in check: `npm|pnpm|yarn|bun (run )?(test|build|lint|typecheck|check)`,
  `npx (tsc|vitest|jest|eslint|playwright test)`, `pytest`, `go test`, `go build`,
  `cargo (test|build|check|clippy)`, `mvn (test|verify|package)`,
  `gradle(w)? (test|build|check)`, `dotnet (test|build)`, `make (test|check)`.
- Exit code: `0` for `PostToolUse`; parsed from the first line of `error` for
  `PostToolUseFailure`. Interrupted or unparseable runs get `exitCode: null` and are
  treated as **not passing**.
- **Masked runs:** a check whose exit code may not reach the shell is recorded with
  `masked: true` and never counts as passing: piped into another command without
  `pipefail` (`npm test | tail`), or followed by anything other than an `&&` chain
  or `|| exit <non-zero>` (`; echo done`, `|| true`, `|| echo failed`, `&`).
- Edits to files outside the project directory (`cwd`) are not recorded.
- **Shell writes count as edits.** A shell command that redirects into a code file
  (`printf ... > src/a.js`) or changes files in place (`sed -i`, `tee`,
  `Set-Content`, `Out-File`, `mv`, `cp`, `rm`, `git apply/checkout/restore`) is
  recorded as an edit, before any verification in the same command.

The ledger is append-only JSON Lines, so parallel tool calls cannot overwrite each
other's entries. Unparseable lines are skipped. Ledgers older than 7 days are deleted
on each write.

### 4.2 The gate (Stop)

`gate.mjs` reads the Stop input and decides:

1. `stop_hook_active` is true → **allow** (the agent already got one block this stop).
2. No `edit` entries in the ledger → **allow**.
3. Last assistant message contains an honest skip line
   (`Verification: skipped — <reason>`, reason at least 10 characters) → **allow**.
4. Find the last `edit`. Collect `verify` entries after it.
   - None → **block**: "You changed N code files (list up to 5) but ran no
     verification since. Run: `<detected commands>`. Then report the results. If
     verification is impossible, end with `Verification: skipped — <reason>`."
   - For each distinct check + arguments, take its latest run. A run with no
     arguments supersedes every earlier run of the same check, so a plain
     `npm test` clears an earlier masked or filtered one; a filtered run
     (`npm test -- -t foo`) never clears a failing full run. If any of those failed, was
     interrupted, or was masked → **block** with that command and why
     ("`npm test` exited with code 1 after your last edit. Fix it or report the
     failure honestly.").
   - Every distinct command's latest run passed → **allow**.

Block output: `{"decision": "block", "reason": "..."}` on stdout, exit 0.
Any internal error in the hook → **allow** and print a one-line warning to stderr.
A broken gate must never trap the user.

SubagentStop uses the same gate, so subagents are held to the same rule.

### 4.3 Detecting the project's verification commands (`detect.mjs`)

Read from the project root (`cwd`):
- `package.json` scripts named `typecheck`, `lint`, `test`, `build` → `npm run <name>`
  (package manager chosen from the lockfile: pnpm, yarn, bun, else npm).
- `pyproject.toml` / `pytest.ini` → `pytest`; `go.mod` → `go build ./... && go test ./...`;
  `Cargo.toml` → `cargo test`; `pom.xml` → `mvn test`; `build.gradle*` → `./gradlew test`.
- Nothing found → the block message asks the agent to run whatever proves the change
  works and to show the output.

### 4.4 Project config (`.groundwork/proof-of-done.json`, optional)

```json
{
  "enabled": true,
  "verify": ["npm run lint", "npm test"],
  "ignore": ["docs/**", "*.md"]
}
```

- `verify` replaces auto-detection.
- `ignore` adds globs to the non-code list.
- Invalid JSON → the gate prints a clear error to stderr
  (`proof-of-done: .groundwork/proof-of-done.json is invalid JSON: <detail>`) and
  allows the stop.

### 4.5 `/proof` command

Prints the evidence receipt of the most recent session in the current project
(entries carry the project `cwd`): files edited, each verification command with
pass/fail and time, and whether the gate would currently allow a stop, using the
project's config and detected commands.

### 4.6 Skill (`skills/proof-of-done/SKILL.md` inside the plugin)

Tells the agent how to finish work: run the relevant checks, paste the key result
lines, and end with a short receipt:

```
Verified:
- npm run lint ✓
- npm test ✓ (42 passed)
```

or the honest skip line. The standalone `proof-of-done-lite` skill contains the same
guidance without the hooks, for people who install skills by copying folders.

## 5. Error handling summary

| Situation | Behaviour |
|---|---|
| Hook crashes or ledger unreadable | Allow stop, one-line stderr warning |
| Exit code unknown | Treated as not passing |
| Agent blocked once already this stop | Allow (`stop_hook_active`) |
| Invalid config | Allow stop, stderr: what failed + how to fix |
| Node.js missing | Claude Code reports the hook error; README lists Node 18+ as a requirement |

## 6. Testing

- **Unit tests** (`node:test`, built in) for `classify`, `detect`, `ledger`, `config`
  and the gate's decision function, using real temp directories. No mocks.
- **Integration tests** spawn `record.mjs` and `gate.mjs` as real processes, feed them
  real hook JSON on stdin, and assert on stdout/exit code. These cover each case in 4.2.
- **Manual end-to-end check** before release: install the marketplace locally with
  `/plugin marketplace add ./`, ask Claude to change code in a sample project, and
  confirm the stop is blocked, then allowed after tests pass.
- **CI** (`.github/workflows/ci.yml`) on every push and PR: Node tests on Ubuntu and
  Windows, plus `claude plugin validate . --strict`.

## 7. Distribution

- Install:
  ```
  /plugin marketplace add WST2002/groundwork
  /plugin install proof-of-done@groundwork
  ```
- Lite skill: copy `skills/proof-of-done-lite/` into `~/.claude/skills/`.
- Repo topics: `claude-code`, `claude-code-plugin`, `claude-skills`, `agent-skills`,
  `ai-coding`, `developer-tools`.
- README leads with the problem in one line, a demo GIF, and the two install commands.

## 8. Roadmap (not in v1)

- Visual proof: screenshots at mobile/tablet/desktop for UI changes (Playwright).
- Diff-vs-claim check: does the diff touch what the agent said it changed?
- CLI wrapper so Cursor/Codex users can run the same checks.
