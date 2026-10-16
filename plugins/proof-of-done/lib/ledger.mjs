import fs from "node:fs";
import path from "node:path";

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const sessionsDir = (dataDir) => path.join(dataDir, "sessions");

export function ledgerPath(dataDir, sessionId) {
  const safeId = String(sessionId).replace(/[^A-Za-z0-9_-]/g, "_");
  return path.join(sessionsDir(dataDir), `${safeId}.jsonl`);
}

export function appendEntry(file, entry) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(entry)}\n`);
}

export function readLedger(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  return text.split("\n").flatMap((line) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

export function pruneOldLedgers(dataDir, now = Date.now()) {
  let names;
  try {
    names = fs.readdirSync(sessionsDir(dataDir));
  } catch {
    return;
  }
  for (const name of names) {
    const file = path.join(sessionsDir(dataDir), name);
    try {
      if (now - fs.statSync(file).mtimeMs > MAX_AGE_MS) fs.rmSync(file);
    } catch {
      continue;
    }
  }
}
