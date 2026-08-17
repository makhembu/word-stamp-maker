// Standalone smoke test for the canvas stamp renderer.
// Runs in Node with @napi-rs/canvas: renders every template (plus edge-case variants),
// probes the pixels to confirm borders/text/ink are actually drawn, and writes a
// contact-sheet PNG (sample-stamps.png) you can open to eyeball the designs.
//
// Usage: npm run smoke
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- Load the compiled core modules ----
import { installDomShim } from "./dom-shim.mjs";
installDomShim();
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { TEMPLATES, defaultsFor } = require("../.smoke/templates.js");
const { renderStamp } = require("../.smoke/renderer.js");

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error(`  ✗ FAIL: ${msg}`);
    failures++;
    return false;
  }
  return true;
}

/** Decode a data URL and count strong-ink pixels inside normalized regions. */
async function probe(dataUrl, regions, minAlpha = 180) {
  const img = await loadImage(dataUrl);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
  let strong = 0;
  let total = 0;
  for (let i = 3; i < data.length; i += 4) {
    total++;
    if (data[i] > minAlpha) strong++;
  }
  const inkRatio = strong / total;
  const results = regions.map((r) => {
    let n = 0;
    const x0 = Math.round(r.x0 * width);
    const x1 = Math.round(r.x1 * width);
    const y0 = Math.round(r.y0 * height);
    const y1 = Math.round(r.y1 * height);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = (y * width + x) * 4;
        if (data[i + 3] > minAlpha && data[i] + data[i + 1] + data[i + 2] < 640) n++;
      }
    }
    return n >= r.min;
  });
  return { inkRatio, results };
}

// Coordinates are normalized (0..1); note the renderer insets the border box by pad/2 ≈ 5-7%.
const RING_REGIONS = [
  { x0: 0.25, y0: 0.02, x1: 0.75, y1: 0.2, min: 60 }, // top arc of the ring
  { x0: 0.3, y0: 0.35, x1: 0.7, y1: 0.65, min: 12 }, // center text
];
const RING_ONLY = [{ x0: 0.25, y0: 0.02, x1: 0.75, y1: 0.2, min: 60 }];
const RECT_REGIONS = [
  { x0: 0.08, y0: 0.06, x1: 0.92, y1: 0.14, min: 40 }, // top border band
  { x0: 0.15, y0: 0.16, x1: 0.85, y1: 0.62, min: 15 }, // main text band (centered or upper)
];
const DIAG_REGIONS = [{ x0: 0.2, y0: 0.3, x1: 0.8, y1: 0.7, min: 20 }];

const suite = [];
let count = 0;

function add(label, params, regions, minAlpha = 180) {
  count++;
  suite.push({ label, params, regions, minAlpha });
}

for (const t of TEMPLATES) {
  const circleLike = t.shape === "circle" || t.shape === "double-circle" || t.shape === "seal";
  const rectLike = t.shape === "rectangle" || t.shape === "rounded" || t.shape === "signature" || t.shape === "date";
  // double-circle and seal have no center content with default params — ring check only.
  const noCenter = t.shape === "double-circle" || t.shape === "seal";
  const regions = circleLike ? (noCenter ? RING_ONLY : RING_REGIONS) : rectLike ? RECT_REGIONS : DIAG_REGIONS;
  add(`${t.label} (${t.shape})`, defaultsFor(t), regions);
}

