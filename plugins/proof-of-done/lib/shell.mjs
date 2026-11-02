import path from "node:path";

export const SHELL_EDIT = "(shell command)";

const QUOTED = /"(?:[^"\\]|\\.)*"|'[^']*'/g;
const ENV_PREFIX = /^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/;
const PACKAGE_MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);
const PACKAGE_SCRIPTS = new Set(["test", "build", "lint", "typecheck", "check"]);
// Package manager flags that take a value as the next word: they pick the workspace or folder the script runs in.
const VALUE_FLAGS = new Set(["-w", "--workspace", "--filter", "-F", "--prefix", "-C", "--dir", "--cwd"]);
const CD = /^(?:cd|pushd|set-location|push-location)\s+(\S+)$/i;
const ABSOLUTE = /^(?:[A-Za-z]:)?[\\/]|^~/;
const POPD = /^(?:popd|pop-location)$/i;
// A folder the command moved to that cannot be worked out (cd - with no earlier cd, popd with nothing pushed).
export const UNKNOWN_DIR = "<unknown>";
// Tools started through a package manager: `npx vitest`, `pnpm vitest`, `pnpm exec jest`, `yarn jest`, `bunx vitest`.
const LAUNCHER = String.raw`(?:npx|bunx|npm\s+exec|pnpm(?:\s+(?:exec|dlx))?|yarn(?:\s+dlx)?|bun(?:\s+x)?)\s+`;
const CHECKS = [
  new RegExp(String.raw`^(?:${LAUNCHER})?turbo\s+(?:run\s+)?(?:test|build|lint|typecheck|check)(?=\s|$)`),
  new RegExp(String.raw`^(?:${LAUNCHER})?nx\s+(?:test|build|lint|typecheck|run-many|affected|run)(?=\s|$)`),
  new RegExp(String.raw`^(?:${LAUNCHER})?lerna\s+run\s+(?:test|build|lint|typecheck|check)(?=\s|$)`),
  new RegExp(String.raw`^${LAUNCHER}(?:tsc|vitest|jest|eslint|playwright\s+test)(?=\s|$)`),
  /^(?:python3?\s+-m\s+)?pytest(?=\s|$)/,
  /^go\s+(?:test|build)(?=\s|$)/,
  /^cargo\s+(?:test|build|check|clippy)(?=\s|$)/,
  /^(?:\.\/)?mvnw?\s+(?:test|verify|package)(?=\s|$)/,
  /^(?:\.\/)?gradlew?(?:\.bat)?\s+(?:test|build|check)(?=\s|$)/,
  /^dotnet\s+(?:test|build)(?=\s|$)/,
  /^make\s+(?:test|check)(?=\s|$)/,
];
const REDIRECTION = /\d*&?>>?\s*(?:&\d+|\S+)/g;
const REDIRECT_TARGET = /(?:^|[^0-9&>=<-])\d*>>?\s*(?!&)([^\s;&|<>]+)/g;
const DISCARDED_OUTPUT = new Set(["/dev/null", "$null", "nul", "NUL", '""']);
const PIPEFAIL = /\bset\s+-[a-zA-Z]*o\s+pipefail\b/;
const FAILING_EXIT = /^exit\s+[1-9]\d*$/;
const IN_PLACE = /^(-[a-zA-Z]*i[a-zA-Z]*|--in-place)$/;
const OPERAND_COMMANDS = new Set(["mv", "cp", "rm", "tee", "set-content", "add-content", "out-file", "move-item", "copy-item", "remove-item", "new-item"]);
const UNKNOWN_TARGET_GIT = new Set(["apply", "am", "merge", "rebase", "cherry-pick"]);

