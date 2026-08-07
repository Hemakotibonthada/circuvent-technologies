/**
 * Page latency probe.
 *
 * Measures what a visitor actually waits for. Two things this deliberately
 * does NOT do:
 *
 *  - count Content-Length headers. Next serves its JS chunks with chunked
 *    transfer encoding and no Content-Length, so a header-based tally reports
 *    0 kB of JavaScript on a page that ships several hundred. Resource Timing
 *    reports the real transferred bytes.
 *  - infer layout shift from images missing width/height. That is a proxy for
 *    the harm, not the harm. CLS is observable directly, so observe it, and
 *    name the elements that actually moved.
 *
 *   npx next start -p 3199
 *   node scripts/perf-probe.mjs http://127.0.0.1:3199
 */

import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://127.0.0.1:3199";

const PAGES = [
  "/",
  "/shop",
  "/developers",
  "/docs",
  "/smart-home",
  "/projects",
  "/architecture",
  "/stack",
  "/about",
  "/contact",
];

/** Google's "good" thresholds, and a self-imposed JS ceiling. */
const BUDGET = { fcp: 1800, cls: 0.1, jsKb: 400 };

const browser = await chromium.launch();
const rows = [];

for (const path of PAGES) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Observe before navigation so no shift is missed.
  await page.addInitScript(() => {
    window.__cls = 0;
    window.__shifters = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        window.__cls += entry.value;
        for (const src of entry.sources ?? []) {
          const n = src.node;
          if (!n || !n.tagName) continue;
          const cls =
            typeof n.className === "string" && n.className.trim()
              ? "." + n.className.trim().split(/\s+/)[0]
              : "";
          window.__shifters.push(n.tagName.toLowerCase() + cls);
        }
      }
    }).observe({ type: "layout-shift", buffered: true });
  });

  const started = Date.now();
  const res = await page.goto(BASE + path, { waitUntil: "load", timeout: 45000 }).catch(() => null);
  if (!res) {
    rows.push({ path, error: "failed to load" });
    await ctx.close();
    continue;
  }
  const loadMs = Date.now() - started;

  // Let late images and fonts settle so their shift is counted.
  await page.waitForTimeout(1500);

  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    const resources = performance.getEntriesByType("resource");
    const sum = (pred) => resources.filter(pred).reduce((t, r) => t + (r.encodedBodySize || 0), 0);
    const isJs = (r) => r.initiatorType === "script" || /\.js(\?|$)/.test(r.name);
    const isImg = (r) => r.initiatorType === "img" || /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/.test(r.name);
    const isCss = (r) => /\.css(\?|$)/.test(r.name);

    const counts = {};
    for (const s of window.__shifters ?? []) counts[s] = (counts[s] ?? 0) + 1;
    const worstShifters = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k}x${v}`);

    return {
      ttfb: nav ? Math.round(nav.responseStart) : null,
      fcp: fcp ? Math.round(fcp.startTime) : null,
      cls: Math.round((window.__cls ?? 0) * 1000) / 1000,
      worstShifters,
      requests: resources.length,
      totalKb: Math.round((sum(() => true) + (nav?.encodedBodySize || 0)) / 1024),
      jsKb: Math.round(sum(isJs) / 1024),
      cssKb: Math.round(sum(isCss) / 1024),
      imgKb: Math.round(sum(isImg) / 1024),
      imgCount: document.querySelectorAll("img").length,
    };
  });

  rows.push({ path, status: res.status(), loadMs, ...m });
  await ctx.close();
}

await browser.close();

const pad = (v, n) => String(v ?? "-").padStart(n);
console.log(
  "\n" +
    "page".padEnd(15) +
    pad("load", 8) +
    pad("ttfb", 6) +
    pad("fcp", 7) +
    pad("cls", 7) +
    pad("reqs", 6) +
    pad("total", 8) +
    pad("js", 7) +
    pad("css", 6) +
    pad("img", 8)
);
console.log("-".repeat(85));
for (const r of rows) {
  if (r.error) {
    console.log(r.path.padEnd(15) + "  " + r.error);
    continue;
  }
  console.log(
    r.path.padEnd(15) +
      pad(r.loadMs + "ms", 8) +
      pad(r.ttfb, 6) +
      pad(r.fcp, 7) +
      pad(r.cls, 7) +
      pad(r.requests, 6) +
      pad(r.totalKb + "k", 8) +
      pad(r.jsKb + "k", 7) +
      pad(r.cssKb + "k", 6) +
      pad(r.imgKb + "k", 8)
  );
}

console.log("\nOver budget:");
let any = false;
for (const r of rows) {
  if (r.error) continue;
  const over = [];
  if (r.fcp != null && r.fcp > BUDGET.fcp) over.push(`FCP ${r.fcp}ms > ${BUDGET.fcp}`);
  if (r.cls > BUDGET.cls) {
    over.push(`CLS ${r.cls} > ${BUDGET.cls}` + (r.worstShifters.length ? ` [${r.worstShifters.join(", ")}]` : ""));
  }
  if (r.jsKb > BUDGET.jsKb) over.push(`JS ${r.jsKb}kB > ${BUDGET.jsKb}`);
  if (over.length) {
    any = true;
    console.log(`  ${r.path.padEnd(15)} ${over.join("  |  ")}`);
  }
}

// A probe that measured nothing must not report success. Every page failing to
// load and the summary reading "all pages inside budget" is the most dangerous
// output this script can produce, because it is indistinguishable from a pass.
const measured = rows.filter((r) => !r.error).length;
if (measured === 0) {
  console.error(
    `\nFAILED: 0 of ${rows.length} pages loaded — nothing was measured.\n` +
    `  Is the server up at ${BASE}?  Start it, or pass a base URL:\n` +
    `    npm run audit:perf -- https://circuvent.com`
  );
  process.exit(1);
}
if (measured < rows.length) {
  console.error(`\nWARNING: only ${measured} of ${rows.length} pages loaded; the rest are unmeasured, not passing.`);
}
if (!any) console.log(`  nothing - all ${measured} measured pages inside FCP/CLS/JS budget.`);
if (any) process.exitCode = 1;
