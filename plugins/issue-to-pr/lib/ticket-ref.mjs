const GITHUB_URL = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+\/[\w.-]+)\/(issues|pull)\/(\d+)/i;
const ISSUE_NUMBER = /^#?(\d+)$/;
const JIRA_KEY = /^[A-Za-z][A-Za-z0-9]+-\d+$/;

const invalid = (reason) => ({ kind: "invalid", reason });

export function parseTicketRef(input) {
  const value = String(input ?? "").trim().replace(/^["']|["']$/g, "").trim();
  if (!value) return invalid("Give an issue number, an issue URL, a Jira key or a description.");

  const url = GITHUB_URL.exec(value);
  if (url) {
    if (url[2].toLowerCase() === "pull") return invalid("That is a pull request, not an issue.");
    return { kind: "github", number: Number(url[3]), repo: url[1] };
  }
  const number = ISSUE_NUMBER.exec(value);
  if (number) return { kind: "github", number: Number(number[1]), repo: null };
  if (JIRA_KEY.test(value)) return { kind: "jira", key: value.toUpperCase() };
  return { kind: "text", text: value };
}
