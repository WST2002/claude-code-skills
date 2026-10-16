import path from "node:path";

const NON_CODE_EXTENSIONS = new Set([
  ".md", ".mdx", ".txt", ".rst",
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".pdf",
  ".lock", ".lockb",
]);
const NON_CODE_FILES = new Set(["package-lock.json", "pnpm-lock.yaml", "LICENSE"]);
const DEFAULT_IGNORE = ["docs/**"];

const VERIFY_PATTERNS = [
  /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(test|build|lint|typecheck|check)\b/,
  /\bnpx\s+(tsc|vitest|jest|eslint|playwright\s+test)\b/,
  /\bpytest\b/,
  /\bgo\s+(test|build)\b/,
  /\bcargo\s+(test|build|check|clippy)\b/,
  /\bmvnw?\s+(test|verify|package)\b/,
  /\bgradlew?\s+(test|build|check)\b/,
  /\bdotnet\s+(test|build)\b/,
  /\bmake\s+(test|check)\b/,
];

const SWALLOWED_EXIT = [
  /\|\|\s*(true|:|exit\s+0)(?=\s|$|;|&|\))/,
  /;\s*(true|exit\s+0)\s*$/,
];
const PIPE = /(^|[^|])\|(?!\|)/;
const PIPEFAIL = /set\s+-o\s+pipefail/;

function toProjectPath(filePath, cwd) {
  const rel = path.relative(cwd, path.resolve(cwd, filePath));
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join("/");
}

export function globToRegExp(glob) {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === "*" && glob[i + 1] === "*") {
      if (glob[i + 2] === "/") {
        source += "(?:.*/)?";
        i += 2;
      } else {
        source += ".*";
        i += 1;
      }
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

export function matchesGlob(relPath, glob) {
  const re = globToRegExp(glob);
  return re.test(relPath) || (!glob.includes("/") && re.test(path.posix.basename(relPath)));
}

export function isCodeFile(filePath, cwd, ignore = []) {
  const rel = toProjectPath(filePath, cwd);
  if (rel === null) return false;
  const base = path.posix.basename(rel);
  if (NON_CODE_FILES.has(base)) return false;
  if (NON_CODE_EXTENSIONS.has(path.posix.extname(base).toLowerCase())) return false;
  return ![...DEFAULT_IGNORE, ...ignore].some((glob) => matchesGlob(rel, glob));
}

export function isVerifyCommand(command, projectCommands = []) {
  if (typeof command !== "string" || !command.trim()) return false;
  return projectCommands.some((c) => command.includes(c)) || VERIFY_PATTERNS.some((re) => re.test(command));
}

export function isMasked(command) {
  if (SWALLOWED_EXIT.some((re) => re.test(command))) return true;
  return PIPE.test(command) && !PIPEFAIL.test(command);
}

export function parseExitCode(error) {
  const match = typeof error === "string" ? /^Exit code (-?\d+)/.exec(error) : null;
  return match ? Number(match[1]) : null;
}
