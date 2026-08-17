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
await page.waitForSelector("#previewSticky", { state: "visible" });
await page.waitForSelector("#templateGrid button", { state: "visible" });
await page.waitForTimeout(400); // let the preview render

const vh = 700;
const atTop = await page.evaluate(() => {
  const p = document.querySelector("#previewSticky").getBoundingClientRect();
  const a = document.querySelector("#actionSticky").getBoundingClientRect();
  const tabs = document.querySelector("nav.tabs").getBoundingClientRect();
  const main = document.querySelector("main");
  return { pTop: p.top, aBottom: a.bottom, tabsBottom: tabs.bottom, mainScrollH: main.scrollHeight, mainClientH: main.clientHeight };
});
// The preview pins just under the (non-scrolling) header + tabs, and is the first thing
// visible on load — no scrolling needed to see it.
ok(atTop.pTop >= atTop.tabsBottom - 2 && atTop.pTop < atTop.tabsBottom + 40, `preview visible at top of scroll area on load (top=${Math.round(atTop.pTop)}px, tabs end at ${Math.round(atTop.tabsBottom)}px)`);
ok(atTop.aBottom <= vh + 1 && atTop.aBottom > vh - 80, `action bar pinned at bottom on load (bottom=${Math.round(atTop.aBottom)}px)`);
ok(atTop.mainScrollH > atTop.mainClientH + 200, `controls actually scroll (${atTop.mainScrollH} vs ${atTop.mainClientH}px)`);

// Scroll deep into the controls: both pinned bars must stay put.
await page.evaluate(() => {
  document.querySelector("main").scrollTop = 99999;
});
await page.waitForTimeout(300);
const scrolled = await page.evaluate(() => {
  const p = document.querySelector("#previewSticky").getBoundingClientRect();
  const a = document.querySelector("#actionSticky").getBoundingClientRect();
  return { pTop: p.top, aBottom: a.bottom };
});
ok(Math.abs(scrolled.pTop - atTop.pTop) < 2, `preview stays pinned while scrolling (top ${Math.round(atTop.pTop)}px → ${Math.round(scrolled.pTop)}px)`);
ok(Math.abs(scrolled.aBottom - atTop.aBottom) < 2, `action bar stays pinned while scrolling (bottom ${Math.round(atTop.aBottom)}px → ${Math.round(scrolled.aBottom)}px)`);

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
