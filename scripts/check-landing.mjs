// Verifies the landing page: the design gallery renders all 15 stamps and every image
// actually loads (no broken assets), then writes a screenshot.
//
// Usage: npm exec --yes --package=playwright -- node scripts/check-landing.mjs
import { chromium } from "playwright";

const URL = process.env.LANDING_URL || "https://localhost:3000/";
let failures = 0;
const ok = (cond, msg) => {
  console.log(`  ${cond ? "✓" : "✗ FAIL"} ${msg}`);
  if (!cond) failures++;
  return cond;
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

await page.goto(URL, { waitUntil: "networkidle", ignoreHTTPSErrors: true });
await page.waitForSelector(".gallery-grid figure", { state: "visible" });

// Gallery tiles use loading="lazy", so below-fold images haven't loaded yet. Flip
// them to eager for the test so we verify the files themselves actually serve.
await page.evaluate(() => {
  document.querySelectorAll("img[loading='lazy']").forEach((img) => {
    img.loading = "eager";
  });
});
await page.waitForFunction(
  () => Array.from(document.querySelectorAll(".gallery-grid img")).every((i) => i.complete && i.naturalWidth > 0),
  { timeout: 10000 }
);

const figures = await page.evaluate(() => {
  const figs = Array.from(document.querySelectorAll(".gallery-grid figure"));
  return {
    count: figs.length,
    broken: figs
      .map((f) => f.querySelector("img"))
      .filter((img) => !img || img.naturalWidth === 0).length,
    labels: figs.map((f) => f.querySelector("figcaption")?.textContent || ""),
  };
});
ok(figures.count === 15, `gallery shows all 15 designs (found ${figures.count})`);
ok(figures.broken === 0, `all gallery images loaded (${figures.broken} broken)`);
ok(figures.labels.every(Boolean), "every tile has a caption");
ok(errors.length === 0, `no console/page errors (${errors.length ? errors[0] : "clean"})`);

await page.screenshot({ path: "landing.png", fullPage: true });
await browser.close();
console.log(failures ? `\n${failures} failure(s)` : "\nAll landing-page checks passed.");
process.exit(failures ? 1 : 0);
