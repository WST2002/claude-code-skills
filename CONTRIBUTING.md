# Contributing

## Layout

- `plugins/<name>/` — anything that needs hooks, commands or enforcement. Each
  plugin is self-contained: its own `.claude-plugin/plugin.json`, `README.md`,
  `CHANGELOG.md` and `tests/`. Plugins cannot import files outside their folder.
- `skills/<name>/SKILL.md` — instruction-only skills that users install by copying
  the folder.
- `.claude-plugin/marketplace.json` — add every new plugin here with the same
  `name` and `version` as its `plugin.json`.

## Rules

- Hook scripts are Node.js ESM with no npm dependencies, invoked as
  `"command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/<file>.mjs"]`.
- A hook that fails internally must never block the user.
- Bump the plugin `version` in both manifests and add a `CHANGELOG.md` entry for
  every user-visible change.

## Checks

```
npm test
claude plugin validate . --strict
```

Tests need Node.js 22 or newer.
