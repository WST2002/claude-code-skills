import path from "node:path";

export const SHELL_EDIT = "(shell command)";

const QUOTED = /"(?:[^"\\]|\\.)*"|'[^']*'/g;
const ENV_PREFIX = /^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/;
const PACKAGE_SCRIPT = /^(npm|pnpm|yarn|bun)\s+(?:run\s+)?(test|build|lint|typecheck|check)(?=\s|$)/;
const CHECKS = [
  /^npx\s+(?:tsc|vitest|jest|eslint|playwright\s+test)(?=\s|$)/,
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
const words = (text) => text.split(/\s+/).filter(Boolean);
const fileOperands = (tokens) => tokens.filter((t) => !t.startsWith("-") && path.extname(t) !== "");

export function splitCommand(command) {
  const text = command.replace(QUOTED, '""');
  const segments = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const pair = text.slice(i, i + 2);
    let sep = null;
    if (pair === "&&" || pair === "||") sep = pair;
    else if (text[i] === "|") sep = "|";
    else if (text[i] === ";" || text[i] === "\n") sep = ";";
    else if (text[i] === "&" && text[i - 1] !== ">" && text[i + 1] !== ">") sep = "&";
    if (!sep) continue;
    segments.push({ text: text.slice(start, i).trim(), sep });
    i += sep.length - 1;
    start = i + 1;
  }
  segments.push({ text: text.slice(start).trim(), sep: "" });
  return segments.filter((s) => s.text);
}

function builtinCheck(text) {
  const script = PACKAGE_SCRIPT.exec(text);
  if (script) return { check: `${script[1]} ${script[2]}`, rest: text.slice(script[0].length) };
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
  return found ? { check: found.check, args: squash(found.rest.replace(REDIRECTION, "")) } : null;
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
  const segments = splitCommand(command);
  const pipefail = segments.some((s) => PIPEFAIL.test(s.text));
  return segments.flatMap((segment, index) => {
    const events = editTargets(segment.text).map((target) => ({ type: "edit", target }));
    const found = parseCheck(segment.text, projectCommands);
    if (found) events.push({ type: "verify", ...found, masked: isMaskedAt(segments, index, pipefail) });
    return events;
  });
}
