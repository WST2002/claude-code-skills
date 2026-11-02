// Reads coverage reports that the project's own test runs wrote, and finds changed code lines that no test ran.
import fs from "node:fs";
import path from "node:path";
import { nativePath } from "./classify.mjs";
import { isTestFile, parseDiff } from "./tamper.mjs";

// Report files, relative to the project root or a monorepo package. lcov comes from Jest, Vitest, c8, nyc and node;
// coverage-final.json from Istanbul; Cobertura XML from coverage.py / pytest-cov and Jest's cobertura reporter.
const REPORTS = ["coverage/lcov.info", "lcov.info", "coverage/coverage-final.json", "coverage.xml", "coverage/cobertura-coverage.xml", "coverage/coverage.xml"];
const NON_CODE = /\.(md|mdx|txt|rst|json|ya?ml|toml|lock|css|scss|sass|less|html?|svg|png|jpe?g|gif|webp|ico|snap|info)$/i;
const MAX_LISTED_FILES = 5;
const MAX_LISTED_RANGES = 8;

// The same file the same way whatever the report wrote: Git Bash /c/ paths, file:// URLs, links and folder
// junctions, and Windows' case-insensitive names. Reports repeat each path on every line, so keys are cached.
const keys = new Map();
function key(file) {
  let found = keys.get(file);
  if (found) return found;
  const plain = nativePath(file.replace(/^file:\/\/(?=\/)/, "").replace(/^\/([A-Za-z]:)/, "$1"));
  let resolved = path.resolve(plain);
  try {
    resolved = fs.realpathSync.native(resolved);
  } catch {
    // A file that no longer exists keeps the path the report gave.
  }
  found = resolved.split(path.sep).join("/");
  if (process.platform === "win32") found = found.toLowerCase();
  keys.set(file, found);
  return found;
}

// A report path, relative to `base` unless it is absolute (including Git Bash and file:// forms).
const resolveIn = (base, file) => {
  const plain = nativePath(file.trim().replace(/^file:\/\/(?=\/)/, "").replace(/^\/([A-Za-z]:)/, "$1"));
  return path.isAbsolute(plain) ? plain : path.join(base, plain);
};

function parseLcov(text, base, add) {
  let file = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("SF:")) file = resolveIn(base, line.slice(3));
    else if (line.startsWith("DA:") && file) {
      const [number, count] = line.slice(3).split(",");
      add(file, Number(number), Number(count));
    } else if (line === "end_of_record") file = null;
  }
}

// Istanbul counts statements, not lines: each line takes the count of the smallest statement on it, so a function
// that ran does not hide a branch inside it that never did. A statement with no count is not listed.
function parseIstanbul(text, base, add) {
  for (const [name, data] of Object.entries(JSON.parse(text))) {
    const file = resolveIn(base, data.path ?? name);
    const statements = Object.entries(data.statementMap ?? {})
      .filter(([id]) => typeof data.s?.[id] === "number")
      .map(([id, loc]) => ({ start: loc.start.line, end: loc.end.line, count: data.s[id] }))
      .sort((a, b) => b.end - b.start - (a.end - a.start));
    const lines = new Map();
    for (const s of statements) for (let line = s.start; line <= s.end; line++) lines.set(line, s.count);
    for (const [line, count] of lines) add(file, line, count);
  }
}

const attributes = (tag) => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

// coverage.py lists every source folder; a class's file name is relative to the one that holds it.
function parseCobertura(text, base, add) {
  const sources = [...text.matchAll(/<source>([^<]+)<\/source>/g)].map((m) => resolveIn(base, m[1]));
  const folders = sources.length ? sources : [base];
  for (const cls of text.matchAll(/<class\b([^>]*?)(?:\/>|>([\s\S]*?)<\/class>)/g)) {
    const filename = attributes(cls[1]).filename;
    if (!filename || cls[2] === undefined) continue;
    const file = folders.map((folder) => resolveIn(folder, filename)).find((f) => fs.existsSync(f)) ?? resolveIn(folders[0], filename);
    for (const line of cls[2].matchAll(/<line\b([^>]*)\/?>/g)) {
      const { number, hits } = attributes(line[1]);
      if (number !== undefined && hits !== undefined) add(file, Number(number), Number(hits));
    }
  }
}

function parseReport(report, add) {
  const text = fs.readFileSync(report, "utf8");
  // lcov and Istanbul paths are relative to the folder the tests ran in: the one that holds coverage/.
  const dir = path.dirname(report);
  const base = path.basename(dir) === "coverage" ? path.dirname(dir) : dir;
  if (report.endsWith(".info")) parseLcov(text, base, add);
  else if (report.endsWith(".json")) parseIstanbul(text, base, add);
  else {
    if (!/<coverage\b[\s\S]*<\/coverage>/.test(text)) throw new Error("not a Cobertura report");
    parseCobertura(text, dir, add);
  }
}

