// Word document integration. All stamp insertion goes through the desktop Shape API
// (WordApiDesktop 1.2+) so stamps are REAL floating shapes wrapped "in front of text":
// they never push, reflow, or rearrange surrounding document content.

import type { QuickPosition, RenderResult, StampParams, StampRecord } from "./types";

/** Shape-name prefix used to recognize stamps created by this add-in. */
export const STAMP_PREFIX = "StampMaker::";

/** The Shape API (floating shapes + text wrapping) is desktop-only. */
export function isShapeApiSupported(): boolean {
  try {
    return Office.context.requirements.isSetSupported("WordApiDesktop", "1.2");
  } catch {
    return false;
  }
}

export function stampName(id: string): string {
  return STAMP_PREFIX + id;
}

export function idFromStampName(name: string): string | null {
  return name.startsWith(STAMP_PREFIX) ? name.slice(STAMP_PREFIX.length) : null;
}

export interface PageGeometry {
  pageWidth: number;
  pageHeight: number;
  topMargin: number;
  bottomMargin: number;
  leftMargin: number;
  rightMargin: number;
}

/** A4 fallback used only if PageSetup isn't available. */
const A4: PageGeometry = {
  pageWidth: 595.3,
  pageHeight: 841.9,
  topMargin: 72,
  bottomMargin: 72,
  leftMargin: 72,
  rightMargin: 72,
};

export async function getPageGeometry(): Promise<PageGeometry> {
  try {
    return await Word.run(async (ctx) => {
      const ps = ctx.document.pageSetup;
      ps.load("pageWidth,pageHeight,topMargin,bottomMargin,leftMargin,rightMargin");
      await ctx.sync();
      if (!ps.pageWidth || !ps.pageHeight) return { ...A4 };
      return {
        pageWidth: ps.pageWidth,
        pageHeight: ps.pageHeight,
        topMargin: ps.topMargin,
        bottomMargin: ps.bottomMargin,
        leftMargin: ps.leftMargin,
        rightMargin: ps.rightMargin,
      };
    });
  } catch {
    return { ...A4 };
  }
}

/** Compute the top-left of a stamp given a quick-position preset and its size. */
export function computePosition(
  pos: QuickPosition,
  geo: PageGeometry,
  w: number,
  h: number
): { top: number; left: number } {
  const { pageWidth, pageHeight, topMargin, bottomMargin, leftMargin, rightMargin } = geo;
  const cx = (pageWidth - w) / 2;
  const cy = (pageHeight - h) / 2;
  switch (pos) {
    case "top-left":
      return { top: topMargin, left: leftMargin };
    case "top-center":
      return { top: topMargin, left: cx };
    case "top-right":
      return { top: topMargin, left: pageWidth - rightMargin - w };
    case "center-left":
      return { top: cy, left: leftMargin };
    case "center":
      return { top: cy, left: cx };
    case "center-right":
      return { top: cy, left: pageWidth - rightMargin - w };
    case "bottom-left":
      return { top: pageHeight - bottomMargin - h, left: leftMargin };
    case "bottom-center":
      return { top: pageHeight - bottomMargin - h, left: cx };
    case "bottom-right":
      return { top: pageHeight - bottomMargin - h, left: pageWidth - rightMargin - w };
    default:
      return { top: 0, left: 0 };
  }
}

export interface InsertOptions {
  position: QuickPosition;
  /** When set, the existing stamp with this id is deleted first (edit-in-place). */
  replaceId?: string;
  /** Reuse an existing stamp's geometry (used by edit + duplicate). */
  keepGeometry?: {
    top: number;
    left: number;
    rotation: number;
    relativeHorizontalPosition: string;
    relativeVerticalPosition: string;
  };
}

/**
 * Insert a rendered stamp as a floating picture wrapped IN FRONT OF TEXT.
 * Guarantees: no paragraphs added, no blank lines, no surrounding text movement.
 */
