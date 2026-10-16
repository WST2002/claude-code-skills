# Claude Code Skills & Plugins

Ready-to-use Claude Code skills and plugins that make AI coding agents faster,
more reliable, and honest about their work.

> "Done!" — but nothing was built, tested, or run. These plugins make the agent
> show evidence before it is allowed to say that.

## Install

```
/plugin marketplace add WST2002/claude-code-skills
/plugin install proof-of-done@claude-code-skills
```

## What's inside

| Name | Type | What it does | Install |
|---|---|---|---|
| [proof-of-done](plugins/proof-of-done) | Plugin | Blocks the agent from finishing after code changes until tests, build or lint have passed after the last edit. | `/plugin install proof-of-done@claude-code-skills` |
| [proof-of-done-lite](skills/proof-of-done-lite) | Skill | The same habits as instructions only, no enforcement. | Copy the folder into `~/.claude/skills/` |

## Plugins vs skills

- **Plugins** can enforce behaviour with hooks. Install them with `/plugin install`.
- **Skills** are instruction files. Copy a skill's folder into `~/.claude/skills/`
  (Windows: `%USERPROFILE%\.claude\skills\`) and it is available in every project.

## Requirements

Node.js 18 or newer on your `PATH`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT © Wageesha Tripathi
