// Minimal PNG reader (8-bit, non-interlaced), so the scripts need nothing but Node.js.
import fs from "node:fs";
import zlib from "node:zlib";

const SIGNATURE = "89504e470d0a1a0a";
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function predict(filter, left, up, upLeft) {
  if (filter === 0) return 0;
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return (left + up) >> 1;
  if (filter === 4) return paeth(left, up, upLeft);
  throw new Error(`Unknown PNG row filter ${filter}: the file is damaged, export it again`);
}

/** Reads a PNG file. Returns its size and rgba(x, y) → [r, g, b, a]. */
export function readPng(file) {
  const data = fs.readFileSync(file);
  if (data.subarray(0, 8).toString("hex") !== SIGNATURE) throw new Error(`${file} is not a PNG: save the screenshot or export the frame as PNG`);
  let header = null;
  let palette = null;
  const chunks = [];
  for (let offset = 8; offset < data.length; ) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    const body = data.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], colorType: body[9], interlace: body[12] };
    else if (type === "PLTE") palette = body;
    else if (type === "IDAT") chunks.push(body);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  const { width, height, depth, colorType, interlace } = header;
  if (depth !== 8 || interlace !== 0 || !(colorType in CHANNELS)) {
    throw new Error(`Unsupported PNG (bit depth ${depth}, colour type ${colorType}, interlaced ${interlace === 1}): export it again as an 8-bit PNG`);
  }
  const channels = CHANNELS[colorType];
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = y * (stride + 1) + 1;
    const out = y * stride;
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? pixels[out + i - channels] : 0;
      const up = y > 0 ? pixels[out - stride + i] : 0;
      const upLeft = y > 0 && i >= channels ? pixels[out - stride + i - channels] : 0;
      pixels[out + i] = (raw[line + i] + predict(filter, left, up, upLeft)) & 0xff;
    }
  }
  const rgba = (x, y) => {
    const at = y * stride + x * channels;
    const p = pixels;
    if (colorType === 0) return [p[at], p[at], p[at], 255];
    if (colorType === 2) return [p[at], p[at + 1], p[at + 2], 255];
    if (colorType === 3) return [palette[p[at] * 3], palette[p[at] * 3 + 1], palette[p[at] * 3 + 2], 255];
    if (colorType === 4) return [p[at], p[at], p[at], p[at + 1]];
    return [p[at], p[at + 1], p[at + 2], p[at + 3]];
  };
  return { width, height, rgba };
}
