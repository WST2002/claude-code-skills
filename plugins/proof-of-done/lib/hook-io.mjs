import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const readHookInput = () => JSON.parse(fs.readFileSync(0, "utf8"));

export const pluginDataDir = () =>
  process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), ".claude", "plugins", "data", "proof-of-done");

export const warn = (message) => process.stderr.write(`proof-of-done: ${message}\n`);