const squash = (text) => text.trim().replace(/\s+/g, " ");
const unquote = (text) => text.replace(/["']/g, "");
const words = (text) => text.split(/\s+/).filter(Boolean);
const fileOperands = (tokens) => tokens.filter((t) => !t.startsWith("-") && path.extname(t) !== "");

// Segments with quoted text emptied (`text`, so operators inside quotes are ignored) and as written (`raw`).
function segmentsOf(command) {
  // Quoted text is masked at the same length, so each segment's raw text can be cut from the same positions.
  const text = command.replace(QUOTED, (q) => `"${"\u0000".repeat(q.length - 2)}"`);
  const segments = [];
  let start = 0;
  const cut = (end, sep) => ({ text: text.slice(start, end).replace(/"\u0000*"/g, '""').trim(), raw: command.slice(start, end).trim(), sep });
  for (let i = 0; i < text.length; i++) {
    const pair = text.slice(i, i + 2);
    let sep = null;
    if (pair === "&&" || pair === "||") sep = pair;
    else if (text[i] === "|") sep = "|";
    else if (text[i] === ";" || text[i] === "\n") sep = ";";
    else if (text[i] === "&" && text[i - 1] !== ">" && text[i + 1] !== ">") sep = "&";
    if (!sep) continue;
    segments.push(cut(i, sep));
    i += sep.length - 1;
    start = i + 1;
  }
  segments.push(cut(text.length, ""));
  return segments.filter((s) => s.text);
}

export function splitCommand(command) {
  return segmentsOf(command).map(({ text, sep }) => ({ text, sep }));
}

// `npm test`, `npm run test -w api`, `pnpm --filter api test`, `yarn workspace api test`: the flags that choose
// where the script runs come before it, so they move into the arguments.
function packageScript(text) {
  const tokens = words(text);
  if (!PACKAGE_MANAGERS.has(tokens[0])) return null;
  let i = 1;
  if (tokens[0] === "yarn" && tokens[1] === "workspace") i = 3;
  if (tokens[0] === "yarn" && tokens[1] === "workspaces" && tokens[2] === "run") i = 2;
  if (tokens[0] === "yarn" && tokens[1] === "workspaces" && tokens[2] === "foreach") {
    i = tokens.indexOf("run", 3);
    if (i === -1) return null;
  }
  // pnpm's -w means "the workspace root" and takes no value. Flags can also come after `run`.
  const skipFlags = () => {
    while (tokens[i]?.startsWith("-")) i += VALUE_FLAGS.has(tokens[i]) && !(tokens[0] === "pnpm" && tokens[i] === "-w") ? 2 : 1;
  };
  skipFlags();
  if (tokens[i] === "run") {
    i++;
    skipFlags();
  }
  if (!PACKAGE_SCRIPTS.has(tokens[i])) return null;
  const flags = tokens.slice(1, i).filter((t) => t !== "run");
  const found = { check: `${tokens[0]} ${tokens[i]}`, rest: [...flags, ...tokens.slice(i + 1)].join(" ") };
  // A bare `bun test` runs bun's own test runner over every test file, never the "test" script.
  return tokens[0] === "bun" && tokens[i] === "test" && i === 1 ? { ...found, runner: true } : found;
}

function builtinCheck(text) {
  const script = packageScript(text);
  if (script) return script;
  const match = CHECKS.map((re) => re.exec(text)).find(Boolean);
  return match ? { check: squash(match[0]).replace(/^\.\//, ""), rest: text.slice(match[0].length) } : null;
}

function parseCheck(segment, projectCommands) {
  const text = squash(segment.replace(ENV_PREFIX, ""));
  for (const project of projectCommands.map(squash)) {
    if (text !== project && !text.startsWith(`${project} `)) continue;
    const canonical = builtinCheck(project);
    const check = canonical ? squash(`${canonical.check} ${canonical.rest}`) : project;
    return { check, args: squash(text.slice(project.length).replace(REDIRECTION, "")) };
  }
  const found = builtinCheck(text);
  return found ? { check: found.check, args: squash(found.rest.replace(REDIRECTION, "")), ...(found.runner && { runner: true }) } : null;
}

function isMaskedAt(segments, index, pipefail) {
  if (segments[index].sep === "|") return !pipefail;
  for (let j = index; j < segments.length - 1; j++) {
    const { sep } = segments[j];
    if (sep === "&&" || (sep === "|" && j > index)) continue;
    if (sep === "||" && FAILING_EXIT.test(segments[j + 1].text)) {
      j++;
      continue;
    }
    return true;
  }
  return false;
}

function editTargets(segment) {
  const redirects = [...segment.matchAll(REDIRECT_TARGET)].map((m) => m[1]).filter((t) => !DISCARDED_OUTPUT.has(t));
  const tokens = words(segment.replace(ENV_PREFIX, "").replace(REDIRECTION, ""));
  const [command = "", ...args] = tokens;
  const name = command.toLowerCase();
  let operands = [];
  if ((name === "sed" || name === "perl") && args.some((a) => IN_PLACE.test(a))) {
    operands = fileOperands(args.filter((a) => !a.startsWith("-")).slice(1));
  } else if (OPERAND_COMMANDS.has(name)) {
    operands = fileOperands(args);
  } else if (name === "git") {
    const [sub, ...rest] = args;
    if (UNKNOWN_TARGET_GIT.has(sub) || (sub === "stash" && rest[0] === "pop")) operands = [SHELL_EDIT];
    else if (sub === "restore") operands = fileOperands(rest);
    else if (sub === "checkout" && rest.includes("--")) operands = fileOperands(rest.slice(rest.indexOf("--") + 1));
  }
  return [...operands, ...redirects];
}

export function analyzeShell(command, projectCommands = []) {
  const segments = segmentsOf(command);
  const pipefail = segments.some((s) => PIPEFAIL.test(s.text));
  // The folder each segment runs in, relative to where the command started: cd and pushd move it, popd and cd - go back.
  let dir;
  let previous;
  let moved = false;
  const stack = [];
  return segments.flatMap((segment, index) => {
    const cd = CD.exec(unquote(segment.raw));
    if (POPD.test(segment.text)) dir = stack.length ? stack.pop() : UNKNOWN_DIR;
    else if (cd?.[1] === "-") [dir, previous] = moved ? [previous, dir] : [UNKNOWN_DIR, dir];
    else if (cd) {
      if (/^push/i.test(segment.text)) stack.push(dir);
      previous = dir;
      moved = true;
      dir = dir && !ABSOLUTE.test(cd[1]) ? `${dir}/${cd[1]}` : cd[1];
    }
    const events = editTargets(segment.text).map((target) => ({ type: "edit", target, ...(dir && { dir }) }));
    // Quoted words (`--filter "@shop/api"`) are read from the segment as written, without their quotes.
    const found = parseCheck(segment.raw === segment.text ? segment.text : unquote(segment.raw), projectCommands);
    if (found) events.push({ type: "verify", ...found, masked: isMaskedAt(segments, index, pipefail), ...(dir && { dir }) });
    return events;
  });
}
