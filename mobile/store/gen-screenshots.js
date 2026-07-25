// Generates Google Play phone + tablet screenshots (9:16) for Circuvent.
// Renders in a logical 1080x1920 space, scaled to each target size.
const fs = require("fs");
const path = require("path");
const { createCanvas } = require("@napi-rs/canvas");

const W = 1080, H = 1920;

// ---- palette ----
const C = {
  bgTop: "#0a0e1a", bgMid: "#120f22", bgBot: "#0a0e1a",
  screen: "#0b1020", screen2: "#0d1226",
  card: "rgba(255,255,255,0.06)", cardSolid: "#141a2e",
  border: "rgba(255,255,255,0.10)",
  text: "#f8fafc", sub: "#93a1bd", faint: "#5b6b8c",
  cyan: "#22d3ee", violet: "#8b5cf6", pink: "#ec4899",
  amber: "#f59e0b", red: "#ef4444", green: "#22c55e", blue: "#3b82f6",
};

const F = (w, s) => `${w} ${s}px Arial, "Segoe UI", sans-serif`;

// ---- primitives ----
function rr(ctx, x, y, w, h, r) {
  if (typeof r === "number") r = { tl: r, tr: r, br: r, bl: r };
  ctx.beginPath();
  ctx.moveTo(x + r.tl, y);
  ctx.lineTo(x + w - r.tr, y);
  ctx.arcTo(x + w, y, x + w, y + r.tr, r.tr);
  ctx.lineTo(x + w, y + h - r.br);
  ctx.arcTo(x + w, y + h, x + w - r.br, y + h, r.br);
  ctx.lineTo(x + r.bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - r.bl, r.bl);
  ctx.lineTo(x, y + r.tl);
  ctx.arcTo(x, y, x + r.tl, y, r.tl);
  ctx.closePath();
}
function fillRR(ctx, x, y, w, h, r, fill) { rr(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); }
function strokeRR(ctx, x, y, w, h, r, stroke, lw = 1.5) { rr(ctx, x, y, w, h, r); ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
function card(ctx, x, y, w, h, r = 24) { fillRR(ctx, x, y, w, h, r, C.card); strokeRR(ctx, x, y, w, h, r, C.border, 1.5); }
function text(ctx, str, x, y, size, weight = "600", color = C.text, align = "left") {
  ctx.font = F(weight, size); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  ctx.fillText(str, x, y);
}
function toggle(ctx, x, y, on, accent = C.green) {
  const w = 74, h = 42;
  fillRR(ctx, x, y, w, h, 21, on ? accent : "rgba(255,255,255,0.14)");
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(on ? x + w - 21 : x + 21, y + h / 2, 15, 0, Math.PI * 2); ctx.fill();
}

// ---- icons (drawn inside a circle of radius ~r at cx,cy) ----
function icon(ctx, kind, cx, cy, r, color) {
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = Math.max(3, r * 0.16); ctx.lineCap = "round"; ctx.lineJoin = "round";
  const s = r;
  switch (kind) {
    case "bulb":
      ctx.beginPath(); ctx.arc(cx, cy - s * 0.15, s * 0.55, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - s * 0.28, cy + s * 0.5); ctx.lineTo(cx + s * 0.28, cy + s * 0.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - s * 0.2, cy + s * 0.72); ctx.lineTo(cx + s * 0.2, cy + s * 0.72); ctx.stroke();
      break;
    case "plug":
      ctx.beginPath(); ctx.moveTo(cx - s * 0.35, cy - s * 0.6); ctx.lineTo(cx - s * 0.35, cy - s * 0.15); ctx.moveTo(cx + s * 0.35, cy - s * 0.6); ctx.lineTo(cx + s * 0.35, cy - s * 0.15); ctx.stroke();
      rr(ctx, cx - s * 0.5, cy - s * 0.15, s, s * 0.7, s * 0.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.55); ctx.lineTo(cx, cy + s * 0.85); ctx.stroke();
      break;
    case "fan":
      for (let i = 0; i < 3; i++) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate((i * 2 * Math.PI) / 3);
        ctx.beginPath(); ctx.ellipse(0, -s * 0.45, s * 0.22, s * 0.42, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.16, 0, Math.PI * 2); ctx.fillStyle = C.screen; ctx.fill(); ctx.strokeStyle = color; ctx.stroke();
      break;
    case "lock":
      ctx.beginPath(); ctx.arc(cx, cy - s * 0.15, s * 0.42, Math.PI, 0); ctx.stroke();
      rr(ctx, cx - s * 0.55, cy - s * 0.15, s * 1.1, s * 0.85, s * 0.16); ctx.fillStyle = color; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy + s * 0.25, s * 0.11, 0, Math.PI * 2); ctx.fillStyle = C.screen; ctx.fill();
      break;
    case "ac":
      rr(ctx, cx - s * 0.7, cy - s * 0.5, s * 1.4, s * 0.75, s * 0.16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - s * 0.45, cy + s * 0.45); ctx.lineTo(cx - s * 0.45, cy + s * 0.65);
      ctx.moveTo(cx, cy + s * 0.45); ctx.lineTo(cx, cy + s * 0.7); ctx.moveTo(cx + s * 0.45, cy + s * 0.45); ctx.lineTo(cx + s * 0.45, cy + s * 0.65); ctx.stroke();
      break;
    case "drop":
      ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.6);
      ctx.bezierCurveTo(cx + s * 0.6, cy + s * 0.05, cx + s * 0.42, cy + s * 0.7, cx, cy + s * 0.7);
      ctx.bezierCurveTo(cx - s * 0.42, cy + s * 0.7, cx - s * 0.6, cy + s * 0.05, cx, cy - s * 0.6);
      ctx.fill();
      break;
    case "tv":
      rr(ctx, cx - s * 0.7, cy - s * 0.55, s * 1.4, s * 0.9, s * 0.12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - s * 0.25, cy + s * 0.6); ctx.lineTo(cx + s * 0.25, cy + s * 0.6); ctx.stroke();
      break;
    case "curtain":
      ctx.beginPath(); ctx.moveTo(cx - s * 0.7, cy - s * 0.6); ctx.lineTo(cx + s * 0.7, cy - s * 0.6); ctx.stroke();
      for (const dx of [-0.45, 0, 0.45]) {
        ctx.beginPath(); ctx.moveTo(cx + dx * s, cy - s * 0.55);
        ctx.quadraticCurveTo(cx + dx * s + s * 0.18, cy, cx + dx * s, cy + s * 0.6); ctx.stroke();
      }
      break;
    case "bolt":
      ctx.beginPath(); ctx.moveTo(cx + s * 0.2, cy - s * 0.6); ctx.lineTo(cx - s * 0.35, cy + s * 0.1);
      ctx.lineTo(cx + s * 0.02, cy + s * 0.1); ctx.lineTo(cx - s * 0.2, cy + s * 0.65);
      ctx.lineTo(cx + s * 0.4, cy - s * 0.1); ctx.lineTo(cx + s * 0.02, cy - s * 0.1); ctx.closePath(); ctx.fill();
      break;
    case "sun":
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.4, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 8; i++) { ctx.save(); ctx.translate(cx, cy); ctx.rotate((i * Math.PI) / 4); ctx.beginPath(); ctx.moveTo(0, -s * 0.58); ctx.lineTo(0, -s * 0.75); ctx.stroke(); ctx.restore(); }
      break;
    case "film":
      rr(ctx, cx - s * 0.6, cy - s * 0.6, s * 1.2, s * 1.2, s * 0.16); ctx.stroke();
      for (const yy of [-0.35, 0.35]) for (const xx of [-0.42, 0.42]) { ctx.beginPath(); ctx.arc(cx + xx * s, cy + yy * s, s * 0.08, 0, Math.PI * 2); ctx.fill(); }
      break;
    case "bell":
      ctx.beginPath(); ctx.moveTo(cx - s * 0.5, cy + s * 0.3);
      ctx.quadraticCurveTo(cx - s * 0.5, cy - s * 0.55, cx, cy - s * 0.6);
      ctx.quadraticCurveTo(cx + s * 0.5, cy - s * 0.55, cx + s * 0.5, cy + s * 0.3); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy + s * 0.5, s * 0.12, 0, Math.PI * 2); ctx.fill();
      break;
    case "home":
      ctx.beginPath(); ctx.moveTo(cx - s * 0.6, cy + s * 0.1); ctx.lineTo(cx, cy - s * 0.55); ctx.lineTo(cx + s * 0.6, cy + s * 0.1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - s * 0.42, cy - s * 0.02); ctx.lineTo(cx - s * 0.42, cy + s * 0.6); ctx.lineTo(cx + s * 0.42, cy + s * 0.6); ctx.lineTo(cx + s * 0.42, cy - s * 0.02); ctx.stroke();
      break;
    case "grid":
      for (const xx of [-0.3, 0.3]) for (const yy of [-0.3, 0.3]) { rr(ctx, cx + xx * s - s * 0.22, cy + yy * s - s * 0.22, s * 0.44, s * 0.44, s * 0.1); ctx.stroke(); }
      break;
    case "spark":
      ctx.beginPath(); ctx.moveTo(cx - s * 0.55, cy + s * 0.4); ctx.lineTo(cx - s * 0.15, cy - s * 0.1); ctx.lineTo(cx + s * 0.15, cy + s * 0.15); ctx.lineTo(cx + s * 0.55, cy - s * 0.45); ctx.stroke();
      break;
    case "mic":
      rr(ctx, cx - s * 0.22, cy - s * 0.6, s * 0.44, s * 0.8, s * 0.22); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy + s * 0.05, s * 0.42, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.47); ctx.lineTo(cx, cy + s * 0.7); ctx.stroke();
      break;
  }
  ctx.restore();
}

