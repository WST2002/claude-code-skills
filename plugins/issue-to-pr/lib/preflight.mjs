import { execFileSync } from "node:child_process";

function git(cwd, args) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

function defaultBranchOf(cwd, currentBranch) {
  const head = git(cwd, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  if (head) return head.replace(/^origin\//, "");
  return ["main", "master"].find((name) => git(cwd, ["rev-parse", "--verify", "--quiet", name]) !== null) ?? currentBranch;
}

export function checkRepo(cwd) {
  if (git(cwd, ["rev-parse", "--is-inside-work-tree"]) !== "true") {
    return {
      ok: false,
      problems: [{ what: "This folder is not a git repository.", fix: "Open the project folder, or run git init." }],
      defaultBranch: null,
      currentBranch: null,
      remote: null,
    };
  }
  const problems = [];
  const currentBranch = git(cwd, ["branch", "--show-current"]) || null;
  if (git(cwd, ["status", "--porcelain"])) {
    problems.push({ what: "There are uncommitted changes.", fix: "Commit them, or run git stash, then try again." });
  }
  const remote = git(cwd, ["remote", "get-url", "origin"]);
  if (!remote) {
    problems.push({ what: 'There is no "origin" remote.', fix: "Add one with git remote add origin <url>." });
  }
  return { ok: problems.length === 0, problems, defaultBranch: defaultBranchOf(cwd, currentBranch), currentBranch, remote };
}

export function ghStatus() {
  try {
    execFileSync("gh", ["auth", "status"], { stdio: "ignore" });
    return "ok";
  } catch (error) {
    return error.code === "ENOENT" ? "missing" : "not-logged-in";
  }
}
