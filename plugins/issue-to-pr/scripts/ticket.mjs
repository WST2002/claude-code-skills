import { execFileSync } from "node:child_process";
import { parseTicketRef } from "../lib/ticket-ref.mjs";

const ISSUE_FIELDS = "number,title,body,labels,comments,url,state,author";

function fetchGithubIssue({ number, repo }) {
  const args = ["issue", "view", String(number), "--json", ISSUE_FIELDS];
  if (repo) args.push("--repo", repo);
  try {
    const issue = JSON.parse(execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    return {
      kind: "github",
      repo,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      url: issue.url,
      labels: issue.labels.map((label) => label.name),
      comments: issue.comments.map((comment) => ({ author: comment.author?.login, body: comment.body })),
    };
  } catch (error) {
    const reason = error.code === "ENOENT"
      ? "GitHub CLI (gh) is not installed or not on PATH. Install it from https://cli.github.com and run gh auth login."
      : `Could not read issue #${number}: ${(error.stderr || error.message).toString().trim()}`;
    return { kind: "invalid", reason };
  }
}

const ref = parseTicketRef(process.argv.slice(2).join(" "));
let result = ref;
if (ref.kind === "github") result = fetchGithubIssue(ref);
if (ref.kind === "text") result = { ...ref, title: ref.text };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
