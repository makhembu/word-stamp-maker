// Canvas stamp renderer. Draws each stamp at high resolution and returns a PNG data URL
// plus the stamp's size in Word points so the insertion layer can place it at exact size.

import type { RenderResult, StampParams, StampShapeKind } from "./types";
import { aspectForShape } from "./templates";

/** Pixels per point — high enough that stamps stay crisp when printed. */
const SCALE = 6;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Keep a module-level "current font" so fitFontSize can re-measure with the same face.
let currentFont = { family: "Arial Black", size: 18, bold: true, italic: false };
function setFont(
  ctx: CanvasRenderingContext2D,
  family: string,
  size: number,
  bold: boolean,
  italic: boolean
): void {
  currentFont = { family, size, bold, italic };
  ctx.font = `${italic ? "italic " : ""}${bold ? "bold " : ""}${size}px ${family}`;
}

function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
  minSize: number
): number {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${currentFont.italic ? "italic " : ""}${currentFont.bold ? "bold " : ""}${size}px ${currentFont.family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 1;
  }
  return size;
}

/** Draw text centered on (x, y). */
function centerText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string
): void {
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

/** Draw text with alignment and optional underline (underline is drawn manually — canvas
 *  fonts don't support text-decoration). */
function fillTextStyled(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  align: "center" | "left" | "right",
  underline: boolean,
  fontSizePx: number
): void {
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
  if (underline) {
    const w = ctx.measureText(text).width;
    const thickness = Math.max(1.5, fontSizePx * 0.07);
    const yLine = y + fontSizePx * 0.4;
    if (align === "center") ctx.fillRect(x - w / 2, yLine, w, thickness);
    else if (align === "left") ctx.fillRect(x, yLine, w, thickness);
    else ctx.fillRect(x - w, yLine, w, thickness);
  }
}

/** Draw text along an arc. `flip` true = bottom arc (letters stay upright). */
function arcText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
  flip: boolean,
  color: string
): void {
  if (!text) return;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const chars = text.split("");
  const totalWidth = chars.reduce((s, ch) => s + ctx.measureText(ch).width, 0);
  const maxSpan = Math.abs(endAngle - startAngle);
  const span = Math.min(totalWidth / r, maxSpan);
  if (span <= 0) return;
  let a = (startAngle + endAngle) / 2 - span / 2;
  for (const ch of chars) {
    const w = ctx.measureText(ch).width;
    const da = w / r;
    const mid = a + da / 2;
    ctx.save();
    ctx.translate(cx + r * Math.cos(mid), cy + r * Math.sin(mid));
    ctx.rotate(flip ? mid - Math.PI / 2 : mid + Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    a += da;
  }
}

/** Draw a wavy divider line (classic rubber-stamp detail). */
function wavyLine(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, amp: number, color: string, weight: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = weight;
  ctx.beginPath();
  const n = 6;
  const step = (x1 - x0) / n;
  ctx.moveTo(x0, y);
  for (let i = 1; i <= n; i++) {
    const x = x0 + step * i;
    const mid = x0 + step * (i - 0.5);
    ctx.quadraticCurveTo(mid, y + (i % 2 === 1 ? -amp : amp), x, y + (i % 2 === 1 ? 0 : 0));
  }
  ctx.stroke();
}

function stampTint(p: StampParams): string {
  return rgba(p.inkColor, 0.08 * p.opacity);
}

function inkColor(p: StampParams): string {
  return rgba(p.inkColor, Math.min(1, p.opacity * 1.05));
}

function borderWidthPts(p: StampParams, base: number): number {
  return base * p.borderThickness;
}

/** Draw the double/single border for box-shaped stamps. */
function drawBoxBorder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  p: StampParams
): void {
  const ink = inkColor(p);
  ctx.strokeStyle = ink;
  ctx.lineWidth = borderWidthPts(p, 3.5) * SCALE;
  const inset = 0;
  if (radius > 0) {
    roundRectPath(ctx, x + inset, y + inset, w - inset * 2, h - inset * 2, radius);
  } else {
    ctx.beginPath();
    ctx.rect(x + inset, y + inset, w - inset * 2, h - inset * 2);
  }
  ctx.stroke();

  if (p.borderStyle === "double") {
    const d = 6 * SCALE;
    ctx.lineWidth = 1.6 * p.borderThickness * SCALE;
    if (radius > 0) {
      roundRectPath(ctx, x + d, y + d, w - d * 2, h - d * 2, Math.max(2, radius - d * 0.6));
    } else {
      ctx.beginPath();
      ctx.rect(x + d, y + d, w - d * 2, h - d * 2);
    }
    ctx.stroke();
  }
}

