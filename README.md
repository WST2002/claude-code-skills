# groundwork

Claude Code plugins and skills that make AI coding agents prove their work.

> "Done!" — but nothing was built, tested, or run. groundwork makes the agent show
> evidence before it is allowed to say that.

## Install

```
/plugin marketplace add WST2002/groundwork
/plugin install proof-of-done@groundwork
```

## What's inside

| Name | Type | What it does | Install |
|---|---|---|---|
| [proof-of-done](plugins/proof-of-done) | Plugin | Blocks the agent from finishing after code changes until tests, build or lint have passed after the last edit. | `/plugin install proof-of-done@groundwork` |
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
