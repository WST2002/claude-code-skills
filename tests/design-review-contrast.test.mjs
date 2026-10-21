import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { contrastRatio, parseHex, sampleBox, toHex } from "../skills/design-review/scripts/contrast.mjs";
import { readPng } from "../skills/design-review/scripts/png.mjs";

const skill = path.resolve(import.meta.dirname, "../skills/design-review");
const example = path.join(skill, "examples", "checkout.png");
const run = (script, args) => spawnSync(process.execPath, [path.join(skill, "scripts", script), ...args], { encoding: "utf8" });

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "design-review-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Writes a small PNG with filter 0 rows. The reader does not check CRCs, so they are left at 0.
function writePng(file, { width, height, colorType, rows, palette }) {
  const chunk = (type, body) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    return Buffer.concat([length, Buffer.from(type, "ascii"), body, Buffer.alloc(4)]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = colorType;
  const raw = Buffer.concat(rows.map((row) => Buffer.from([0, ...row])));
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    ...(palette ? [chunk("PLTE", Buffer.from(palette))] : []),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]));
}

test("contrast ratios match WCAG reference values", () => {
  assert.equal(contrastRatio(parseHex("#000"), parseHex("#FFFFFF")), 21);
  assert.equal(contrastRatio(parseHex("#FFFFFF"), parseHex("#000000")).toFixed(2), "21.00");
  assert.equal(contrastRatio(parseHex("#767676"), parseHex("#fff")).toFixed(2), "4.54");
  assert.equal(contrastRatio(parseHex("#777777"), parseHex("#fff")).toFixed(2), "4.48");
});

test("bad colours explain the expected format", () => {
  assert.throws(() => parseHex("grey"), /"grey" is not a hex colour: use a value like #1D1D1F/);
});

test("reads a real browser screenshot", () => {
  const image = readPng(example);
  assert.deepEqual([image.width, image.height], [780, 1520]);
  assert.equal(toHex(image.rgba(574, 1180).slice(0, 3)), "#BDBDBD");
});

test("samples the text and background colours of a button from a screenshot", () => {
  const { text, background } = sampleBox(readPng(example), { x: 420, y: 1180, width: 300, height: 70 });
  assert.deepEqual([toHex(text), toHex(background)], ["#9E9E9E", "#BDBDBD"]);
});

test("samples light text on white and white text on blue", () => {
  const image = readPng(example);
  const placeholder = sampleBox(image, { x: 64, y: 456, width: 300, height: 48 });
  assert.deepEqual([toHex(placeholder.text), toHex(placeholder.background)], ["#C7C7CC", "#FFFFFF"]);
  const paypal = sampleBox(image, { x: 40, y: 1180, width: 320, height: 70 });
  assert.deepEqual([toHex(paypal.text), toHex(paypal.background)], ["#FFFFFF", "#2563EB"]);
});

test("reads greyscale, palette and transparent PNGs", (t) => {
  const dir = tempDir(t);
  const cases = [
    { colorType: 0, rows: [[0, 255]], expect: ["#000000", "#FFFFFF"] },
    { colorType: 3, rows: [[1, 0]], palette: [255, 0, 0, 0, 0, 255], expect: ["#0000FF", "#FF0000"] },
    { colorType: 6, rows: [[255, 0, 0, 255, 0, 0, 0, 0]], expect: ["#FF0000", "#000000"] },
  ];
  for (const { expect, ...png } of cases) {
    const file = path.join(dir, `type${png.colorType}.png`);
    writePng(file, { width: 2, height: 1, ...png });
    const image = readPng(file);
    assert.deepEqual([0, 1].map((x) => toHex(image.rgba(x, 0).slice(0, 3))), expect, `colour type ${png.colorType}`);
  }
});

test("transparent pixels are judged over white", (t) => {
  const file = path.join(tempDir(t), "clear.png");
  const clear = [0, 0, 0, 0];
  const black = [0, 0, 0, 255];
  writePng(file, { width: 5, height: 1, colorType: 6, rows: [[...clear, ...black, ...clear, ...black, ...clear]] });
  const { text, background } = sampleBox(readPng(file), { x: 0, y: 0, width: 5, height: 1 });
  assert.deepEqual([toHex(text), toHex(background)], ["#000000", "#FFFFFF"]);
});

test("unsupported files and boxes fail with a fix", (t) => {
  const file = path.join(tempDir(t), "photo.png");
  fs.writeFileSync(file, "not an image");
  assert.throws(() => readPng(file), /is not a PNG: save the screenshot or export the frame as PNG/);
  assert.throws(() => sampleBox(readPng(example), { x: 700, y: 10, width: 200, height: 10 }), /outside the 780×1520 image/);
});

test("contrast CLI works with hex values and with a screenshot box", () => {
  const hex = run("contrast.mjs", ["#9E9E9E", "#BDBDBD"]);
  assert.equal(hex.status, 0);
  assert.match(hex.stdout, /Ratio {7}1\.43:1 \(exact values\)/);
  assert.match(hex.stdout, /Normal text .* ✗ fail/);
  const sampled = run("contrast.mjs", [example, "40,1180,320,70"]);
  assert.match(sampled.stdout, /Ratio {7}5\.17:1 \(sampled from checkout\.png\)/);
  assert.match(sampled.stdout, /Normal text .* ✓ pass/);
  const bad = run("contrast.mjs", ["grey"]);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /^Usage: /);
});
