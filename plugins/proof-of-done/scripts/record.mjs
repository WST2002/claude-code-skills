import { loadConfig } from "../lib/config.mjs";
import { detectVerifyCommands } from "../lib/detect.mjs";
import { entriesFor } from "../lib/evidence.mjs";
import { pluginDataDir, readHookInput, warn } from "../lib/hook-io.mjs";
import { appendEntry, ledgerPath, pruneOldLedgers } from "../lib/ledger.mjs";

function main() {
  const input = readHookInput();
  const config = loadConfig(input.cwd);
  if (!config.enabled) return;
  const entries = entriesFor(input, config, config.verify ?? detectVerifyCommands(input.cwd));
  if (entries.length === 0) return;
  const dataDir = pluginDataDir();
  for (const entry of entries) appendEntry(ledgerPath(dataDir, input.session_id), entry);
  pruneOldLedgers(dataDir);
}

try {
  main();
} catch (error) {
  warn(`could not record evidence: ${error.message}`);
}
