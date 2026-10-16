import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pod-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

export function writeFiles(dir, files) {
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
  }
}
