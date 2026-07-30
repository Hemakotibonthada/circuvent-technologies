// Renders the product SVGs to a single contact sheet so they can be eyeballed.
// Shipping an illustration nobody has looked at is how you end up with art that
// parses perfectly and still looks wrong — a vertical line stroked with an
// objectBoundingBox gradient, for instance, validates fine and paints nothing.
//
// Run with:  node scripts/preview-product-art.js
//
// Imports from @playwright/test because that is what package.json declares;
// the bare `playwright` package is only present transitively.
const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const IMG = path.join(__dirname, "..", "public", "img");
const OUT = path.join(require("os").tmpdir(), "product-sheet.png");

(async () => {
  const files = fs.readdirSync(IMG).filter((f) => f.startsWith("product-") && f.endsWith(".svg")).sort();
  const cells = files
    .map((f) => {
      const data = fs.readFileSync(path.join(IMG, f)).toString("base64");
      return `<figure><img src="data:image/svg+xml;base64,${data}"><figcaption>${f}</figcaption></figure>`;
    })
    .join("");

  const html = `<!doctype html><meta charset="utf-8">
  <style>
    body{margin:0;background:#111827;font-family:system-ui;padding:16px}
    .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:14px}
    figure{margin:0}
    img{width:100%;display:block;border-radius:10px}
    figcaption{color:#9ca3af;font-size:11px;text-align:center;margin-top:5px}
  </style>
  <div class="grid">${cells}</div>`;

  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.screenshot({ path: OUT, fullPage: true });
  await browser.close();
  console.log("SHEET:", OUT, "files:", files.length);
})();
