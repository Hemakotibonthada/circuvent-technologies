/**
 * Image weight budget.
 *
 * A 512x512 logo shipped at 253 kB and rendered at 28 px went unnoticed on
 * every page of the site for months, because nothing measures asset weight and
 * an image that looks right looks right at any file size. Re-encoding it took
 * minutes; noticing it took a production trace.
 *
 * So the budget is enforced rather than remembered. Sizes are generous — this
 * is meant to catch a 250 kB icon, not to police a well-made hero image.
 *
 *   npm run audit:images
 */
import { readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = "public";

/** Bytes. Keyed by extension; the first match wins. */
const BUDGET = {
  ".svg": 24 * 1024,
  ".ico": 32 * 1024,
  ".png": 80 * 1024,
  ".jpg": 150 * 1024,
  ".jpeg": 150 * 1024,
  ".webp": 100 * 1024,
  ".avif": 100 * 1024,
  ".gif": 100 * 1024,
};

/**
 * Files that are legitimately large and are not fetched during page render —
 * social preview images are requested by crawlers, not browsers.
 */
const EXEMPT = new Set(["og-image.png"]);

const found = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) { walk(p); continue; }
    const ext = extname(entry).toLowerCase();
    if (BUDGET[ext] === undefined) continue;
    found.push({ path: p, name: entry, ext, size: st.size });
  }
})(ROOT);

if (found.length === 0) {
  console.error(`FAILED: found no images under ${ROOT}/ — the scan is broken, not the assets.`);
  process.exit(1);
}

const over = found.filter((f) => !EXEMPT.has(f.name) && f.size > BUDGET[f.ext]);
const kb = (n) => `${(n / 1024).toFixed(0)}kB`;

found.sort((a, b) => b.size - a.size);
console.log(`Largest assets under ${ROOT}/ (${found.length} scanned):`);
for (const f of found.slice(0, 8)) {
  const flag = over.includes(f) ? "OVER" : "ok  ";
  console.log(`  ${flag} ${kb(f.size).padStart(7)}  ${f.path}`);
}

if (over.length) {
  console.error(`\n${over.length} asset(s) over budget:`);
  for (const f of over) {
    console.error(`  ${f.path} is ${kb(f.size)}, budget ${kb(BUDGET[f.ext])}`);
  }
  console.error(
    `\nRe-encode, resize to the size actually rendered, or add to EXEMPT if it is\n` +
    `not fetched during page render.`
  );
  process.exit(1);
}
console.log(`\nAll ${found.length} assets within budget.`);
