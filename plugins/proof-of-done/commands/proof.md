---
description: Show what was edited and verified in this session, and whether the stop gate would pass
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/receipt.mjs"`

Show the receipt above to the user exactly as printed. If the gate would block, say what to run next.