/** Draw rings for circle-family stamps. */
function drawRings(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, p: StampParams, extraRing: boolean): void {
  const ink = inkColor(p);
  ctx.strokeStyle = ink;
  ctx.lineWidth = borderWidthPts(p, 5) * SCALE;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  if (extraRing || p.borderStyle === "double") {
    ctx.lineWidth = 1.8 * p.borderThickness * SCALE;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.82, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Trace the outline of a custom stamp shape into the current path. */
function traceShapePath(
  ctx: CanvasRenderingContext2D,
  shape: StampShapeKind,
  cx: number,
  cy: number,
  W: number,
  H: number,
  inset: number
): void {
  const x = inset;
  const y = inset;
  const w = W - inset * 2;
  const h = H - inset * 2;
  ctx.beginPath();
  switch (shape) {
    case "circle":
    case "double-circle": {
      ctx.arc(cx, cy, Math.min(w, h) / 2, 0, Math.PI * 2);
      break;
    }
    case "ellipse": {
      ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    }
    case "diamond": {
      ctx.moveTo(cx, y);
      ctx.lineTo(x + w, cy);
      ctx.lineTo(cx, y + h);
      ctx.lineTo(x, cy);
      ctx.closePath();
      break;
    }
    case "hexagon":
    case "octagon": {
      const n = shape === "hexagon" ? 6 : 8;
      const step = (Math.PI * 2) / n;
      for (let i = 0; i < n; i++) {
        const a = step * i - Math.PI / 2;
        const px = cx + (w / 2) * Math.cos(a);
        const py = cy + (h / 2) * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
    default: {
      const radius = shape === "rounded" ? Math.min(14 * SCALE, w * 0.12) : 0;
      if (radius > 0) roundRectPath(ctx, x, y, w, h, radius);
      else ctx.rect(x, y, w, h);
    }
  }
}

/** Draw the border of a custom stamp (single or double ring / outline). */
function drawCustomBorder(
  ctx: CanvasRenderingContext2D,
  p: StampParams,
  W: number,
  H: number
): void {
  const cx = W / 2;
  const cy = H / 2;
  const pad = 12 * SCALE;
  const isRound = p.shape === "circle" || p.shape === "double-circle";
  const ink = inkColor(p);

  ctx.strokeStyle = ink;
  ctx.lineWidth = borderWidthPts(p, isRound ? 5 : 3.5) * SCALE;
  traceShapePath(ctx, p.shape, cx, cy, W, H, pad / 2);
  ctx.stroke();

  const inner = p.shape === "double-circle" || p.borderStyle === "double";
  if (inner) {
    ctx.lineWidth = 1.8 * p.borderThickness * SCALE;
    if (isRound) {
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(W, H) / 2 - pad / 2, 0, Math.PI * 2);
      ctx.stroke();
      // the inner ring sits at 0.82 of the outer radius
      ctx.beginPath();
      ctx.arc(cx, cy, (Math.min(W, H) / 2 - pad / 2) * 0.82, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      traceShapePath(ctx, p.shape, cx, cy, W, H, pad / 2 + 6 * SCALE);
      ctx.stroke();
    }
  }
}

/** Height (pt) for a custom text-block stamp: adapts to the lowest text block, but never
 *  below the shape's natural minimum aspect. Circle shapes are always square. */
function customHeightPts(p: StampParams): number {
  const isRound = p.shape === "circle" || p.shape === "double-circle";
  if (isRound) return p.widthPts;
  const blocks = (p.textBlocks || []).filter((b) => b.text.trim());
  let contentH = p.widthPts * 0.42;
  for (const b of blocks) {
    const need = (b.size / 2 + 19) / Math.max(0.06, 1 - Math.min(b.y, 96) / 100);
    if (need > contentH) contentH = need;
  }
  return Math.max(p.widthPts * aspectForShape(p.shape), contentH + 40);
}

/** Generic renderer for custom stamps: an outline shape with freely placed text blocks. */
function renderCustomStamp(
  ctx: CanvasRenderingContext2D,
  p: StampParams,
  W: number,
  H: number
): void {
  const pad = 12 * SCALE;
  const ink = inkColor(p);
  const blocks = (p.textBlocks || []).filter((b) => b.text.trim());
  const isRound = p.shape === "circle" || p.shape === "double-circle";

  drawCustomBorder(ctx, p, W, H);
  if (!blocks.length) return;

  const contentTop = pad * 1.6;
  const contentBottom = H - pad * 1.6;
  const contentH = contentBottom - contentTop;
  const innerW = W - pad * 2.2;
  const maxW = isRound ? Math.min(innerW, (Math.min(W, H) - pad * 2) * 0.72) : innerW;

  const positioned = blocks.map((b) => ({ b, y: contentTop + (Math.min(b.y, 96) / 100) * contentH }));

  if (p.divider && positioned.length > 1) {
    for (let i = 0; i < positioned.length - 1; i++) {
      const midY = (positioned[i].y + positioned[i + 1].y) / 2;
      wavyLine(
        ctx,
        W / 2 - innerW * 0.3,
        W / 2 + innerW * 0.3,
        midY,
        3 * SCALE,
        rgba(p.inkColor, Math.min(1, p.opacity * 0.9)),
        1.4 * p.borderThickness * SCALE
      );
    }
  }

  for (const { b, y } of positioned) {
    const desired = b.size * SCALE;
    const size = Math.min(desired, fitFontSize(ctx, b.text, maxW, desired, 6 * SCALE));
    setFont(ctx, p.fontFamily, size, p.bold, p.italic);
    if (b.align === "center") {
      fillTextStyled(ctx, b.text, W / 2, y, ink, "center", p.underline, size);
    } else {
      const edge = b.align === "left" ? pad * 1.7 : W - pad * 1.7;
      fillTextStyled(ctx, b.text, edge, y, ink, b.align, p.underline, size);
    }
  }
}

/** Render one stamp. */
export function renderStamp(params: StampParams): RenderResult {
  const wPts = params.widthPts;
  const hPts =
    params.textBlocks && params.textBlocks.length > 0
      ? customHeightPts(params)
      : Math.max(24, wPts * params.aspect);
  const W = Math.round(wPts * SCALE);
  const H = Math.round(hPts * SCALE);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  const p = params;
  const cx = W / 2;
  const cy = H / 2;

  // Normalize optional formatting fields (they may be missing on older stamps).
  const underline = !!p.underline;
  const secondLineSizePx = (p.secondLineSize || Math.round(p.fontSize * 0.6)) * SCALE;

  // Fill the canvas with the faint stamp tint (ink wash) so the stamp reads as "printed".
  ctx.fillStyle = stampTint(p);
  ctx.fillRect(0, 0, W, H);

  const fontSizePx = p.fontSize * SCALE;
  const ink = inkColor(p);

  if (p.textBlocks && p.textBlocks.length > 0) {
    renderCustomStamp(ctx, p, W, H);
  } else {
  switch (p.shape) {
    case "circle": {
      const R = Math.min(W, H) / 2 - 10 * SCALE;
      drawRings(ctx, cx, cy, R, p, false);
      const innerR = R * 0.62;
      const maxW = innerR * 2 * 0.96;
      const lines: string[] = [p.mainText];
      if (p.secondLine) lines.push(p.secondLine);
      const lineH = lines.length > 1 ? Math.min(fontSizePx * 0.9, (innerR * 2) / lines.length) : fontSizePx;
      const startY = cy - ((lines.length - 1) * lineH) / 2;
      lines.forEach((line, i) => {
        const desired = i === 0 ? lineH : Math.min(secondLineSizePx, lineH);
        const size = Math.min(desired, fitFontSize(ctx, line, maxW, desired, 8 * SCALE));
        setFont(ctx, p.fontFamily, size, p.bold, p.italic);
        fillTextStyled(ctx, line, cx, startY + i * lineH, ink, "center", underline, size);
      });
      break;
    }

    case "double-circle": {
      const R = Math.min(W, H) / 2 - 10 * SCALE;
      drawRings(ctx, cx, cy, R, p, true);
      const topText = p.mainText;
      const bottomText = p.secondLine || p.dateText || "";
      setFont(ctx, p.fontFamily, Math.min(fontSizePx * 0.52, fitFontSize(ctx, topText, R * 2 * 0.7, fontSizePx * 0.52, 7 * SCALE)), p.bold, p.italic);
      arcText(ctx, topText, cx, cy, R * 0.9, -Math.PI / 2 - 1.25, -Math.PI / 2 + 1.25, false, ink);
      if (bottomText) {
        setFont(ctx, p.fontFamily, Math.min(fontSizePx * 0.45, fitFontSize(ctx, bottomText, R * 2 * 0.6, fontSizePx * 0.45, 7 * SCALE)), p.bold, p.italic);
        arcText(ctx, bottomText, cx, cy, R * 0.9, Math.PI / 2 - 1.25, Math.PI / 2 + 1.25, true, ink);
      }
      // Center content
      const centerLines: string[] = [p.dateText || p.refText || ""].filter(Boolean);
      if (centerLines.length) {
        setFont(ctx, p.fontFamily, Math.min(fontSizePx * 0.5, fitFontSize(ctx, centerLines[0], R * 1.2, fontSizePx * 0.5, 7 * SCALE)), p.bold, p.italic);
        centerText(ctx, centerLines[0], cx, cy, ink);
      }
      break;
    }

    case "seal": {
      const R = Math.min(W, H) / 2 - 10 * SCALE;
      drawRings(ctx, cx, cy, R, p, true);
      const arcTextSize = Math.min(fontSizePx * 0.5, fitFontSize(ctx, p.mainText, R * 2 * 0.66, fontSizePx * 0.5, 7 * SCALE));
      setFont(ctx, p.fontFamily, arcTextSize, p.bold, p.italic);
      arcText(ctx, p.mainText, cx, cy, R * 0.9, -Math.PI / 2 - 1.3, -Math.PI / 2 + 1.3, false, ink);
      const bottomText = p.deptText || "•  •  •";
      setFont(ctx, p.fontFamily, arcTextSize * 0.92, p.bold, p.italic);
      arcText(ctx, bottomText, cx, cy, R * 0.9, Math.PI / 2 - 1.3, Math.PI / 2 + 1.3, true, ink);
      // Center: name + date
      const centerLines: string[] = [];
      if (p.nameText) centerLines.push(p.nameText);
      if (p.dateText) centerLines.push(p.dateText);
      if (centerLines.length) {
        const lh = Math.min(fontSizePx * 0.52, (R * 1.05) / centerLines.length);
        const startY = cy - ((centerLines.length - 1) * lh) / 2;
        centerLines.forEach((line, i) => {
          setFont(ctx, p.fontFamily, Math.min(lh, fitFontSize(ctx, line, R * 1.35, lh, 7 * SCALE)), p.bold, p.italic);
          centerText(ctx, line, cx, startY + i * lh, ink);
        });
      }
      break;
    }

    case "diagonal": {
      // Borderless diagonal overlay text.
      const text = p.mainText;
      const size = Math.min(fontSizePx * 1.15, fitFontSize(ctx, text, W * 0.92, fontSizePx * 1.15, 8 * SCALE), H * 0.85);
      setFont(ctx, p.fontFamily, size, p.bold, p.italic);
      fillTextStyled(ctx, text, cx, cy, rgba(p.inkColor, Math.min(1, p.opacity)), "center", underline, size);
      if (p.secondLine) {
        const s2 = Math.min(secondLineSizePx, size * 0.6);
        setFont(ctx, p.fontFamily, s2, p.bold, p.italic);
        fillTextStyled(ctx, p.secondLine, cx, cy + size * 0.95, rgba(p.inkColor, Math.min(1, p.opacity)), "center", underline, s2);
      }
      break;
    }

    case "rectangle":
    case "rounded":
    case "signature":
    case "date": {
      const pad = 12 * SCALE;
      const radius = p.shape === "rounded" ? 14 * SCALE : 2 * SCALE;
      drawBoxBorder(ctx, pad / 2, pad / 2, W - pad, H - pad, radius, p);

      const innerW = W - pad * 2.2;
      const hasLower = !!(p.secondLine || p.dateText || p.refText || p.deptText || p.nameText);

      if (p.shape === "signature") {
        // Main text top, signature line with name, date bottom.
        const mainSize = Math.min(fontSizePx * 0.85, fitFontSize(ctx, p.mainText, innerW, fontSizePx * 0.85, 8 * SCALE), H * 0.22);
        setFont(ctx, p.fontFamily, mainSize, p.bold, p.italic);
        fillTextStyled(ctx, p.mainText, cx, H * 0.26, ink, "center", underline, mainSize);
        // signature line
        const lineY = H * 0.52;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.6 * SCALE;
        ctx.beginPath();
        ctx.moveTo(cx - innerW * 0.3, lineY);
        ctx.quadraticCurveTo(cx - innerW * 0.1, lineY - 4 * SCALE, cx, lineY);
        ctx.quadraticCurveTo(cx + innerW * 0.1, lineY + 4 * SCALE, cx + innerW * 0.3, lineY);
        ctx.stroke();
        if (p.nameText) {
          setFont(ctx, p.fontFamily, Math.min(fontSizePx * 0.5, fitFontSize(ctx, p.nameText, innerW * 0.8, fontSizePx * 0.5, 7 * SCALE), H * 0.12), false, true);
          centerText(ctx, p.nameText, cx, lineY + 12 * SCALE, ink);
        }
        if (p.dateText) {
          setFont(ctx, p.fontFamily, Math.min(fontSizePx * 0.44, fitFontSize(ctx, p.dateText, innerW, fontSizePx * 0.44, 7 * SCALE), H * 0.12), p.bold, p.italic);
          centerText(ctx, p.dateText, cx, H * 0.82, ink);
        }
        break;
      }

      // Stacked layout: main text (upper) + optional lower block.
      const lowerLines: { text: string; isSecond: boolean }[] = [];
      if (p.secondLine) lowerLines.push({ text: p.secondLine, isSecond: true });
      if (p.dateText) lowerLines.push({ text: p.dateText, isSecond: false });
      if (p.refText) lowerLines.push({ text: `REF: ${p.refText}`, isSecond: false });
      if (p.deptText) lowerLines.push({ text: p.deptText, isSecond: false });
      if (p.nameText) lowerLines.push({ text: p.nameText, isSecond: false });

      let mainY = H * 0.5;
      let lowerY = H * 0.5;
      if (hasLower) {
        mainY = H * 0.3;
        lowerY = H * 0.62;
      }

      // Fit the main line to BOTH the available width and the available height so a
      // short line at a large text size can never spill past the top/bottom borders.
      const maxMainH = hasLower ? H * 0.26 : H * 0.62;
      const mainSize = Math.min(
        fontSizePx * 0.95,
        fitFontSize(ctx, p.mainText, innerW, fontSizePx * 0.95, 8 * SCALE),
        maxMainH
      );
      setFont(ctx, p.fontFamily, mainSize, p.bold, p.italic);
      if (p.align === "center") {
        fillTextStyled(ctx, p.mainText, cx, mainY, ink, "center", underline, mainSize);
      } else {
        const edge = p.align === "left" ? pad * 1.7 : W - pad * 1.7;
        fillTextStyled(ctx, p.mainText, edge, mainY, ink, p.align, underline, mainSize);
      }

      if (hasLower) {
        if (p.divider && lowerLines.length) {
          wavyLine(ctx, cx - innerW * 0.3, cx + innerW * 0.3, mainY + mainSize * 0.8, 3 * SCALE, rgba(p.inkColor, Math.min(1, p.opacity * 0.9)), 1.4 * p.borderThickness * SCALE);
        }
        const blockH = H * 0.36;
        const lhList = lowerLines.map((line) =>
          Math.min(
            line.isSecond ? Math.min(secondLineSizePx, fontSizePx * 0.46) : fontSizePx * 0.46,
            blockH / lowerLines.length
          )
        );
        const totalH = lhList.reduce((s, l) => s + l, 0);
        let y = lowerY - totalH / 2 + lhList[0] / 2;
        lowerLines.forEach((line, i) => {
          const size = Math.min(lhList[i], fitFontSize(ctx, line.text, innerW, lhList[i], 6 * SCALE));
          setFont(ctx, p.fontFamily, size, p.bold, p.italic);
          fillTextStyled(ctx, line.text, cx, y, rgba(p.inkColor, Math.min(1, p.opacity)), "center", underline, size);
          y += lhList[i];
        });
      }
      break;
    }

    default: {
      const innerW = W - 24 * SCALE;
      const mainSize = Math.min(fontSizePx, fitFontSize(ctx, p.mainText, innerW, fontSizePx, 8 * SCALE));
      setFont(ctx, p.fontFamily, mainSize, p.bold, p.italic);
      centerText(ctx, p.mainText, cx, cy, ink);
    }
  }
  }

  const dataUrl = canvas.toDataURL("image/png");
  return { dataUrl, widthPts: wPts, heightPts: hPts };
}
