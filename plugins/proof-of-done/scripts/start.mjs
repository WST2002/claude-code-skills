import { loadConfig } from "../lib/config.mjs";
import { pluginDataDir, readHookInput, warn } from "../lib/hook-io.mjs";
import { appendEntry, ledgerPath } from "../lib/ledger.mjs";
import { headCommit } from "../lib/session-diff.mjs";

// Remembers the commit the session started from, so test changes are judged against it, not against later commits.
function main() {
  const input = readHookInput();
  if (typeof input.session_id !== "string") return;
  const config = loadConfig(input.cwd);
  if (!config.enabled || config.tamper === false) return;
  const sha = headCommit(input.cwd);
  if (sha) appendEntry(ledgerPath(pluginDataDir(), input.session_id), { type: "baseline", sha, cwd: input.cwd, at: new Date().toISOString() });
}

try {
  main();
} catch (error) {
  warn(`could not record the starting commit: ${error.message}`);
}
