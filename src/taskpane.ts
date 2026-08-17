// Stamp Maker task pane entry point.

import {
  CUSTOM_SHAPES,
  FONT_OPTIONS,
  INK_COLORS,
  SIZE_PRESETS,
  TEMPLATES,
  aspectForShape,
  defaultsFor,
  todayText,
} from "./core/templates";
import { renderStamp } from "./core/renderer";
import {
  deleteStamp,
  insertStamp,
  isShapeApiSupported,
  listStamps,
  selectStamp,
} from "./core/document";
import { deleteSavedDesign, loadSavedDesigns, saveDesign } from "./core/saved";
import type { SavedDesign } from "./core/saved";
import type { StampParams, StampRecord, TextAlign, TextBlock } from "./core/types";
import { runTestSuite } from "./test/suite";

// ---------- DOM helpers ----------
function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}
function val(id: string): string {
  return ($(id) as HTMLInputElement | HTMLSelectElement).value;
}

// ---------- State ----------
let editingId: string | null = null;
let editingRecord: StampRecord | null = null;
let stampsCache: StampRecord[] = [];

// ---------- Toast ----------
let toastTimer: number | undefined;
function toast(message: string, isError = false): void {
  const el = $("toast");
  el.textContent = message;
  el.classList.toggle("error", isError);
  el.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.hidden = true;
  }, 2400);
}

// ---------- Build static UI ----------
function buildTemplateGrid(): void {
  const grid = $("templateGrid");
  grid.innerHTML = "";
  for (const t of TEMPLATES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = t.label;
    btn.dataset.template = t.id;
    btn.addEventListener("click", () => selectTemplate(t.id));
    grid.appendChild(btn);
  }
  // Saved custom designs appear in the gallery too, as first-class templates.
  for (const d of loadSavedDesigns()) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = d.name;
    btn.dataset.saved = d.id;
    btn.title = "Saved design";
    btn.classList.add("saved-chip-btn");
    btn.addEventListener("click", () => loadSavedIntoUI(d));
    grid.appendChild(btn);
  }
}

function buildSwatches(): void {
  const wrap = $("colorSwatches");
  wrap.innerHTML = "";
  for (const c of INK_COLORS) {
    const s = document.createElement("button");
    s.type = "button";
    s.className = "swatch";
    s.style.background = c.hex;
    s.title = c.name;
    s.dataset.color = c.hex;
    s.addEventListener("click", () => selectSwatch(c.hex));
    wrap.appendChild(s);
  }
}

function selectSwatch(hex: string): void {
  const custom = $("customColor") as HTMLInputElement;
  custom.value = hex;
  document.querySelectorAll<HTMLElement>(".swatch").forEach((s) => {
    s.classList.toggle("active", s.dataset.color === hex);
  });
  const isCustom = !INK_COLORS.some((c) => c.hex === hex);
  if (!isCustom) {
    document.querySelectorAll<HTMLElement>(".swatch").forEach((s) => {
      if (s.dataset.color === hex) s.classList.add("active");
    });
  }
  schedulePreview();
}

function buildShapeSelect(): void {
  const sel = $("shapeSelect") as HTMLSelectElement;
  sel.innerHTML = "";
  for (const o of CUSTOM_SHAPES) {
    const opt = document.createElement("option");
    opt.value = o.value;
    opt.textContent = o.label;
    sel.appendChild(opt);
  }
}

function buildFontSelect(): void {
  const sel = $("fontFamily") as HTMLSelectElement;
  sel.innerHTML = "";
  for (const f of FONT_OPTIONS) {
    const opt = document.createElement("option");
    opt.value = f;
    opt.textContent = f;
    sel.appendChild(opt);
  }
}

// ---------- Template / field handling ----------
let activeTemplateId = TEMPLATES[0].id;

