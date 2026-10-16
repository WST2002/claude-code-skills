import fs from "node:fs";
import path from "node:path";

export const CONFIG_PATH = ".groundwork/proof-of-done.json";

const strings = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === "string") : null);

export function loadConfig(projectDir) {
  const defaults = { enabled: true, verify: null, ignore: [], error: null };
  let raw;
  try {
    raw = fs.readFileSync(path.join(projectDir, CONFIG_PATH), "utf8");
  } catch {
    return defaults;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { ...defaults, error: `${CONFIG_PATH} is invalid JSON: ${error.message}. Fix the file or delete it.` };
  }
  return {
    enabled: parsed.enabled !== false,
    verify: strings(parsed.verify),
    ignore: strings(parsed.ignore) ?? [],
    error: null,
  };
}
