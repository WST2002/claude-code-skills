import { isCodeFile, parseExitCode } from "./classify.mjs";
import { testsRun } from "./output.mjs";
import { SHELL_EDIT, analyzeShell } from "./shell.mjs";

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const SHELL_TOOLS = new Set(["Bash", "PowerShell"]);

function exitCodeOf(input) {
  if (input.hook_event_name !== "PostToolUseFailure") return 0;
  return input.is_interrupt ? null : parseExitCode(input.error);
}

function outputOf(input) {
  const response = input.tool_response;
  if (typeof response === "string") return response;
  return [response?.stdout, response?.stderr].filter((text) => typeof text === "string").join("\n");
}

function shellEntries(input, config, projectCommands, at) {
  const command = input.tool_input?.command;
  if (typeof command !== "string") return [];
  const { cwd } = input;
  const ran = input.hook_event_name === "PostToolUse" ? testsRun(outputOf(input)) : null;
  return analyzeShell(command, projectCommands).flatMap((event) => {
    if (event.type === "edit") {
      const counts = event.target === SHELL_EDIT || isCodeFile(event.target, cwd, config.ignore);
      return counts ? [{ type: "edit", file: event.target, cwd, at }] : [];
    }
    const { check, args, masked } = event;
    const entry = { type: "verify", command, check, args, exitCode: exitCodeOf(input), masked, cwd, at };
    return [ran === null ? entry : { ...entry, testsRun: ran }];
  });
}

export function entriesFor(input, config, projectCommands) {
  const toolInput = input.tool_input ?? {};
  const at = new Date().toISOString();
  if (EDIT_TOOLS.has(input.tool_name)) {
    if (input.hook_event_name !== "PostToolUse") return [];
    const file = toolInput.file_path ?? toolInput.notebook_path;
    return typeof file === "string" && isCodeFile(file, input.cwd, config.ignore) ? [{ type: "edit", file, cwd: input.cwd, at }] : [];
  }
  return SHELL_TOOLS.has(input.tool_name) ? shellEntries(input, config, projectCommands, at) : [];
}