function selectTemplate(id: string): void {
  activeTemplateId = id;
  const tpl = TEMPLATES.find((t) => t.id === id)!;
  document.querySelectorAll<HTMLElement>("#templateGrid button").forEach((b) => {
    b.classList.toggle("active", b.dataset.template === id);
  });

  if (tpl.id === "custom") {
    initCustomBlocks();
  }

  const d = defaultsFor(tpl);
  ($("mainText") as HTMLInputElement).value = d.mainText;
  ($("secondLine") as HTMLInputElement).value = "";
  ($("refText") as HTMLInputElement).value = "";
  ($("deptText") as HTMLInputElement).value = "";
  ($("nameText") as HTMLInputElement).value = "";
  ($("addDate") as HTMLInputElement).checked = tpl.id === "date";
  ($("dateText") as HTMLInputElement).value = todayText();
  selectSwatch(d.inkColor);
  ($("customColor") as HTMLInputElement).value = d.inkColor;
  ($("sizePreset") as HTMLSelectElement).value = "medium";
  ($("customWidth") as HTMLInputElement).value = String(d.widthPts);
  ($("fontFamily") as HTMLSelectElement).value = d.fontFamily;
  ($("fontSize") as HTMLInputElement).value = String(d.fontSize);
  ($("secondLineSize") as HTMLInputElement).value = String(d.secondLineSize);
  ($("boldChk") as HTMLInputElement).checked = d.bold;
  ($("italicChk") as HTMLInputElement).checked = d.italic;
  ($("underlineChk") as HTMLInputElement).checked = d.underline;
  ($("alignSelect") as HTMLSelectElement).value = d.align;
  ($("borderStyle") as HTMLSelectElement).value = d.borderStyle;
  ($("borderThickness") as HTMLSelectElement).value = String(d.borderThickness);
  ($("opacityRange") as HTMLInputElement).value = String(Math.round(d.opacity * 100));
  $("opacityVal").textContent = `${Math.round(d.opacity * 100)}%`;
  ($("rotationNum") as HTMLInputElement).value = String(d.rotation);
  ($("randomTilt") as HTMLInputElement).checked = false;
  ($("dividerChk") as HTMLInputElement).checked = tpl.divider;

  const shapeSel = $("shapeSelect") as HTMLSelectElement;
  shapeSel.value = d.shape;

  applyFieldVisibility(tpl);
  schedulePreview();
}

function applyFieldVisibility(tpl: { supportsSecondLine: boolean; supportsDate: boolean; supportsRef: boolean; supportsDept: boolean; supportsName: boolean; id: string }): void {
  const isCustom = tpl.id === "custom";
  $("legacyTextSection").hidden = isCustom;
  $("customTextSection").hidden = !isCustom;
  $("secondLineField").hidden = !tpl.supportsSecondLine;
  $("secondLineSizeField").hidden = !tpl.supportsSecondLine;
  $("dateRow").hidden = !tpl.supportsDate;
  $("refField").hidden = !tpl.supportsRef;
  $("deptField").hidden = !tpl.supportsDept;
  $("nameField").hidden = !tpl.supportsName;
  $("shapeField").hidden = !isCustom;
  $("fontSizeField").hidden = isCustom;
  $("formatField").hidden = isCustom;
  $("alignField").hidden = isCustom;
  $("dividerField").hidden = isCustom
    ? false
    : !(tpl.supportsSecondLine || tpl.supportsDate || tpl.supportsRef || tpl.supportsDept || tpl.supportsName);
}

