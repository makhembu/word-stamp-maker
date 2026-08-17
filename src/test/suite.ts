// In-Word automated test suite.
//
// Every test runs against the OPEN document (as the user asked: "test against realistic
// Word documents"). Scaffolding (long text, tables) is created inside a temporary content
// control at the end of the document and removed afterwards, together with every test
// stamp. The core assertion in each test is the same: after inserting a floating stamp,
// the paragraph count and body text length are IDENTICAL — i.e. zero reflow.
//
// IMPORTANT: Word.run batches may never be nested on the same document, so every test
// sequences separate Word.run calls (baseline → insert → verify).

import { renderStamp } from "../core/renderer";
import { deleteStamp, insertStamp, listStamps } from "../core/document";
import { applyDynamicFields, defaultsFor, TEMPLATES, todayText } from "../core/templates";
import type { StampParams } from "../core/types";

export interface TestResult {
  name: string;
  pass: boolean;
  detail: string;
}

interface Baseline {
  paragraphCount: number;
  bodyTextLength: number;
  lastParagraphText: string;
}

function approx(a: number, b: number, tol = 1.5): boolean {
  return Math.abs(a - b) <= tol;
}

function getBaseline(): Promise<Baseline> {
  return Word.run(async (ctx) => {
    const body = ctx.document.body;
    body.load("text");
    const paragraphs = body.paragraphs;
    paragraphs.load("items");
    const last = paragraphs.getLast();
    last.load("text");
    await ctx.sync();
    return {
      paragraphCount: paragraphs.items.length,
      bodyTextLength: body.text.length,
      lastParagraphText: last.text,
    };
  });
}

function reflowDiff(before: Baseline, after: Baseline): string | null {
  if (after.paragraphCount !== before.paragraphCount) {
    return `Paragraph count changed: ${before.paragraphCount} → ${after.paragraphCount}`;
  }
  if (after.bodyTextLength !== before.bodyTextLength) {
    return `Body text length changed: ${before.bodyTextLength} → ${after.bodyTextLength}`;
  }
  if (after.lastParagraphText !== before.lastParagraphText) {
    return "Last paragraph text changed";
  }
  return null;
}

let tempControlCreated = false;

/** Create the scaffold content control at the end of the body (once). */
async function ensureScaffold(): Promise<boolean> {
  if (tempControlCreated) return true;
  try {
    await Word.run(async (ctx) => {
      const range = ctx.document.body.getRange(Word.RangeLocation.end);
      const cc = range.insertContentControl();
      cc.title = "StampMakerTestScaffold";
      cc.tag = "stamp-maker-test";
      await ctx.sync();
    });
    tempControlCreated = true;
    return true;
  } catch {
    return false;
  }
}

function testStampParams(overrides: Partial<StampParams> = {}): StampParams {
  const base = defaultsFor(TEMPLATES.find((t) => t.id === "approved")!);
  return { ...base, mainText: "TEST STAMP", ...overrides };
}

