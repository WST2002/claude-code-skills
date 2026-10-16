import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readLedger } from "../lib/ledger.mjs";
import { formatReceipt } from "../lib/receipt.mjs";

function dataDirs() {
  if (process.env.CLAUDE_PLUGIN_DATA) return [process.env.CLAUDE_PLUGIN_DATA];
  const root = path.join(os.homedir(), ".claude", "plugins", "data");
  try {
    return fs.readdirSync(root).filter((name) => name.includes("proof-of-done")).map((name) => path.join(root, name));
  } catch {
    return [];
  }
}

function newestLedger() {
  const files = dataDirs().flatMap((dir) => {
    const sessions = path.join(dir, "sessions");
    try {
      return fs.readdirSync(sessions).filter((n) => n.endsWith(".jsonl")).map((n) => path.join(sessions, n));
    } catch {
      return [];
    }
  });
  return files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

const file = newestLedger();
process.stdout.write(file ? formatReceipt(readLedger(file)) : "No evidence recorded yet in this session.\n");
