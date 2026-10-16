# Claude Code Skills & Plugins

Ready-to-use Claude Code skills and plugins that make AI coding agents faster,
more reliable, and honest about their work.

## Install

**Skills** — all of them, or pick one:

```bash
npx skills add WST2002/claude-code-skills
npx skills add WST2002/claude-code-skills --skill security-audit
```

Or copy any folder from [`skills/`](skills) into `~/.claude/skills/`
(Windows: `%USERPROFILE%\.claude\skills\`).

**Plugins** — inside Claude Code:

```
/plugin marketplace add WST2002/claude-code-skills
/plugin install proof-of-done@claude-code-skills
```

## Skills

| Skill | Use it to |
|---|---|
| [security-audit](skills/security-audit) | Find exploitable vulnerabilities in any codebase, with file:line evidence, attack scenario and fix |
| [code-review](skills/code-review) | Review a PR, branch or diff for real defects, each with a concrete failing scenario |
| [database-schema-design](skills/database-schema-design) | Design a schema from scratch or review one for integrity, indexes and safe migrations |
| [web-performance-audit](skills/web-performance-audit) | Find why a site is slow, tied to LCP, INP, CLS and bundle size, with expected gains |
| [api-design-review](skills/api-design-review) | Design or review REST APIs: naming, status codes, errors, pagination, breaking changes |
| [git-commit-writer](skills/git-commit-writer) | Write commit messages that match your repo's convention and split mixed changes |
| [readme-writer](skills/readme-writer) | Write a README from the real codebase, with verified commands and nothing invented |
| [prd-writer](skills/prd-writer) | Write a PRD with evidence, measurable goals and testable acceptance criteria |
| [proof-of-done-lite](skills/proof-of-done-lite) | Make the agent show test and build results before saying "done" |

Every skill uses the same approach: a clear method, a fixed output format, and a
verification step so results are specific and low on false positives.

## Plugins

| Plugin | What it does |
|---|---|
| [proof-of-done](plugins/proof-of-done) | Blocks the agent from finishing after code changes until tests, build or lint have passed after the last edit. Requires Node.js 18+. |

## Plugins vs skills

- **Skills** are instructions. Claude loads them when your request matches.
- **Plugins** can enforce behaviour with hooks, for example stopping the agent
  until checks pass.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Ideas for new skills are welcome as issues.

## License

MIT © Wageesha Tripathi