// ---- shared chrome ----
function drawBg(ctx) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, C.bgTop); g.addColorStop(0.5, C.bgMid); g.addColorStop(1, C.bgBot);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const rg = ctx.createRadialGradient(W * 0.85, 120, 40, W * 0.85, 120, 620);
  rg.addColorStop(0, "rgba(139,92,246,0.28)"); rg.addColorStop(1, "rgba(139,92,246,0)");
  ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.035)"; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 72) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 72) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}
function drawCaption(ctx, lines, accentIdx) {
  ctx.textAlign = "center";
  let y = 150;
  lines.forEach((ln, i) => {
    text(ctx, ln, W / 2, y, 66, "800", i === accentIdx ? C.cyan : C.text, "center");
    y += 82;
  });
  fillRR(ctx, W / 2 - 44, y - 26, 88, 8, 4, C.violet);
}
function statusBar(ctx, x, y, w) {
  text(ctx, "9:41", x + 30, y + 34, 26, "700", C.text);
  const rx = x + w - 30;
  // battery
  strokeRR(ctx, rx - 46, y + 14, 40, 20, 5, C.text, 2.5);
  fillRR(ctx, rx - 43, y + 17, 30, 14, 3, C.text);
  ctx.fillStyle = C.text; ctx.fillRect(rx - 4, y + 20, 4, 8);
  // wifi
  ctx.strokeStyle = C.text; ctx.lineWidth = 2.5; ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(rx - 78, y + 32, 6 + i * 6, -Math.PI * 0.75, -Math.PI * 0.25); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(rx - 78, y + 32, 2, 0, Math.PI * 2); ctx.fillStyle = C.text; ctx.fill();
}
function navBar(ctx, x, y, w, active) {
  const items = [["home", "Home"], ["grid", "Devices"], ["spark", "Automate"], ["bolt", "Energy"], ["bell", "Alerts"]];
  const iw = w / items.length;
  items.forEach((it, i) => {
    const cx = x + iw * i + iw / 2;
    const col = i === active ? C.cyan : C.faint;
    icon(ctx, it[0], cx, y + 30, 17, col);
    text(ctx, it[1], cx, y + 66, 20, i === active ? "700" : "500", col, "center");
  });
}

