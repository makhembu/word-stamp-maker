// Minimal DOM shim so renderer.ts (canvas-based) can run in Node via @napi-rs/canvas.
// Shared by scripts/smoke-render.mjs and scripts/gen-gallery.mjs.
import { createCanvas } from "@napi-rs/canvas";

let pendingW = 0;
let pendingH = 0;
let current = null;

export function installDomShim() {
  globalThis.document = {
    createElement: (tag) => {
      if (tag !== "canvas") return {};
      return new Proxy(
        {},
        {
          get: (_t, prop) => {
            if (prop === "width" || prop === "height") {
              return current ? current[prop] : pendingW;
            }
            if (prop === "getContext") {
              return (type) => {
                current = createCanvas(Math.max(1, pendingW), Math.max(1, pendingH));
                pendingW = 0;
                pendingH = 0;
                return current.getContext(type);
              };
            }
            if (prop === "toDataURL") {
              return () => {
                const c = current || createCanvas(1, 1);
                const buf = c.toBuffer("image/png");
                return `data:image/png;base64,${buf.toString("base64")}`;
              };
            }
            return undefined;
          },
          set: (_t, prop, value) => {
            if (prop === "width") pendingW = value;
            if (prop === "height") pendingH = value;
            return true;
          },
        }
      );
    },
  };
}
