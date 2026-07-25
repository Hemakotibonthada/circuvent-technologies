// Regenerates the app launcher icons to match the Google Play store icon:
// a cyan->violet gradient with the white "connected home" glyph.
// Writes both the Expo source assets (for future prebuilds) and the Android
// mipmap resources directly (so a rebuild picks them up without a prebuild).
// Run from mobile/:  node scripts/gen-app-icons.js
const { createCanvas } = require("@napi-rs/canvas");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "assets");
const RES = path.join(ROOT, "android", "app", "src", "main", "res");

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function gradient(ctx, S) {
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, "#06b6d4");
  g.addColorStop(1, "#8b5cf6");
  return g;
}
function highlight(ctx, S) {
  const rg = ctx.createRadialGradient(S / 2, S * 0.38, S * 0.04, S / 2, S * 0.38, S * 0.62);
  rg.addColorStop(0, "rgba(255,255,255,0.18)");
  rg.addColorStop(1, "rgba(255,255,255,0)");
  return rg;
}
// White connected-home glyph, scaled from the 512px Play-icon design, centered.
function glyph(ctx, S) {
  const k = S / 512;
  ctx.save();
  ctx.translate(S / 2 - 256 * k, S / 2 - 267 * k);
  ctx.scale(k, k);
  ctx.strokeStyle = "#fff"; ctx.fillStyle = "#fff"; ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.moveTo(140, 258); ctx.lineTo(256, 150); ctx.lineTo(372, 258);
  ctx.lineTo(372, 384); ctx.lineTo(140, 384); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.arc(256, 300, 26, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 12;
  for (const [x, y] of [[192, 344], [320, 344], [256, 236]]) {
    ctx.beginPath(); ctx.moveTo(256, 300); ctx.lineTo(x, y); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// mode: square (full-bleed, iOS), full (rounded corners), round (circle),
//       bg (gradient only), fg (glyph on transparent).
function render(S, mode) {
  const c = createCanvas(S, S);
  const ctx = c.getContext("2d");
  const fillBg = () => { ctx.fillStyle = gradient(ctx, S); ctx.fillRect(0, 0, S, S); ctx.fillStyle = highlight(ctx, S); ctx.fillRect(0, 0, S, S); };
  if (mode === "square") { fillBg(); glyph(ctx, S); }
  else if (mode === "bg") { fillBg(); }
  else if (mode === "fg") { glyph(ctx, S); }
  else if (mode === "full") { ctx.save(); rr(ctx, 0, 0, S, S, S * 0.22); ctx.clip(); fillBg(); ctx.restore(); glyph(ctx, S); }
  else if (mode === "round") { ctx.save(); ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); ctx.clip(); fillBg(); ctx.restore(); glyph(ctx, S); }
  return c.toBuffer("image/png");
}
function write(p, buf) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); console.log("  " + path.relative(ROOT, p)); }

// Expo source assets (used by future prebuilds)
write(path.join(ASSETS, "icon.png"), render(1024, "square"));
write(path.join(ASSETS, "adaptive-icon.png"), render(1024, "fg"));
write(path.join(ASSETS, "adaptive-icon-bg.png"), render(1024, "bg"));
write(path.join(ASSETS, "favicon.png"), render(196, "full"));

// Android mipmap resources (legacy px / adaptive px per density)
const DENS = [["mdpi", 48, 108], ["hdpi", 72, 162], ["xhdpi", 96, 216], ["xxhdpi", 144, 324], ["xxxhdpi", 192, 432]];
for (const [name, leg, ad] of DENS) {
  const dir = path.join(RES, "mipmap-" + name);
  write(path.join(dir, "ic_launcher.png"), render(leg, "full"));
  write(path.join(dir, "ic_launcher_round.png"), render(leg, "round"));
  write(path.join(dir, "ic_launcher_foreground.png"), render(ad, "fg"));
  write(path.join(dir, "ic_launcher_background.png"), render(ad, "bg"));
}
console.log("Launcher icons regenerated.");
