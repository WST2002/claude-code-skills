import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { matchesGlob } from "./classify.mjs";
import { findTampering } from "./tamper.mjs";

const MAX_NEW_FILE_BYTES = 256 * 1024;
const MAX_NEW_FILES = 200;

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : null;
}

export const headCommit = (cwd) => git(cwd, "rev-parse", "HEAD")?.trim() || null;

// New, untracked files are not in `git diff`, so they are written as additions in the same format.
function untrackedAsDiff(cwd) {
  const files = (git(cwd, "ls-files", "--others", "--exclude-standard", "-z") ?? "").split("\0").filter(Boolean).slice(0, MAX_NEW_FILES);
  return files.flatMap((file) => {
    let text;
    try {
      if (fs.statSync(path.join(cwd, file)).size > MAX_NEW_FILE_BYTES) return [];
      text = fs.readFileSync(path.join(cwd, file), "utf8");
    } catch {
      return [];
    }
    const lines = text.replace(/\n$/, "").split("\n");
    return [`diff --git a/${file} b/${file}`, "new file mode 100644", "--- /dev/null", `+++ b/${file}`, `@@ -0,0 +1,${lines.length} @@`, ...lines.map((line) => `+${line}`)];
  }).join("\n");
}

/** Everything changed since the session started (or since HEAD), as a unified diff with no context lines. */
export function sessionDiff(cwd, baseline) {
  if (git(cwd, "rev-parse", "--is-inside-work-tree")?.trim() !== "true" || !headCommit(cwd)) return null;
  const base = baseline && git(cwd, "cat-file", "-e", `${baseline}^{commit}`) !== null ? baseline : "HEAD";
  return `${git(cwd, "diff", "--no-color", "--no-ext-diff", "-U0", base, "--") ?? ""}\n${untrackedAsDiff(cwd)}`;
}

/** Test-weakening changes made in this session, or [] when the check is off or the project is not a git repository. */
export function sessionTampering({ cwd, entries, config }) {
  if (config.tamper === false || !entries.some((e) => e.type === "edit")) return [];
  // SessionStart also fires on resume and compaction; the first baseline is where the session began.
  const baseline = entries.find((e) => e.type === "baseline")?.sha;
  const diff = sessionDiff(cwd, baseline);
  if (!diff) return [];
  const ignore = (file) => (config.ignore ?? []).some((glob) => matchesGlob(file, glob));
  return findTampering(diff, ignore);
}
