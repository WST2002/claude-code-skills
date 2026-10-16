import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { branchName } from "../lib/branch-name.mjs";

const { values } = parseArgs({
  options: {
    id: { type: "string" },
    title: { type: "string", default: "" },
    labels: { type: "string", default: "" },
  },
});

function existingBranches() {
  try {
    return execFileSync("git", ["branch", "--all", "--format=%(refname:short)"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split("\n")
      .map((name) => name.trim().replace(/^origin\//, ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

const labels = values.labels.split(",").map((label) => label.trim()).filter(Boolean);
process.stdout.write(`${branchName({ id: values.id, title: values.title, labels }, existingBranches())}\n`);
