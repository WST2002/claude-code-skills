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
      const entry = JSON.parse(line);
      return isValidEntry(entry) ? [entry] : [];
    } catch {
      return [];
    }
  });
}

function isValidEntry(entry) {
  if (entry === null || typeof entry !== "object") return false;
  if (entry.type === "edit") return typeof entry.file === "string";
  if (entry.type === "verify") return typeof entry.command === "string";
  if (entry.type === "baseline") return typeof entry.sha === "string";
  if (entry.type === "tests-asked") return Array.isArray(entry.files) && entry.files.every((f) => typeof f === "string");
  return false;
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
