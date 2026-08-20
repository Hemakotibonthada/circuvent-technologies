import { chromium } from "playwright";
import { join } from "node:path";
const BASE = process.argv[2], OUT = process.argv[3];
const SHOTS = [
  { path: "/login",    name: "hrms-login-900.png",   w: 1440, h: 900 },
  { path: "/login",    name: "hrms-login-800.png",   w: 1280, h: 800 },
  { path: "/register", name: "hrms-register-900.png",w: 1440, h: 900 },
];
const b = await chromium.launch();
for (const s of SHOTS) {
  const p = await b.newPage({ viewport: { width: s.w, height: s.h } });
  const r = await p.goto(BASE + s.path, { waitUntil: "networkidle", timeout: 45000 });
  await p.waitForTimeout(3200);
  // Does anything overflow the viewport vertically?
  const overflow = await p.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  await p.screenshot({ path: join(OUT, s.name) });
  console.log(s.name, "status", r?.status(), "verticalOverflow", overflow + "px");
  await p.close();
}
await b.close();