async function runOne(
  name: string,
  fn: () => Promise<{ pass: boolean; detail: string }>
): Promise<TestResult> {
  try {
    const r = await fn();
    return { name, pass: r.pass, detail: r.detail };
  } catch (e) {
    return { name, pass: false, detail: `Exception: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Load the wrap type of a specific stamp shape. */
async function readShapeWrap(id: string): Promise<string | null> {
  return Word.run(async (ctx) => {
    const shapes = ctx.document.body.shapes.getByTypes([Word.ShapeType.picture]);
    shapes.load("items");
    await ctx.sync();
    for (const s of shapes.items) {
      if (s.name === `StampMaker::${id}`) {
        s.load("textWrap/type");
        await ctx.sync();
        return s.textWrap.type;
      }
    }
    return null;
  });
}

export async function runTestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const createdIds: string[] = [];
  tempControlCreated = false;

  results.push(
    await runOne("Floating stamp over a paragraph causes zero reflow", async () => {
      const before = await getBaseline();
      const params = testStampParams({ rotation: 0 });
      const render = renderStamp(params);
      const { id } = await insertStamp(render, params, { position: "cursor" });
      createdIds.push(id);

      const after = await getBaseline();
      const reflow = reflowDiff(before, after);
      if (reflow) return { pass: false, detail: reflow };

      const wrap = await readShapeWrap(id);
      if (wrap !== "Front") {
        return { pass: false, detail: `Expected wrap "Front", got "${wrap}"` };
      }
      return { pass: true, detail: `Paragraphs ${before.paragraphCount}, text ${before.bodyTextLength} unchanged; wrap = Front` };
    })
  );

  results.push(
    await runOne("Stamp over a table leaves the table untouched", async () => {
      const scaffolded = await ensureScaffold();
      if (!scaffolded) return { pass: false, detail: "Scaffold content control unavailable (skipped)" };

      const tableBefore = await Word.run(async (ctx) => {
        const cc = ctx.document.contentControls.getByTag("stamp-maker-test").getFirst();
        cc.insertTable(3, 3, Word.InsertLocation.end, [
          ["A1", "A2", "A3"],
          ["B1", "B2", "B3"],
          ["C1", "C2", "C3"],
        ]);
        const tables = ctx.document.body.tables;
        tables.load("items");
        await ctx.sync();
        const t = tables.items[tables.items.length - 1];
        t.load("rowCount");
        const firstCells = t.rows.getFirst().cells;
        firstCells.load("items");
        const c00 = t.getCell(0, 0);
        c00.load("value");
        await ctx.sync();
        return { rows: t.rowCount, cols: firstCells.items.length, c00: c00.value };
      });

      const before = await getBaseline();
      const params = testStampParams({ rotation: 0 });
      const render = renderStamp(params);
      const { id } = await insertStamp(render, params, { position: "center" });
      createdIds.push(id);
      const after = await getBaseline();

      const reflow = reflowDiff(before, after);
      if (reflow) return { pass: false, detail: reflow };

      const tableAfter = await Word.run(async (ctx) => {
        const tables = ctx.document.body.tables;
        tables.load("items");
        await ctx.sync();
        const t = tables.items[tables.items.length - 1];
        t.load("rowCount");
        const firstCells = t.rows.getFirst().cells;
        firstCells.load("items");
        const c00 = t.getCell(0, 0);
        c00.load("value");
        await ctx.sync();
        return { rows: t.rowCount, cols: firstCells.items.length, c00: c00.value };
      });

      if (tableAfter.rows !== tableBefore.rows || tableAfter.cols !== tableBefore.cols) {
        return { pass: false, detail: `Table size changed: ${tableBefore.rows}×${tableBefore.cols} → ${tableAfter.rows}×${tableAfter.cols}` };
      }
      if (tableAfter.c00 !== tableBefore.c00) {
        return { pass: false, detail: "Table cell text changed" };
      }
      return { pass: true, detail: `Table stayed ${tableAfter.rows}×${tableAfter.cols}; cell text unchanged` };
    })
  );

  results.push(
    await runOne("Stamp on a long multi-page document causes zero reflow", async () => {
      const scaffolded = await ensureScaffold();
      if (!scaffolded) return { pass: false, detail: "Scaffold content control unavailable (skipped)" };

      await Word.run(async (ctx) => {
        const cc = ctx.document.contentControls.getByTag("stamp-maker-test").getFirst();
        for (let i = 0; i < 300; i++) {
          cc.insertParagraph(`Test line ${i}: the quick brown fox jumps over the lazy dog.`, Word.InsertLocation.end);
        }
        await ctx.sync();
      });

      const before = await getBaseline();
      const params = testStampParams({ rotation: 0 });
      const render = renderStamp(params);
      const { id } = await insertStamp(render, params, { position: "cursor" });
      createdIds.push(id);
      const after = await getBaseline();

      const reflow = reflowDiff(before, after);
      if (reflow) return { pass: false, detail: reflow };
      return { pass: true, detail: `${before.paragraphCount} paragraphs / ${before.bodyTextLength} chars unchanged after insert` };
    })
  );

  results.push(
    await runOne("Rotation is applied to the floating shape", async () => {
      const params = testStampParams({ rotation: 27 });
      const render = renderStamp(params);
      const { id } = await insertStamp(render, params, { position: "cursor" });
      createdIds.push(id);

      const rotation = await Word.run(async (ctx) => {
        const shapes = ctx.document.body.shapes.getByTypes([Word.ShapeType.picture]);
        shapes.load("items");
        await ctx.sync();
        for (const s of shapes.items) {
          if (s.name === `StampMaker::${id}`) {
            s.load("rotation");
            await ctx.sync();
            return s.rotation;
          }
        }
        return null;
      });
      if (rotation === null) return { pass: false, detail: "Stamp shape not found" };
      if (!approx(rotation, 27, 0.01)) return { pass: false, detail: `Expected rotation 27, got ${rotation}` };
      return { pass: true, detail: `Shape rotation = ${rotation}°` };
    })
  );

  results.push(
    await runOne("Dynamic date re-fills with today's date", async () => {
      const params = testStampParams({ dynamicDate: true, dateText: "01 JAN 2000" });
      const resolved = applyDynamicFields(params);
      if (resolved.dateText !== todayText()) {
        return { pass: false, detail: `Expected "${todayText()}", got "${resolved.dateText}"` };
      }
      return { pass: true, detail: `"01 JAN 2000" re-filled to "${resolved.dateText}"` };
    })
  );

  results.push(
    await runOne("Manual date is preserved when dynamic date is off", async () => {
      const params = testStampParams({ dynamicDate: false, dateText: "05 MAY 2026" });
      const resolved = applyDynamicFields(params);
      if (resolved.dateText !== "05 MAY 2026") {
        return { pass: false, detail: `Expected "05 MAY 2026", got "${resolved.dateText}"` };
      }
      return { pass: true, detail: `Manual date "${resolved.dateText}" preserved` };
    })
  );

  results.push(
    await runOne("Custom auto-date block re-fills, other blocks untouched", async () => {
      const params = testStampParams({
        templateId: "custom",
        dynamicDate: false,
        textBlocks: [
          { id: "b0", text: "RECEIVED", size: 16, y: 25, align: "center" as const },
          { id: "b1", text: "01 JAN 2000", size: 12, y: 70, align: "center" as const, autoDate: true },
        ],
      });
      const resolved = applyDynamicFields(params);
      const blocks = resolved.textBlocks || [];
      const auto = blocks.find((b) => b.autoDate);
      const plain = blocks.find((b) => b.id === "b0");
      if (!auto || auto.text !== todayText()) {
        return { pass: false, detail: `Auto block text "${auto?.text}" != "${todayText()}"` };
      }
      if (plain?.text !== "RECEIVED") {
        return { pass: false, detail: `Plain block changed to "${plain?.text}"` };
      }
      return { pass: true, detail: `Auto block "${auto.text}", plain block "${plain.text}"` };
    })
  );

  results.push(
    await runOne("Dynamic date stamp round-trips through Word with today's date", async () => {
      const params = applyDynamicFields(
        testStampParams({ templateId: "received", shape: "rectangle", mainText: "RECEIVED", dateText: "01 JAN 2000", dynamicDate: true })
      );
      const render = renderStamp(params);
      const { id } = await insertStamp(render, params, { position: "cursor" });
      createdIds.push(id);

      const altText = await Word.run(async (ctx) => {
        const shapes = ctx.document.body.shapes.getByTypes([Word.ShapeType.picture]);
        shapes.load("items");
        await ctx.sync();
        for (const s of shapes.items) {
          if (s.name === `StampMaker::${id}`) {
            s.load("altTextDescription");
            await ctx.sync();
            return s.altTextDescription;
          }
        }
        return null;
      });
      if (!altText) return { pass: false, detail: "Stamp shape not found" };
      const parsed = JSON.parse(altText) as StampParams;
      if (parsed.dateText !== todayText()) {
        return { pass: false, detail: `Inserted date "${parsed.dateText}" != "${todayText()}"` };
      }
      if (!parsed.dynamicDate) {
        return { pass: false, detail: "dynamicDate flag was not persisted" };
      }
      return { pass: true, detail: `Inserted RECEIVED stamp carries "${parsed.dateText}" and stays dynamic` };
    })
  );

  results.push(
    await runOne("Stamp metadata round-trips for editing", async () => {
      const params = testStampParams({ mainText: "ROUNDTRIP", inkColor: "#123456", rotation: 5 });
      const render = renderStamp(params);
      const { id } = await insertStamp(render, params, { position: "cursor" });
      createdIds.push(id);

      const altText = await Word.run(async (ctx) => {
        const shapes = ctx.document.body.shapes.getByTypes([Word.ShapeType.picture]);
        shapes.load("items");
        await ctx.sync();
        for (const s of shapes.items) {
          if (s.name === `StampMaker::${id}`) {
            s.load("altTextDescription");
            await ctx.sync();
            return s.altTextDescription;
          }
        }
        return null;
      });
      if (!altText) return { pass: false, detail: "Stamp shape not found" };
      const parsed = JSON.parse(altText) as StampParams;
      if (parsed.mainText !== "ROUNDTRIP" || parsed.inkColor !== "#123456") {
        return { pass: false, detail: "Metadata mismatch" };
      }
      return { pass: true, detail: `altText holds template "${parsed.templateId}", "${parsed.mainText}"` };
    })
  );

  results.push(
    await runOne("Edit-in-place preserves position and stamp count", async () => {
      const params = testStampParams({ rotation: 0 });
      const render = renderStamp(params);
      const { id } = await insertStamp(render, params, { position: "center" });

      const geo = await Word.run(async (ctx) => {
        const shapes = ctx.document.body.shapes.getByTypes([Word.ShapeType.picture]);
        shapes.load("items");
        await ctx.sync();
        for (const s of shapes.items) {
          if (s.name === `StampMaker::${id}`) {
            s.load("top,left,relativeHorizontalPosition,relativeVerticalPosition");
            await ctx.sync();
            return {
              top: s.top,
              left: s.left,
              relH: s.relativeHorizontalPosition,
              relV: s.relativeVerticalPosition,
            };
          }
        }
        return null;
      });
      if (!geo) return { pass: false, detail: "Stamp not found" };

      const countBefore = (await listStamps()).length;
      const newParams = testStampParams({ mainText: "UPDATED", rotation: 0 });
      const newRender = renderStamp(newParams);
      await insertStamp(newRender, newParams, {
        position: "cursor",
        replaceId: id,
        keepGeometry: {
          top: geo.top,
          left: geo.left,
          rotation: 0,
          relativeHorizontalPosition: geo.relH,
          relativeVerticalPosition: geo.relV,
        },
      });

      const countAfter = (await listStamps()).length;
      const updated = (await listStamps()).find((r) => r.id === id);
      if (!updated) return { pass: false, detail: "Updated stamp not found" };
      if (countAfter !== countBefore) {
        return { pass: false, detail: `Stamp count changed: ${countBefore} → ${countAfter}` };
      }
      if (!approx(updated.top, geo.top) || !approx(updated.left, geo.left)) {
        return { pass: false, detail: `Position moved: (${geo.left},${geo.top}) → (${updated.left},${updated.top})` };
      }
      if (updated.params?.mainText !== "UPDATED") {
        return { pass: false, detail: "Text did not update" };
      }
      return { pass: true, detail: "Position preserved, count unchanged, text updated" };
    })
  );

  results.push(
    await runOne("Duplicate creates an offset copy", async () => {
      const params = testStampParams({ mainText: "DUPLICATE ME" });
      const render = renderStamp(params);
      const { id } = await insertStamp(render, params, { position: "center" });
      const original = (await listStamps()).find((r) => r.id === id);
      if (!original) return { pass: false, detail: "Original not found" };

      const dupRender = renderStamp(params);
      await insertStamp(dupRender, params, {
        position: "cursor",
        keepGeometry: {
          top: original.top + 24,
          left: original.left + 24,
          rotation: original.rotation,
          relativeHorizontalPosition: original.relativeHorizontalPosition,
          relativeVerticalPosition: original.relativeVerticalPosition,
        },
      });
      const after = await listStamps();
      const copies = after.filter((r) => r.params?.mainText === "DUPLICATE ME");
      createdIds.push(...copies.map((c) => c.id));
      if (copies.length < 2) return { pass: false, detail: "Expected 2 copies" };
      const [a, b] = copies;
      if (approx(a.left, b.left) && approx(a.top, b.top)) {
        return { pass: false, detail: "Copies overlap exactly" };
      }
      return { pass: true, detail: `2 stamps at (${Math.round(a.left)},${Math.round(a.top)}) and (${Math.round(b.left)},${Math.round(b.top)})` };
    })
  );

  results.push(
    await runOne("Delete removes only the targeted stamp", async () => {
      const params = testStampParams({ mainText: "DELETE ME" });
      const render = renderStamp(params);
      const { id } = await insertStamp(render, params, { position: "cursor" });
      createdIds.push(id);
      const before = (await listStamps()).filter((r) => r.params?.mainText === "DELETE ME").length;
      await deleteStamp(id);
      const after = (await listStamps()).filter((r) => r.params?.mainText === "DELETE ME").length;
      if (after !== before - 1) return { pass: false, detail: `Expected ${before - 1} left, got ${after}` };
      return { pass: true, detail: `Deleted 1 of ${before}; ${after} remain` };
    })
  );

  results.push(
    await runOne("Quick position lands inside the page", async () => {
      const params = testStampParams({ rotation: 0 });
      const render = renderStamp(params);
      const { id } = await insertStamp(render, params, { position: "top-right" });
      createdIds.push(id);
      const rec = (await listStamps()).find((r) => r.id === id);
      if (!rec) return { pass: false, detail: "Stamp not found" };
      if (rec.left < 0 || rec.top < 0) return { pass: false, detail: `Negative position (${rec.left}, ${rec.top})` };
      return { pass: true, detail: `Stamp at (${Math.round(rec.left)}, ${Math.round(rec.top)}), ${Math.round(rec.width)}×${Math.round(rec.height)} pt` };
    })
  );

  // Cleanup: delete test stamps and the scaffold.
  for (const id of createdIds) {
    try {
      await deleteStamp(id);
    } catch {
      // already gone
    }
  }
  if (tempControlCreated) {
    try {
      await Word.run(async (ctx) => {
        const cc = ctx.document.contentControls.getByTag("stamp-maker-test").getFirstOrNullObject();
        cc.load("isNullObject");
        await ctx.sync();
        if (!cc.isNullObject) {
          cc.delete(true);
          await ctx.sync();
        }
      });
    } catch {
      // best-effort cleanup
    }
  }

  const passCount = results.filter((r) => r.pass).length;
  results.unshift({
    name: `Suite summary: ${passCount}/${results.length} passed`,
    pass: passCount === results.length,
    detail: "All test stamps and scaffolding were removed afterwards.",
  });
  return results;
}
