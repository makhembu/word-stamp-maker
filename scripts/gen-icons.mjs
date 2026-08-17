// Generates the add-in icon PNGs (16, 32, 80) with a pure-Node PNG encoder.
// No dependencies. Draws a red double-ring "rubber stamp" mark with a T glyph.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------- Minimal PNG encoder ----------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba /* Uint8Array w*h*4 */) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  // raw scanlines with filter byte 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.subarray(y * stride, (y + 1) * stride).forEach((v, i) => {
      raw[y * (stride + 1) + 1 + i] = v;
    });
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- Drawing ----------
const INK = [198, 40, 40, 255]; // stamp red

function drawIcon(size) {
  const SS = 4; // supersample factor
  const S = size * SS;
  const px = new Float64Array(S * S * 4);

  const mix = (a, b, t) => a + (b - a) * t;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // normalized coords in [0,1]
      const nx = (x + 0.5) / S;
      const ny = (y + 0.5) / S;
      const cx = 0.5;
      const cy = 0.5;
      const dx = nx - cx;
      const dy = ny - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      const i = (y * S + x) * 4;

      let col = [0, 0, 0, 0];
      // outer ring: radius 0.44 with 0.09 thickness
      if (r >= 0.35 && r <= 0.44) col = INK;
      // inner ring: radius 0.28 with 0.045 thickness
      else if (r >= 0.235 && r <= 0.28) col = INK;
      // "T" glyph (two bars) inside the inner ring
      else {
        const barW = 0.075;
        const barH = 0.16;
        const inV = Math.abs(dx) <= barW / 2 && Math.abs(dy) <= barH / 2;
        const inH = Math.abs(dy) <= barW / 2 && Math.abs(dx) <= barH * 0.82;
        if (inV || inH) col = INK;
      }
      px[i] = col[0];
      px[i + 1] = col[1];
      px[i + 2] = col[2];
      px[i + 3] = col[3];
    }
  }

  // box downsample to final size (also gives antialiasing)
  const out = new Uint8Array(size * size * 4);
  const f = SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < f; sy++) {
        for (let sx = 0; sx < f; sx++) {
          const i = ((y * f + sy) * S + (x * f + sx)) * 4;
          const alpha = px[i + 3] / 255;
          r += px[i] * alpha;
          g += px[i + 1] * alpha;
          b += px[i + 2] * alpha;
          a += alpha;
        }
      }
      const n = f * f;
      const o = (y * size + x) * 4;
      // unpremultiply
      out[o] = a > 0 ? Math.round(r / a) : 0;
      out[o + 1] = a > 0 ? Math.round(g / a) : 0;
      out[o + 2] = a > 0 ? Math.round(b / a) : 0;
      out[o + 3] = Math.round((a / n) * 255);
    }
  }

  return encodePng(size, size, out);
}

const assetsDir = join(__dirname, "..", "assets");
mkdirSync(assetsDir, { recursive: true });
for (const size of [16, 32, 80]) {
  writeFileSync(join(assetsDir, `icon-${size}.png`), drawIcon(size));
  console.log(`wrote assets/icon-${size}.png`);
}
