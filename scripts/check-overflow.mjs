// Check whether rendered stamp text overflows the border box.
// Border box top stroke sits at y ≈ pad/2 (36px at SCALE 6); anything with strong ink
// above ~20px (or below H-20) is content escaping the borders.
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { TEMPLATES, defaultsFor } = require("../.smoke/templates.js");
const { renderStamp } = require("../.smoke/renderer.js");

let pendingW = 0, pendingH = 0, current = null;
globalThis.document = { createElement: (tag) => {
  if (tag !== "canvas") return {};
  return new Proxy({}, {
    get: (_t, prop) => {
      if (prop === "width" || prop === "height") return current ? current[prop] : pendingW;
      if (prop === "getContext") return (type) => { current = createCanvas(Math.max(1, pendingW), Math.max(1, pendingH)); pendingW = 0; pendingH = 0; return current.getContext(type); };
      if (prop === "toDataURL") return () => { const c = current || createCanvas(1, 1); return `data:image/png;base64,${c.toBuffer("image/png").toString("base64")}`; };
      return undefined;
    },
    set: (_t, prop, value) => { if (prop === "width") pendingW = value; if (prop === "height") pendingH = value; return true; },
  });
}};

async function bbox(r) {
  const img = await loadImage(r.dataUrl);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
  let minY = Infinity, maxY = -Infinity, count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] > 180 && data[i] + data[i + 1] + data[i + 2] < 640) {
        count++;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { width, height, minY, maxY, count };
}

const custom = defaultsFor(TEMPLATES.find((t) => t.id === "custom"));

const variants = [
  {
    label: "A: short top line + max text size (suspected overflow)",
    p: { ...custom, mainText: "OCS", secondLine: "", fontSize: 72, widthPts: 160, shape: "rectangle", aspect: 0.42 },
  },
  {
    label: "B: two-line police stamp, text size 40",
    p: { ...custom, mainText: "Officer Commanding Station (OCS)", secondLine: "Madema Police Station", fontSize: 40, widthPts: 240 },
  },
  {
    label: "C: two-line police stamp, text size 22",
    p: { ...custom, mainText: "Officer Commanding Station (OCS)", secondLine: "Madema Police Station", fontSize: 22, widthPts: 240 },
  },
];

for (const v of variants) {
  const r = renderStamp(v.p);
  const b = await bbox(r);
  const borderEdge = 20; // px; strong ink should stay below this
  const overTop = b.minY < borderEdge;
  const overBottom = b.maxY > b.height - borderEdge;
  console.log(
    `${overTop || overBottom ? "✗ OVERFLOW" : "  ok"}  ${v.label}\n` +
    `     ink bbox y ${b.minY}..${b.maxY} of ${b.height}px (${(b.minY / b.height * 100).toFixed(1)}%..${(b.maxY / b.height * 100).toFixed(1)}%)  strong px: ${b.count}`
  );
}
