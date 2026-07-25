// Generates Google Play store graphics as PNGs:
//   feature-graphic.png  (1024x500)  — required Feature graphic
//   icon-512.png         (512x512)   — Play store icon
// Run: node store/gen-assets.js   (from mobile/)
const { createCanvas } = require("@napi-rs/canvas");
const fs = require("fs");
const path = require("path");
const OUT = __dirname;

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function feature() {
  const W = 1024, H = 500;
  const c = createCanvas(W, H);
  const ctx = c.getContext("2d");
  let g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#0b1024"); g.addColorStop(1, "#0a0f1f");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  let rg = ctx.createRadialGradient(770, 150, 20, 770, 150, 430);
  rg.addColorStop(0, "rgba(139,92,246,0.5)"); rg.addColorStop(1, "rgba(139,92,246,0)");
  ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  let rg2 = ctx.createRadialGradient(110, 430, 20, 110, 430, 380);
  rg2.addColorStop(0, "rgba(6,182,212,0.28)"); rg2.addColorStop(1, "rgba(6,182,212,0)");
  ctx.fillStyle = rg2; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(91,100,136,0.12)"; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  // brand mark
  let bg = ctx.createLinearGradient(64, 60, 118, 114);
  bg.addColorStop(0, "#06b6d4"); bg.addColorStop(1, "#8b5cf6");
  ctx.fillStyle = bg; rr(ctx, 64, 62, 56, 56, 16); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = "800 60px Arial, sans-serif"; ctx.textBaseline = "alphabetic";
  ctx.fillText("Circuvent", 138, 108);
  ctx.fillStyle = "#9aa6c0"; ctx.font = "600 32px Arial, sans-serif";
  ctx.fillText("Your smart home, in one app.", 66, 196);
  ctx.fillStyle = "#c7d0e6"; ctx.font = "500 23px Arial, sans-serif";
  ctx.fillText("Control  \u2022  Scenes  \u2022  Energy  \u2022  Voice", 66, 246);
  // pills
  ctx.font = "600 21px Arial, sans-serif";
  let px = 66;
  for (const p of ["Works with Alexa & Google", "iOS & Android"]) {
    const w = ctx.measureText(p).width + 36;
    ctx.fillStyle = "rgba(255,255,255,0.08)"; rr(ctx, px, 292, w, 46, 23); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.20)"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = "#e7ecff"; ctx.fillText(p, px + 18, 321);
    px += w + 14;
  }
  // device accent tiles
  const cols = ["#06b6d4", "#f59e0b", "#ef4444", "#22d3ee", "#8b5cf6"];
  let tx = 66;
  for (const col of cols) {
    ctx.fillStyle = "rgba(255,255,255,0.05)"; rr(ctx, tx, 378, 76, 76, 18); ctx.fill();
    ctx.fillStyle = col; ctx.globalAlpha = 0.9; rr(ctx, tx + 22, 400, 32, 30, 8); ctx.fill(); ctx.globalAlpha = 1;
    tx += 92;
  }

  // phone mockup
  const phX = 730, phY = 66, phW = 244, phH = 372;
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
  ctx.fillStyle = "#0f1730"; rr(ctx, phX, phY, phW, phH, 40); ctx.fill(); ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 2; rr(ctx, phX, phY, phW, phH, 40); ctx.stroke();
  ctx.fillStyle = "#0b1220"; rr(ctx, phX + 14, phY + 16, phW - 28, phH - 32, 28); ctx.fill();
  let hg = ctx.createLinearGradient(phX + 30, phY + 50, phX + phW - 30, phY + 150);
  hg.addColorStop(0, "#06b6d4"); hg.addColorStop(1, "#8b5cf6");
  ctx.fillStyle = hg; rr(ctx, phX + 30, phY + 50, phW - 60, 98, 20); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.font = "700 12px Arial"; ctx.fillText("LIVE POWER", phX + 48, phY + 82);
  ctx.fillStyle = "#fff"; ctx.font = "800 32px Arial"; ctx.fillText("248 W", phX + 48, phY + 122);
  const tcols = ["#f59e0b", "#ef4444", "#22d3ee", "#8b5cf6"]; let i = 0;
  for (let r = 0; r < 2; r++) for (let col = 0; col < 2; col++) {
    const x = phX + 30 + col * 96, y = phY + 168 + r * 78;
    ctx.fillStyle = "rgba(255,255,255,0.06)"; rr(ctx, x, y, 84, 64, 16); ctx.fill();
    ctx.fillStyle = tcols[i]; ctx.beginPath(); ctx.arc(x + 20, y + 22, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.5)"; rr(ctx, x + 44, y + 42, 28, 12, 6); ctx.fill();
    i++;
  }
  fs.writeFileSync(path.join(OUT, "feature-graphic.png"), c.toBuffer("image/png"));
  console.log("feature-graphic.png " + W + "x" + H);
}

function icon() {
  const S = 512;
  const c = createCanvas(S, S);
  const ctx = c.getContext("2d");
  let g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, "#06b6d4"); g.addColorStop(1, "#8b5cf6");
  ctx.fillStyle = g; rr(ctx, 0, 0, S, S, 112); ctx.fill();
  let rg = ctx.createRadialGradient(S / 2, S * 0.38, 20, S / 2, S * 0.38, S * 0.62);
  rg.addColorStop(0, "rgba(255,255,255,0.18)"); rg.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = rg; rr(ctx, 0, 0, S, S, 112); ctx.fill();
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 26; ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(140, 258); ctx.lineTo(256, 150); ctx.lineTo(372, 258);
  ctx.lineTo(372, 384); ctx.lineTo(140, 384); ctx.closePath(); ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(256, 300, 26, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 12;
  for (const [x, y] of [[192, 344], [320, 344], [256, 236]]) {
    ctx.beginPath(); ctx.moveTo(256, 300); ctx.lineTo(x, y); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
  }
  fs.writeFileSync(path.join(OUT, "icon-512.png"), c.toBuffer("image/png"));
  console.log("icon-512.png " + S + "x" + S);
}

feature();
icon();
