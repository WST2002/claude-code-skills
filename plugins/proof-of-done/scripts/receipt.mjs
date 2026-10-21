import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../lib/config.mjs";
import { detectVerifyCommands } from "../lib/detect.mjs";
import { warn } from "../lib/hook-io.mjs";
import { readLedger } from "../lib/ledger.mjs";
import { formatReceipt } from "../lib/receipt.mjs";
import { sessionTampering } from "../lib/session-diff.mjs";

const samePath = (a, b) => typeof a === "string" && path.relative(a, b) === "";

function dataDirs() {
  if (process.env.CLAUDE_PLUGIN_DATA) return [process.env.CLAUDE_PLUGIN_DATA];
  const root = path.join(os.homedir(), ".claude", "plugins", "data");
  try {
    return fs.readdirSync(root).filter((name) => name.includes("proof-of-done")).map((name) => path.join(root, name));
  } catch {
    return [];
  }
}

function ledgerFiles() {
  return dataDirs().flatMap((dir) => {
    const sessions = path.join(dir, "sessions");
    try {
      return fs.readdirSync(sessions).filter((n) => n.endsWith(".jsonl")).flatMap((n) => {
        const file = path.join(sessions, n);
        try {
          return [{ file, mtime: fs.statSync(file).mtimeMs }];
        } catch {
          return [];
        }
      });
    } catch {
      return [];
    }
  });
}

function newestProjectEntries(projectDir) {
  const ledgers = ledgerFiles().sort((a, b) => b.mtime - a.mtime);
  for (const { file } of ledgers) {
    const entries = readLedger(file).filter((e) => samePath(e.cwd, projectDir));
    if (entries.length) return entries;
  }
  return null;
}

function main() {
  const projectDir = process.cwd();
  const entries = newestProjectEntries(projectDir);
  if (!entries) {
    process.stdout.write("No evidence recorded yet for this project.\n");
    return;
  }
  const config = loadConfig(projectDir);
  const verifyCommands = config.verify ?? detectVerifyCommands(projectDir);
  const tampering = sessionTampering({ cwd: projectDir, entries, config });
  process.stdout.write(formatReceipt(entries, { enabled: config.enabled, verifyCommands, tampering }));
}

try {
  main();
} catch (error) {
  warn(`could not build the receipt: ${error.message}`);
}
