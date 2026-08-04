/**
 * Contrast audit for code surfaces in dark mode.
 *
 * Written because the bug it checks for was invisible to every existing test:
 * the stylesheet compiled, the page rendered, and the only symptom was that a
 * human could not read it. Asserting the computed colours in a real browser is
 * the only thing that would have caught it.
 *
 * Run against a production server:
 *   npx next start -p 3199
 *   node scripts/audit-code-contrast.mjs http://127.0.0.1:3199
 */

import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://127.0.0.1:3199";

/**
 * Pages that render code/terminal surfaces.
 *
 * /smarthome and /smarthome/admin are behind auth so they cannot be visited
 * here. They are covered by construction rather than by measurement: the fix
 * derives the code surface from `currentColor`, so it cannot invert on any
 * surface, including the console's five `--cv-*` themes and the bright
 * `.cv-tile-on` state. Code elements there set no inline background, so the
 * global rule reaches them — verified by grep, not assumed.
 */
const PAGES = [
  "/developers",
  "/docs",
  "/architecture",
  "/stack",
  "/open-source",
  "/roadmap",
  "/projects",
  "/smarthome",
];

/** WCAG AA for body text. */
const MIN = 4.5;

function srgbToLinear(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrast(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Parses rgb()/rgba() into [r,g,b,a]. */
function parse(css) {
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
}

/** Composites a possibly-translucent colour over an opaque backdrop. */
function over(fg, bg) {
  const a = fg[3];
  return [0, 1, 2].map((i) => Math.round(fg[i] * a + bg[i] * (1 - a)));
}

const browser = await chromium.launch();
const failures = [];
const unreachable = [];
let checked = 0;

for (const scheme of ["dark", "light"]) {
  const ctx = await browser.newContext({ colorScheme: scheme });
  const page = await ctx.newPage();

  for (const path of PAGES) {
    const res = await page
      .goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 20000 })
      .catch((err) => {
        console.log(`  ERROR ${scheme} ${path}: ${err.message.split("\n")[0]}`);
        return null;
      });
    if (!res || !res.ok()) {
      unreachable.push(`${scheme} ${path}${res ? ` (${res.status()})` : ""}`);
      continue;
    }
    // The theme script reads a stored preference; force the class so the audit
    // tests the theme it says it is testing rather than whatever was cached.
    await page.evaluate((s) => {
      document.documentElement.classList.toggle("dark", s === "dark");
      document.documentElement.classList.toggle("light", s !== "dark");
    }, scheme);
    await page.waitForTimeout(250);

    const samples = await page.evaluate(() => {
      /** Walks up for the first ancestor with a non-transparent background. */
      function backdrop(el) {
        let node = el.parentElement;
        while (node) {
          const bg = getComputedStyle(node).backgroundColor;
          const m = bg.match(/rgba?\(([^)]+)\)/);
          if (m) {
            const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
            const a = p.length > 3 ? p[3] : 1;
            if (a >= 0.999) return bg;
          }
          node = node.parentElement;
        }
        return getComputedStyle(document.body).backgroundColor || "rgb(255,255,255)";
      }

      const out = [];
      for (const el of document.querySelectorAll("pre, code")) {
        const text = (el.textContent ?? "").trim();
        if (!text) continue;
        const cs = getComputedStyle(el);
        out.push({
          tag: el.tagName.toLowerCase(),
          color: cs.color,
          bg: cs.backgroundColor,
          backdrop: backdrop(el),
          sample: text.slice(0, 42).replace(/\s+/g, " "),
        });
      }
      return out;
    });

    for (const s of samples) {
      const fg = parse(s.color);
      const own = parse(s.bg);
      const back = parse(s.backdrop);
      if (!fg || !back) continue;
      // The element's own background may be translucent — composite it.
      const surface = own && own[3] < 0.999 ? over(own, back) : own ? [own[0], own[1], own[2]] : [back[0], back[1], back[2]];
      const ratio = contrast([fg[0], fg[1], fg[2]], surface);
      checked++;
      if (ratio < MIN) {
        failures.push({ scheme, path, ...s, ratio: ratio.toFixed(2), surface: `rgb(${surface.join(",")})` });
      }
    }
  }
  await ctx.close();
}

await browser.close();

console.log(`\nChecked ${checked} code/pre elements across ${PAGES.length} pages in both schemes.`);

if (unreachable.length) {
  console.log(`\nCould not load:\n${unreachable.map((u) => `  ${u}`).join("\n")}`);
}

/**
 * A run that examined nothing must not report success.
 *
 * The first version of this script printed "All meet WCAG AA" after checking
 * zero elements, because every navigation had timed out and the failure was
 * swallowed. That is worse than a red run: it is a green one that proves
 * nothing, and it would have been taken as evidence the bug was fixed.
 */
if (checked === 0) {
  console.error("\nFAILED: no code/pre elements were examined — the audit proved nothing.");
  process.exit(2);
}
if (unreachable.length) {
  console.error(`\nFAILED: ${unreachable.length} page loads failed; the audit is incomplete.`);
  process.exit(2);
}

if (failures.length) {
  console.log(`\n${failures.length} below ${MIN}:1 —\n`);
  for (const f of failures) {
    console.log(`  ${f.scheme.padEnd(5)} ${f.path.padEnd(16)} <${f.tag}> ${f.ratio}:1`);
    console.log(`        text ${f.color} on ${f.surface}`);
    console.log(`        "${f.sample}"`);
  }
  process.exit(1);
}
console.log(`All meet WCAG AA (${MIN}:1).`);
