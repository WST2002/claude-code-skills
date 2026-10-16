import path from "node:path";

const NON_CODE_EXTENSIONS = new Set([
  ".md", ".mdx", ".txt", ".rst",
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".pdf",
  ".lock", ".lockb", ".log", ".out",
]);
const NON_CODE_FILES = new Set(["package-lock.json", "pnpm-lock.yaml", "LICENSE"]);
const DEFAULT_IGNORE = ["docs/**"];
const GIT_BASH_DRIVE = /^\/([a-zA-Z])(?=\/|$)/;

function nativePath(filePath) {
  return process.platform === "win32" ? filePath.replace(GIT_BASH_DRIVE, "$1:") : filePath;
}

function toProjectPath(filePath, cwd) {
  const rel = path.relative(cwd, path.resolve(cwd, nativePath(filePath)));
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

export function parseExitCode(error) {
  const match = typeof error === "string" ? /^Exit code (-?\d+)/.exec(error) : null;
  return match ? Number(match[1]) : null;
}