// ---------- Custom text blocks ----------
function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function addBlockRow(block?: Partial<TextBlock>): void {
  const list = $("textBlocksList");
  const row = document.createElement("div");
  row.className = "block-row";
  const size = block?.size ?? 18;
  const y = block?.y ?? 40;
  const align = block?.align ?? "center";
  const bold = block?.bold ?? true;
  const italic = block?.italic ?? false;
  const underline = block?.underline ?? false;
  const spacing = block?.spacing ?? 0;
  row.innerHTML = `
    <div class="row">
      <input type="text" class="block-text" maxlength="48" placeholder="Text…" value="${escapeAttr(block?.text ?? "")}" />
      <label class="check mini" title="Bold"><input type="checkbox" class="block-bold" ${bold ? "checked" : ""} /> B</label>
      <label class="check mini" title="Italic"><input type="checkbox" class="block-italic" ${italic ? "checked" : ""} /> I</label>
      <label class="check mini" title="Underline"><input type="checkbox" class="block-underline" ${underline ? "checked" : ""} /> U</label>
      <button type="button" class="block-del" title="Remove this text">✕</button>
    </div>
    <div class="row block-opts">
      <div class="field" style="flex:0 0 62px">
        <label>Size</label>
        <input type="number" class="block-size" min="6" max="96" value="${size}" />
      </div>
      <div class="field" style="flex:0 0 82px">
        <label>Spacing <span class="hint">pt</span></label>
        <input type="number" class="block-spacing" min="-6" max="16" step="0.5" value="${spacing}" title="Letter spacing between characters, in points. Negative condenses." />
      </div>
      <div class="field" style="flex:1">
        <label>Y position</label>
        <input type="range" class="block-y" min="0" max="96" value="${y}" />
      </div>
      <span class="yval">${y}%</span>
      <select class="block-align">
        <option value="center">Center</option>
        <option value="left"${align === "left" ? " selected" : ""}>Left</option>
        <option value="right"${align === "right" ? " selected" : ""}>Right</option>
      </select>
    </div>`;
  row.querySelector(".block-text")!.addEventListener("input", schedulePreview);
  row.querySelector(".block-size")!.addEventListener("input", schedulePreview);
  row.querySelector(".block-spacing")!.addEventListener("input", schedulePreview);
  for (const cls of [".block-bold", ".block-italic", ".block-underline"]) {
    row.querySelector(cls)!.addEventListener("change", schedulePreview);
  }
  const yRange = row.querySelector(".block-y") as HTMLInputElement;
  const yVal = row.querySelector(".yval") as HTMLElement;
  yRange.addEventListener("input", () => {
    yVal.textContent = `${yRange.value}%`;
    schedulePreview();
  });
  row.querySelector(".block-align")!.addEventListener("change", schedulePreview);
  row.querySelector(".block-del")!.addEventListener("click", () => {
    row.remove();
    schedulePreview();
  });
  list.appendChild(row);
}

function renderBlockRows(blocks: TextBlock[]): void {
  const list = $("textBlocksList");
  list.innerHTML = "";
  for (const b of blocks) addBlockRow(b);
}

/** Reset the custom text-block editor from the current main/second line fields. */
function initCustomBlocks(): void {
  const main = val("mainText").trim() || "STAMP";
  const second = val("secondLine").trim();
  const blocks: TextBlock[] = [{ id: "b0", text: main, size: 18, y: 35, align: "center" }];
  if (second) blocks.push({ id: "b1", text: second, size: 13, y: 70, align: "center" });
  renderBlockRows(blocks);
}

function blocksFromUI(): TextBlock[] {
  const out: TextBlock[] = [];
  const rows = Array.from($("textBlocksList").querySelectorAll<HTMLElement>(".block-row"));
  for (const row of rows) {
    const text = (row.querySelector(".block-text") as HTMLInputElement).value.trim();
    if (!text) continue;
    out.push({
      id: "b" + out.length,
      text,
      size: Math.min(96, Math.max(6, parseInt((row.querySelector(".block-size") as HTMLInputElement).value, 10) || 18)),
      y: Math.min(96, Math.max(0, parseInt((row.querySelector(".block-y") as HTMLInputElement).value, 10) || 40)),
      align: (row.querySelector(".block-align") as HTMLSelectElement).value as TextAlign,
      bold: (row.querySelector(".block-bold") as HTMLInputElement).checked,
      italic: (row.querySelector(".block-italic") as HTMLInputElement).checked,
      underline: (row.querySelector(".block-underline") as HTMLInputElement).checked,
      spacing: Math.min(16, Math.max(-6, parseFloat((row.querySelector(".block-spacing") as HTMLInputElement).value) || 0)),
    });
  }
  return out;
}

// ---------- Saved designs ----------
function refreshSavedDesigns(): void {
  const wrap = $("savedDesigns");
  wrap.innerHTML = "";
  for (const d of loadSavedDesigns()) {
    const chip = document.createElement("div");
    chip.className = "saved-chip";
    chip.title = "Load this design";
    const name = document.createElement("span");
    name.textContent = d.name;
    name.style.fontWeight = "600";
    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.title = "Delete this design";
    del.textContent = "✕";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteSavedDesign(d.id);
      refreshSavedDesigns();
      buildTemplateGrid();
      toast("Design deleted");
    });
    chip.appendChild(name);
    chip.appendChild(del);
    chip.addEventListener("click", () => loadSavedIntoUI(d));
    wrap.appendChild(chip);
  }
}

