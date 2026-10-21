#!/usr/bin/env node
// Exact WCAG contrast, from two colours or from a box on a PNG screenshot.
//   node contrast.mjs "#9E9E9E" "#BDBDBD"
//   node contrast.mjs screen.png 400,1168,348,96      (box: x,y,width,height in image pixels)
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPng } from "./png.mjs";

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const THRESHOLDS = [
  ["Normal text", 4.5],
  ["Large text (18px+, or 14px+ bold)", 3],
  ["Icons, input borders, focus rings", 3],
];
// A colour must cover at least this share of the box to count as text, so stray anti-aliased pixels are ignored.
const MIN_SHARE = 0.01;

export function parseHex(text) {
  const match = HEX.exec(text.trim());
  if (!match) throw new Error(`"${text}" is not a hex colour: use a value like #1D1D1F`);
  const hex = match[1].length === 3 ? [...match[1]].map((c) => c + c).join("") : match[1];
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

export const toHex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;

function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const overWhite = ([r, g, b, a]) => [r, g, b].map((v) => Math.round((v * a + 255 * (255 - a)) / 255));

/** The background (most common colour) and the text colour (the most contrasting common colour) inside a box. */
export function sampleBox(image, { x, y, width, height }) {
  if (x < 0 || y < 0 || width < 1 || height < 1 || x + width > image.width || y + height > image.height) {
    throw new Error(`Box ${x},${y},${width},${height} is outside the ${image.width}×${image.height} image: use image pixels (x,y,width,height)`);
  }
  const counts = new Map();
  for (let row = y; row < y + height; row++) {
    for (let col = x; col < x + width; col++) {
      const hex = toHex(overWhite(image.rgba(col, row)));
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
  }
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  const background = parseHex(ranked[0][0]);
  const minimum = Math.max(2, width * height * MIN_SHARE);
  const candidates = ranked.slice(1).filter(([, n]) => n >= minimum).map(([hex]) => parseHex(hex));
  if (candidates.length === 0) throw new Error("Only one colour found in the box: draw the box around the text and some of its background");
  const text = candidates.reduce((best, c) => (contrastRatio(c, background) > contrastRatio(best, background) ? c : best));
  return { text, background };
}

export function report(text, background, source) {
  const ratio = contrastRatio(text, background);
  const rows = THRESHOLDS.map(([label, min]) => `${label.padEnd(36)} needs ${min}:1  ${ratio >= min ? "✓ pass" : "✗ fail"}`);
  return [
    `Text        ${toHex(text)}`,
    `Background  ${toHex(background)}`,
    `Ratio       ${ratio.toFixed(2)}:1 (${source})`,
    ...rows,
  ].join("\n");
}

function main(args) {
  if (args.length === 2 && args[0].toLowerCase().endsWith(".png")) {
    const [x, y, width, height] = args[1].split(",").map(Number);
    const { text, background } = sampleBox(readPng(args[0]), { x, y, width, height });
    return report(text, background, `sampled from ${path.basename(args[0])}`);
  }
  if (args.length === 2) return report(parseHex(args[0]), parseHex(args[1]), "exact values");
  throw new Error('Usage: node contrast.mjs "#text" "#background"  |  node contrast.mjs screen.png x,y,width,height');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(main(process.argv.slice(2)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
