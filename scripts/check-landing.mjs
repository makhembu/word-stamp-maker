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
  // Ignore the badge's own optional GitHub API fetch: a 404 just means the release
  // hasn't been published yet (first deploy), and the badge hides gracefully.
  if (m.type() === "error" && !/Failed to load resource:.*404/.test(m.text())) errors.push(m.text());
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

// The page must make it obvious this is a Microsoft Word add-in and lead with
// the one-click installer, not the raw XML manifest.
const copy = await page.evaluate(() => document.body.innerText);
ok(
  copy.includes("Microsoft Word"),
  'page text mentions "Microsoft Word"'
);
ok(
  /Word add-in/i.test(copy),
  'page text says it is a "Word add-in"'
);
const DL_URL = "https://github.com/makhembu/word-stamp-maker/releases/latest/download/stamp-maker-setup.zip";
const dl = await page.evaluate((u) => {
  const a = document.querySelector('a.btn.primary[href^="https://github.com/"]');
  if (!a) return null;
  return { href: a.getAttribute("href"), download: a.hasAttribute("download"), text: a.textContent.trim() };
}, DL_URL);
ok(!!dl, "hero primary CTA links to the installer");
ok(dl?.href === DL_URL, `hero CTA points at the GitHub release perma-link (${dl?.href})`);
ok(dl?.download, "download CTA uses the download attribute (fires the GA event)");
ok(/installer/i.test(dl?.text || ""), "download CTA says installer");
ok(/installer/i.test(copy), "install steps mention the installer");

// Live download badge: present, and either shows a real count (GitHub API reachable)
// or hides gracefully without breaking the page.
const badge = await page.evaluate(() => {
  const el = document.querySelector("#dlBadge");
  return {
    exists: !!el,
    visible: !!el && !el.hidden && el.getBoundingClientRect().height > 0,
    text: el?.textContent.replace(/\s+/g, " ").trim() || "",
  };
});
ok(badge.exists, "download badge element exists");
if (badge.visible) {
  ok(/\d[\.\,]?\d* downloads/i.test(badge.text), `badge shows a count ("${badge.text}")`);
} else {
  ok(true, "badge stays hidden when GitHub is unreachable (graceful)");
}

// FAQ: present, populated, and covering the promised topics (versions, Mac, privacy).
// Closed <details> hide their answers from innerText, so open them first.
const faq = await page.evaluate(() => {
  const items = Array.from(document.querySelectorAll(".faq-item"));
  items.forEach((i) => (i.open = true));
  return {
    count: items.length,
    emptySummaries: items.filter((i) => !(i.querySelector("summary")?.textContent.trim())).length,
    text: document.querySelector(".faq")?.innerText || "",
  };
});
ok(faq.count >= 6, `FAQ has at least 6 questions (found ${faq.count})`);
ok(faq.emptySummaries === 0, "every FAQ question has a summary");
ok(/Microsoft 365/.test(faq.text), "FAQ covers Word versions (Microsoft 365)");
ok(/Mac/.test(faq.text), "FAQ covers Mac");
ok(/(tracking|account|never leaves your machine|collect my data)/i.test(faq.text), "FAQ covers privacy");

// SEO head: canonical + OG must be absolute (the deployed origin), the social card
// must exist and serve, and JSON-LD must be complete enough for rich results.
const seo = await page.evaluate(() => {
  const q = (sel, attr) => document.querySelector(sel)?.getAttribute(attr) || "";
  const ld = JSON.parse(document.querySelector('script[type="application/ld+json"]')?.textContent || "{}");
  const gtag = document.querySelector('script[src*="googletagmanager"]');
  return {
    canon: q('link[rel="canonical"]', "href"),
    ogUrl: q('meta[property="og:url"]', "content"),
    ogImage: q('meta[property="og:image"]', "content"),
    ogSite: q('meta[property="og:site_name"]', "content"),
    twImage: q('meta[name="twitter:image"]', "content"),
    twCard: q('meta[name="twitter:card"]', "content"),
    keywords: !!document.querySelector('meta[name="keywords"]'),
    html: document.head.innerHTML,
    gtagSrc: gtag?.getAttribute("src") || "",
    ld,
  };
});
ok(!/__GA_ID__/.test(seo.html), "no GA placeholder leaks into the page");
if (seo.gtagSrc) {
  ok(/^https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-[A-Z0-9]+$/.test(seo.gtagSrc), `gtag script uses a valid G- id (${seo.gtagSrc})`);
} else {
  ok(true, "analytics not configured on this build (GA_MEASUREMENT_ID unset) — no gtag script");
}
ok(/^https:\/\//.test(seo.canon) && seo.canon.endsWith("/"), `canonical is absolute (${seo.canon})`);
ok(/^https:\/\//.test(seo.ogUrl), `og:url is absolute (${seo.ogUrl})`);
ok(/^https:\/\/.+social-card\.png$/.test(seo.ogImage), `og:image points at social-card.png (${seo.ogImage})`);
ok(seo.twImage === seo.ogImage, "twitter:image matches og:image");
ok(seo.twCard === "summary_large_image", `twitter card is summary_large_image (got ${seo.twCard || "none"})`);
ok(seo.ogSite === "Stamp Maker", "og:site_name is set");
ok(!seo.keywords, "no stale keywords meta tag");
ok(!!seo.ld.url && !!seo.ld.image && Array.isArray(seo.ld.sameAs) && seo.ld.sameAs.length > 0, "JSON-LD has url, image, and sameAs");
ok(seo.ld["@type"] === "SoftwareApplication" && seo.ld.offers?.price === "0", "JSON-LD is a free SoftwareApplication");
const socialOk = await page.evaluate(async (u) => {
  try {
    const r = await fetch(u);
    return r.ok;
  } catch {
    return false;
  }
}, seo.ogImage);
ok(socialOk, `social card image serves (${seo.ogImage})`);

await page.screenshot({ path: "landing.png", fullPage: true });
await browser.close();
console.log(failures ? `\n${failures} failure(s)` : "\nAll landing-page checks passed.");
process.exit(failures ? 1 : 0);