/**
 * Line hits from the coverage reports in `dirs` (the project root, and each monorepo package) written after
 * `sinceMs`, so a report from before the last edit is never trusted. Unreadable reports are skipped.
 * `written(file)` is when the newest report that lists the file was written.
 */
export function readCoverage(root, dirs, sinceMs) {
  const files = new Map();
  const written = new Map();
  const reports = [];
  for (const dir of dirs) {
    for (const name of REPORTS) {
      const report = path.join(dir, name);
      let stat;
      try {
        stat = fs.statSync(report);
      } catch {
        continue;
      }
      if (stat.mtimeMs <= sinceMs) continue;
      const add = (file, line, count) => {
        const k = key(file);
        let lines = files.get(k);
        if (!lines) files.set(k, (lines = new Map()));
        lines.set(line, Math.max(lines.get(line) ?? 0, count));
        written.set(k, Math.max(written.get(k) ?? 0, stat.mtimeMs));
      };
      try {
        parseReport(report, add);
        reports.push(report);
      } catch {
        // A half-written or foreign file: leave it out rather than guess.
      }
    }
  }
  return { reports, lines: (file) => files.get(key(file)) ?? null, written: (file) => written.get(key(file)) ?? 0 };
}

const changedAfter = (file, time) => {
  try {
    return fs.statSync(file).mtimeMs > time;
  } catch {
    return false;
  }
};

/**
 * Changed code lines (from a `git diff -U0` relative to `root`) that a coverage report lists with 0 hits:
 * [{ file, lines }]. Lines a report does not list (comments, blank lines), files no report mentions, files changed
 * after the report was written, and code a renamed file brought along unchanged are left alone.
 */
export function findUncovered({ diff, root, coverage, ignore = () => false, edited = () => true }) {
  const files = parseDiff(diff);
  // A rename shows up as a deleted file and a new one: only lines that were not in a deleted file are new.
  const deletedText = new Set(files.filter((f) => f.deleted).flatMap((f) => f.hunks.flatMap((h) => h.removed.map((r) => r.text.trim()))));
  return files
    .filter((f) => !f.deleted && !isTestFile(f.path) && !NON_CODE.test(f.path) && !ignore(f.path) && edited(f.path))
    .map((f) => {
      const absolute = path.join(root, f.path);
      const hits = coverage.lines(absolute);
      if (!hits || changedAfter(absolute, coverage.written(absolute))) return { file: f.path, lines: [] };
      const added = f.hunks.flatMap((h) => h.added).filter((a) => !(f.created && deletedText.has(a.text.trim())));
      return { file: f.path, lines: added.map((a) => a.line).filter((line) => hits.get(line) === 0) };
    })
    .filter((f) => f.lines.length);
}

/** "3–5, 9, 11–12": runs of line numbers, with only the first few listed. */
export function lineRanges(lines) {
  const ranges = [];
  for (const line of [...lines].sort((a, b) => a - b)) {
    const last = ranges.at(-1);
    if (last && line === last[1] + 1) last[1] = line;
    else ranges.push([line, line]);
  }
  const shown = ranges.slice(0, MAX_LISTED_RANGES).map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(", ");
  return ranges.length > MAX_LISTED_RANGES ? `${shown} and ${ranges.length - MAX_LISTED_RANGES} more` : shown;
}

/** The block message for uncovered lines, in "ask" or "strict" mode. */
export function uncoveredReason(uncovered, reports, root, mode) {
  const listed = uncovered.slice(0, MAX_LISTED_FILES).map((u) => `${u.file} (line${u.lines.length === 1 ? "" : "s"} ${lineRanges(u.lines)})`);
  const more = uncovered.length > MAX_LISTED_FILES ? ` and ${uncovered.length - MAX_LISTED_FILES} more files` : "";
  const from = reports.map((r) => path.relative(root, r).split(path.sep).join("/")).join(", ");
  const found = `The latest coverage run (${from}) did not run lines you changed: ${listed.join(", ")}${more}. If that run covered only part of the tests, run the full test suite with coverage and stop again.`;
  if (mode === "strict") {
    return `${found} Otherwise add or change tests so these lines run. If they really cannot be tested, explain why in your report on a line starting "Uncovered lines:".`;
  }
  return `${found} Otherwise ask the user once whether you should add tests that run them, then stop and wait for the answer. If they say yes, write the tests and run them with coverage again. If they say no, say so in your report on a line starting "Uncovered lines:". Do not ask again about these files.`;
}
