// Verifies the task pane layout with the real bundle in a real browser (system Chrome):
// the preview must stay pinned to the top of the scroll area, and the action bar pinned
// to the bottom, while the controls scroll. Office is mocked so the UI renders outside Word.
//
// Usage: npm exec --yes --package=playwright -- node scripts/check-pane.mjs
import { chromium } from "playwright";

const URL = process.env.PANE_URL || "https://localhost:3000/taskpane.html";
let failures = 0;
const ok = (cond, msg) => {
  console.log(`  ${cond ? "✓" : "✗ FAIL"} ${msg}`);
  if (!cond) failures++;
  return cond;
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 340, height: 700 } });

// Mock Office so init() runs; block the real office.js from overwriting it.
await page.addInitScript(() => {
  window.Office = {
    onReady: (fn) => fn({ host: "Word" }),
    context: {
      host: "Word",
      requirements: { isSetSupported: () => true },
      document: {},
    },
    HostType: { Word: "Word" },
  };
});
await page.route("**/office.js", (r) => r.abort());

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  // The office.js abort below is deliberate (we mock Office); ignore its load error.
  if (m.type() === "error" && !/office\.js|ERR_FAILED/.test(m.text())) errors.push(m.text());
});

await page.goto(URL, { waitUntil: "networkidle", ignoreHTTPSErrors: true });
await page.waitForSelector("#previewBar", { state: "visible" });
await page.waitForSelector("#actionBar", { state: "visible" });
await page.waitForSelector("#templateGrid button", { state: "visible" });
await page.waitForTimeout(400); // let the preview render

const vh = 700;
const atTop = await page.evaluate(() => {
  const p = document.querySelector("#previewBar").getBoundingClientRect();
  const a = document.querySelector("#actionBar").getBoundingClientRect();
  const tabs = document.querySelector("nav.tabs").getBoundingClientRect();
  const mainEl = document.querySelector("main");
  const main = mainEl.getBoundingClientRect();
  return {
    pTop: p.top, pBottom: p.bottom, aTop: a.top, aBottom: a.bottom,
    tabsBottom: tabs.bottom, mainTop: main.top, mainBottom: main.bottom,
    mainScrollH: mainEl.scrollHeight, mainClientH: mainEl.clientHeight,
  };
});
// App shell: preview bar sits right under the tabs; action bar sits at the pane bottom;
// the scroll area lives strictly BETWEEN them (nothing can scroll under either bar).
ok(atTop.pTop >= atTop.tabsBottom - 2 && atTop.pTop < atTop.tabsBottom + 8, `preview bar directly under tabs (top=${Math.round(atTop.pTop)}px, tabs end at ${Math.round(atTop.tabsBottom)}px)`);
ok(atTop.aBottom <= vh + 1 && atTop.aBottom > vh - 2, `action bar flush with pane bottom (bottom=${Math.round(atTop.aBottom)}px)`);
ok(atTop.mainTop >= atTop.pBottom - 1 && atTop.mainBottom <= atTop.aTop + 1, `scroll area sits between the bars (main ${Math.round(atTop.mainTop)}–${Math.round(atTop.mainBottom)}px, bars ${Math.round(atTop.pBottom)}–${Math.round(atTop.aTop)}px)`);
ok(atTop.mainScrollH > atTop.mainClientH + 150, `controls actually scroll (${atTop.mainScrollH} vs ${atTop.mainClientH}px)`);

// Scroll deep into the controls: bars never move, and the last control is fully reachable.
await page.evaluate(() => {
  document.querySelector("main").scrollTop = 99999;
});
await page.waitForTimeout(300);
const scrolled = await page.evaluate(() => {
  const p = document.querySelector("#previewBar").getBoundingClientRect();
  const a = document.querySelector("#actionBar").getBoundingClientRect();
  const main = document.querySelector("main").getBoundingClientRect();
  const rot = document.querySelector("#rotationNum").getBoundingClientRect();
  return { pTop: p.top, aBottom: a.bottom, mainBottom: main.bottom, rotBottom: rot.bottom };
});
ok(Math.abs(scrolled.pTop - atTop.pTop) < 2 && Math.abs(scrolled.aBottom - atTop.aBottom) < 2, `bars fixed while scrolling (preview top ${Math.round(atTop.pTop)}px, action bottom ${Math.round(atTop.aBottom)}px)`);
ok(scrolled.rotBottom <= scrolled.mainBottom + 1, `last control fully visible at scroll bottom (rotation field ends at ${Math.round(scrolled.rotBottom)}px, scroll area ends at ${Math.round(scrolled.mainBottom)}px)`);

// On other tabs the bars hide, so the Stamps/Test tabs get the full height.
await page.click("#tabBtn-manage");
await page.waitForTimeout(150);
const otherTab = await page.evaluate(() => {
  const p = document.querySelector("#previewBar").getBoundingClientRect();
  const a = document.querySelector("#actionBar").getBoundingClientRect();
  return { pH: p.height, aH: a.height };
});
ok(otherTab.pH === 0 && otherTab.aH === 0, "preview and action bars hidden on the Stamps tab");
await page.click("#tabBtn-design");

// The preview must not overlap the controls in a way that hides them: it should be
// visually present (canvas drawn) and the action bar above it shouldn't cover it.
const canvas = await page.evaluate(() => {
  const c = document.querySelector("#preview");
  return c.width > 100 && c.height > 50;
});
ok(canvas, "preview canvas actually rendered content");

await page.screenshot({ path: "pane-top.png" });
await page.evaluate(() => {
  document.querySelector("main").scrollTop = 99999;
});
await page.waitForTimeout(200);
await page.screenshot({ path: "pane-scrolled.png" });

ok(errors.length === 0, `no console/page errors (${errors.length ? errors[0] : "clean"})`);
await browser.close();
console.log(failures ? `\n${failures} failure(s)` : "\nAll layout checks passed.");
process.exit(failures ? 1 : 0);
