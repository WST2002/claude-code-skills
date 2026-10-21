// Finds test changes that make a check pass without fixing anything, in a unified diff (git diff -U0).

const TEST_FILE = [
  /(^|\/)(tests?|__tests__|spec)\//,
  /\.(test|spec)\.[cm]?[jt]sx?$/,
  /(^|\/)test_[^/]+\.py$/,
  /_test\.(py|go)$/,
  /Tests?\.(java|kt|cs)$/,
];
const SKIP = /\.(skip|only|todo)\s*\(|\b(xit|xdescribe|xtest|fit|fdescribe)\s*\(|@pytest\.mark\.(skip|skipif|xfail)\b|@unittest\.skip|\bt\.Skip(Now|f)?\(|#\[ignore\]|@Disabled\b|@Ignore\b/;
const ALWAYS_PASSES = /expect\(\s*(true|1)\s*\)\.(toBe|toEqual)\(\s*(true|1)\s*\)|\bassert\s+True\b|assert\.ok\(\s*true\s*\)|assertTrue\(\s*true\s*\)|\bassert\(\s*true\s*\)/;
const WEAK = /\.(toBeTruthy|toBeDefined|toBeFalsy)\(\s*\)|\.not\.toBeNull\(\s*\)|\.not\.toBeUndefined\(\s*\)|toBeGreaterThanOrEqual\(\s*0\s*\)|\bassert\s+\w[\w.]*\s*(is not None)?\s*$/;
const STRONG = /\.(toBe|toEqual|toStrictEqual|toMatch|toContain|toHaveLength|toThrow|toHaveBeenCalledWith)\(\s*\S|\bassert\w*\s*\(?.*(==|!=|Equal|In\b)|\bassert\.(equal|deepEqual|strictEqual|deepStrictEqual|match|throws)\(/;
const TEST_CASE = /^\s*(it|test|describe|xit|fit|xdescribe|fdescribe)(\.\w+)*\s*\(|^\s*(async\s+)?def\s+test_|^\s*func\s+Test\w*\(|@Test\b/;
const SUPPRESS = /@ts-(ignore|nocheck)\b|eslint-disable|#\s*noqa\b|#\s*type:\s*ignore|\/\/\s*nolint\b|@SuppressWarnings\b|#\s*pragma:\s*no cover/;
const THRESHOLD = /\b(branches|functions|lines|statements|fail_under|fail-under|cov-fail-under)["']?\s*[:=]?\s*(\d+(?:\.\d+)?)/;
const NON_CODE = /\.(md|mdx|txt|rst|lock)$|(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/;

export const isTestFile = (file) => TEST_FILE.some((re) => re.test(file));

function parseDiff(diff) {
  const files = [];
  let file = null;
  let line = 0;
  let hunk = null;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      file = { path: raw.replace(/^diff --git a\/.* b\//, ""), deleted: false, hunks: [] };
      files.push(file);
      hunk = null;
    } else if (!file) continue;
    else if (raw.startsWith("deleted file mode")) file.deleted = true;
    else if (raw.startsWith("+++ ") && raw !== "+++ /dev/null") file.path = raw.slice(4).replace(/^b\//, "");
    else if (raw.startsWith("@@")) {
      line = Number(/\+(\d+)/.exec(raw)?.[1] ?? 0);
      hunk = { added: [], removed: [] };
      file.hunks.push(hunk);
    } else if (hunk && raw.startsWith("+") && !raw.startsWith("+++")) hunk.added.push({ line: line++, text: raw.slice(1) });
    else if (hunk && raw.startsWith("-") && !raw.startsWith("---")) hunk.removed.push({ text: raw.slice(1) });
    else if (hunk && raw.startsWith(" ")) line++;
  }
  return files;
}

const short = (text) => {
  const t = text.trim();
  return t.length > 80 ? `${t.slice(0, 77)}…` : t;
};

/** Test-weakening changes in a diff: [{ file, line, kind, text }]. `ignore(file)` leaves a file out. */
export function findTampering(diff, ignore = () => false) {
  const findings = [];
  for (const file of parseDiff(diff)) {
    if (ignore(file.path) || NON_CODE.test(file.path)) continue;
    const test = isTestFile(file.path);
    if (file.deleted) {
      if (test) findings.push({ file: file.path, line: null, kind: "deleted-file", text: "" });
      continue;
    }
    let removedCases = 0;
    let addedCases = 0;
    for (const { added, removed } of file.hunks) {
      const removedStrong = removed.some((r) => STRONG.test(r.text));
      for (const { line, text } of added) {
        const add = (kind) => findings.push({ file: file.path, line, kind, text: short(text) });
        if (SUPPRESS.test(text)) add("suppressed");
        else if (test && SKIP.test(text)) add("skipped");
        else if (test && ALWAYS_PASSES.test(text)) add("always-passes");
        else if (test && removedStrong && WEAK.test(text)) add("weakened");
        const before = removed.map((r) => THRESHOLD.exec(r.text)).find((m) => m && m[1] === THRESHOLD.exec(text)?.[1]);
        const after = THRESHOLD.exec(text);
        if (before && after && Number(after[2]) < Number(before[2])) add("threshold");
      }
      if (test) {
        removedCases += removed.filter((r) => TEST_CASE.test(r.text)).length;
        addedCases += added.filter((a) => TEST_CASE.test(a.text)).length;
      }
    }
    if (removedCases > addedCases) findings.push({ file: file.path, line: null, kind: "removed-tests", text: String(removedCases - addedCases) });
  }
  return findings;
}

const DESCRIBE = {
  "deleted-file": () => "deletes this test file",
  "removed-tests": (f) => `removes ${f.text} test${f.text === "1" ? "" : "s"}`,
  suppressed: (f) => `hides an error or warning: \`${f.text}\``,
  skipped: (f) => `skips or focuses tests: \`${f.text}\``,
  "always-passes": (f) => `adds an assertion that can never fail: \`${f.text}\``,
  weakened: (f) => `replaces an exact assertion with a weaker one: \`${f.text}\``,
  threshold: (f) => `lowers a coverage threshold: \`${f.text}\``,
};
const MAX_LISTED = 6;

export function tamperReason(findings) {
  const lines = findings.slice(0, MAX_LISTED).map((f) => `- ${f.file}${f.line ? `:${f.line}` : ""} ${DESCRIBE[f.kind](f)}`);
  if (findings.length > MAX_LISTED) lines.push(`- and ${findings.length - MAX_LISTED} more`);
  return [
    "These changes can make checks pass without fixing anything:",
    ...lines,
    'Undo them and fix the cause, or, if a change is really intended, explain it in your report on a line starting "Test changes:".',
  ].join("\n");
}
