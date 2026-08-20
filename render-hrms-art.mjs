// Screenshot the HRMS illustrations after their entrance animations settle.
// Lives in WebSite only so `playwright` resolves; deleted after the run.
//
// Loaded as a data: URI rather than a file:// path. The workspace path contains
// spaces, which a bare file URL does not survive, and a data URI exercises the
// same <img> code path the pages use.
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = process.argv[2];
const OUT = process.argv[3];
mkdirSync(OUT, { recursive: true });

const SHOTS = [
  { file: "auth-people.svg",    w: 640,  h: 720, bg: "linear-gradient(160deg,#7c3aed,#5b21b6 60%,#4c1d95)" },
  { file: "hero-dashboard.svg", w: 1000, h: 680, bg: "#0b0b12" },
  { file: "hero-dashboard.svg", w: 1000, h: 680, bg: "#ffffff", suffix: "-light" },
];

const browser = await chromium.launch();
for (const s of SHOTS) {
  const svg = readFileSync(join(SRC, s.file));
  const uri = `data:image/svg+xml;base64,${svg.toString("base64")}`;
  const page = await browser.newPage({ viewport: { width: s.w, height: s.h } });
  await page.setContent(
    `<html><body style="margin:0;width:${s.w}px;height:${s.h}px;background:${s.bg}">
       <img src="${uri}" width="${s.w}" height="${s.h}"
            onerror="document.title='LOAD-FAILED'">
     </body></html>`
  );
  await page.waitForTimeout(3200);
  if ((await page.title()) === "LOAD-FAILED") throw new Error(`${s.file} failed to load`);
  const name = s.file.replace(".svg", "") + (s.suffix ?? "") + ".png";
  await page.screenshot({ path: join(OUT, name) });
  await page.close();
  console.log("rendered", name);
}
await browser.close();
