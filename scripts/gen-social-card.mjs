// Generates assets/social-card.png — the 1200×630 Open Graph / Twitter card.
// Warm paper background, ink frame, the wordmark, and three real rendered stamps
// (from the actual renderer) so the card is unmistakably about this product.
//
// Usage: npm run social
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { installDomShim } from "./dom-shim.mjs";

installDomShim();

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { TEMPLATES, defaultsFor } = require("../.smoke/templates.js");
const { renderStamp } = require("../.smoke/renderer.js");

const W = 1200;
const H = 630;
const OUT = join(__dirname, "..", "assets", "social-card.png");

const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");

// Warm paper background
ctx.fillStyle = "#f2ece1";
ctx.fillRect(0, 0, W, H);

// Ink frame (double rule, like a document border)
ctx.strokeStyle = "#221d15";
ctx.lineWidth = 3;
ctx.strokeRect(24, 24, W - 48, H - 48);
ctx.lineWidth = 1.2;
ctx.strokeRect(38, 38, W - 76, H - 76);

// Red kicker
ctx.fillStyle = "#c12f24";
ctx.font = "700 26px Arial, sans-serif";
ctx.textBaseline = "alphabetic";
ctx.fillText("FREE MICROSOFT WORD ADD-IN", 80, 118);

// Wordmark (stacked, stamp-lettering voice via heavy condensed-ish system face)
ctx.fillStyle = "#221d15";
ctx.font = "900 148px 'Arial Black', Arial, sans-serif";
ctx.fillText("STAMP", 78, 288);
ctx.fillStyle = "#c12f24";
ctx.fillText("MAKER", 78, 428);

// Tagline
ctx.fillStyle = "#6d6353";
ctx.font = "600 30px Arial, sans-serif";
ctx.fillText("Rubber stamps that overlay your Word documents —", 80, 502);
ctx.fillText("no text reflow, no subscription.", 80, 540);

// Small print
ctx.fillStyle = "#a3967f";
ctx.font = "600 21px Arial, sans-serif";
ctx.fillText("free forever  ·  no account  ·  Windows & Mac  ·  installs in under a minute", 80, 586);

// Three real rendered stamps, tilted like impressions on the desk (right third)
async function drawStamp(id, x, y, w, rot) {
  const p = defaultsFor(TEMPLATES.find((t) => t.id === id));
  const { dataUrl } = renderStamp(p);
  const img = await loadImage(dataUrl);
  const scale = w / img.width;
  const ih = img.height * scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -ih / 2, w, ih);
  ctx.restore();
}

await drawStamp("approved", 985, 210, 230, -12);
await drawStamp("confidential", 1085, 330, 190, 8);
await drawStamp("seal", 880, 370, 210, -5);

const buf = canvas.toBuffer("image/png");
writeFileSync(OUT, buf);
console.log(`Wrote ${OUT} (${buf.length} bytes)`);
