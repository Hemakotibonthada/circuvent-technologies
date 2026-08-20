// Screenshot the HRMS landing, sign-in and sign-up screens.
// Lives in WebSite only so `playwright` resolves; deleted after the run.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2];
const OUT = process.argv[3];
mkdirSync(OUT, { recursive: true });

const SHOTS = [
  { path: "/login",    name: "hrms-login-desktop.png",    w: 1440, h: 900 },
  { path: "/register", name: "hrms-register-desktop.png", w: 1440, h: 900 },
  { path: "/login",    name: "hrms-login-mobile.png",     w: 420,  h: 860 },
  { path: "/",         name: "hrms-landing-hero.png",     w: 1440, h: 980 },
];

const browser = await chromium.launch();
for (const s of SHOTS) {
  const page = await browser.newPage({ viewport: { width: s.w, height: s.h } });
  const res = await page.goto(BASE + s.path, { waitUntil: "networkidle", timeout: 45000 });
  // Let the staggered entrances and the illustration's own timeline settle.
  await page.waitForTimeout(3500);
  await page.screenshot({ path: join(OUT, s.name) });
  console.log(s.path, "->", res?.status(), s.name);
  await page.close();
}
await browser.close();