// ---- screen renderers (draw inside sx,sy,sw,sh) ----
function scHome(ctx, sx, sy, sw) {
  let y = sy + 108;
  text(ctx, "Good evening", sx + 40, y, 28, "500", C.sub);
  text(ctx, "Hema's Home", sx + 40, y + 44, 46, "800", C.text);
  icon(ctx, "home", sx + sw - 66, y + 2, 20, C.cyan);
  y += 96;
  // live power hero
  const hx = sx + 40, hw = sw - 80, hh = 190;
  const g = ctx.createLinearGradient(hx, y, hx + hw, y + hh);
  g.addColorStop(0, C.cyan); g.addColorStop(1, C.violet);
  fillRR(ctx, hx, y, hw, hh, 30, g);
  text(ctx, "LIVE POWER", hx + 34, y + 56, 24, "800", "rgba(255,255,255,0.85)");
  text(ctx, "248", hx + 34, y + 138, 96, "800", "#fff");
  ctx.font = F("800", 96); const nw = ctx.measureText("248").width;
  text(ctx, "W", hx + 34 + nw + 20, y + 138, 44, "700", "rgba(255,255,255,0.9)");
  text(ctx, "3 devices active now", hx + 34, y + 172, 24, "600", "rgba(255,255,255,0.85)");
  icon(ctx, "bolt", hx + hw - 70, y + 84, 44, "rgba(255,255,255,0.9)");
  y += hh + 40;
  // room chips
  const rooms = [["Living Room", true], ["Bedroom", false], ["Kitchen", false]];
  let cxp = sx + 40;
  rooms.forEach(([r, on]) => {
    ctx.font = F("700", 26); const tw = ctx.measureText(r).width + 52;
    fillRR(ctx, cxp, y, tw, 60, 30, on ? C.violet : C.card);
    if (!on) strokeRR(ctx, cxp, y, tw, 60, 30, C.border, 1.5);
    text(ctx, r, cxp + 26, y + 39, 26, "700", on ? "#fff" : C.sub);
    cxp += tw + 18;
  });
  y += 104;
  text(ctx, "Favorites", sx + 40, y, 34, "800", C.text);
  y += 30;
  // 2x2 device tiles
  const tiles = [["bulb", "Ceiling Light", "Living Room", true, C.amber], ["ac", "Air Conditioner", "Bedroom", true, C.cyan], ["tv", "Smart TV", "Living Room", false, C.pink], ["drop", "Aqua Guard", "Kitchen", false, C.blue]];
  const tw = (sw - 80 - 24) / 2, th = 210;
  tiles.forEach((t, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = sx + 40 + col * (tw + 24), ty = y + 20 + row * (th + 24);
    card(ctx, x, ty, tw, th, 26);
    const [k, name, room, on, ac] = t;
    fillRR(ctx, x + 28, ty + 28, 74, 74, 22, on ? ac : "rgba(255,255,255,0.06)");
    icon(ctx, k, x + 65, ty + 65, 24, on ? "#0b1020" : C.faint);
    toggle(ctx, x + tw - 90, ty + 36, on, ac);
    text(ctx, name, x + 28, ty + 148, 27, "700", C.text);
    text(ctx, room, x + 28, ty + 182, 22, "500", C.sub);
    text(ctx, on ? "On" : "Off", x + tw - 62, ty + 148, 22, "700", on ? C.green : C.faint, "center");
  });
}

