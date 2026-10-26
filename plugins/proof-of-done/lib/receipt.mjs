import { decide } from "./decide.mjs";

function status(entry) {
  if (entry.exitCode !== 0 && entry.exitCode !== null) return `✗ exit ${entry.exitCode}`;
  if (entry.masked) return "⚠ masked";
  if (entry.exitCode === 0 && entry.testsRun === 0) return "⚠ 0 tests ran";
  return entry.exitCode === 0 ? "✓ passed" : "? interrupted";
}

function gateLine(entries, { enabled, verifyCommands, tampering, untested, testsMode }) {
  if (!enabled) return "**Gate:** proof-of-done is disabled for this project";
  const verdict = decide({ entries, verifyCommands, tampering, untested, testsMode });
  return verdict.allow ? "**Gate:** ✅ would allow stopping" : `**Gate:** ⛔ would block — ${verdict.reason}`;
}

export function formatReceipt(entries, { enabled = true, verifyCommands = [], tampering = [], untested = [], testsMode = "ask" } = {}) {
  const files = [...new Set(entries.filter((e) => e.type === "edit").map((e) => e.file))];
  const runs = entries.filter((e) => e.type === "verify");
  const lines = [
    "## Proof of Done receipt",
    "",
    `**Files edited (${files.length}):**`,
    ...(files.length ? files.map((f) => `- ${f}`) : ["- none"]),
    "",
    `**Verification runs (${runs.length}):**`,
    ...(runs.length ? runs.map((e) => `- \`${e.command}\` ${status(e)} (${e.at})`) : ["- none"]),
    "",
    gateLine(entries, { enabled, verifyCommands, tampering, untested, testsMode }),
  ];
  return `${lines.join("\n")}\n`;
}