export async function insertStamp(
  render: RenderResult,
  params: StampParams,
  opts: InsertOptions
): Promise<{ id: string }> {
  const base64 = render.dataUrl.replace(/^data:image\/png;base64,/, "");
  // When replacing an existing stamp, keep its identity so the manage list and
  // duplicate/edit flows stay stable.
  const id = opts.replaceId || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));

  // Resolve the target page position BEFORE opening the Word.run batch so we never
  // nest Word.run calls on the same document.
  let quickPos: { top: number; left: number } | null = null;
  if (!opts.keepGeometry && opts.position !== "cursor") {
    const geo = await getPageGeometry();
    quickPos = computePosition(opts.position, geo, render.widthPts, render.heightPts);
  }

  await Word.run(async (ctx) => {
    if (opts.replaceId) {
      const old = await findShapeById(ctx, opts.replaceId);
      if (old) old.delete();
    }

    const range = ctx.document.getSelection();
    const options: Word.InsertShapeOptions = {
      width: render.widthPts,
      height: render.heightPts,
    };
    const shape = range.insertPictureFromBase64(base64, options);
    shape.name = stampName(id);
    shape.altTextDescription = JSON.stringify(params);
    shape.textWrap.type = Word.ShapeTextWrapType.front;
    shape.lockAspectRatio = true;
    shape.allowOverlap = true;
    shape.rotation = params.rotation;

    if (opts.keepGeometry) {
      shape.relativeHorizontalPosition = opts.keepGeometry.relativeHorizontalPosition as Word.RelativeHorizontalPosition;
      shape.relativeVerticalPosition = opts.keepGeometry.relativeVerticalPosition as Word.RelativeVerticalPosition;
      shape.left = opts.keepGeometry.left;
      shape.top = opts.keepGeometry.top;
      shape.rotation = opts.keepGeometry.rotation;
    } else if (quickPos) {
      shape.relativeHorizontalPosition = Word.RelativeHorizontalPosition.page;
      shape.relativeVerticalPosition = Word.RelativeVerticalPosition.page;
      shape.left = quickPos.left;
      shape.top = quickPos.top;
    }

    shape.select();
    await ctx.sync();
  });

  return { id };
}

async function findShapeById(
  ctx: Word.RequestContext,
  id: string
): Promise<Word.Shape | null> {
  const shapes = ctx.document.body.shapes.getByTypes([Word.ShapeType.picture]);
  shapes.load("items/name");
  await ctx.sync();
  for (const s of shapes.items) {
    const name = s.name;
    if (name === stampName(id)) return s;
  }
  return null;
}

/** List all stamps created by this add-in in the document body. */
export async function listStamps(): Promise<StampRecord[]> {
  return Word.run(async (ctx) => {
    const shapes = ctx.document.body.shapes.getByTypes([Word.ShapeType.picture]);
    shapes.load("items");
    await ctx.sync();
    const items = shapes.items;
    for (const s of items) {
      s.load("name,altTextDescription,top,left,width,height,rotation,textWrap/type,relativeHorizontalPosition,relativeVerticalPosition");
    }
    await ctx.sync();

    const records: StampRecord[] = [];
    for (const s of items) {
      const id = idFromStampName(s.name);
      if (!id) continue;
      let params: StampParams | null = null;
      try {
        params = JSON.parse(s.altTextDescription) as StampParams;
      } catch {
        params = null;
      }
      records.push({
        id,
        shapeId: s.id,
        name: s.name,
        altText: s.altTextDescription,
        params,
        top: s.top,
        left: s.left,
        width: s.width,
        height: s.height,
        rotation: s.rotation,
        wrapType: s.textWrap.type,
        isInline: s.textWrap.type === "Inline",
        relativeHorizontalPosition: s.relativeHorizontalPosition,
        relativeVerticalPosition: s.relativeVerticalPosition,
      });
    }
    return records;
  });
}

export async function deleteStamp(id: string): Promise<void> {
  await Word.run(async (ctx) => {
    const shape = await findShapeById(ctx, id);
    if (shape) shape.delete();
    await ctx.sync();
  });
}

export async function selectStamp(id: string): Promise<void> {
  await Word.run(async (ctx) => {
    const shape = await findShapeById(ctx, id);
    if (shape) shape.select();
    await ctx.sync();
  });
}