function loadSavedIntoUI(d: SavedDesign): void {
  activeTemplateId = "custom";
  document.querySelectorAll<HTMLElement>("#templateGrid button").forEach((b) => {
    b.classList.toggle("active", b.dataset.template === "custom" || b.dataset.saved === d.id);
  });
  const customTpl = TEMPLATES.find((t) => t.id === "custom")!;
  loadParamsIntoUI(d.params);
  applyFieldVisibility(customTpl);
  ($("tabBtn-design") as HTMLButtonElement).click();
  toast(`Loaded "${d.name}" ✓`);
}

// ---------- Params ----------
function widthFromSizePreset(): number {
  const preset = val("sizePreset");
  if (preset === "custom") {
    return Math.min(420, Math.max(60, parseInt(val("customWidth"), 10) || 180));
  }
  return SIZE_PRESETS[preset].widthPts;
}

function paramsFromUI(): StampParams {
  const shape = val("shapeSelect") as StampParams["shape"];
  const addDate = ($("addDate") as HTMLInputElement).checked;
  const isCustom = activeTemplateId === "custom";
  const blocks = isCustom ? blocksFromUI() : [];
  const mainText = isCustom ? (blocks[0]?.text ?? "STAMP") : val("mainText").trim() || "STAMP";
  const params: StampParams = {
    templateId: activeTemplateId,
    shape,
    mainText,
    secondLine: isCustom ? "" : val("secondLine").trim(),
    dateText: addDate ? val("dateText").trim() || todayText() : "",
    refText: val("refText").trim(),
    deptText: val("deptText").trim(),
    nameText: val("nameText").trim(),
    inkColor: ($("customColor") as HTMLInputElement).value,
    opacity: (parseInt(val("opacityRange"), 10) || 92) / 100,
    fontSize: Math.min(72, Math.max(8, parseInt(val("fontSize"), 10) || 18)),
    secondLineSize: Math.min(60, Math.max(6, parseInt(val("secondLineSize"), 10) || 11)),
    fontFamily: val("fontFamily"),
    bold: ($("boldChk") as HTMLInputElement).checked,
    italic: ($("italicChk") as HTMLInputElement).checked,
    underline: ($("underlineChk") as HTMLInputElement).checked,
    align: val("alignSelect") as StampParams["align"],
    borderThickness: parseFloat(val("borderThickness")) || 1,
    borderStyle: val("borderStyle") as StampParams["borderStyle"],
    rotation: parseInt(val("rotationNum"), 10) || 0,
    widthPts: widthFromSizePreset(),
    aspect: aspectForShape(shape),
    divider: ($("dividerChk") as HTMLInputElement).checked,
  };
  if (isCustom) {
    params.textBlocks =
      blocks.length > 0
        ? blocks
        : [{ id: "b0", text: mainText, size: 18, y: 40, align: "center" as const }];
  }
  return params;
}

// ---------- Preview ----------
let previewTimer: number | undefined;
function schedulePreview(): void {
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(renderPreview, 120);
}

function renderPreview(): void {
  const canvas = $("preview") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  let p: StampParams;
  try {
    p = paramsFromUI();
  } catch {
    return;
  }
  try {
    const r = renderStamp(p);
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.style.transform = `rotate(${p.rotation}deg)`;
    };
    img.src = r.dataUrl;
  } catch (e) {
    // ignore preview errors; they shouldn't block the UI
    console.error("preview failed", e);
  }
}

