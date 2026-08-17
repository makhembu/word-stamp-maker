// Generates the per-design PNGs shown in the landing-page gallery (assets/gallery/*.png).
// Renders every template with the real renderer, downscales to a web-friendly size,
// and writes the images where webpack will copy them into dist/.
//
// Usage: npm run gallery
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { installDomShim } from "./dom-shim.mjs";

installDomShim();

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { TEMPLATES, defaultsFor } = require("../.smoke/templates.js");
const { renderStamp } = require("../.smoke/renderer.js");

const OUT_DIR = join(__dirname, "..", "assets", "gallery");
mkdirSync(OUT_DIR, { recursive: true });

/** Demo content so a few designs look their best (neutral, generic). */
function demoParams(id) {
  const p = defaultsFor(TEMPLATES.find((t) => t.id === id));
  switch (id) {
    case "seal":
      return { ...p, nameText: "AUTHORIZED", deptText: "DOCUMENTS DIVISION", dateText: "17 AUG 2026" };
    case "date":
      return { ...p, dateText: "17 AUG 2026", refText: "2026/014" };
    case "received":
      return { ...p, dateText: "17 AUG 2026", refText: "2026/014" };
    case "signature":
      return { ...p, nameText: "R. ADEWALE", dateText: "17 AUG 2026" };
    case "custom":
      return {
        ...p,
        secondLine: "",
        textBlocks: [
          { id: "b0", text: "CUSTOM TEXT", size: 16, y: 30, align: "center", bold: true },
          { id: "b1", text: "YOUR DESIGN HERE", size: 12, y: 70, align: "center", bold: false },
        ],
      };
    default:
      return p;
  }
}

const MAX_EDGE = 460; // web-friendly max pixel edge
let failures = 0;

for (const t of TEMPLATES) {
  const id = t.id;
  try {
    const { dataUrl } = renderStamp(demoParams(id));
    const src = await loadImage(dataUrl);
    const scale = Math.min(1, MAX_EDGE / Math.max(src.width, src.height));
    const w = Math.max(1, Math.round(src.width * scale));
    const h = Math.max(1, Math.round(src.height * scale));
    const out = createCanvas(w, h);
    const ctx = out.getContext("2d");
    ctx.drawImage(src, 0, 0, w, h);
    const buf = out.toBuffer("image/png");
    writeFileSync(join(OUT_DIR, `${id}.png`), buf);
    console.log(`  ✓ ${id}.png → ${w}×${h}px, ${buf.length}B`);
  } catch (e) {
    console.error(`  ✗ ${id}: ${e.message}`);
    failures++;
  }
}

console.log(failures ? `${failures} failure(s)` : `Wrote ${TEMPLATES.length} gallery images to assets/gallery/`);
process.exit(failures ? 1 : 0);
