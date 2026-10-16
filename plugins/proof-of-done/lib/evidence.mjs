import { isCodeFile, isMasked, isVerifyCommand, parseExitCode } from "./classify.mjs";

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const SHELL_TOOLS = new Set(["Bash", "PowerShell"]);

function exitCodeOf(input) {
  if (input.hook_event_name !== "PostToolUseFailure") return 0;
  return input.is_interrupt ? null : parseExitCode(input.error);
}

export function entryFor(input, config, projectCommands) {
  const toolInput = input.tool_input ?? {};
  const at = new Date().toISOString();
  if (EDIT_TOOLS.has(input.tool_name)) {
    if (input.hook_event_name !== "PostToolUse") return null;
    const file = toolInput.file_path ?? toolInput.notebook_path;
    return typeof file === "string" && isCodeFile(file, input.cwd, config.ignore) ? { type: "edit", file, at } : null;
  }
  if (SHELL_TOOLS.has(input.tool_name) && isVerifyCommand(toolInput.command, projectCommands)) {
    return { type: "verify", command: toolInput.command, exitCode: exitCodeOf(input), masked: isMasked(toolInput.command), at };
  }
  return null;
}