// ---------- Insert / update ----------
function setBusy(busy: boolean): void {
  const btn = $("insertBtn") as HTMLButtonElement;
  btn.disabled = busy;
  btn.textContent = editingId ? (busy ? "UPDATING…" : "UPDATE STAMP") : busy ? "INSERTING…" : "INSERT STAMP";
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function updateEditBanner(): void {
  const banner = $("editBanner");
  if (editingId) {
    const tpl = TEMPLATES.find((t) => t.id === editingRecord?.params?.templateId);
    $("editBannerText").textContent = `Updating "${editingRecord?.params?.mainText || tpl?.label || "stamp"}" — changes apply in place.`;
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }
  setBusy(false);
}

async function applyStamp(): Promise<void> {
  const params = paramsFromUI();
  if (!params.mainText.trim()) {
    toast("Enter some stamp text first", true);
    return;
  }
  setBusy(true);
  try {
    const render = renderStamp(params);
    if (editingId && editingRecord) {
      await insertStamp(render, params, {
        position: "cursor",
        replaceId: editingId,
        keepGeometry: {
          top: editingRecord.top,
          left: editingRecord.left,
          rotation: editingRecord.rotation,
          relativeHorizontalPosition: editingRecord.relativeHorizontalPosition,
          relativeVerticalPosition: editingRecord.relativeVerticalPosition,
        },
      });
      editingId = null;
      editingRecord = null;
      toast("Stamp updated ✓");
    } else {
      await insertStamp(render, params, { position: "cursor" });
      toast("Stamp inserted ✓");
    }
    updateEditBanner();
    await refreshManage();
  } catch (e) {
    toast(`Could not insert stamp: ${errorMessage(e)}`, true);
  } finally {
    setBusy(false);
  }
}

function cancelEdit(): void {
  editingId = null;
  editingRecord = null;
  updateEditBanner();
}

// ---------- Manage ----------
async function refreshManage(): Promise<void> {
  try {
    stampsCache = await listStamps();
  } catch (e) {
    toast(`Could not list stamps: ${errorMessage(e)}`, true);
    stampsCache = [];
  }
  const list = $("stampList");
  list.innerHTML = "";
  $("manageEmpty").hidden = stampsCache.length > 0;

  for (const rec of stampsCache) {
    const label = rec.params?.mainText || rec.name.replace(/^StampMaker::/, "");
    const row = document.createElement("div");
    row.className = "stamp-row";
    const metaBits: string[] = [
      `${Math.round(rec.width)}×${Math.round(rec.height)} pt`,
      `${Math.round(rec.rotation)}°`,
      `(${Math.round(rec.left)}, ${Math.round(rec.top)})`,
    ];
    if (rec.wrapType === "Front") metaBits.push('<span class="badge">front of text</span>');
    else if (rec.wrapType === "Behind") metaBits.push('<span class="badge">behind text</span>');

    row.innerHTML = `
      <div class="name">${escapeHtml(label)}</div>
      <div class="meta">${metaBits.join(" · ")}</div>
      <div class="actions">
        <button data-act="select">Select</button>
        <button data-act="edit">Edit</button>
        <button data-act="dup">Duplicate</button>
        <button data-act="del">Delete</button>
      </div>`;

    row.querySelector('[data-act="select"]')!.addEventListener("click", () => {
      selectStamp(rec.id).catch((e) => toast(errorMessage(e), true));
    });
    row.querySelector('[data-act="edit"]')!.addEventListener("click", () => startEdit(rec));
    row.querySelector('[data-act="dup"]')!.addEventListener("click", () => duplicateStamp(rec));
    row.querySelector('[data-act="del"]')!.addEventListener("click", () => removeStamp(rec));
    list.appendChild(row);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function startEdit(rec: StampRecord): void {
  if (!rec.params) {
    toast("This stamp has no editable metadata", true);
    return;
  }
  editingId = rec.id;
  editingRecord = rec;

  const tpl = TEMPLATES.find((t) => t.id === rec.params!.templateId) ?? TEMPLATES.find((t) => t.id === "custom")!;
  selectTemplate(tpl.id);
  loadParamsIntoUI(rec.params);
  applyFieldVisibility(tpl);

  ($("tabBtn-design") as HTMLButtonElement).click();
  updateEditBanner();
}

function loadParamsIntoUI(p: StampParams): void {
  ($("mainText") as HTMLInputElement).value = p.mainText;
  ($("secondLine") as HTMLInputElement).value = p.secondLine;
  ($("addDate") as HTMLInputElement).checked = !!p.dateText;
  ($("dateText") as HTMLInputElement).value = p.dateText || todayText();
  ($("refText") as HTMLInputElement).value = p.refText;
  ($("deptText") as HTMLInputElement).value = p.deptText;
  ($("nameText") as HTMLInputElement).value = p.nameText;
  selectSwatch(p.inkColor);
  ($("customColor") as HTMLInputElement).value = p.inkColor;
  ($("sizePreset") as HTMLSelectElement).value = SIZE_PRESETS.small.widthPts === p.widthPts ? "small" : SIZE_PRESETS.medium.widthPts === p.widthPts ? "medium" : SIZE_PRESETS.large.widthPts === p.widthPts ? "large" : "custom";
  ($("customWidth") as HTMLInputElement).value = String(Math.round(p.widthPts));
  ($("fontFamily") as HTMLSelectElement).value = p.fontFamily;
  ($("fontSize") as HTMLInputElement).value = String(p.fontSize);
  ($("secondLineSize") as HTMLInputElement).value = String(p.secondLineSize || Math.round((p.fontSize || 18) * 0.6));
  ($("boldChk") as HTMLInputElement).checked = p.bold;
  ($("italicChk") as HTMLInputElement).checked = p.italic;
  ($("underlineChk") as HTMLInputElement).checked = !!p.underline;
  ($("alignSelect") as HTMLSelectElement).value = p.align;
  ($("borderStyle") as HTMLSelectElement).value = p.borderStyle;
  ($("borderThickness") as HTMLSelectElement).value = String(p.borderThickness);
  ($("opacityRange") as HTMLInputElement).value = String(Math.round(p.opacity * 100));
  $("opacityVal").textContent = `${Math.round(p.opacity * 100)}%`;
  ($("rotationNum") as HTMLInputElement).value = String(p.rotation);
  ($("randomTilt") as HTMLInputElement).checked = false;
  ($("dividerChk") as HTMLInputElement).checked = !!p.divider;
  ($("shapeSelect") as HTMLSelectElement).value = p.shape;
  // Custom stamps: rebuild the text-block editor from the saved params (or migrate
  // legacy custom stamps that used the old single second-line fields).
  if (p.templateId === "custom") {
    const migrated: TextBlock[] =
      p.textBlocks && p.textBlocks.length
        ? p.textBlocks
        : [
            { id: "b0", text: p.mainText || "STAMP", size: p.fontSize || 18, y: 35, align: "center" },
            ...(p.secondLine
              ? [{ id: "b1", text: p.secondLine, size: p.secondLineSize || 12, y: 70, align: "center" as const }]
              : []),
          ];
    // Older stamps have no per-block style; inherit the stamp-wide style explicitly so
    // re-saving doesn't silently change their look.
    const blocks = migrated.map((b) => ({
      ...b,
      bold: b.bold ?? p.bold,
      italic: b.italic ?? p.italic,
      underline: b.underline ?? p.underline,
      spacing: b.spacing ?? 0,
    }));
    renderBlockRows(blocks);
  }
  schedulePreview();
}

async function duplicateStamp(rec: StampRecord): Promise<void> {
  if (!rec.params) {
    toast("Cannot duplicate: no metadata", true);
    return;
  }
  try {
    const render = renderStamp(rec.params);
    await insertStamp(render, rec.params, {
      position: "cursor",
      keepGeometry: {
        top: rec.top + 24,
        left: rec.left + 24,
        rotation: rec.rotation,
        relativeHorizontalPosition: rec.relativeHorizontalPosition,
        relativeVerticalPosition: rec.relativeVerticalPosition,
      },
    });
    toast("Stamp duplicated ✓");
    await refreshManage();
  } catch (e) {
    toast(`Duplicate failed: ${errorMessage(e)}`, true);
  }
}

async function removeStamp(rec: StampRecord): Promise<void> {
  if (!window.confirm(`Delete the "${rec.params?.mainText || "stamp"}" stamp?`)) return;
  try {
    await deleteStamp(rec.id);
    toast("Stamp deleted");
    await refreshManage();
  } catch (e) {
    toast(`Delete failed: ${errorMessage(e)}`, true);
  }
}

// ---------- Tests ----------
async function runTests(): Promise<void> {
  const btn = $("runTestsBtn") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = "Running…";
  const resultsEl = $("testResults");
  resultsEl.innerHTML = '<div class="empty">Running tests inside Word…</div>';
  try {
    const results = await runTestSuite();
    resultsEl.innerHTML = "";
    for (const r of results) {
      const div = document.createElement("div");
      div.className = `test-result ${r.pass ? "pass" : "fail"}`;
      div.innerHTML = `<div class="tname">${r.pass ? "✓" : "✗"} ${escapeHtml(r.name)}</div>` +
        (r.detail ? `<div class="tdetail">${escapeHtml(r.detail)}</div>` : "");
      resultsEl.appendChild(div);
    }
  } catch (e) {
    resultsEl.innerHTML = `<div class="test-result fail"><div class="tname">✗ Suite crashed</div><div class="tdetail">${escapeHtml(errorMessage(e))}</div></div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "▶ Run test suite";
  }
}

// ---------- Tabs ----------
function switchTab(name: string): void {
  document.querySelectorAll<HTMLElement>("nav.tabs button").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === name);
  });
  $("tab-design").hidden = name !== "design";
  $("tab-manage").hidden = name !== "manage";
  $("tab-tests").hidden = name !== "tests";
  $("previewBar").hidden = name !== "design";
  $("actionBar").hidden = name !== "design";
  if (name === "manage") void refreshManage();
}

// ---------- Boot ----------
function bindEvents(): void {
  const inputs = [
    "mainText", "secondLine", "dateText", "refText", "deptText", "nameText",
    "fontSize", "secondLineSize", "customWidth", "rotationNum", "opacityRange",
  ];
  for (const id of inputs) {
    $(id).addEventListener("input", schedulePreview);
  }
  $("opacityRange").addEventListener("input", () => {
    $("opacityVal").textContent = `${($("opacityRange") as HTMLInputElement).value}%`;
  });
  for (const id of ["fontFamily", "alignSelect", "borderStyle", "borderThickness", "sizePreset", "shapeSelect"]) {
    $(id).addEventListener("change", () => {
      $("customWidthField").hidden = val("sizePreset") !== "custom";
      schedulePreview();
    });
  }
  for (const id of ["boldChk", "italicChk", "underlineChk", "addDate", "randomTilt", "dividerChk"]) {
    $(id).addEventListener("change", () => {
      if (id === "addDate" && ($("addDate") as HTMLInputElement).checked) {
        const dt = $("dateText") as HTMLInputElement;
        if (!dt.value.trim()) dt.value = todayText();
      }
      if (id === "randomTilt" && ($("randomTilt") as HTMLInputElement).checked) {
        const r = Math.round((Math.random() * 28 - 14));
        ($("rotationNum") as HTMLInputElement).value = String(r);
      }
      schedulePreview();
    });
  }
  $("customColor").addEventListener("input", () => {
    selectSwatch(($("customColor") as HTMLInputElement).value);
  });
  $("addBlockBtn").addEventListener("click", () => {
    addBlockRow({ text: "", size: 14, y: 60, align: "center" });
    schedulePreview();
  });
  $("saveDesignBtn").addEventListener("click", () => {
    const nameInput = $("designName") as HTMLInputElement;
    const name = nameInput.value.trim();
    if (!name) {
      toast("Give the design a name first", true);
      nameInput.focus();
      return;
    }
    saveDesign(name, paramsFromUI());
    refreshSavedDesigns();
    buildTemplateGrid();
    toast("Design saved ✓");
  });
  $("designName").addEventListener("keydown", (e) => {
    if (e.key === "Enter") ($("saveDesignBtn") as HTMLButtonElement).click();
  });
  $("insertBtn").addEventListener("click", () => void applyStamp());
  $("cancelEditBtn").addEventListener("click", cancelEdit);
  $("refreshBtn").addEventListener("click", () => void refreshManage());
  $("runTestsBtn").addEventListener("click", () => void runTests());
  document.querySelectorAll<HTMLElement>("nav.tabs button").forEach((b) => {
    b.addEventListener("click", () => switchTab(b.dataset.tab || "design"));
  });
}

function init(): void {
  if (!isShapeApiSupported()) {
    $("unsupported").hidden = false;
    $("tab-design").hidden = true;
    $("tab-manage").hidden = true;
    $("tab-tests").hidden = true;
    $("previewBar").hidden = true;
    $("actionBar").hidden = true;
    document.querySelectorAll<HTMLElement>("nav.tabs button").forEach((b) => (b.style.display = "none"));
    return;
  }
  buildTemplateGrid();
  buildSwatches();
  buildShapeSelect();
  buildFontSelect();
  bindEvents();
  refreshSavedDesigns();
  $("previewBar").hidden = false;
  $("actionBar").hidden = false;
  selectTemplate(TEMPLATES[0].id);
  void refreshManage();
}

Office.onReady((info) => {
  if (info.host === Office.HostType.Word) {
    init();
  } else {
    $("unsupported").hidden = false;
    $("unsupported").querySelector("h2")!.textContent = "Word only";
  }
});