const base = defaultsFor(TEMPLATES.find((t) => t.id === "custom"));
add("custom long/double/thick", {
  ...base,
  mainText: "LONGEST POSSIBLE STAMP TEXT HERE",
  secondLine: "second line of text",
  dateText: "17 AUG 2026",
  refText: "12345",
  deptText: "FINANCE",
  nameText: "J. DOE",
  borderStyle: "double",
  borderThickness: 1.6,
  widthPts: 300,
  opacity: 0.4,
  rotation: 45,
  align: "right",
  italic: true,
}, RECT_REGIONS, 70);
add("circle huge text", { ...base, shape: "circle", aspect: 1, widthPts: 90, mainText: "VERY LONG TEXT IN A SMALL CIRCLE STAMP" }, RING_REGIONS);
add("seal full", {
  ...defaultsFor(TEMPLATES.find((t) => t.id === "seal")),
  nameText: "REPUBLIC OF KENYA",
  deptText: "LAND REGISTRY",
  dateText: "17 AUG 2026",
}, RING_REGIONS);
add("unicode", { ...base, mainText: "HABARI — ŠĐČĆŽ", secondLine: "«Санкции» 日本語" }, RECT_REGIONS);
add(
  "underline + per-line sizes",
  {
    ...base,
    mainText: "UNDERLINED",
    secondLine: "smaller line",
    underline: true,
    secondLineSize: 14,
    fontSize: 24,
    widthPts: 180,
  },
  [
    { x0: 0.15, y0: 0.16, x1: 0.85, y1: 0.4, min: 15 }, // main text
    { x0: 0.2, y0: 0.4, x1: 0.8, y1: 0.45, min: 300 }, // underline stroke
  ]
);

// Custom builder: outline shapes with freely placed text blocks.
const customBase = defaultsFor(TEMPLATES.find((t) => t.id === "custom"));
const mkBlocks = (rows) =>
  rows.map(([text, size, y, align, style], i) => ({
    id: "b" + i,
    text,
    size,
    y,
    align: align || "center",
    ...(style || {}),
  }));
add(
  "custom blocks rectangle",
  {
    ...customBase,
    widthPts: 200,
    textBlocks: mkBlocks([["RECEIVED BY", 16, 22], ["MAIN OFFICE", 13, 58]]),
  },
  RECT_REGIONS
);
add(
  "custom blocks circle",
  {
    ...customBase,
    shape: "circle",
    widthPts: 160,
    textBlocks: mkBlocks([["APPROVED", 20, 30], ["BY COMMITTEE", 11, 70]]),
  },
  RING_REGIONS
);
add(
  "custom double-circle",
  {
    ...customBase,
    shape: "double-circle",
    widthPts: 160,
    borderStyle: "single",
    textBlocks: mkBlocks([["ORIGINAL", 16, 50]]),
  },
  RING_REGIONS
);
add(
  "custom ellipse + divider",
  {
    ...customBase,
    shape: "ellipse",
    widthPts: 200,
    divider: true,
    textBlocks: mkBlocks([["RECEIVED", 16, 30], ["17 AUG 2026", 12, 70]]),
  },
  RECT_REGIONS
);
add(
  "custom diamond",
  {
    ...customBase,
    shape: "diamond",
    widthPts: 180,
    textBlocks: mkBlocks([["SAMPLE", 18, 50]]),
  },
  [{ x0: 0.15, y0: 0.12, x1: 0.85, y1: 0.55, min: 15 }]
);
add(
  "custom hexagon",
  {
    ...customBase,
    shape: "hexagon",
    widthPts: 180,
    textBlocks: mkBlocks([["PAID", 20, 50]]),
  },
  [{ x0: 0.2, y0: 0.05, x1: 0.8, y1: 0.55, min: 15 }]
);
add(
  "custom octagon",
  {
    ...customBase,
    shape: "octagon",
    widthPts: 180,
    textBlocks: mkBlocks([["COPY", 18, 50]]),
  },
  [{ x0: 0.2, y0: 0.05, x1: 0.8, y1: 0.55, min: 15 }]
);
add(
  "custom per-block styles",
  {
    ...customBase,
    shape: "rectangle",
    widthPts: 200,
    divider: true,
    textBlocks: mkBlocks([
      ["OFFICER ON DUTY", 15, 24, "center", { bold: true, underline: true }],
      ["MAIN OFFICE", 13, 62, "center", { italic: true, bold: false }],
    ]),
  },
  RECT_REGIONS
);
add(
  "custom stretched letter spacing",
  {
    ...customBase,
    shape: "rectangle",
    widthPts: 230,
    textBlocks: mkBlocks([
      ["OFFICIAL", 20, 30, "center", { spacing: 6 }],
      ["SEAL OF OFFICE", 12, 70, "center", { spacing: 2, bold: false }],
    ]),
  },
  [
    { x0: 0.2, y0: 0.02, x1: 0.8, y1: 0.1, min: 30 }, // top border (tall stamp: border sits at ~4% height)
    { x0: 0.15, y0: 0.2, x1: 0.85, y1: 0.55, min: 15 }, // upper text band
  ]
);
add(
  "custom condensed letter spacing",
  {
    ...customBase,
    shape: "rounded",
    widthPts: 160,
    textBlocks: mkBlocks([["COPY", 24, 50, "center", { spacing: -3 }]]),
  },
  RECT_REGIONS
);

