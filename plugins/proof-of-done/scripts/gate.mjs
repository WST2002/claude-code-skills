import { loadConfig } from "../lib/config.mjs";
import { decide } from "../lib/decide.mjs";
import { detectVerifyCommands } from "../lib/detect.mjs";
import { pluginDataDir, readHookInput, warn } from "../lib/hook-io.mjs";
import { ledgerPath, readLedger } from "../lib/ledger.mjs";
import { sessionTampering } from "../lib/session-diff.mjs";

function main() {
  const input = readHookInput();
  if (typeof input.session_id !== "string") return;
  const config = loadConfig(input.cwd);
  if (config.error) {
    warn(config.error);
    return;
  }
  if (!config.enabled) return;
  const entries = readLedger(ledgerPath(pluginDataDir(), input.session_id));
  const stopHookActive = input.stop_hook_active === true;
  const verdict = decide({
    entries,
    lastMessage: input.last_assistant_message,
    stopHookActive,
    verifyCommands: config.verify ?? detectVerifyCommands(input.cwd),
    tampering: stopHookActive ? [] : sessionTampering({ cwd: input.cwd, entries, config }),
  });
  if (!verdict.allow) process.stdout.write(JSON.stringify({ decision: "block", reason: verdict.reason }));
}

try {
  main();
} catch (error) {
  warn(`gate skipped after an internal error: ${error.message}`);
}
