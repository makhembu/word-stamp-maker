// End-to-end verification that a download event actually fires: loads the LIVE landing
// page in a real browser, confirms gtag loads and sends a page_view beacon, clicks the
// Download installer button, and checks three independent signals:
//   1. the download event is pushed to window.dataLayer (client-side truth)
//   2. a collect beacon with en=download reaches Google's measurement endpoint
//   3. the browser genuinely receives the zip (download event on the page)
//
// Usage: LANDING_URL=... npm run check-ga   (defaults to the live site)
import { chromium } from "playwright";

const URL = process.env.LANDING_URL || "https://makhembu.github.io/word-stamp-maker/";
let failures = 0;
const ok = (cond, msg) => {
  console.log(`  ${cond ? "✓" : "✗ FAIL"} ${msg}`);
  if (!cond) failures++;
  return cond;
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();

const beacons = [];
const gtagLoads = [];
page.on("request", (r) => {
  const u = r.url();
  if (u.includes("google-analytics.com/g/collect")) beacons.push(u);
  if (u.includes("googletagmanager.com/gtag/js")) gtagLoads.push(u);
});

await page.goto(URL, { waitUntil: "networkidle" });
ok(gtagLoads.length > 0, `gtag loader script requested (${gtagLoads[0] || "none"})`);
await page.waitForFunction(() => typeof window.gtag === "function", { timeout: 15000 });
await page.waitForTimeout(1500);
ok(beacons.some((u) => u.includes("en=page_view")), `page_view beacon sent to GA4 (${beacons.length} beacon(s) so far)`);

// Click the hero download button and catch the browser-level download. Use Promise.all:
// the click resolves immediately, while the download event fires once the asset stream
// starts — racing them would always report "no download".
const cta = page.locator('a.btn.primary[download]').first();
const [download] = await Promise.all([
  page.waitForEvent("download", { timeout: 25000 }).catch(() => null),
  cta.click().catch(() => null),
]);
await page.waitForTimeout(3000);

// Signal 1: the client-side event must be in the dataLayer with the file name.
const dlEvents = await page.evaluate(() =>
  (window.dataLayer || [])
    .filter((e) => e && e[0] === "event" && e[1] === "download")
    .map((e) => e[2] || {})
);
ok(dlEvents.length > 0, `download event pushed to dataLayer (${dlEvents.length} hit(s))`);
const payload = JSON.stringify(dlEvents);
ok(/stamp-maker-setup\.zip/.test(payload), "event carries the installer file name");
if (dlEvents[0]) console.log(`      → ${JSON.stringify(dlEvents[0])}`);

// Signal 2: the beacon with en=download must have reached Google's endpoint.
const dlBeacons = beacons.filter((u) => u.includes("en=download"));
ok(dlBeacons.length > 0, `download beacon sent to Google (${dlBeacons.length} hit(s))`);
if (dlBeacons[0]) {
  const fileOk = dlBeacons.some((u) => /file_name|stamp-maker-setup/.test(decodeURIComponent(u)));
  ok(fileOk, "beacon payload identifies the zip");
  console.log(`      → ${decodeURIComponent(dlBeacons[0]).slice(0, 220)}…`);
}

// Signal 3: the browser actually received the file.
if (download) {
  ok(true, `browser received the zip download (suggested name: ${download.suggestedFilename()})`);
} else {
  ok(false, "browser download did not start (or asset served inline)");
}

await browser.close();
console.log(failures ? `\n${failures} failure(s)` : "\nAll GA event checks passed.");
process.exit(failures ? 1 : 0);
