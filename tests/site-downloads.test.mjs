import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { buildSite } from "../site/build.mjs";
import { createZip, crc32 } from "../site/zip.mjs";

const root = path.resolve(import.meta.dirname, "..");
const skillNames = fs.readdirSync(path.join(root, "skills"));

function builtDir(t) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "site-"));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  buildSite(out);
  return out;
}

// Reads a ZIP through its central directory, the way unzip tools do.
function readZip(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    assert.equal(buffer.readUInt32LE(at), 0x02014b50);
    const [size, nameLength, offset] = [buffer.readUInt32LE(at + 20), buffer.readUInt16LE(at + 28), buffer.readUInt32LE(at + 42)];
    const crc = buffer.readUInt32LE(at + 16);
    const name = buffer.toString("utf8", at + 46, at + 46 + nameLength);
    const start = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28);
    const data = zlib.inflateRawSync(buffer.subarray(start, start + size));
    assert.equal(crc32(data), crc, name);
    files.set(name, data);
    at += 46 + nameLength;
  }
  return files;
}

test("crc32 matches the standard check value", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
});

test("a ZIP round-trips its files", () => {
  const files = readZip(createZip([{ name: "a/SKILL.md", data: Buffer.from("# hi\n") }, { name: "a/x.bin", data: Buffer.from([0, 1, 2, 255]) }]));
  assert.deepEqual([...files.keys()], ["a/SKILL.md", "a/x.bin"]);
  assert.equal(files.get("a/SKILL.md").toString(), "# hi\n");
  assert.deepEqual([...files.get("a/x.bin")], [0, 1, 2, 255]);
});

test("every skill can be downloaded as a ZIP with the skill folder at its root", (t) => {
  const out = builtDir(t);
  for (const name of skillNames) {
    const files = readZip(fs.readFileSync(path.join(out, "downloads", `${name}.zip`)));
    assert.deepEqual(files.get(`${name}/SKILL.md`), fs.readFileSync(path.join(root, "skills", name, "SKILL.md")), name);
    for (const file of files.keys()) assert.ok(file.startsWith(`${name}/`), file);
  }
  const designReview = readZip(fs.readFileSync(path.join(out, "downloads", "design-review.zip")));
  assert.ok(designReview.has("design-review/scripts/contrast.mjs"));
  assert.ok(designReview.has("design-review/examples/checkout.png"));
});

test("skill pages offer the Claude app download with upload steps", (t) => {
  const html = fs.readFileSync(path.join(builtDir(t), "skills", "ux-writing", "index.html"), "utf8");
  assert.match(html, /<a class="button" href="\/claude-code-skills\/downloads\/ux-writing\.zip" download>Download UX Writing \(\.zip\)<\/a>/);
  assert.match(html, /Customize → Skills/);
});

test("skill examples are published with the site", (t) => {
  const out = builtDir(t);
  assert.ok(fs.existsSync(path.join(out, "skills", "design-review", "examples", "checkout-review.html")));
});
