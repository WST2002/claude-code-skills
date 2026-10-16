import { checkRepo, ghStatus } from "../lib/preflight.mjs";

let result;
try {
  result = { ...checkRepo(process.cwd()), gh: ghStatus() };
} catch (error) {
  result = { ok: false, problems: [{ what: `Preflight failed: ${error.message}`, fix: "Check the repository state with git status." }] };
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
