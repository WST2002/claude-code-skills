import { SHELL_EDIT, isCodeFile, isMasked, isVerifyCommand, parseExitCode, shellEditTargets } from "./classify.mjs";

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const SHELL_TOOLS = new Set(["Bash", "PowerShell"]);

function exitCodeOf(input) {
  if (input.hook_event_name !== "PostToolUseFailure") return 0;
  return input.is_interrupt ? null : parseExitCode(input.error);
}

function shellEntries(input, config, projectCommands, at) {
  const command = input.tool_input?.command;
  if (typeof command !== "string") return [];
  const entries = [];
  const edited = shellEditTargets(command).find((t) => t === SHELL_EDIT || isCodeFile(t, input.cwd, config.ignore));
  if (edited) entries.push({ type: "edit", file: edited, at });
  if (isVerifyCommand(command, projectCommands)) {
    entries.push({ type: "verify", command, exitCode: exitCodeOf(input), masked: isMasked(command), at });
  }
  return entries;
}

export function entriesFor(input, config, projectCommands) {
  const toolInput = input.tool_input ?? {};
  const at = new Date().toISOString();
  if (EDIT_TOOLS.has(input.tool_name)) {
    if (input.hook_event_name !== "PostToolUse") return [];
    const file = toolInput.file_path ?? toolInput.notebook_path;
    return typeof file === "string" && isCodeFile(file, input.cwd, config.ignore) ? [{ type: "edit", file, at }] : [];
  }
  return SHELL_TOOLS.has(input.tool_name) ? shellEntries(input, config, projectCommands, at) : [];
}
