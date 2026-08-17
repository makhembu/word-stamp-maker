// One-off: render the OCS / Madema Police Station stamp variants so the user can
// eyeball them before using the add-in. Writes police-stamp-*.png to the project root.
import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { TEMPLATES, defaultsFor } = require("../.smoke/templates.js");
const { renderStamp } = require("../.smoke/renderer.js");

function dataUrlToPng(dataUrl) {
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

const custom = defaultsFor(TEMPLATES.find((t) => t.id === "custom"));

const variants = [
  {
    file: "police-stamp-blue.png",
    label: "Blue · OCS first line",
    p: {
      ...custom,
      mainText: "Officer Commanding Station (OCS)",
      secondLine: "Madema Police Station",
      inkColor: "#1565C0",
      widthPts: 240,
      fontSize: 22,
      borderStyle: "double",
      borderThickness: 1.2,
      opacity: 0.95,
    },
  },
  {
    file: "police-stamp-black.png",
    label: "Black · OCS first line",
    p: {
      ...custom,
      mainText: "Officer Commanding Station (OCS)",
      secondLine: "Madema Police Station",
      inkColor: "#1F1F1F",
      widthPts: 240,
      fontSize: 22,
      borderStyle: "double",
      borderThickness: 1.2,
      opacity: 0.95,
    },
  },
  {
    file: "police-stamp-madema-main.png",
    label: "Blue · Madema first line (shorter line renders bigger)",
    p: {
      ...custom,
      mainText: "MADEMA POLICE STATION",
      secondLine: "Officer Commanding Station (OCS)",
      inkColor: "#1565C0",
      widthPts: 240,
      fontSize: 22,
      borderStyle: "double",
      borderThickness: 1.2,
      opacity: 0.95,
    },
  },
];

for (const v of variants) {
  const r = renderStamp(v.p);
  writeFileSync(join(__dirname, "..", v.file), dataUrlToPng(r.dataUrl));
  console.log(`wrote ${v.file} (${r.widthPts}×${r.heightPts}pt) — ${v.label}`);
}