function scDevices(ctx, sx, sy, sw) {
  let y = sy + 100;
  text(ctx, "Devices", sx + 40, y, 46, "800", C.text);
  icon(ctx, "plug", sx + sw - 66, y - 12, 18, C.cyan);
  y += 44;
  // search
  card(ctx, sx + 40, y, sw - 80, 72, 22);
  ctx.strokeStyle = C.faint; ctx.lineWidth = 3; ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(sx + 78, y + 36, 13, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(sx + 89, y + 47); ctx.lineTo(sx + 100, y + 58); ctx.stroke();
  text(ctx, "Search devices & rooms", sx + 120, y + 46, 26, "500", C.faint);
  y += 104;
  const rows = [
    ["plug", "Smart Plug", "Living Room", "On", C.green, true, C.green],
    ["bulb", "Ceiling Light", "Bedroom", "On · 80%", C.amber, true, C.amber],
    ["fan", "Smart Fan", "Bedroom", "Off", C.faint, false, C.cyan],
    ["lock", "Front Door", "Entrance", "Locked", C.violet, true, C.violet],
    ["curtain", "Living Curtain", "Living Room", "Open · 60%", C.cyan, true, C.cyan],
    ["drop", "Aqua Guard", "Kitchen", "Off", C.faint, false, C.blue],
  ];
  const rh = 118;
  rows.forEach((r, i) => {
    const ty = y + i * (rh + 16);
    card(ctx, sx + 40, ty, sw - 80, rh, 24);
    const [k, name, room, st, stc, on, ac] = r;
    fillRR(ctx, sx + 64, ty + 22, 74, 74, 22, on ? ac : "rgba(255,255,255,0.06)");
    icon(ctx, k, sx + 101, ty + 59, 24, on ? "#0b1020" : C.faint);
    text(ctx, name, sx + 160, ty + 50, 30, "700", C.text);
    text(ctx, room + " · " + st, sx + 160, ty + 86, 23, "500", stc);
    toggle(ctx, sx + sw - 156, ty + 38, on, ac);
  });
}

function scAutomate(ctx, sx, sy, sw) {
  let y = sy + 100;
  text(ctx, "Automations", sx + 40, y, 46, "800", C.text);
  y += 44;
  text(ctx, "Scenes", sx + 40, y, 30, "800", C.sub);
  y += 28;
  const scenes = [["sun", "Good\nMorning", C.amber], ["film", "Movie\nNight", C.violet], ["lock", "Away\nMode", C.cyan]];
  const cw = (sw - 80 - 48) / 3, ch = 190;
  scenes.forEach((s, i) => {
    const x = sx + 40 + i * (cw + 24);
    const g = ctx.createLinearGradient(x, y, x, y + ch);
    g.addColorStop(0, "rgba(255,255,255,0.08)"); g.addColorStop(1, "rgba(255,255,255,0.03)");
    fillRR(ctx, x, y, cw, ch, 26, g); strokeRR(ctx, x, y, cw, ch, 26, C.border, 1.5);
    fillRR(ctx, x + cw / 2 - 37, y + 30, 74, 74, 22, s[2]);
    icon(ctx, s[0], x + cw / 2, y + 67, 24, "#0b1020");
    const ls = s[1].split("\n");
    text(ctx, ls[0], x + cw / 2, y + 142, 26, "700", C.text, "center");
    text(ctx, ls[1], x + cw / 2, y + 172, 26, "700", C.text, "center");
  });
  y += ch + 48;
  text(ctx, "Rules", sx + 40, y, 30, "800", C.sub);
  y += 28;
  const rules = [
    ["sun", "At sunset", "Turn on porch light", true, C.amber],
    ["home", "8:00 AM daily", "Open living room curtains", true, C.cyan],
    ["drop", "Motion detected", "Notify me & log event", false, C.violet],
    ["bolt", "Usage over 3 kWh", "Send energy alert", true, C.pink],
  ];
  const rh = 116;
  rules.forEach((r, i) => {
    const ty = y + i * (rh + 16);
    card(ctx, sx + 40, ty, sw - 80, rh, 24);
    fillRR(ctx, sx + 64, ty + 21, 74, 74, 22, "rgba(255,255,255,0.06)");
    icon(ctx, r[0], sx + 101, ty + 58, 22, r[4]);
    text(ctx, r[1], sx + 160, ty + 49, 27, "700", C.text);
    text(ctx, r[2], sx + 160, ty + 84, 23, "500", C.sub);
    toggle(ctx, sx + sw - 156, ty + 37, r[3], C.cyan);
  });
}

function scEnergy(ctx, sx, sy, sw) {
  let y = sy + 100;
  text(ctx, "Energy", sx + 40, y, 46, "800", C.text);
  y += 60;
  // two stat cards
  const cw = (sw - 80 - 24) / 2;
  const stats = [["Today", "4.2", "kWh", C.cyan], ["Cost", "\u20B934", "approx", C.green]];
  stats.forEach((s, i) => {
    const x = sx + 40 + i * (cw + 24);
    card(ctx, x, y, cw, 150, 26);
    text(ctx, s[0], x + 28, y + 46, 26, "600", C.sub);
    text(ctx, s[1], x + 28, y + 108, 60, "800", s[3]);
    text(ctx, s[2], x + 28, y + 138, 22, "500", C.faint);
  });
  y += 190;
  // bar chart
  const bx = sx + 40, bw = sw - 80, bh = 360;
  card(ctx, bx, y, bw, bh, 26);
  text(ctx, "This week", bx + 30, y + 50, 28, "700", C.text);
  text(ctx, "kWh / day", bx + bw - 30, y + 50, 22, "500", C.faint, "right");
  const vals = [3.1, 4.4, 2.8, 5.1, 3.6, 4.9, 4.2];
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  const max = 5.6, base = y + bh - 70, top = y + 90, area = base - top;
  const gap = (bw - 80) / vals.length, barW = gap * 0.5;
  vals.forEach((v, i) => {
    const x = bx + 40 + i * gap + (gap - barW) / 2;
    const hh = (v / max) * area;
    const g = ctx.createLinearGradient(x, base - hh, x, base);
    const on = i === vals.length - 1;
    g.addColorStop(0, on ? C.cyan : C.violet); g.addColorStop(1, on ? "rgba(34,211,238,0.35)" : "rgba(139,92,246,0.3)");
    fillRR(ctx, x, base - hh, barW, hh, 10, g);
    text(ctx, days[i], x + barW / 2, base + 34, 22, "600", on ? C.cyan : C.faint, "center");
  });
  y += bh + 30;
  // breakdown
  text(ctx, "By device", sx + 40, y + 20, 30, "800", C.sub);
  y += 44;
  const bd = [["Air Conditioner", 48, C.cyan], ["Lighting", 22, C.amber], ["Appliances", 18, C.violet], ["Others", 12, C.pink]];
  bd.forEach((b, i) => {
    const ty = y + i * 62;
    text(ctx, b[0], sx + 40, ty + 24, 26, "600", C.text);
    text(ctx, b[1] + "%", sx + sw - 40, ty + 24, 26, "700", b[2], "right");
    fillRR(ctx, sx + 40, ty + 36, sw - 80, 12, 6, "rgba(255,255,255,0.08)");
    fillRR(ctx, sx + 40, ty + 36, (sw - 80) * (b[1] / 100), 12, 6, b[2]);
  });
}

function scVoice(ctx, sx, sy, sw) {
  let y = sy + 100;
  text(ctx, "Voice Control", sx + 40, y, 46, "800", C.text);
  y += 44;
  text(ctx, "Link your assistants and control", sx + 40, y, 26, "500", C.sub);
  text(ctx, "Circuvent hands-free.", sx + 40, y + 36, 26, "500", C.sub);
  y += 90;
  // Alexa card
  const cw = sw - 80, ch = 170;
  card(ctx, sx + 40, y, cw, ch, 28);
  // alexa ring
  ctx.save(); ctx.translate(sx + 40 + 95, y + ch / 2);
  ctx.strokeStyle = "#00caff"; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(0, 0, 44, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = "#1ce8ff"; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(0, 0, 44, Math.PI * 0.15, Math.PI * 0.75); ctx.stroke();
  ctx.restore();
  text(ctx, "Amazon Alexa", sx + 40 + 190, y + 74, 34, "800", C.text);
  text(ctx, "Connected", sx + 40 + 190, y + 116, 26, "600", C.green);
  ctx.beginPath(); ctx.arc(sx + 40 + 190 + 148, y + 108, 7, 0, Math.PI * 2); ctx.fillStyle = C.green; ctx.fill();
  y += ch + 28;
  // Google card
  card(ctx, sx + 40, y, cw, ch, 28);
  const gx = sx + 40 + 95, gy = y + ch / 2;
  const gd = [["#4285F4", -1, -1], ["#EA4335", 1, -1], ["#FBBC05", -1, 1], ["#34A853", 1, 1]];
  gd.forEach(([col, dx, dy]) => { ctx.beginPath(); ctx.arc(gx + dx * 22, gy + dy * 22, 15, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); });
  text(ctx, "Google Assistant", sx + 40 + 190, y + 74, 34, "800", C.text);
  text(ctx, "Connected", sx + 40 + 190, y + 116, 26, "600", C.green);
  ctx.beginPath(); ctx.arc(sx + 40 + 190 + 174, y + 108, 7, 0, Math.PI * 2); ctx.fillStyle = C.green; ctx.fill();
  y += ch + 40;
  // try saying
  const th = 300;
  const g = ctx.createLinearGradient(sx + 40, y, sx + 40 + cw, y + th);
  g.addColorStop(0, "rgba(34,211,238,0.14)"); g.addColorStop(1, "rgba(139,92,246,0.14)");
  fillRR(ctx, sx + 40, y, cw, th, 28, g); strokeRR(ctx, sx + 40, y, cw, th, 28, C.border, 1.5);
  fillRR(ctx, sx + 40 + 34, y + 34, 66, 66, 20, C.violet);
  icon(ctx, "mic", sx + 40 + 67, y + 67, 20, "#fff");
  text(ctx, "Try saying", sx + 40 + 120, y + 78, 30, "800", C.text);
  const cmds = ['"Alexa, turn on the living room lights"', '"Hey Google, activate Movie Night"', '"Alexa, lock the front door"'];
  cmds.forEach((c, i) => {
    const ty = y + 128 + i * 56;
    ctx.fillStyle = C.cyan; ctx.beginPath(); ctx.arc(sx + 40 + 44, ty - 8, 5, 0, Math.PI * 2); ctx.fill();
    text(ctx, c, sx + 40 + 66, ty, 25, "500", C.text);
  });
}

// ---- compose ----
const SCREENS = [
  { fn: scHome, cap: ["Your whole home,", "in one tap"], acc: 1, nav: 0 },
  { fn: scDevices, cap: ["Every device,", "beautifully organized"], acc: 1, nav: 1 },
  { fn: scAutomate, cap: ["Automate your", "everyday moments"], acc: 1, nav: 2 },
  { fn: scEnergy, cap: ["Track energy,", "save money"], acc: 1, nav: 3 },
  { fn: scVoice, cap: ["Works with Alexa", "& Google Assistant"], acc: 0, nav: 4 },
];

function renderScreen(s, tw, th) {
  const c = createCanvas(tw, th);
  const ctx = c.getContext("2d");
  ctx.scale(tw / W, th / H);
  drawBg(ctx);
  drawCaption(ctx, s.cap, s.acc);
  // phone frame
  const px = 150, py = 430, pw = 780, ph = 1400;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 60; ctx.shadowOffsetY = 30;
  fillRR(ctx, px, py, pw, ph, 68, "#05070d");
  ctx.restore();
  strokeRR(ctx, px, py, pw, ph, 68, "rgba(255,255,255,0.10)", 2);
  const sx = px + 20, sy = py + 20, sw = pw - 40, sh = ph - 40;
  // clip screen
  ctx.save();
  rr(ctx, sx, sy, sw, sh, 52); ctx.clip();
  const sg = ctx.createLinearGradient(sx, sy, sx, sy + sh);
  sg.addColorStop(0, C.screen); sg.addColorStop(1, C.screen2);
  ctx.fillStyle = sg; ctx.fillRect(sx, sy, sw, sh);
  statusBar(ctx, sx, sy, sw);
  // notch
  fillRR(ctx, sx + sw / 2 - 70, sy + 16, 140, 34, 17, "#05070d");
  s.fn(ctx, sx, sy, sw, sh);
  // bottom nav
  fillRR(ctx, sx, sy + sh - 118, sw, 118, { tl: 0, tr: 0, br: 52, bl: 52 }, "rgba(9,12,22,0.92)");
  ctx.strokeStyle = C.border; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx, sy + sh - 118); ctx.lineTo(sx + sw, sy + sh - 118); ctx.stroke();
  navBar(ctx, sx, sy + sh - 100, sw, s.nav);
  ctx.restore();
  return c.toBuffer("image/png");
}

const SIZES = [
  { dir: "phone", w: 1080, h: 1920 },
  { dir: "tablet7", w: 1350, h: 2400 },
  { dir: "tablet10", w: 1440, h: 2560 },
];

const outRoot = path.join(__dirname, "screenshots");
SIZES.forEach((sz) => {
  const dir = path.join(outRoot, sz.dir);
  fs.mkdirSync(dir, { recursive: true });
  SCREENS.forEach((s, i) => {
    const buf = renderScreen(s, sz.w, sz.h);
    const name = `${String(i + 1).padStart(2, "0")}-${s.fn.name.replace("sc", "").toLowerCase()}.png`;
    fs.writeFileSync(path.join(dir, name), buf);
    console.log(`${sz.dir}/${name}  ${sz.w}x${sz.h}  ${Math.round(buf.length / 1024)} KB`);
  });
});
console.log("Done ->", outRoot);
