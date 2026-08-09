/**
 * Screenshots /smarthome/admin under every theme the console offers.
 *
 * The console's theme lives in localStorage under one key, and the provider
 * reads it on mount — so setting it before navigation is enough, and no login
 * is needed to see the chrome, the shell and the empty states, which is where
 * the colour problems live.
 *
 * Run against the dev server; writes PNGs and prints the computed colours of
 * the elements that looked wrong in the report.
 */
const { chromium } = require("@playwright/test");

const BASE = process.env.BASE || "http://localhost:3001";
const OUT = process.env.OUT || require("os").tmpdir();

// Matches KEY in src/app/smarthome/theme.tsx.
const KEY = "cv-console-theme";

const THEMES = [
  { mode: "glass", scheme: "dark", accentKey: "brand" },
  { mode: "glass", scheme: "light", accentKey: "brand" },
  { mode: "neo", scheme: "dark", accentKey: "brand" },
  { mode: "neo", scheme: "light", accentKey: "brand" },
  { mode: "aurora", scheme: "dark", accentKey: "brand" },
  { mode: "aurora", scheme: "light", accentKey: "brand" },
];

/** Every admin route, because the shell is shared but the pages are not. */
const ROUTES = (process.env.ROUTES || [
  "/smarthome/admin",
  "/smarthome/admin/fleet",
  "/smarthome/admin/registry",
  "/smarthome/admin/telemetry",
  "/smarthome/admin/provisioning",
  "/smarthome/admin/ota",
  "/smarthome/admin/latency",
  "/smarthome/admin/alerts",
  "/smarthome/admin/rules",
  "/smarthome/admin/access",
  "/smarthome/admin/security",
  "/smarthome/admin/platform",
  "/smarthome/admin/dashboards",
  "/smarthome/admin/intelligence",
].join(",")).split(",");

/** Relative luminance, for a contrast ratio that is not a matter of opinion. */
function lum(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function parse(css) {
  const m = /rgba?\(([^)]+)\)/.exec(css || "");
  if (!m) return null;
  const p = m[1].split(",").map((s) => parseFloat(s));
  return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
}
function ratio(fg, bg) {
  const a = lum(fg) + 0.05;
  const b = lum(bg) + 0.05;
  return Math.round((Math.max(a, b) / Math.min(a, b)) * 100) / 100;
}

(async () => {
  const browser = await chromium.launch();
  const results = [];

  for (const t of THEMES) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await ctx.addInitScript(
      ([key, value]) => { window.localStorage.setItem(key, value); },
      [KEY, JSON.stringify(t)]
    );
    const page = await ctx.newPage();
    const name = `${t.mode}-${t.scheme}`;
    const failuresForTheme = [];

    for (const route of ROUTES) {
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 90000 });
      await page.waitForTimeout(600);
      if (route === "/smarthome/admin") {
        await page.screenshot({ path: `${OUT}/admin-${name}.png`, fullPage: false });
      }

    /*
     * Walk the visible text and find anything that cannot be read against what
     * is actually painted behind it. Climbing to the first non-transparent
     * ancestor background matters: nearly every surface here is translucent,
     * and comparing against `rgba(0,0,0,0)` would score every element as
     * perfect contrast against nothing.
     *
     * Elements filled with a gradient are skipped rather than guessed at. A
     * gradient is a background-image, not a background-color, so the climb
     * walks straight past it to whatever card is behind — which reported the
     * avatar chip and the cookie button as white-on-white when both are white
     * on a cyan/violet fill and perfectly legible. Two false alarms in a
     * five-item list is enough to make the whole list ignorable.
     */
    const bad = await page.evaluate(() => {
      const seen = [];
      const walk = document.querySelectorAll("body *");
      for (const el of walk) {
        const text = (el.textContent || "").trim();
        if (!text || el.children.length > 0) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) < 0.15) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4 || r.top > 1400) continue;

        let bg = null;
        let node = el;
        let painted = false;
        while (node) {
          const c = getComputedStyle(node);
          if (c.backgroundImage && c.backgroundImage !== "none") { painted = true; break; }
          const m = /rgba?\(([^)]+)\)/.exec(c.backgroundColor);
          if (m) {
            const p = m[1].split(",").map(parseFloat);
            const alpha = p.length > 3 ? p[3] : 1;
            if (alpha > 0.55) { bg = c.backgroundColor; break; }
          }
          node = node.parentElement;
        }
        if (painted) continue;
        seen.push({ text: text.slice(0, 42), color: cs.color, bg, tag: el.tagName.toLowerCase(), cls: el.className && String(el.className).slice(0, 60) });
      }
      return seen;
    });

    const failures = [];
    for (const s of bad) {
      const fg = parse(s.color);
      const bgc = parse(s.bg || "");
      if (!fg || !bgc) continue;
      const cr = ratio(fg.rgb, bgc.rgb);
      if (cr < 3) failures.push({ ...s, route, contrast: cr });
    }
      failuresForTheme.push(...failures);
    }

    failuresForTheme.sort((a, b) => a.contrast - b.contrast);
    results.push({ theme: name, unreadable: failuresForTheme.length, worst: failuresForTheme.slice(0, 8) });
    await ctx.close();
  }

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
})();