console.log("Rendering + probing…");
const rendered = [];
for (const s of suite) {
  try {
    const r = renderStamp(s.params);
    const okPrefix = r.dataUrl.startsWith("data:image/png;base64,");
    const bytes = Buffer.from(r.dataUrl.split(",")[1] || "", "base64").length;
    const probesOk = await probe(r.dataUrl, s.regions, s.minAlpha);
    const inkOk = probesOk.inkRatio > 0.0005;
    const allProbes = probesOk.results.every(Boolean);
    const ok = okPrefix && bytes > 200 && r.widthPts > 0 && r.heightPts > 0 && inkOk && allProbes;
    if (assert(ok, `${s.label}: PNG ${bytes}B, ink ${(probesOk.inkRatio * 100).toFixed(2)}%, regions ${probesOk.results.join("/")}`)) {
      console.log(`  ✓ ${s.label} → ${r.widthPts}×${r.heightPts}pt, ${bytes}B`);
    }
    rendered.push({ label: s.label, params: s.params, result: r });
  } catch (e) {
    assert(false, `${s.label}: threw ${e.message}`);
  }
}

// ---- Contact sheet ----
const COLS = 5;
const CELL = 220;
const PAD = 12;
const HEADER = 26;
const rows = Math.ceil(rendered.length / COLS);
const sheet = createCanvas(COLS * CELL + PAD * (COLS + 1), HEADER + rows * (CELL + PAD) + PAD);
const sctx = sheet.getContext("2d");
sctx.fillStyle = "#f2f3f5";
sctx.fillRect(0, 0, sheet.width, sheet.height);
sctx.fillStyle = "#222";
sctx.font = "bold 18px sans-serif";
sctx.fillText("Stamp Maker — rendered designs (no Word needed)", PAD, 20);
for (let i = 0; i < rendered.length; i++) {
  const r = rendered[i];
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const x = PAD + col * (CELL + PAD);
  const y = HEADER + PAD + row * (CELL + PAD);
  sctx.fillStyle = "#ffffff";
  sctx.fillRect(x, y, CELL, CELL);
  sctx.fillStyle = "#555";
  sctx.font = "12px sans-serif";
  sctx.fillText(r.label, x + 8, y + 16);
  const img = await loadImage(r.result.dataUrl);
  const scale = Math.min((CELL - 16) / img.width, (CELL - 40) / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  sctx.save();
  sctx.translate(x + CELL / 2, y + 30 + (CELL - 40) / 2);
  sctx.rotate((r.params.rotation * Math.PI) / 180);
  sctx.drawImage(img, -w / 2, -h / 2, w, h);
  sctx.restore();
}
const sheetBuf = sheet.toBuffer("image/png");
writeFileSync(join(__dirname, "..", "sample-stamps.png"), sheetBuf);
console.log(`\nContact sheet written to sample-stamps.png (${sheetBuf.length} bytes)`);

console.log(`${count} renders, ${failures} failures.`);
process.exit(failures ? 1 : 0);
