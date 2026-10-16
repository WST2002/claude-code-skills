import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));

test("every marketplace entry points at a plugin with a matching manifest", () => {
  const marketplace = readJson(".claude-plugin/marketplace.json");
  assert.equal(marketplace.name, "groundwork");
  assert.ok(marketplace.plugins.length > 0);
  for (const entry of marketplace.plugins) {
    assert.match(entry.source, /^\.\/plugins\/[a-z0-9-]+$/);
    const manifest = readJson(path.join(entry.source, ".claude-plugin/plugin.json"));
    assert.equal(manifest.name, entry.name);
    assert.equal(manifest.version, entry.version);
    assert.ok(fs.existsSync(path.join(root, entry.source, "CHANGELOG.md")), `${entry.name} needs a CHANGELOG.md`);
  }
});
