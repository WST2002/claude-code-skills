import { loadConfig } from "../lib/config.mjs";
import { decide } from "../lib/decide.mjs";
import { detectVerifyCommands } from "../lib/detect.mjs";
import { pluginDataDir, readHookInput, warn } from "../lib/hook-io.mjs";
import { appendEntry, ledgerPath, readLedger } from "../lib/ledger.mjs";
import { sessionChecks } from "../lib/session-diff.mjs";

function main() {
  const input = readHookInput();
  if (typeof input.session_id !== "string") return;
  const config = loadConfig(input.cwd);
  if (config.error) {
    warn(config.error);
    return;
  }
  if (!config.enabled) return;
  const ledger = ledgerPath(pluginDataDir(), input.session_id);
  const entries = readLedger(ledger);
  const stopHookActive = input.stop_hook_active === true;
  const { tampering, untested } = stopHookActive ? { tampering: [], untested: [] } : sessionChecks({ cwd: input.cwd, entries, config });
  // A subagent cannot ask the user, so only the main agent asks about missing tests.
  const askable = !(input.hook_event_name === "SubagentStop" && config.tests === "ask");
  const verdict = decide({
    entries,
    lastMessage: input.last_assistant_message,
    stopHookActive,
    verifyCommands: config.verify ?? detectVerifyCommands(input.cwd),
    tampering,
    untested: askable ? untested : [],
    testsMode: config.tests,
  });
  if (verdict.allow) return;
  if (verdict.askedAbout) appendEntry(ledger, { type: "tests-asked", files: verdict.askedAbout, cwd: input.cwd, at: new Date().toISOString() });
  process.stdout.write(JSON.stringify({ decision: "block", reason: verdict.reason }));
}

try {
  main();
} catch (error) {
  warn(`gate skipped after an internal error: ${error.message}`);
}
