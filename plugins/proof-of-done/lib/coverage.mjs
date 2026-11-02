// Reads coverage reports that the project's own test runs wrote, and finds changed code lines that no test ran.
import fs from "node:fs";
import path from "node:path";
import { nativePath } from "./classify.mjs";
import { isTestFile, parseDiff } from "./tamper.mjs";

// Report files, relative to the project root or a monorepo package. lcov comes from Jest, Vitest, c8, nyc and node;
// coverage-final.json from Istanbul; Cobertura XML from coverage.py / pytest-cov and Jest's cobertura reporter.
const REPORTS = ["coverage/lcov.info", "lcov.info", "coverage/coverage-final.json", "coverage.xml", "coverage/cobertura-coverage.xml", "coverage/coverage.xml"];
const NON_CODE = /\.(md|mdx|txt|rst|json|ya?ml|toml|lock|css|scss|sass|less|html?|svg|png|jpe?g|gif|webp|ico|snap)$/i;
const MAX_LISTED_FILES = 5;
const MAX_LISTED_RANGES = 8;

const key = (file) => {
  const resolved = path.resolve(nativePath(file)).split(path.sep).join("/");
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
};

function parseLcov(text, base, add) {
  let file = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("SF:")) file = path.resolve(base, line.slice(3).trim());
    else if (line.startsWith("DA:") && file) {
      const [number, count] = line.slice(3).split(",");
      add(file, Number(number), Number(count));
    } else if (line === "end_of_record") file = null;
  }
}

// Istanbul counts statements, not lines: each line takes the count of the smallest statement on it, so a function
// that ran does not hide a branch inside it that never did.
function parseIstanbul(text, base, add) {
  for (const [name, data] of Object.entries(JSON.parse(text))) {
    const file = path.resolve(base, data.path ?? name);
    const statements = Object.entries(data.statementMap ?? {})
      .map(([id, loc]) => ({ start: loc.start.line, end: loc.end.line, count: data.s?.[id] ?? 0 }))
      .sort((a, b) => b.end - b.start - (a.end - a.start));
    const lines = new Map();
    for (const s of statements) for (let line = s.start; line <= s.end; line++) lines.set(line, s.count);
    for (const [line, count] of lines) add(file, line, count);
  }
}

function parseCobertura(text, base, add) {
  const source = /<source>([^<]+)<\/source>/.exec(text)?.[1]?.trim();
  for (const cls of text.matchAll(/<class\b[^>]*\bfilename="([^"]+)"[^>]*>([\s\S]*?)<\/class>/g)) {
    const file = path.resolve(source ?? base, cls[1]);
    for (const line of cls[2].matchAll(/<line\b[^>]*\bnumber="(\d+)"[^>]*\bhits="(\d+)"/g)) add(file, Number(line[1]), Number(line[2]));
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
    parseCobertura(text, base, add);
  }
}

/**
 * Line hits from the coverage reports in `dirs` (the project root, and each monorepo package) written after
 * `sinceMs`, so a report from before the last edit is never trusted. Unreadable reports are skipped.
 */
export function readCoverage(root, dirs, sinceMs) {
  const files = new Map();
  const reports = [];
  const add = (file, line, count) => {
    const lines = files.get(key(file)) ?? new Map();
    lines.set(line, Math.max(lines.get(line) ?? 0, count));
    files.set(key(file), lines);
  };
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
      try {
        parseReport(report, add);
        reports.push(report);
      } catch {
        // A half-written or foreign file: leave it out rather than guess.
      }
    }
  }
  return { reports, lines: (file) => files.get(key(file)) ?? null };
}

/**
 * Changed code lines (from a `git diff -U0` relative to `root`) that a coverage report lists with 0 hits:
 * [{ file, lines }]. Lines a report does not list (comments, blank lines) and files no report mentions are left alone.
 */
export function findUncovered({ diff, root, coverage, ignore = () => false, edited = () => true }) {
  return parseDiff(diff)
    .filter((f) => !f.deleted && !isTestFile(f.path) && !NON_CODE.test(f.path) && !ignore(f.path) && edited(f.path))
    .map((f) => {
      const hits = coverage.lines(path.join(root, f.path));
      const lines = hits ? f.hunks.flatMap((h) => h.added.map((a) => a.line)).filter((line) => hits.get(line) === 0) : [];
      return { file: f.path, lines };
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
  const found = `The coverage report (${from}) shows that lines you changed never ran in any test: ${listed.join(", ")}${more}.`;
  if (mode === "strict") {
    return `${found} Add or change tests so these lines run, then run the tests with coverage again. If they really cannot be tested, explain why in your report on a line starting "Uncovered lines:".`;
  }
  return `${found} Ask the user once whether you should add tests that run them, then stop and wait for the answer. If they say yes, write the tests and run them with coverage again. If they say no, say so in your report on a line starting "Uncovered lines:". Do not ask again about these files.`;
}
