import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { matchesGlob, nativePath } from "./classify.mjs";
import { SHELL_EDIT } from "./shell.mjs";
import { findUncovered, readCoverage } from "./coverage.mjs";
import { findTampering } from "./tamper.mjs";
import { findUntested } from "./untested.mjs";
import { findWorkspaces } from "./workspaces.mjs";

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

// The same path with short (8.3) names and links resolved, as git prints it; a deleted file keeps its own name.
function realPath(file) {
  try {
    return fs.realpathSync.native(file);
  } catch {
    const parent = path.dirname(file);
    return parent === file ? file : path.join(realPath(parent), path.basename(file));
  }
}

// Files the session edited, relative to the repository root, or null when a shell command changed files it did not name.
function editedFiles(cwd, entries) {
  const edits = entries.filter((e) => e.type === "edit");
  if (edits.some((e) => e.file === SHELL_EDIT)) return null;
  const root = git(cwd, "rev-parse", "--show-toplevel")?.trim();
  if (!root) return null;
  const realRoot = realPath(root);
  return new Set(edits.map((e) => path.relative(realRoot, realPath(path.resolve(e.cwd ?? cwd, nativePath(e.file)))).split(path.sep).join("/")));
}

// Changed lines that a coverage report written after the last edit shows never ran: { uncovered, reports, root }.
function coverageCheck(cwd, entries, diff, ignore, edited) {
  const root = git(cwd, "rev-parse", "--show-toplevel")?.trim();
  const lastEdit = Date.parse(entries.findLast((e) => e.type === "edit")?.at ?? "");
  if (!root || Number.isNaN(lastEdit)) return null;
  const packages = findWorkspaces(cwd)?.packages.map((p) => path.join(root, p.dir)) ?? [];
  const coverage = readCoverage(root, [...new Set([realPath(root), realPath(cwd), ...packages])], lastEdit);
  if (!coverage.reports.length) return null;
  return { uncovered: findUncovered({ diff, root: realPath(root), coverage, ignore, edited }), reports: coverage.reports, root: realPath(root) };
}

/**
 * The session's test changes that can make checks pass without a fix (`tampering`), code changed with no test
 * change (`untested`), and changed lines a fresh coverage report shows never ran (`coverage`, or null). Each is
 * empty when its check is off or the project is not a git repository.
 */
export function sessionChecks({ cwd, entries, config }) {
  const none = { tampering: [], untested: [], coverage: null };
  const tamper = config.tamper !== false;
  const tests = (config.tests ?? "ask") !== "off";
  const coverage = (config.coverage ?? "ask") !== "off";
  if ((!tamper && !tests && !coverage) || !entries.some((e) => e.type === "edit")) return none;
  // SessionStart also fires on resume and compaction; the first baseline is where the session began.
  const baseline = entries.find((e) => e.type === "baseline")?.sha;
  const diff = sessionDiff(cwd, baseline);
  if (!diff) return none;
  const ignore = (file) => (config.ignore ?? []).some((glob) => matchesGlob(file, glob));
  const edited = tests || coverage ? editedFiles(cwd, entries) : null;
  const wasEdited = (file) => !edited || edited.has(file);
  return {
    tampering: tamper ? findTampering(diff, ignore) : [],
    untested: tests ? findUntested(diff, ignore, wasEdited) : [],
    coverage: coverage ? coverageCheck(cwd, entries, diff, ignore, wasEdited) : null,
  };
}
