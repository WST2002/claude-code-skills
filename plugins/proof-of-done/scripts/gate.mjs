import { loadConfig } from "../lib/config.mjs";
import { decide } from "../lib/decide.mjs";
import { detectVerifyCommands } from "../lib/detect.mjs";
import { pluginDataDir, readHookInput, warn } from "../lib/hook-io.mjs";
import { appendEntry, ledgerPath, readLedger } from "../lib/ledger.mjs";
import { sessionChecks } from "../lib/session-diff.mjs";
import { findWorkspaces } from "../lib/workspaces.mjs";

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
  const { tampering, untested, coverage } = stopHookActive ? { tampering: [], untested: [], coverage: null } : sessionChecks({ cwd: input.cwd, entries, config });
  // A subagent cannot ask the user, so only the main agent asks about missing tests or uncovered lines.
  const subagent = input.hook_event_name === "SubagentStop";
  const askable = !(subagent && config.tests === "ask");
  const coverageAskable = !(subagent && config.coverage === "ask");
  const verdict = decide({
    entries,
    lastMessage: input.last_assistant_message,
    stopHookActive,
    verifyCommands: config.verify ?? detectVerifyCommands(input.cwd),
    tampering,
    untested: askable ? untested : [],
    testsMode: config.tests,
    workspaces: config.workspaces ? findWorkspaces(input.cwd) : null,
    coverage: coverage && coverageAskable ? { ...coverage, mode: config.coverage } : null,
  });
  if (verdict.allow) return;
  const at = new Date().toISOString();
  if (verdict.askedAbout) appendEntry(ledger, { type: "tests-asked", files: verdict.askedAbout, cwd: input.cwd, at });
  if (verdict.askedCoverage) appendEntry(ledger, { type: "coverage-asked", files: verdict.askedCoverage, cwd: input.cwd, at });
  process.stdout.write(JSON.stringify({ decision: "block", reason: verdict.reason }));
}

try {
  main();
} catch (error) {
  warn(`gate skipped after an internal error: ${error.message}`);
}
