// Circuvent - hardware package generator.
// Data-driven: emits a full engineering + retail package per device to match the
// hand-authored hardware/home-automation and hardware/water-tank-controller packages.
// Per device it writes: pcb/{SCHEMATIC.md,BOM.csv,README.md,<model>.kicad_pro},
// DATASHEET.md, MANUAL.md, enclosure/{ENCLOSURE.md,label.svg,box-dieline.svg},
// images/product.svg, listings/{amazon.md,flipkart.md}.
// Pin maps mirror the firmware/<slug>/<slug>.ino sources.
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const F3 = "```"; // markdown code fence (safe inside double-quoted strings)

// ---------- helpers ----------
const nl = (a) => a.filter((x) => x !== null && x !== undefined).join("\n");
function mdTable(head, rows) {
  const line = (arr) => "| " + arr.join(" | ") + " |";
  const sep = "| " + head.map(() => "---").join(" | ") + " |";
  return nl([line(head), sep, ...rows.map(line)]);
}
function bomCsv(rows) {
  const head = "Ref,Qty,Value/Part,Package,Description,Notes";
  return nl([head, ...rows.map((r) => r.join(","))]) + "\n";
}
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// ---------- doc renderers ----------
function schematic(d) {
  const s = d.schem;
  const out = [
    "# " + d.name + " - Schematic / Netlist", "",
    s.intro, "",
    "## Power", F3, ...s.power, F3, "",
    "## MCU (U1 ESP32-WROOM-32E) - I/O map (matches firmware/" + d.slug + "/" + d.slug + ".ino)",
    mdTable(["Signal", "ESP32 GPIO", "Net / connector"], d.pins.map((p) => [p.sig, String(p.gpio), p.net])), "",
  ];
  if (s.drive) out.push("## " + (s.driveTitle || "Output drive"), F3, ...s.drive, F3, "");
  if (s.sensor) out.push("## " + (s.sensorTitle || "Sensors / inputs"), F3, ...s.sensor, F3, "");
  out.push("## Layout / safety rules", ...s.safety.map((b) => "- " + b), "",
    "See README.md for the KiCad project + Gerber/fab checklist.", "");
  return nl(out);
}
function bom(d) { return bomCsv(d.bom); }
function pcbReadme(d) {
  const b = d.board;
  return nl([
    "# " + d.name + " PCB - KiCad project + fab checklist", "",
    "Design source: SCHEMATIC.md (netlist) + BOM.csv. Open " + d.model.toLowerCase() + ".kicad_pro in KiCad 8, capture, lay out, export.", "",
    "## Board spec",
    "- " + b.layers,
    "- " + b.iso,
    "- Size target ~ " + b.size + "; " + b.mounts + ".",
    ...(b.extra || []).map((x) => "- " + x), "",
    "## Pre-fab (DFM) checklist",
    ...b.dfm.map((x) => "- [ ] " + x), "",
    "## Export for fab / assembly",
    "- [ ] Gerbers + Excellon -> gerbers/; IPC-356 netlist",
    "- [ ] BOM (BOM.csv) + CPL/centroid; PDF assembly + 3D STEP",
    "- [ ] Order boards" + (b.stencil === false ? "" : " + stencil"), "",
    "## Bring-up (EVT)",
    ...b.bringup.map((x) => "- [ ] " + x), "",
  ]);
}
function kicad(d) {
  return JSON.stringify({
    board: { design_settings: { defaults: {} } },
    meta: { filename: d.model.toLowerCase() + ".kicad_pro", version: 1 },
    project: { name: "Circuvent " + d.product, description: d.kicadDesc, board_revision: "A" },
    sheets: [],
    text_variables: Object.assign({ MODEL: d.model, REV: "A" }, d.kicadVars || {}),
  }, null, 2) + "\n";
}
function datasheet(d) {
  const out = [
    "# Circuvent " + d.product, "",
    "**Model:** " + d.model + " \u00b7 **Type id:** `" + d.slug + "` \u00b7 **Firmware:** " + d.fwVer, "",
    d.summary, "",
    "## Key features", ...d.features.map((f) => "- " + f), "",
    "## Specifications", mdTable(["Parameter", "Value"], d.specs), "",
    "## Telemetry / control (cloud contract)",
    "- **State:** " + d.state,
    "- **Commands (`set`):** " + d.commands, "",
    "## Compliance (required before retail sale in India) - external",
    ...d.compliance.map((c) => "- [ ] " + c), "",
    "## In the box", d.inBox, "",
  ];
  if (d.safetyNote) out.push("> SAFETY: " + d.safetyNote, "");
  return nl(out);
}
function manual(d) {
  const out = ["# " + d.product + " - Quick Start", ""];
  d.manual.sections.forEach((sec, i) => {
    out.push("## " + (i + 1) + ". " + sec.t);
    sec.steps.forEach((st, j) => out.push((j + 1) + ". " + st));
    out.push("");
  });
  if (d.manual.trouble) out.push("## Troubleshooting", ...d.manual.trouble.map((x) => "- " + x), "");
  return nl(out);
}
function enclosure(d) {
  const e = d.enc;
  return nl([
    "# " + d.product + " - Enclosure spec", "",
    "- **Type:** " + e.type,
    "- **Approx size:** " + e.size,
    "- **Front:** " + e.front,
    "- **Openings:** " + e.openings,
    "- **Tooling:** " + e.tooling,
    "- **Retail carton:** box-dieline.svg (" + e.carton + ")", "",
    "Vendor still owes: " + e.owes, "",
  ]);
}
function amazon(d) {
  const l = d.listing;
  return nl([
    "# " + d.product + " - Amazon.in listing", "",
    "**Title (< 200 chars):**", l.title, "",
    "**Brand:** Circuvent  \u00b7  **Model:** " + d.model + "  \u00b7  **Category:** " + l.category, "",
    "## Bullet points", ...l.bullets.map((b) => "- " + b), "",
    "## Description", l.description, "",
    "## A+ content (modules)", ...l.aplus.map((a, i) => (i + 1) + ". " + a), "",
    "## Search keywords", l.keywords, "",
    "## Compliance / listing gates (before publish)",
    "- " + (l.gates || "BIS registration, WPC/ETA, GST, EAN-13, electrical safety declaration."), "",
  ]);
}
function flipkart(d) {
  const l = d.listing;
  const hi = l.bullets.map((b) => (b.includes(": ") ? b.slice(0, b.indexOf(": ")) : b));
  return nl([
    "# " + d.product + " - Flipkart listing", "",
    "**Product title:**", l.fkTitle || l.title, "",
    "**Brand:** Circuvent  \u00b7  **Model:** " + d.model + "  \u00b7  **Vertical:** " + (l.vertical || l.category), "",
    "## Highlights", ...hi.map((h) => "- " + h), "",
    "## Description", l.description, "",
    "## Specifications", mdTable(["Parameter", "Value"], d.specs), "",
    "## Listing gates (before publish)",
    "- Flipkart Seller account + brand, EAN-13, GST, BIS/WPC where applicable, images (white bg) + video.", "",
  ]);
}

// ---------- SVG artwork ----------
function labelSvg(d) {
  const L = d.label;
  const lines = L.lines.map((t, i) => '  <text x="14" y="' + (86 + i * 18) + '" font-size="11" fill="#374151">' + esc(t) + "</text>").join("\n");
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="220" viewBox="0 0 360 220" font-family="Arial, sans-serif">',
    '  <rect x="0.5" y="0.5" width="359" height="219" rx="10" fill="#ffffff" stroke="#111827"/>',
    '  <rect x="0" y="0" width="360" height="44" rx="10" fill="#0b1020"/>',
    '  <circle cx="26" cy="22" r="11" fill="none" stroke="' + d.accent + '" stroke-width="3"/>',
    '  <text x="46" y="28" fill="#ffffff" font-size="20" font-weight="bold">Circu<tspan fill="' + d.accent + '">vent</tspan></text>',
    '  <text x="250" y="19" fill="#c4b5fd" font-size="10">MADE IN INDIA</text>',
    '  <text x="' + (338 - L.brand.length * 6) + '" y="33" fill="#e5e7eb" font-size="11" font-weight="bold">' + esc(L.brand) + "</text>",
    '  <text x="14" y="68" font-size="13" font-weight="bold" fill="#111827">' + esc(L.title) + "</text>",
    lines,
    '  <rect x="266" y="60" width="80" height="80" fill="#ffffff" stroke="#111827"/>',
    '  <g fill="#111827">',
    '    <rect x="272" y="66" width="20" height="20"/><rect x="320" y="66" width="20" height="20"/>',
    '    <rect x="272" y="114" width="20" height="20"/>',
    '    <rect x="300" y="72" width="6" height="6"/><rect x="300" y="88" width="6" height="6"/>',
    '    <rect x="314" y="100" width="6" height="6"/><rect x="300" y="112" width="6" height="6"/>',
    '    <rect x="322" y="120" width="6" height="6"/><rect x="332" y="108" width="6" height="6"/>',
    "  </g>",
    '  <text x="266" y="152" font-size="8" fill="#6b7280">Scan to set up</text>',
    '  <text x="14" y="182" font-size="10" fill="#111827" font-weight="bold">Device ID: __________________</text>',
    '  <text x="14" y="198" font-size="10" fill="#111827" font-weight="bold">Key: __________________</text>',
    '  <text x="14" y="213" font-size="8" fill="#b91c1c">' + esc(L.warn) + "</text>",
    '  <g transform="translate(266,168)" font-size="9" fill="#374151">',
    '    <rect x="0" y="0" width="26" height="14" fill="none" stroke="#374151"/><text x="4" y="10">CE</text>',
    '    <rect x="32" y="0" width="30" height="14" fill="none" stroke="#374151"/><text x="35" y="10">BIS</text>',
    '    <rect x="66" y="0" width="14" height="14" fill="none" stroke="#374151"/><text x="68" y="10">&#9851;</text>',
    "  </g>",
    "</svg>", "",
  ].join("\n");
}
function boxSvg(d) {
  const B = d.box;
  const sub = B.sub.map((t, i) => '    <text x="292" y="' + (166 + i * 14) + '" font-size="10" fill="#c4b5fd">' + esc(t) + "</text>").join("\n");
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="460" viewBox="0 0 720 460" font-family="Arial, sans-serif">',
    "  <style>",
    "    .cut{fill:none;stroke:#e11d48;stroke-width:1.2}",
    "    .fold{fill:none;stroke:#2563eb;stroke-width:1;stroke-dasharray:6 4}",
    "    .panel{fill:#f8fafc}.front{fill:#0b1020}.t{fill:#111827;font-size:11px}.w{fill:#ffffff}",
    "  </style>",
    '  <rect width="720" height="460" fill="#ffffff"/>',
    '  <text x="16" y="22" class="t" font-weight="bold">' + esc(d.product) + " retail carton - die-line (not to scale). Red = cut, blue dashed = fold.</text>",
    '  <g transform="translate(40,60)">',
    '    <path class="fold" d="M40,40 h480"/>',
    '    <path class="cut" d="M40,40 v-34 h120 v34 M160,40 q60,-46 120,0"/>',
    '    <path class="cut" d="M0,40 h40 v220 h-40 z"/>',
    '    <text class="t" x="6" y="150" transform="rotate(-90 8,150)">GLUE</text>',
    '    <path class="fold" d="M40,40 v220"/>',
    '    <rect class="panel" x="40" y="40" width="120" height="220"/>',
    '    <text class="t" x="60" y="140">BACK</text><text class="t" x="52" y="158" font-size="9">specs / QR / barcode</text>',
    '    <path class="fold" d="M160,40 v220"/>',
    '    <rect class="panel" x="160" y="40" width="120" height="220"/>',
    '    <text class="t" x="196" y="150">LEFT</text>',
    '    <path class="fold" d="M280,40 v220"/>',
    '    <rect class="front" x="280" y="40" width="120" height="220"/>',
    '    <circle cx="300" cy="66" r="9" fill="none" stroke="' + d.accent + '" stroke-width="2.5"/>',
    '    <text class="w" x="316" y="70" font-size="13" font-weight="bold">Circu<tspan fill="' + d.accent + '">vent</tspan></text>',
    '    <text class="w" x="292" y="146" font-size="15" font-weight="bold">' + esc(B.title) + "</text>",
    sub,
    '    <text x="292" y="236" font-size="8" fill="#cbd5e1">' + esc(B.strip) + "</text>",
    '    <path class="fold" d="M400,40 v220"/>',
    '    <rect class="panel" x="400" y="40" width="120" height="220"/>',
    '    <text class="t" x="436" y="150">RIGHT</text>',
    '    <path class="cut" d="M520,40 v220"/>',
    '    <path class="fold" d="M40,260 h480"/>',
    '    <path class="cut" d="M40,260 v40 h120 v-40 M280,260 v46 h120 v-46"/>',
    '    <path class="cut" d="M160,260 v34 h120 v-34"/>',
    "  </g>",
    '  <text x="40" y="360" class="t" font-size="9">Material: 300gsm + E-flute . CMYK + matte lamination . spot-UV logo. EAN-13 + statutory text on BACK.</text>',
    "</svg>", "",
  ].join("\n");
}
function productSvg(d) {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600" font-family="Arial, sans-serif">',
    "  <defs>",
    '    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ede9fe"/><stop offset="1" stop-color="#e0f2fe"/></linearGradient>',
    '    <linearGradient id="case" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e2e8f0"/></linearGradient>',
    '    <linearGradient id="acc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + d.accent + '"/><stop offset="1" stop-color="' + (d.accent2 || d.accent) + '"/></linearGradient>',
    "  </defs>",
    '  <rect width="600" height="600" fill="url(#bg)"/>',
    illus(d.illus, d),
    '  <text x="300" y="540" text-anchor="middle" fill="#0f172a" font-size="22" font-weight="bold">' + esc(d.name) + "</text>",
    '  <text x="300" y="562" text-anchor="middle" fill="#94a3b8" font-size="11">Render mockup - replace with studio photography before listing.</text>',
    "</svg>", "",
  ].join("\n");
}

// device face illustrations (drawn ~ x150..450, y110..490)
function illus(type, d) {
  const a = d.accent;
  const brand = '  <g><rect x="150" y="110" width="300" height="380" rx="24" fill="url(#case)" stroke="#94a3b8" stroke-width="2"/>' +
    '<rect x="150" y="110" width="300" height="60" rx="24" fill="#0b1020"/><rect x="150" y="146" width="300" height="24" fill="#0b1020"/>' +
    '<circle cx="188" cy="142" r="11" fill="none" stroke="' + a + '" stroke-width="3"/>' +
    '<text x="208" y="149" fill="#ffffff" font-size="19" font-weight="bold">Circu<tspan fill="' + a + '">vent</tspan></text></g>';
  const G = (s) => brand + s;
  switch (type) {
    case "plug":
      return G('<circle cx="300" cy="300" r="96" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="3"/>' +
        '<circle cx="300" cy="262" r="15" fill="#334155"/><circle cx="266" cy="322" r="15" fill="#334155"/><circle cx="334" cy="322" r="15" fill="#334155"/>' +
        '<rect x="250" y="420" width="100" height="44" rx="10" fill="url(#acc)"/><text x="300" y="448" text-anchor="middle" fill="#fff" font-size="16" font-weight="bold">16A</text>' +
        '<circle cx="300" cy="404" r="7" fill="#22c55e"/>');
    case "switch2":
      return G('<rect x="196" y="210" width="208" height="120" rx="16" fill="#0b1020"/>' +
        '<rect x="214" y="228" width="80" height="84" rx="12" fill="url(#acc)"/><text x="254" y="276" text-anchor="middle" fill="#0b1020" font-size="14" font-weight="bold">1</text>' +
        '<rect x="306" y="228" width="80" height="84" rx="12" fill="#1e293b"/><text x="346" y="276" text-anchor="middle" fill="#94a3b8" font-size="14" font-weight="bold">2</text>' +
        '<text x="300" y="372" text-anchor="middle" fill="#475569" font-size="13">2-Gang Touch . Behind-switch</text>' +
        '<circle cx="300" cy="404" r="7" fill="#22c55e"/>');
    case "bulb":
      return G('<circle cx="300" cy="288" r="82" fill="url(#acc)" opacity="0.25"/><circle cx="300" cy="288" r="60" fill="url(#acc)"/>' +
        '<rect x="278" y="346" width="44" height="20" rx="4" fill="#94a3b8"/><rect x="284" y="366" width="32" height="14" rx="3" fill="#64748b"/>' +
        '<rect x="196" y="410" width="208" height="20" rx="10" fill="#0b1020"/>' +
        '<rect x="200" y="414" width="46" height="12" rx="6" fill="#ef4444"/><rect x="252" y="414" width="46" height="12" rx="6" fill="#22c55e"/>' +
        '<rect x="304" y="414" width="46" height="12" rx="6" fill="#3b82f6"/><rect x="356" y="414" width="44" height="12" rx="6" fill="#f8fafc"/>' +
        '<text x="300" y="456" text-anchor="middle" fill="#475569" font-size="12">RGBW . Dim . Scenes</text>');
    case "fan":
      return G('<g transform="translate(300,296)"><circle r="18" fill="#0b1020"/>' +
        '<g fill="url(#acc)"><ellipse cx="0" cy="-58" rx="22" ry="52"/><g transform="rotate(120)"><ellipse cx="0" cy="-58" rx="22" ry="52"/></g><g transform="rotate(240)"><ellipse cx="0" cy="-58" rx="22" ry="52"/></g></g>' +
        '<circle r="10" fill="#334155"/></g>' +
        '<path d="M232 410 a70 70 0 0 1 136 0" fill="none" stroke="' + a + '" stroke-width="8" stroke-linecap="round"/>' +
        '<text x="300" y="456" text-anchor="middle" fill="#475569" font-size="12">BLDC / regulator . 6 speeds</text>');
    case "lock":
      return G('<rect x="246" y="286" width="108" height="92" rx="12" fill="url(#acc)"/>' +
        '<path d="M266 286 v-24 a34 34 0 0 1 68 0 v24" fill="none" stroke="#334155" stroke-width="12"/>' +
        '<circle cx="300" cy="322" r="12" fill="#0b1020"/><rect x="295" y="330" width="10" height="24" rx="4" fill="#0b1020"/>' +
        '<text x="300" y="420" text-anchor="middle" fill="#475569" font-size="13">Deadbolt / strike . Auto-lock</text>' +
        '<circle cx="300" cy="450" r="7" fill="#22c55e"/>');
    case "curtain":
      return G('<rect x="196" y="206" width="208" height="14" rx="6" fill="#0b1020"/>' +
        '<g fill="#e2e8f0" stroke="#cbd5e1"><path d="M206 220 q10 60 0 120 q10 60 0 120 h30 q-10 -60 0 -120 q-10 -60 0 -120 z"/>' +
        '<path d="M364 220 q-10 60 0 120 q-10 60 0 120 h30 q10 -60 0 -120 q10 -60 0 -120 z"/></g>' +
        '<path d="M262 336 h-30 l14 -14 m-14 14 l14 14" fill="none" stroke="' + a + '" stroke-width="6" stroke-linecap="round"/>' +
        '<path d="M338 336 h30 l-14 -14 m14 14 l-14 14" fill="none" stroke="' + a + '" stroke-width="6" stroke-linecap="round"/>' +
        '<text x="300" y="456" text-anchor="middle" fill="#475569" font-size="12">Open / Close / Stop . % position</text>');
    case "pir":
      return G('<path d="M234 300 a66 66 0 0 1 132 0 z" fill="#0b1020"/><ellipse cx="300" cy="300" rx="66" ry="22" fill="#1e293b"/>' +
        '<ellipse cx="300" cy="298" rx="40" ry="14" fill="url(#acc)" opacity="0.7"/>' +
        '<g fill="none" stroke="' + a + '" stroke-width="5" stroke-linecap="round"><path d="M300 360 q-40 30 -70 24"/><path d="M300 360 q40 30 70 24"/><path d="M300 366 v34"/></g>' +
        '<text x="300" y="440" text-anchor="middle" fill="#475569" font-size="13">PIR motion . Instant alerts</text>');
    case "ctclamp":
      return G('<circle cx="300" cy="292" r="66" fill="none" stroke="url(#acc)" stroke-width="20"/>' +
        '<circle cx="300" cy="292" r="66" fill="none" stroke="#0b1020" stroke-width="4"/>' +
        '<line x1="300" y1="150" x2="300" y2="470" stroke="#64748b" stroke-width="10"/>' +
        '<rect x="356" y="270" width="16" height="44" rx="4" fill="#334155"/>' +
        '<text x="300" y="452" text-anchor="middle" fill="#475569" font-size="12">Clamp CT . Live W + kWh</text>');
    case "sos":
      return G('<rect x="236" y="220" width="128" height="210" rx="26" fill="#0b1020"/>' +
        '<circle cx="300" cy="300" r="52" fill="url(#acc)"/><text x="300" y="312" text-anchor="middle" fill="#fff" font-size="26" font-weight="bold">SOS</text>' +
        '<g fill="none" stroke="' + a + '" stroke-width="4" opacity="0.8"><path d="M372 264 a70 70 0 0 1 0 72"/><path d="M228 264 a70 70 0 0 0 0 72"/></g>' +
        '<circle cx="300" cy="392" r="9" fill="#22c55e"/><text x="300" y="418" text-anchor="middle" fill="#cbd5e1" font-size="11">GPS + GSM</text>');
    case "agri":
      return G('<rect x="210" y="230" width="180" height="150" rx="14" fill="#0b1020"/>' +
        '<circle cx="270" cy="300" r="34" fill="url(#acc)"/><path d="M270 300 l24 -14 v28 z" fill="#0b1020"/>' +
        '<rect x="318" y="278" width="52" height="44" rx="6" fill="#1e293b"/><text x="344" y="305" text-anchor="middle" fill="' + a + '" font-size="12" font-weight="bold">3PH</text>' +
        '<line x1="360" y1="230" x2="360" y2="196" stroke="#334155" stroke-width="6"/><circle cx="360" cy="192" r="6" fill="' + a + '"/>' +
        '<text x="300" y="418" text-anchor="middle" fill="#475569" font-size="12">Missed-call / SMS + app . Dry-run guard</text>');
    default:
      return G("");
  }
}

// ---------- write ----------
function write(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  console.log("  " + path.relative(ROOT, p));
}
function emit(d) {
  const base = path.join(ROOT, d.folder);
  console.log(d.model + "  " + d.product);
  write(path.join(base, "pcb", "SCHEMATIC.md"), schematic(d));
  write(path.join(base, "pcb", "BOM.csv"), bom(d));
  write(path.join(base, "pcb", "README.md"), pcbReadme(d));
  write(path.join(base, "pcb", d.model.toLowerCase() + ".kicad_pro"), kicad(d));
  write(path.join(base, "DATASHEET.md"), datasheet(d));
  write(path.join(base, "MANUAL.md"), manual(d));
  write(path.join(base, "enclosure", "ENCLOSURE.md"), enclosure(d));
  write(path.join(base, "enclosure", "label.svg"), labelSvg(d));
  write(path.join(base, "enclosure", "box-dieline.svg"), boxSvg(d));
  write(path.join(base, "images", "product.svg"), productSvg(d));
  write(path.join(base, "listings", "amazon.md"), amazon(d));
  write(path.join(base, "listings", "flipkart.md"), flipkart(d));
}

const DEVICES = [
  {
    folder: "smart-plug", slug: "smart-plug", model: "CV-PLUG", name: "Smart Plug",
    product: "Smart Plug 16A (Energy Metering)", fwVer: "2.0.0",
    accent: "#06b6d4", accent2: "#22d3ee", illus: "plug",
    kicadDesc: "Single-channel 16A ESP32 mains plug with BL0937 energy metering. Capture schematic from SCHEMATIC.md.",
    kicadVars: { LOAD: "16A", METER: "BL0937", MAINS_CREEPAGE_MM: "8" },
    summary: "A 16 A Wi-Fi smart plug that switches any appliance and meters live power and energy - with a physical button that keeps working even without the internet.",
    features: [
      "**16 A load** - run geysers, ACs (within rating), pumps and washers from the app, web or the on-plug button.",
      "**Live energy metering (BL0937):** watts now, plus cumulative kWh and cost estimates.",
      "**Local-first button:** toggle the load instantly, online or offline.",
      "**Boot-state restore:** returns to its last state after a power cut.",
      "Schedules + timers; over-current protection via the mains fuse.",
      "Zero-touch Wi-Fi setup (phone captive portal); secure OTA updates.",
    ],
    specs: [
      ["Supply", "100-240 V AC, 50/60 Hz"], ["Max load", "16 A resistive (3680 W @ 230 V)"],
      ["Switching", "1x SPDT relay (16 A)"], ["Metering", "BL0937 - W, kWh, V, A"],
      ["Connectivity", "Wi-Fi 802.11 b/g/n 2.4 GHz (ESP32)"], ["Local control", "1 push-button (offline-capable)"],
      ["Socket", "India 6/16 A universal (variant)"], ["Operating temp", "0-45 degC"], ["Warranty", "12 months"],
    ],
    state: "`power`, `watts`, `kwh`, `voltage`, `current`, `uptime`.",
    commands: "`{power}`, `{restore}`, `{rule:{onMin,offMin,en}}`.",
    compliance: ["BIS / CRS registration (mains appliance, IS 302)", "WPC/ETA for the 2.4 GHz radio", "IEC 60335 safety + CISPR EMC; RoHS; e-waste marks"],
    inBox: "Smart plug unit \u00b7 quick-start guide (`MANUAL.md`) \u00b7 warranty card.",
    safetyNote: "Do not exceed the rated load. A mains fuse protects the board; stay within the socket + relay current limits.",
    schem: {
      intro: "ESP32-based single-channel 16 A mains plug with non-invasive energy metering. The relay switches the socket live; a BL0937 meters the load. Mains and low-voltage logic are isolated (HLK PSU + opto barrier).",
      power: [
        "J1(L) --[F1 16A]--+--[RV1 MOV]--+--> PS1.AC-L (HLK-PM03)",
        "J1(N) -----------+-------------+--> PS1.AC-N",
        "PS1.+5V -> 5V rail (K1 coil, U2.IN) ; PS1.-V -> GND",
        "U2 AMS1117-3.3 -> 3V3 (ESP32) ; C1 1000u on 5V (relay inrush) ; C2 100u 3V3 ; C3..C6 100n",
      ],
      driveTitle: "Relay drive (opto-isolated) + metering front-end",
      drive: [
        "IO26 --[1k]--> PC1.anode ; PC1.cathode->GND",
        "PC1.collector--[1k]--> Q1.base ; Q1.emitter->GND ; Q1.collector-> K1 coil(-)",
        "K1 coil(+)->5V ; D1 (1N4007) across coil",
        "K1 COM-> mains L(in) ; K1 NO -> socket L(out) ; N + E pass straight through",
        "BL0937: Rshunt 1mR in load-L path -> current ; Rdiv(Vmains) -> voltage ;",
        "  CF->IO35, CF1->IO34, SEL->IO25 (on the mains island; keep away from LV)",
      ],
      safety: [
        "Single mains-L bus: IN -> K1 COM -> shunt -> socket L(out); wide 2 oz traces + thermal relief.",
        ">= 8 mm creepage / 6 mm clearance mains-to-LV; isolation slot under the opto + PSU.",
        "16 A fuse + MOV at entry; size the shunt for <= 1 W at full load.",
        "BL0937 front-end sits on the mains island; only the 3 opto/pulse lines cross to LV.",
        "Silk: shock warning, 16 A rating, serial/QR, CE/BIS mark area.",
      ],
    },
    pins: [
      { sig: "RELAY_PIN", gpio: 26, net: "-> PC1 -> Q1 -> K1 coil (socket live)" },
      { sig: "LED_PIN", gpio: 2, net: "-> LED1 (load on)" },
      { sig: "BTN_PIN", gpio: 0, net: "SW1 manual toggle (also BOOT/config)" },
      { sig: "MTR_CF", gpio: 35, net: "<- BL0937 CF (active-power pulses)" },
      { sig: "MTR_CF1", gpio: 34, net: "<- BL0937 CF1 (V/I pulses)" },
      { sig: "MTR_SEL", gpio: 25, net: "-> BL0937 SEL (V/I select)" },
    ],
    board: {
      layers: "2-layer FR4, 1.6 mm, HASL lead-free, 2 oz copper on mains.",
      iso: ">= 8 mm creepage / 6 mm clearance mains-to-LV; isolation slots.",
      size: "50 x 50 mm (plug body)", mounts: "2x M3 / snap bosses",
      extra: ["Relay + shunt pads wide; keep the metering divider tight to the shunt."],
      dfm: ["ERC/DRC clean at fab rules; mains clearances as keepout", "Fuse + MOV at entry; single L-bus IN->relay->shunt->OUT", "Shunt power + trace width verified at 16 A", "Test points: 5V, 3V3, GND, IO26, IO35/34/25 (meter)", "UART/EN/IO0 pads for the flashing jig; fiducials"],
      bringup: ["Rails before ESP32; flash test firmware over jig", "Relay clicks + switches the socket; button toggles offline", "BL0937 reads W/kWh against a known load; calibrate", "Cloud sync self-test; schedule fires"],
    },
    bom: [
      ["U1", "1", "ESP32-WROOM-32E (4MB)", "SMD module", "Wi-Fi/BLE MCU module", "Main controller"],
      ["PS1", "1", "HLK-PM03 (5V 3W)", "SIP", "230VAC -> 5VDC isolated PSU", "Relay coil + logic"],
      ["U2", "1", "AMS1117-3.3", "SOT-223", "5V -> 3.3V LDO", "MCU rail"],
      ["U3", "1", "BL0937 / HLW8032", "SOP", "Energy metering front-end", "W/kWh/V/A"],
      ["U4", "1", "PC817", "DIP-4", "Opto-isolator", "Relay drive"],
      ["Q1", "1", "S8050", "SOT-23", "NPN relay driver", ""],
      ["D1", "1", "1N4007", "DO-41", "Flyback diode", "Across relay coil"],
      ["K1", "1", "T90/HF105 16A", "THT relay", "SPDT 16A", "Switch socket live"],
      ["Rsh", "1", "1mR 2W", "2512", "Current shunt", "Metering (load-L path)"],
      ["RV1", "1", "10D471K", "disc", "MOV 470V", "Mains surge clamp"],
      ["F1", "1", "16A slow-blow", "5x20 holder", "Mains fuse", ""],
      ["SW1", "1", "Tactile 6mm", "THT", "Manual button / BOOT", ""],
      ["LED0", "1", "Green 3mm", "THT", "Power/online", ""],
      ["LED1", "1", "Blue 3mm", "THT", "Load status", ""],
      ["J1", "1", "Plug pins + socket", "-", "India 6/16A in/out", "Body-integrated"],
      ["JP", "1", "3P 2.54mm", "header", "UART (TX/RX/GND)", "Factory flashing"],
      ["R1-R10", "10", "10k/1k/330 + divider", "0805", "Pull-ups/base/LED/meter", ""],
      ["C1", "1", "1000uF/10V", "electrolytic", "5V bulk (relay inrush)", ""],
      ["C2", "1", "100uF/6.3V", "electrolytic", "3.3V rail", ""],
      ["C3-C6", "4", "100nF", "0805", "Decoupling", ""],
      ["PCB", "1", "2-layer FR4 1.6mm", "-", "Main board", ">=8mm mains-LV creepage; 2oz Cu"],
      ["ENC", "1", "ABS plug body (UL94 V-0)", "-", "Plug + socket", "Pins + front socket + button"],
    ],
    enc: {
      type: "plug-in wall module, ABS, flame-retardant (UL94 V-0), white + cyan accent, with integrated India 6/16 A pins and a front universal socket.",
      size: "60 x 60 x 55 mm (plug body). 2x internal bosses.",
      front: "1 status LED + 1 manual button + universal socket + brand area (recessed for label.svg).",
      openings: "front socket; rear mains pins; button + LED light-pipe.",
      tooling: "injection mould (2 cavities); validate against PCB outline (50 x 50 mm) + pin carrier.",
      carton: "E-flute, 4-color + matte lam, spot-UV logo",
      owes: "3D STEP, drop-test, plug-pin retention + temperature-rise test on the assembled unit.",
    },
    label: {
      brand: "Smart Plug", title: "16A Wi-Fi Smart Plug",
      lines: ["Model: CV-PLUG    Type: smart-plug", "Input: 100-240V ~ 50/60Hz", "Load: 16A max (3680W @ 230V)", "Metering: W / kWh . Wi-Fi 2.4GHz", "Warranty: 12 months"],
      warn: "RISK OF SHOCK - Do not exceed rated load.",
    },
    box: { title: "Smart Plug 16A", sub: ["Energy Metering", "Wi-Fi . Works offline"], strip: "Live W + kWh . Schedules . Button" },
    listing: {
      title: "Circuvent Smart Plug 16A | Wi-Fi Heavy-Duty Smart Socket with Energy Monitoring | Live Power & kWh | App + Physical Button | Works Offline | Made in India",
      category: "Home Improvement > Smart Home > Smart Plugs", vertical: "Smart Plugs",
      bullets: [
        "16A HEAVY-DUTY: Switch high-power appliances - geysers, ACs (within rating), pumps, washing machines - from the app, web or the on-plug button.",
        "SEE YOUR ENERGY: Built-in metering shows live watts plus cumulative kWh, so you know what every appliance costs.",
        "WORKS WITHOUT INTERNET: The physical button toggles the load instantly, online or offline.",
        "REMEMBERS AFTER POWER CUTS: Boot-state restore returns the plug to its last state automatically.",
        "SECURE & MADE IN INDIA: 60-second phone Wi-Fi setup, over-the-air updates, mains-fuse protection, 12-month warranty.",
      ],
      description: "The Circuvent Smart Plug turns any 6/16 A wall socket into a metered, app-controlled outlet. Switch heavy appliances from the free Circuvent app, the web, or the on-plug button, and watch live power and daily energy so you can cut waste. Control is local-first, so the button keeps working even if the Wi-Fi is down. A mains fuse and surge clamp protect the board; stay within the 16 A rating.",
      aplus: ["Hero: 16A smart plug + live power ring.", "Energy metering: watts + kWh screens.", "Local-first: the button works offline.", "Schedules + timers.", "Specs table + safety limits.", "What's in the box + warranty + Made in India."],
      keywords: "16a smart plug, wifi smart plug energy monitoring, heavy duty smart plug india, smart socket geyser ac, smart plug works offline",
    },
    manual: {
      sections: [
        { t: "Plug in", steps: ["Plug the unit into a 6/16 A wall socket rated for your load.", "Plug your appliance into the front socket. Do not exceed 16 A."] },
        { t: "Power on & connect to Wi-Fi", steps: ["The green LED shows power.", "On your phone, join Wi-Fi \"Circuvent-Setup-XXXX\".", "The setup page opens (or visit http://192.168.4.1); pick your Wi-Fi, enter the password, Save & connect. The plug restarts and comes online."] },
        { t: "Link to your account", steps: ["Open the Circuvent app (or circuvent.com -> Store -> Devices).", "Add a device -> enter the Device ID + Key from the sticker.", "The plug appears with on/off, energy and schedules."] },
        { t: "Use it", steps: ["Button: press to toggle the load (works offline too).", "Energy: watch live watts and daily kWh in the app.", "Schedules: set daily on/off times.", "After a power cut: the plug returns to its last state."] },
      ],
      trouble: ["Offline: hold the button ~5 s to reopen the Wi-Fi setup portal.", "No power reading: give it a load; tiny standby loads read ~0 W.", "Load not switching: check the appliance is within 16 A and the fuse is intact."],
    },
  },
  {
    folder: "smart-switch", slug: "smart-switch", model: "CV-SW2", name: "Smart Switch",
    product: "Smart Switch (2-Gang Touch)", fwVer: "2.0.0",
    accent: "#8b5cf6", accent2: "#a78bfa", illus: "switch2",
    kicadDesc: "2-gang ESP32 mains switch module with capacitive touch + Alexa/Google. Capture schematic from SCHEMATIC.md.",
    kicadVars: { GANGS: "2", VOICE: "Alexa+Google", MAINS_CREEPAGE_MM: "8" },
    summary: "A 2-gang Wi-Fi switch module that hides behind your existing switches - touch pads and the app both control two loads, with Alexa and Google built in.",
    features: [
      "**2 independent gangs** - control two lights/fans from the app, web, touch pads or voice.",
      "**Capacitive touch:** built-in touch pads act as local switches (work offline).",
      "**Alexa & Google:** exposed as two switches via the built-in bridge (fauxmoESP).",
      "**Retrofit:** fits behind your existing switchboard - no new switch plate.",
      "**Boot-state restore** + daily schedules per gang.",
      "Zero-touch Wi-Fi setup; secure OTA updates.",
    ],
    specs: [
      ["Supply", "100-240 V AC, 50/60 Hz"], ["Gangs", "2x SPDT relay, 10 A (recommend <= 6 A/gang)"],
      ["Local control", "2x capacitive touch (T0/T3)"], ["Voice", "Alexa + Google (local bridge)"],
      ["Connectivity", "Wi-Fi 802.11 b/g/n 2.4 GHz (ESP32)"], ["Enclosure", "fit-behind-switch module"],
      ["Operating temp", "0-50 degC"], ["Warranty", "12 months"],
    ],
    state: "`power`, `power2`, `uptime`.",
    commands: "`{ch,on}`, `{power}`, `{power2}`, `{restore}`.",
    compliance: ["BIS / CRS registration (mains appliance)", "WPC/ETA for the 2.4 GHz radio", "IEC 60335 safety + CISPR EMC; RoHS; e-waste marks"],
    inBox: "2-gang module \u00b7 wire connectors \u00b7 wiring guide (`MANUAL.md`) \u00b7 warranty card.",
    safetyNote: "Install by a qualified electrician; observe the per-gang current limits.",
    schem: {
      intro: "ESP32-based 2-gang mains switch module. Two opto-isolated relays switch two loads; two capacitive-touch pads give local control. Mains and LV logic are isolated (HLK PSU + opto barrier).",
      power: [
        "J1(L) --[F1 6A]--+--[RV1 MOV]--+--> PS1.AC-L (HLK-PM03)",
        "J1(N) -----------+-------------+--> PS1.AC-N",
        "PS1.+5V -> 5V rail (K1/K2 coils, U3/U4.IN) ; PS1.-V -> GND",
        "U2 AMS1117-3.3 -> 3V3 (ESP32) ; C1 470u on 5V ; C2 100u 3V3 ; C3..C6 100n",
      ],
      driveTitle: "Per-gang relay drive (x2, opto-isolated) + touch",
      drive: [
        "IOxx --[1k]--> PCn.anode ; PCn.cathode->GND",
        "PCn.collector--[1k]--> Qn.base ; Qn.emitter->GND ; Qn.collector-> Kn coil(-)",
        "Kn coil(+)->5V ; Dn (1N4007) across coil",
        "Kn COM-> mains L ; Kn NO -> J2.OUTn ; loads return to common N",
        "Touch pads TP1/TP2 (exposed copper behind the plate) -> IO4/IO15 (ESP32 touch)",
      ],
      safety: [
        "Single mains-L bus to the 2 relay COMs; keep switched-L outputs separated.",
        ">= 8 mm creepage / 6 mm clearance mains-to-LV; isolation slots under optos + PSU.",
        "Fuse + MOV at entry; 2 oz traces + thermal relief on relay pads.",
        "Route touch traces short + guarded; keep them off the mains island.",
        "Silk: shock warning, ratings, serial/QR, CE/BIS mark area.",
      ],
    },
    pins: [
      { sig: "RELAY1", gpio: 26, net: "-> PC1 -> Q1 -> K1 coil (gang 1)" },
      { sig: "RELAY2", gpio: 27, net: "-> PC2 -> Q2 -> K2 coil (gang 2)" },
      { sig: "TOUCH1 (T0)", gpio: 4, net: "<- TP1 copper touch pad (gang 1)" },
      { sig: "TOUCH2 (T3)", gpio: 15, net: "<- TP2 copper touch pad (gang 2)" },
    ],
    board: {
      layers: "2-layer FR4, 1.6 mm, HASL lead-free, 2 oz copper on mains.",
      iso: ">= 8 mm creepage / 6 mm clearance mains-to-LV; isolation slots.",
      size: "45 x 45 mm (fits a modular back-box)", mounts: "2x M3",
      extra: ["Touch pads on the top copper under the plate; guard ring around each."],
      dfm: ["ERC/DRC clean at fab rules; mains clearances as keepout", "Fuse + MOV at entry; single L-bus to both relay COMs", "Per-gang derating on silk; total <= fuse/PSU/copper", "Test points: 5V, 3V3, GND, IO26/27, IO4/15 (touch)", "UART/EN/IO0 pads for the flashing jig; fiducials"],
      bringup: ["Rails before ESP32; flash test firmware over jig", "Both relays click + switch; touch pads toggle offline", "Alexa/Google discovery finds two switches", "Cloud sync self-test; schedule fires"],
    },
    bom: [
      ["U1", "1", "ESP32-WROOM-32E (4MB)", "SMD module", "Wi-Fi/BLE MCU module", "Main controller"],
      ["PS1", "1", "HLK-PM03 (5V 3W)", "SIP", "230VAC -> 5VDC isolated PSU", "2 relay coils + logic"],
      ["U2", "1", "AMS1117-3.3", "SOT-223", "5V -> 3.3V LDO", "MCU rail"],
      ["U3-U4", "2", "PC817", "DIP-4", "Opto-isolators", "One per gang"],
      ["Q1-Q2", "2", "S8050", "SOT-23", "NPN relay drivers", ""],
      ["D1-D2", "2", "1N4007", "DO-41", "Flyback diodes", "Across each coil"],
      ["K1-K2", "2", "SRD-05VDC-SL-C", "THT relay", "5V SPDT 10A", "Switch mains loads (<=6A/gang)"],
      ["TP1-TP2", "2", "Copper pad + decal", "-", "Capacitive touch", "Under the switch plate"],
      ["RV1", "1", "7D471K", "disc", "MOV 470V", "Mains surge clamp"],
      ["F1", "1", "6A slow-blow", "5x20 holder", "Mains fuse", ""],
      ["LED0", "1", "Green 3mm", "THT", "Power/online", ""],
      ["LED1-LED2", "2", "Blue 3mm", "THT", "Gang status", ""],
      ["J1", "1", "2P 5.08mm", "terminal", "Mains input L/N", ""],
      ["J2", "1", "3P 5.08mm", "terminal", "2x switched-L + common N", "Loads"],
      ["JP", "1", "3P 2.54mm", "header", "UART (TX/RX/GND)", "Factory flashing"],
      ["R1-R10", "10", "10k/1k/330", "0805", "Pull-ups/base/LED resistors", ""],
      ["C1", "1", "470uF/10V", "electrolytic", "5V bulk", ""],
      ["C2", "1", "100uF/6.3V", "electrolytic", "3.3V rail", ""],
      ["C3-C6", "4", "100nF", "0805", "Decoupling", ""],
      ["PCB", "1", "2-layer FR4 1.6mm", "-", "Main board", ">=8mm mains-LV creepage; 2oz Cu"],
      ["ENC", "1", "ABS module (UL94 V-0)", "-", "Fit-behind-switch box", "Touch pads face the plate"],
    ],
    enc: {
      type: "fit-behind-switch ABS module (UL94 V-0), fits a standard modular back-box; touch pads face the plate.",
      size: "45 x 45 x 20 mm. 2x M3.",
      front: "2 touch pads (foil/decal) + 2 status light-pipes.",
      openings: "terminal side (L/N in, 2 switched-L out + common N).",
      tooling: "injection mould (2 cavities); validate against PCB (45 x 45 mm).",
      carton: "E-flute, 4-color + matte lam, spot-UV logo",
      owes: "3D STEP, drop-test, touch-plate fit + creepage validation on the assembled unit.",
    },
    label: {
      brand: "Smart Switch", title: "2-Gang Wi-Fi Touch Switch",
      lines: ["Model: CV-SW2    Type: smart-switch", "Input: 100-240V ~ 50/60Hz", "2 x Relay 10A (max 6A/gang)", "Alexa + Google . Wi-Fi 2.4GHz", "Warranty: 12 months"],
      warn: "RISK OF SHOCK - Qualified electrician install only.",
    },
    box: { title: "Smart Switch", sub: ["2-Gang Touch", "Alexa + Google"], strip: "Touch . App . Voice . Works offline" },
    listing: {
      title: "Circuvent Smart Switch | 2-Gang Wi-Fi Touch Switch Module (Fits Behind Existing Switches) | Works with Alexa & Google | Physical Touch + App | Offline-capable | Made in India",
      category: "Home Improvement > Smart Home > Smart Switches", vertical: "Smart Switches",
      bullets: [
        "CONTROL TWO LOADS: Make two existing switches smart - app, web, touch pads or voice.",
        "TOUCH + VOICE: Capacitive touch pads for instant local control, plus Alexa and Google built in.",
        "FITS BEHIND YOUR SWITCHES: Retrofit module drops into a modular back-box - no new faceplate.",
        "WORKS WITHOUT INTERNET: Touch toggles the loads instantly, online or offline.",
        "SECURE & MADE IN INDIA: 60-second phone Wi-Fi setup, OTA updates, 12-month warranty.",
      ],
      description: "The Circuvent Smart Switch upgrades two existing switches into app-, touch- and voice-controlled loads without changing your switch plate. It installs behind the board, exposes two switches to Alexa and Google, and keeps local touch control working even when the Wi-Fi is down. Installation by a qualified electrician; observe the per-gang current limits.",
      aplus: ["Hero: 2 gangs, one hidden module.", "Touch pads + voice control.", "Retrofit behind existing switches.", "Local-first: touch works offline.", "Specs + safety limits.", "What's in the box + warranty + Made in India."],
      keywords: "2 gang smart switch, wifi touch switch module, retrofit smart switch india, alexa google smart switch, smart switch works offline",
    },
    manual: {
      sections: [
        { t: "Wire (electrician)", steps: ["Switch off the mains at the board.", "Connect incoming L/N to J1 (through the fuse).", "Connect each load's live to J2.OUT1/OUT2; load neutrals to common N. Observe <= 6 A/gang.", "Tuck the module into the back-box; stick the touch pads under the plate."] },
        { t: "Power on & connect to Wi-Fi", steps: ["Power on - the green LED shows power.", "On your phone, join Wi-Fi \"Circuvent-Setup-XXXX\".", "The setup page opens (or visit http://192.168.4.1); pick your Wi-Fi, Save & connect."] },
        { t: "Link account + voice", steps: ["Open the Circuvent app -> Add a device -> enter the Device ID + Key from the sticker.", "In Alexa/Google, discover devices - two switches appear.", "Rename each gang (e.g., Lights, Fan)."] },
        { t: "Use it", steps: ["Touch: tap a pad to toggle that gang (works offline).", "Voice: \"Alexa, turn on Lights\".", "Schedules: set daily on/off per gang.", "After a power cut: gangs return to their last state."] },
      ],
      trouble: ["Offline: hold IO0/BOOT ~5 s (or power-cycle 3x) to reopen the setup portal.", "Touch not responding: re-seat the pads flush under the plate; recalibrate in the app.", "Voice not found: re-run Alexa/Google discovery on the same 2.4 GHz Wi-Fi."],
    },
  },
  {
    folder: "smart-light", slug: "smart-light", model: "CV-LED", name: "Smart Light",
    product: "Smart Light Controller (RGBW)", fwVer: "2.0.0",
    accent: "#f59e0b", accent2: "#f97316", illus: "bulb",
    kicadDesc: "ESP32 RGBW LED-strip controller (12-24V DC) with aux relay. Capture schematic from SCHEMATIC.md.",
    kicadVars: { CHANNELS: "RGBW", VIN: "12-24V", PWM: "5kHz/8-bit" },
    summary: "A Wi-Fi RGBW controller for LED strips and fixtures - millions of colours, tunable white, scenes and smooth dimming, plus a physical button.",
    features: [
      "**RGBW strip driver:** 4 PWM channels (R, G, B + dedicated white) for 12-24 V strips.",
      "**Aux fixture relay:** switch a separate lamp on/off from the same unit.",
      "**Scenes + dimming:** smooth 8-bit PWM, colour scenes, schedules, wake/sleep fades.",
      "**Local button:** cycles on/off and presets, online or offline.",
      "Zero-touch Wi-Fi setup; secure OTA updates.",
    ],
    specs: [
      ["Supply", "12-24 V DC (strip PSU)"], ["Outputs", "4x N-MOSFET PWM (R/G/B/W), common-anode"],
      ["Aux", "1x SPDT dry-contact relay"], ["Max current", "~3 A/channel (heatsink-dependent)"],
      ["PWM", "5 kHz, 8-bit"], ["Connectivity", "Wi-Fi 2.4 GHz (ESP32)"],
      ["Operating temp", "0-45 degC"], ["Warranty", "12 months"],
    ],
    state: "`power`, `white`, `r`, `g`, `b`, `brightness`, `scene`.",
    commands: "`{power}`, `{white}`, `{rgb:[r,g,b]}`, `{brightness}`, `{scene}`.",
    compliance: ["WPC/ETA for the 2.4 GHz radio", "EN 55015 (lighting EMC) + LVD; RoHS; e-waste marks", "BIS where applicable for the bundled DC PSU"],
    inBox: "LED controller \u00b7 wiring guide (`MANUAL.md`) \u00b7 warranty card. (Strip + DC PSU sold separately.)",
    safetyNote: "Match the strip voltage to your DC PSU; do not exceed the per-channel current.",
    schem: {
      intro: "ESP32 RGBW LED-strip controller. A DC input feeds a buck to 5 V/3V3; four N-MOSFETs sink the common-anode strip channels under 8-bit PWM. A small relay provides an auxiliary on/off output. No mains on-board (DC input).",
      power: [
        "J1(+Vin 12-24V) -> U3 buck (MP1584) -> 5V -> U2 AMS1117 -> 3V3 (ESP32)",
        "J1(GND) -> GND (common) ; C1 470u on Vin ; C2 100u 5V ; C3 100u 3V3 ; C4..C7 100n",
        "Strip +V taps Vin directly ; channels sink to GND through the MOSFETs",
      ],
      driveTitle: "MOSFET channels + aux relay",
      drive: [
        "IOxx --[100R]--> Qn.gate ; Qn.gate--[100k]->GND ; Qn.source->GND ; Qn.drain-> strip channel",
        "Strip common (+V) -> Vin ; each colour returns through its MOSFET drain",
        "Aux: IO26 -> PC1 -> Q5 -> K1 coil ; D1 across coil ; K1 dry contact -> J3",
        "PWM: ledc 5 kHz 8-bit on IO25/32/33/27 (firmware smart-light.ino)",
      ],
      safety: [
        "Size the MOSFETs + copper for the strip current; add a heatsink/pour above ~2 A/ch.",
        "Reverse-polarity diode + fuse on Vin; TVS across Vin for surge.",
        "Keep PWM traces short; star-ground the returns to avoid colour cross-talk.",
        "Aux relay contacts rated for the auxiliary load only (not the strip).",
      ],
    },
    pins: [
      { sig: "RGB_R_PIN", gpio: 32, net: "-> Q1 gate (R channel)" },
      { sig: "RGB_G_PIN", gpio: 33, net: "-> Q2 gate (G channel)" },
      { sig: "RGB_B_PIN", gpio: 27, net: "-> Q3 gate (B channel)" },
      { sig: "WHITE_PWM_PIN", gpio: 25, net: "-> Q4 gate (W channel)" },
      { sig: "RELAY_PIN", gpio: 26, net: "-> PC1 -> Q5 -> K1 (aux fixture)" },
      { sig: "BTN_PIN", gpio: 0, net: "SW1 on/off + preset (also BOOT)" },
    ],
    board: {
      layers: "2-layer FR4, 1.6 mm, HASL lead-free, 1-2 oz copper on channels.",
      iso: "Low-voltage DC only - no mains isolation required.",
      size: "55 x 40 mm", mounts: "2x M3",
      extra: ["Copper pour + optional heatsink on the MOSFET drains for high-current strips."],
      dfm: ["ERC/DRC clean at fab rules", "Reverse-polarity diode + fuse on Vin", "MOSFET + trace width sized for per-channel current", "Test points: Vin, 5V, 3V3, GND, IO25/32/33/27/26", "UART/EN/IO0 pads for the flashing jig; fiducials"],
      bringup: ["Rails before ESP32; flash test firmware over jig", "Each colour + white fades smoothly; aux relay clicks", "Button cycles presets offline", "Cloud sync self-test; scene fires"],
    },
    bom: [
      ["U1", "1", "ESP32-WROOM-32E (4MB)", "SMD module", "Wi-Fi/BLE MCU module", "Main controller"],
      ["U3", "1", "MP1584 buck", "module/SMD", "12-24V -> 5V DC-DC", "Strip PSU rail"],
      ["U2", "1", "AMS1117-3.3", "SOT-223", "5V -> 3.3V LDO", "MCU rail"],
      ["Q1-Q4", "4", "AO3400 / IRLZ44N", "SOT-23 / TO-220", "N-MOSFET PWM channels", "R/G/B/W"],
      ["Q5", "1", "S8050", "SOT-23", "NPN relay driver", "Aux"],
      ["PC1", "1", "PC817", "DIP-4", "Opto-isolator", "Aux relay"],
      ["K1", "1", "SRD-05VDC-SL-C", "THT relay", "5V SPDT", "Aux fixture"],
      ["D1", "1", "1N4007", "DO-41", "Flyback diode", "Aux coil"],
      ["D2", "1", "SS34", "SMA", "Reverse-polarity diode", "Vin"],
      ["TVS1", "1", "SMBJ33A", "SMB", "Transient suppressor", "Vin surge"],
      ["F1", "1", "5A", "1206 fuse", "Input fuse", ""],
      ["SW1", "1", "Tactile 6mm", "THT", "Button / BOOT", ""],
      ["LED0", "1", "Green 3mm", "THT", "Power/online", ""],
      ["J1", "1", "2P 5.08mm + barrel", "terminal", "Vin +/-", ""],
      ["J2", "1", "5P 5.08mm", "terminal", "+V R G B W", "Strip out"],
      ["J3", "1", "2P 5.08mm", "terminal", "Aux dry contact", ""],
      ["JP", "1", "3P 2.54mm", "header", "UART (TX/RX/GND)", "Factory flashing"],
      ["R1-R12", "12", "100R/100k/10k/330", "0805", "Gate/pull/LED resistors", ""],
      ["C1", "1", "470uF/35V", "electrolytic", "Vin bulk", ""],
      ["C2-C3", "2", "100uF", "electrolytic", "5V + 3.3V", ""],
      ["C4-C7", "4", "100nF", "0805", "Decoupling", ""],
      ["PCB", "1", "2-layer FR4 1.6mm", "-", "Main board", "MOSFET thermal pour"],
      ["ENC", "1", "ABS inline box (UL94 V-0)", "-", "Strip controller box", "DC + terminal outs"],
    ],
    enc: {
      type: "small inline ABS box (UL94 V-0), white + amber accent, for LED-strip installs.",
      size: "60 x 45 x 22 mm. 2x M3 / adhesive pad.",
      front: "1 status LED + 1 button + brand area (recessed for label.svg).",
      openings: "DC barrel/terminal in; 5-way strip terminal out; aux terminal.",
      tooling: "injection mould (2 cavities); validate against PCB (55 x 40 mm).",
      carton: "E-flute, 4-color + matte lam, spot-UV logo",
      owes: "3D STEP, thermal test at full strip current, drop-test on the assembled unit.",
    },
    label: {
      brand: "Smart Light", title: "Wi-Fi RGBW LED Controller",
      lines: ["Model: CV-LED    Type: smart-light", "Input: 12-24V DC", "4ch RGBW PWM + aux relay", "Scenes . Dimming . Wi-Fi 2.4GHz", "Warranty: 12 months"],
      warn: "Match strip voltage to the DC PSU.",
    },
    box: { title: "Smart Light", sub: ["RGBW Controller", "Scenes . Dimming"], strip: "16M colours . Tunable white . Fades" },
    listing: {
      title: "Circuvent Smart Light Controller | Wi-Fi RGBW LED Strip Controller (12-24V) | 16M Colours, Tunable White, Scenes & Dimming | App + Alexa/Google | Made in India",
      category: "Home Improvement > Smart Home > Smart Lighting", vertical: "Smart Lighting",
      bullets: [
        "16 MILLION COLOURS + WHITE: Drive RGBW strips with a dedicated white channel for true warm/cool tones.",
        "SCENES & SMOOTH DIMMING: 8-bit PWM fades, colour scenes, schedules and wake/sleep effects.",
        "AUX FIXTURE RELAY: Switch a second lamp on/off from the same controller.",
        "APP + VOICE: Control from the Circuvent app, web, the on-unit button or Alexa/Google.",
        "EASY & MADE IN INDIA: 60-second Wi-Fi setup, OTA updates, 12-month warranty.",
      ],
      description: "The Circuvent Smart Light Controller turns any 12-24 V RGBW LED strip into an app- and voice-controlled light with millions of colours, tunable white and smooth scene dimming. Four MOSFET channels drive the strip; an auxiliary relay switches a separate fixture. Match the strip voltage to your DC power supply and stay within the per-channel current.",
      aplus: ["Hero: RGBW strip + colour wheel.", "Tunable white + scenes.", "Aux relay for a second light.", "App + voice control.", "Wiring diagram (Vin, R/G/B/W).", "Specs + warranty + Made in India."],
      keywords: "rgbw led controller wifi, smart led strip controller india, tunable white led controller, alexa led strip controller, 12v 24v smart led controller",
    },
    manual: {
      sections: [
        { t: "Connect the strip", steps: ["Match your strip voltage (12 or 24 V) to a DC PSU of adequate current.", "Wire strip +V to J2 (+V) and R/G/B/W to their terminals.", "Connect the DC PSU to J1 (observe polarity). Optionally wire an aux lamp to J3."] },
        { t: "Power on & connect to Wi-Fi", steps: ["The status LED shows power.", "On your phone, join Wi-Fi \"Circuvent-Setup-XXXX\".", "Open the setup page (or http://192.168.4.1); pick your Wi-Fi, Save & connect."] },
        { t: "Link account + voice", steps: ["Open the Circuvent app -> Add a device -> enter the Device ID + Key.", "Optionally discover it in Alexa/Google as a light."] },
        { t: "Use it", steps: ["Pick colours or white; drag brightness.", "Tap scenes (Relax, Party, Reading) or set schedules.", "Button: press to cycle on/off + presets (works offline)."] },
      ],
      trouble: ["Wrong colours: check the R/G/B/W wiring order at J2.", "Flicker at low brightness: use a PSU with enough headroom; keep strip runs within spec.", "Offline: hold the button ~5 s to reopen the Wi-Fi setup portal."],
    },
  },
  {
    folder: "smart-fan", slug: "smart-fan", model: "CV-FAN", name: "Smart Fan",
    product: "Smart Fan Regulator", fwVer: "2.0.0",
    accent: "#38bdf8", accent2: "#0ea5e9", illus: "fan",
    kicadDesc: "ESP32 BLDC/DC fan regulator: relay + 25kHz PWM to 0-10V speed. Capture schematic from SCHEMATIC.md.",
    kicadVars: { SPEEDS: "6", SPEED_SIGNAL: "0-10V/PWM", MAINS_CREEPAGE_MM: "8" },
    summary: "A Wi-Fi smart regulator for BLDC and DC fans - on/off plus smooth, buzz-free speed control from the app, voice or the on-unit button.",
    features: [
      "**Smooth speed control:** 25 kHz PWM filtered to a 0-10 V signal drives BLDC-fan speed (no hum).",
      "**Hard on/off relay:** fully cuts fan power when off.",
      "**6 preset speeds** + schedules; boot-state restore.",
      "**Local button** cycles speed, online or offline.",
      "Zero-touch Wi-Fi setup; secure OTA updates.",
    ],
    specs: [
      ["Supply", "100-240 V AC, 50/60 Hz"], ["Fan types", "BLDC (PWM/0-10 V input) or DC fan (via MOSFET)"],
      ["Speed signal", "25 kHz PWM, filtered to 0-10 V"], ["On/off", "1x SPDT relay"],
      ["Presets", "6 speeds"], ["Connectivity", "Wi-Fi 2.4 GHz (ESP32)"],
      ["Operating temp", "0-50 degC"], ["Warranty", "12 months"],
    ],
    state: "`power`, `speed` (0-100), `preset`.",
    commands: "`{power}`, `{speed}`, `{preset}`.",
    compliance: ["BIS / CRS registration (mains appliance)", "WPC/ETA for the 2.4 GHz radio", "IEC 60335 safety + CISPR EMC; RoHS; e-waste marks"],
    inBox: "Fan regulator \u00b7 wiring guide (`MANUAL.md`) \u00b7 warranty card.",
    safetyNote: "Install by a qualified electrician. Use only with fans that accept a 0-10 V/PWM input, or a DC fan on the MOSFET output.",
    schem: {
      intro: "ESP32 fan regulator. A relay switches fan power; a 25 kHz PWM output is RC-filtered and op-amp buffered to a 0-10 V speed signal for BLDC fans, or drives an N-MOSFET for DC fans. Mains and LV logic are isolated (HLK PSU + opto).",
      power: [
        "J1(L) --[F1 2A]--+--[RV1 MOV]--+--> PS1.AC-L (HLK-PM03)",
        "J1(N) -----------+-------------+--> PS1.AC-N",
        "PS1.+5V -> 5V rail (K1 coil, U2.IN, U3 buffer) ; PS1.-V -> GND",
        "U2 AMS1117-3.3 -> 3V3 (ESP32) ; C1 470u 5V ; C2 100u 3V3 ; C3..C6 100n",
      ],
      driveTitle: "Relay + speed output",
      drive: [
        "IO26 --[1k]--> PC1.anode ; PC1.collector-> Q1.base -> K1 coil(-) ; K1 coil(+)->5V ; D1 across coil",
        "K1 COM-> mains L ; K1 NO -> J2 (fan L) ; N common",
        "IO25 (25 kHz PWM) --[R 10k]--+--[C 1u]->GND (RC ~16 Hz) -> U3 op-amp x3.03 -> 0-10 V @ J3",
        "DC-fan option: IO25 -> Qm (N-MOSFET) gate ; fan+ -> Vfan ; fan- -> Qm drain",
      ],
      safety: [
        "Fuse + MOV at entry; relay pad wide; 2 oz copper on mains.",
        ">= 8 mm creepage / 6 mm clearance mains-to-LV; isolation slot under the opto + PSU.",
        "0-10 V output referenced to the fan-control ground; keep the speed signal off the mains island.",
        "Silk: shock warning, ratings, serial/QR, CE/BIS mark area.",
      ],
    },
    pins: [
      { sig: "FAN_RELAY", gpio: 26, net: "-> PC1 -> Q1 -> K1 coil (fan power)" },
      { sig: "SPEED_PWM_PIN", gpio: 25, net: "-> RC filter -> U3 buffer -> J3 (0-10 V) / Qm gate (DC)" },
      { sig: "BTN_PIN", gpio: 0, net: "SW1 speed cycle (also BOOT)" },
    ],
    board: {
      layers: "2-layer FR4, 1.6 mm, HASL lead-free, 2 oz copper on mains.",
      iso: ">= 8 mm creepage / 6 mm clearance mains-to-LV; isolation slots.",
      size: "55 x 45 mm", mounts: "2x M3",
      extra: ["Op-amp + RC near IO25; guard the 0-10 V trace from PWM/mains coupling."],
      dfm: ["ERC/DRC clean at fab rules; mains clearances as keepout", "Fuse + MOV at entry; relay pad wide", "RC + op-amp gain verified for full 0-10 V swing", "Test points: 5V, 3V3, GND, IO26/25, 0-10 V out", "UART/EN/IO0 pads for the flashing jig; fiducials"],
      bringup: ["Rails before ESP32; flash test firmware over jig", "Relay clicks + powers the fan; 0-10 V ramps 0-100%", "Button cycles presets offline", "Cloud sync self-test; schedule fires"],
    },
    bom: [
      ["U1", "1", "ESP32-WROOM-32E (4MB)", "SMD module", "Wi-Fi/BLE MCU module", "Main controller"],
      ["PS1", "1", "HLK-PM03 (5V 3W)", "SIP", "230VAC -> 5VDC isolated PSU", "Relay + logic"],
      ["U2", "1", "AMS1117-3.3", "SOT-223", "5V -> 3.3V LDO", "MCU rail"],
      ["U3", "1", "MCP6002", "SOIC-8", "Rail-to-rail op-amp", "0-10 V speed buffer"],
      ["PC1", "1", "PC817", "DIP-4", "Opto-isolator", "Relay drive"],
      ["Q1", "1", "S8050", "SOT-23", "NPN relay driver", ""],
      ["Qm", "1", "IRLZ44N", "TO-220", "N-MOSFET (DC-fan option)", "Optional"],
      ["D1", "1", "1N4007", "DO-41", "Flyback diode", "Relay coil"],
      ["K1", "1", "SRD-05VDC-SL-C", "THT relay", "5V SPDT", "Fan power"],
      ["RV1", "1", "7D471K", "disc", "MOV 470V", "Mains surge clamp"],
      ["F1", "1", "2A slow-blow", "5x20 holder", "Mains fuse", ""],
      ["SW1", "1", "Tactile 6mm", "THT", "Button / BOOT", ""],
      ["LED0", "1", "Green 3mm", "THT", "Power/online", ""],
      ["J1", "1", "2P 5.08mm", "terminal", "Mains L/N in", ""],
      ["J2", "1", "2P 5.08mm", "terminal", "Fan power out", ""],
      ["J3", "1", "3P 5.08mm", "terminal", "0-10 V + GND (+ DC fan)", ""],
      ["JP", "1", "3P 2.54mm", "header", "UART (TX/RX/GND)", "Factory flashing"],
      ["R1-R10", "10", "10k/1k/330 + RC", "0805", "Pull/base/LED/filter", ""],
      ["C1", "1", "470uF/10V", "electrolytic", "5V bulk", ""],
      ["C2", "1", "100uF/6.3V", "electrolytic", "3.3V rail", ""],
      ["Cf", "1", "1uF film", "0805", "RC filter cap", "0-10 V smoothing"],
      ["C3-C6", "4", "100nF", "0805", "Decoupling", ""],
      ["PCB", "1", "2-layer FR4 1.6mm", "-", "Main board", ">=8mm mains-LV creepage; 2oz Cu"],
      ["ENC", "1", "ABS wall box (UL94 V-0)", "-", "Regulator box", "Button + LED + brand area"],
    ],
    enc: {
      type: "modular/wall ABS box (UL94 V-0), white + sky accent; mounts near the fan point.",
      size: "90 x 55 x 32 mm. 2x M3.",
      front: "1 status LED + 1 button + brand area (recessed for label.svg).",
      openings: "cable entries for mains in, fan power out, and the 0-10 V lead.",
      tooling: "injection mould (2 cavities); validate against PCB (55 x 45 mm).",
      carton: "E-flute, 4-color + matte lam, spot-UV logo",
      owes: "3D STEP, drop-test, creepage validation + fan-compatibility list on the assembled unit.",
    },
    label: {
      brand: "Smart Fan", title: "Wi-Fi Fan Regulator (BLDC)",
      lines: ["Model: CV-FAN    Type: smart-fan", "Input: 100-240V ~ 50/60Hz", "Relay on/off + 0-10V speed", "6 speeds . Wi-Fi 2.4GHz", "Warranty: 12 months"],
      warn: "RISK OF SHOCK - Qualified electrician install only.",
    },
    box: { title: "Smart Fan", sub: ["Fan Regulator", "BLDC / DC"], strip: "6 speeds . App . Voice . Schedules" },
    listing: {
      title: "Circuvent Smart Fan Regulator | Wi-Fi Speed Controller for BLDC & DC Fans | Smooth 6-Speed Control, Schedules & Voice | App + Alexa/Google | Made in India",
      category: "Home Improvement > Smart Home > Fan Controllers", vertical: "Fan Regulators",
      bullets: [
        "SMOOTH, BUZZ-FREE SPEED: A 0-10 V/PWM signal drives BLDC fans across 6 speeds with no hum.",
        "ON/OFF + SPEED: A relay cuts power when off; the app or button sets the speed.",
        "SCHEDULES & SCENES: Auto-slow at night, boost on a hot afternoon, or group into scenes.",
        "APP + VOICE: Control from the Circuvent app, web, on-unit button or Alexa/Google.",
        "MADE IN INDIA: 60-second Wi-Fi setup, OTA updates, 12-month warranty.",
      ],
      description: "The Circuvent Smart Fan Regulator adds app, schedule and voice control to modern BLDC fans (and DC fans) with smooth, silent speed control. A relay switches fan power while a filtered 0-10 V signal sets the speed across six presets. Installation by a qualified electrician; use with fans that accept a 0-10 V/PWM speed input.",
      aplus: ["Hero: fan + speed dial.", "Silent BLDC speed control.", "6 presets + schedules.", "App + voice.", "Wiring diagram.", "Specs + warranty + Made in India."],
      keywords: "smart fan regulator wifi, bldc fan speed controller, smart fan controller india, alexa fan regulator, wifi ceiling fan regulator",
    },
    manual: {
      sections: [
        { t: "Wire (electrician)", steps: ["Switch off the mains at the board.", "Connect incoming L/N to J1 (through the fuse).", "Connect fan power to J2; connect the fan's 0-10 V speed lead to J3 (or a DC fan to the MOSFET terminals).", "Mount in a modular box near the fan point."] },
        { t: "Power on & connect to Wi-Fi", steps: ["Power on - the green LED shows power.", "Join Wi-Fi \"Circuvent-Setup-XXXX\" on your phone.", "Open the setup page (or http://192.168.4.1); pick your Wi-Fi, Save & connect."] },
        { t: "Link account + voice", steps: ["Open the Circuvent app -> Add a device -> enter the Device ID + Key.", "Optionally discover it in Alexa/Google as a fan."] },
        { t: "Use it", steps: ["Drag the speed slider or tap a preset.", "Button: press to cycle speed (works offline).", "Schedules: auto-set speed by time of day."] },
      ],
      trouble: ["Fan won't vary speed: confirm it accepts a 0-10 V/PWM input (older AC fans need a TRIAC variant).", "Buzzing at low speed: use the 0-10 V output, not raw PWM, into the fan.", "Offline: hold the button ~5 s to reopen the Wi-Fi setup portal."],
    },
  },
  {
    folder: "smart-lock", slug: "smart-lock", model: "CV-LOCK", name: "Smart Lock",
    product: "Smart Lock Controller", fwVer: "2.0.0",
    accent: "#7c3aed", accent2: "#a78bfa", illus: "lock",
    kicadDesc: "ESP32 12V electric-lock controller: relay + flyback + door reed. Capture schematic from SCHEMATIC.md.",
    kicadVars: { VIN: "12V", OUTPUT: "strike/solenoid/motor", DOOR_SENSE: "reed" },
    summary: "A Wi-Fi controller for electric strikes, solenoid bolts and motorized locks - lock/unlock from the app or a button, with door-state sensing and auto-lock.",
    features: [
      "**Drives 12 V strikes/solenoids/motor bolts** via a rated relay + flyback protection.",
      "**Door sensor input** (reed) reports open/closed and can auto-lock on close.",
      "**Auto-lock timer** + manual button + status LED (on = locked).",
      "**Fail-safe / fail-secure** wiring options for local codes.",
      "Zero-touch Wi-Fi setup; secure OTA updates.",
    ],
    specs: [
      ["Supply", "12 V DC (lock PSU)"], ["Output", "1x SPDT relay for 12 V strike/solenoid/motor"],
      ["Protection", "Flyback + RC snubber on the lock coil"], ["Door sensor", "1x reed/dry-contact input"],
      ["Local control", "1 button + status LED"], ["Connectivity", "Wi-Fi 2.4 GHz (ESP32)"],
      ["Operating temp", "0-50 degC"], ["Warranty", "12 months"],
    ],
    state: "`locked`, `door`, `uptime`.",
    commands: "`{lock}`, `{unlock}`, `{autolock:sec}`.",
    compliance: ["WPC/ETA for the 2.4 GHz radio", "CISPR EMC; RoHS; e-waste marks", "Fail-safe egress behaviour per local fire/building code (installer)"],
    inBox: "Lock controller \u00b7 flyback diode \u00b7 wiring guide (`MANUAL.md`) \u00b7 warranty card. (Lock + 12 V PSU sold separately.)",
    safetyNote: "For access control, follow local fire/egress codes. Verify fail-safe (unlock-on-power-loss) or fail-secure behaviour matches your requirement.",
    schem: {
      intro: "ESP32 electric-lock controller. A relay switches a 12 V strike/solenoid/motor; a flyback + snubber protect against the coil kick. A reed input senses the door. DC input; no mains on-board.",
      power: [
        "J1(+12V) -> U3 buck (MP1584) -> 5V -> U2 AMS1117 -> 3V3 (ESP32)",
        "J1(GND) -> GND ; C1 470u on 12V (solenoid inrush) ; C2 100u 5V ; C3 100u 3V3 ; C4..C6 100n",
        "D3 (SS34) reverse-polarity + F1 on the 12 V input",
      ],
      driveTitle: "Lock drive (relay + flyback)",
      drive: [
        "IO26 --[1k]--> PC1.anode ; PC1.collector-> Q1.base -> K1 coil(-) ; K1 coil(+)->5V ; D1 across coil",
        "K1 COM-> +12V ; K1 NO/NC -> J2 (pick fail-secure/fail-safe) ; D2 (1N5408) + RC snubber across the lock coil",
        "Status: IO2 -> LED1 (on = locked)",
      ],
      sensorTitle: "Door sensor (optional provision)",
      sensor: [
        "J3 reed switch -> IO33 (INPUT_PULLUP), closes to GND when the door is shut",
        "Firmware hook publishes door state + can auto-lock on close",
      ],
      safety: [
        "The 12 V coil needs a flyback (D2) + optional RC snubber to protect the relay contacts.",
        "Bulk cap on 12 V for solenoid inrush; size the relay for the lock's coil current.",
        "Fail-safe (unlocks on power loss) vs fail-secure: choose per local egress/fire code.",
        "Fuse + reverse-polarity diode on the 12 V input; strain-relieve the lock cable.",
      ],
    },
    pins: [
      { sig: "LOCK_RELAY", gpio: 26, net: "-> PC1 -> Q1 -> K1 coil -> J2 lock output" },
      { sig: "LED_PIN", gpio: 2, net: "-> LED1 (on = locked)" },
      { sig: "BTN_PIN", gpio: 0, net: "SW1 lock/unlock (also BOOT)" },
    ],
    board: {
      layers: "2-layer FR4, 1.6 mm, HASL lead-free.",
      iso: "Low-voltage DC only; keep the 12 V coil loop tight with its flyback.",
      size: "50 x 40 mm", mounts: "2x M3",
      extra: ["Snubber + flyback right at the relay; bulk cap near J1 for inrush."],
      dfm: ["ERC/DRC clean at fab rules", "Flyback + snubber across the lock coil verified", "Reverse-polarity diode + fuse on Vin", "Test points: 12V, 5V, 3V3, GND, IO26/2/33", "UART/EN/IO0 pads for the flashing jig; fiducials"],
      bringup: ["Rails before ESP32; flash test firmware over jig", "Relay drives the lock; LED shows locked; button toggles offline", "Reed reads door open/closed; auto-lock fires", "Cloud sync self-test"],
    },
    bom: [
      ["U1", "1", "ESP32-WROOM-32E (4MB)", "SMD module", "Wi-Fi/BLE MCU module", "Main controller"],
      ["U3", "1", "MP1584 buck", "module/SMD", "12V -> 5V DC-DC", "Logic rail"],
      ["U2", "1", "AMS1117-3.3", "SOT-223", "5V -> 3.3V LDO", "MCU rail"],
      ["PC1", "1", "PC817", "DIP-4", "Opto-isolator", "Relay drive"],
      ["Q1", "1", "S8050", "SOT-23", "NPN relay driver", ""],
      ["K1", "1", "SRD-05VDC-SL-C", "THT relay", "5V SPDT 10A", "Switch 12V lock"],
      ["D1", "1", "1N4007", "DO-41", "Flyback (relay coil)", ""],
      ["D2", "1", "1N5408", "DO-201", "Flyback (lock coil)", "Across solenoid"],
      ["D3", "1", "SS34", "SMA", "Reverse-polarity", "Vin"],
      ["F1", "1", "3A", "1206 fuse", "Input fuse", ""],
      ["SW1", "1", "Tactile 6mm", "THT", "Button / BOOT", ""],
      ["LED0", "1", "Green 3mm", "THT", "Power/online", ""],
      ["LED1", "1", "Violet 3mm", "THT", "Locked status", ""],
      ["J1", "1", "2P 5.08mm", "terminal", "12V in +/-", ""],
      ["J2", "1", "3P 5.08mm", "terminal", "Lock COM/NO/NC", ""],
      ["J3", "1", "2P 2.54mm", "header", "Door reed", ""],
      ["JP", "1", "3P 2.54mm", "header", "UART (TX/RX/GND)", "Factory flashing"],
      ["R1-R8", "8", "10k/1k/330", "0805", "Pull/base/LED resistors", ""],
      ["Rsn/Csn", "2", "100R + 100nF", "0805/film", "RC snubber", "Lock coil"],
      ["C1", "1", "470uF/25V", "electrolytic", "12V bulk (inrush)", ""],
      ["C2-C3", "2", "100uF", "electrolytic", "5V + 3.3V", ""],
      ["C4-C6", "3", "100nF", "0805", "Decoupling", ""],
      ["PCB", "1", "2-layer FR4 1.6mm", "-", "Main board", "Tight coil loop"],
      ["ENC", "1", "ABS box (UL94 V-0)", "-", "Controller box", "Near door frame"],
    ],
    enc: {
      type: "compact ABS box (UL94 V-0), white + violet accent; mounts by the door frame or in the ceiling void.",
      size: "70 x 45 x 25 mm. 2x M3.",
      front: "1 status LED (locked) + 1 button + brand area.",
      openings: "cable entries for 12 V in, lock output and the door reed.",
      tooling: "injection mould (2 cavities); validate against PCB (50 x 40 mm).",
      carton: "E-flute, 4-color + matte lam, spot-UV logo",
      owes: "3D STEP, endurance cycling of the relay against the target lock, drop-test.",
    },
    label: {
      brand: "Smart Lock", title: "Wi-Fi Electric-Lock Controller",
      lines: ["Model: CV-LOCK    Type: smart-lock", "Input: 12V DC", "Relay out (strike/solenoid/motor)", "Door reed input . Wi-Fi 2.4GHz", "Warranty: 12 months"],
      warn: "Verify fail-safe behaviour on power loss.",
    },
    box: { title: "Smart Lock", sub: ["Lock Controller", "Door sensing"], strip: "Lock/Unlock . Auto-lock . App . Reed" },
    listing: {
      title: "Circuvent Smart Lock Controller | Wi-Fi Controller for Electric Strikes, Solenoid Bolts & Motor Locks (12V) | App Lock/Unlock, Door Sensor & Auto-Lock | Made in India",
      category: "Home Improvement > Smart Home > Smart Locks", vertical: "Access Control",
      bullets: [
        "MAKE ANY 12V LOCK SMART: Drives electric strikes, solenoid bolts and motor locks with proper flyback protection.",
        "APP LOCK/UNLOCK: Lock or unlock from the Circuvent app or the on-unit button, with a status LED.",
        "DOOR SENSOR + AUTO-LOCK: A reed input reports open/closed and can auto-lock the door on close.",
        "FAIL-SAFE OR FAIL-SECURE: Wire for unlock-on-power-loss or stay-locked per your building's code.",
        "SECURE & MADE IN INDIA: 60-second Wi-Fi setup, OTA updates, 12-month warranty.",
      ],
      description: "The Circuvent Smart Lock Controller adds Wi-Fi lock/unlock, door sensing and auto-lock to existing 12 V electric strikes, solenoid bolts and motorized locks. A protected relay drives the lock while a reed input tracks the door. Choose fail-safe or fail-secure wiring to match local fire and egress codes. Lock hardware and 12 V supply are sold separately.",
      aplus: ["Hero: door + lock/unlock.", "Works with strikes/solenoids/motors.", "Door sensor + auto-lock.", "Fail-safe vs fail-secure.", "Wiring diagram + protection.", "Specs + warranty + Made in India."],
      keywords: "wifi electric lock controller, smart door strike controller, solenoid lock wifi india, auto lock controller, access control wifi module",
    },
    manual: {
      sections: [
        { t: "Mount & wire the lock", steps: ["Power off the 12 V supply.", "Wire the lock to J2: use COM+NO for fail-secure (locked without power) or COM+NC for fail-safe (unlocked without power).", "Fit the supplied flyback diode across the lock coil (polarity as marked).", "Optionally wire a door reed to J3. Connect the 12 V supply to J1 (observe polarity)."] },
        { t: "Power on & connect to Wi-Fi", steps: ["The status LED shows the lock state.", "Join Wi-Fi \"Circuvent-Setup-XXXX\" on your phone.", "Open the setup page (or http://192.168.4.1); pick your Wi-Fi, Save & connect."] },
        { t: "Link to your account", steps: ["Open the Circuvent app -> Add a device -> enter the Device ID + Key.", "The lock appears with lock/unlock, door state and auto-lock."] },
        { t: "Use it", steps: ["Tap lock/unlock in the app, or press the button.", "Set an auto-lock timer (e.g., re-lock 10 s after unlock).", "Enable auto-lock-on-close if a reed is fitted."] },
      ],
      trouble: ["Lock buzzes/chatters: check the flyback + snubber and that the 12 V supply meets the lock's current.", "Wrong behaviour on power loss: swap NO/NC at J2 for fail-safe vs fail-secure.", "Door state stuck: check the reed gap and wiring at J3."],
    },
  },
  {
    folder: "curtain", slug: "curtain", model: "CV-CURT", name: "Curtain Control",
    product: "Smart Curtain & Blind Controller", fwVer: "2.0.0",
    accent: "#14b8a6", accent2: "#2dd4bf", illus: "curtain",
    kicadDesc: "ESP32 curtain/blind motor controller: 2 interlocked relays. Capture schematic from SCHEMATIC.md.",
    kicadVars: { MOTOR: "AC tubular", INTERLOCK: "yes", MAINS_CREEPAGE_MM: "8" },
    summary: "A Wi-Fi controller for curtain and blind motors - open, close, stop and set any position from the app, wall buttons or voice.",
    features: [
      "**Open / close / stop** an AC tubular curtain or roller-blind motor via two interlocked relays.",
      "**Set % position** with travel-time calibration; presets and schedules (sunrise/sunset).",
      "**3 wall buttons** (open/close/stop) that work offline.",
      "**Safe interlock:** the open and close relays can never energise together.",
      "Zero-touch Wi-Fi setup; secure OTA updates.",
    ],
    specs: [
      ["Supply", "100-240 V AC, 50/60 Hz"], ["Motor", "AC tubular curtain/blind, <= 6 A"],
      ["Outputs", "2x SPDT relay (open/close), interlocked"], ["Local control", "3 buttons (open/close/stop)"],
      ["Position", "travel-time based %"], ["Connectivity", "Wi-Fi 2.4 GHz (ESP32)"],
      ["Operating temp", "0-50 degC"], ["Warranty", "12 months"],
    ],
    state: "`position` (0-100), `moving`, `direction`.",
    commands: "`{open}`, `{close}`, `{stop}`, `{position}`, `{calibrate}`.",
    compliance: ["BIS / CRS registration (mains appliance)", "WPC/ETA for the 2.4 GHz radio", "IEC 60335 safety + CISPR EMC; RoHS; e-waste marks"],
    inBox: "Curtain controller \u00b7 wiring guide (`MANUAL.md`) \u00b7 warranty card.",
    safetyNote: "Install by a qualified electrician. The motor must be an AC tubular type with separate open/close windings; observe the current limit.",
    schem: {
      intro: "ESP32-based curtain/blind controller. Two opto-isolated relays drive an AC tubular motor's open and close windings; a hardware + firmware interlock prevents both energising at once. Three buttons give local control. Mains and LV logic are isolated (HLK PSU + opto).",
      power: [
        "J1(L) --[F1 3A]--+--[RV1 MOV]--+--> PS1.AC-L (HLK-PM03)",
        "J1(N) -----------+-------------+--> PS1.AC-N",
        "PS1.+5V -> 5V rail (K1/K2 coils, U3/U4.IN) ; PS1.-V -> GND",
        "U2 AMS1117-3.3 -> 3V3 (ESP32) ; C1 470u 5V ; C2 100u 3V3 ; C3..C6 100n",
      ],
      driveTitle: "Interlocked motor relays (x2, opto-isolated)",
      drive: [
        "IOxx --[1k]--> PCn.anode ; PCn.collector-> Qn.base -> Kn coil(-) ; Kn coil(+)->5V ; Dn across coil",
        "K1 NO -> motor OPEN lead ; K2 NO -> motor CLOSE lead ; motor common -> N",
        "Interlock: K1 NC in series with K2 coil (and vice-versa) so only one can close",
        "Buttons SW1/2/3 -> IO32/33/0 (INPUT_PULLUP to GND): open / close / stop (offline)",
      ],
      safety: [
        "Hardware interlock (NC contacts cross-wired) plus a firmware guard: never energise both.",
        "Add a short reversing dead-time in firmware before changing direction.",
        "Fuse + MOV at entry; 2 oz copper on mains; relay pads wide.",
        ">= 8 mm creepage / 6 mm clearance mains-to-LV; isolation slots under optos + PSU.",
        "Silk: shock warning, ratings, serial/QR, CE/BIS mark area.",
      ],
    },
    pins: [
      { sig: "MOTOR_OPEN_PIN", gpio: 26, net: "-> PC1 -> Q1 -> K1 (open winding)" },
      { sig: "MOTOR_CLOSE_PIN", gpio: 27, net: "-> PC2 -> Q2 -> K2 (close winding)" },
      { sig: "BTN_OPEN", gpio: 32, net: "SW1 open (INPUT_PULLUP -> GND)" },
      { sig: "BTN_CLOSE", gpio: 33, net: "SW2 close (INPUT_PULLUP -> GND)" },
      { sig: "BTN_STOP", gpio: 0, net: "SW3 stop (also BOOT/config)" },
    ],
    board: {
      layers: "2-layer FR4, 1.6 mm, HASL lead-free, 2 oz copper on mains.",
      iso: ">= 8 mm creepage / 6 mm clearance mains-to-LV; isolation slots.",
      size: "70 x 50 mm", mounts: "2x M3",
      extra: ["Cross-wire the relay NC contacts for the hardware interlock; label OPEN/CLOSE on silk."],
      dfm: ["ERC/DRC clean at fab rules; mains clearances as keepout", "Hardware interlock (NC cross-wire) verified on the netlist", "Fuse + MOV at entry; relay pads wide", "Test points: 5V, 3V3, GND, IO26/27, IO32/33/0", "UART/EN/IO0 pads for the flashing jig; fiducials"],
      bringup: ["Rails before ESP32; flash test firmware over jig", "Open + close each drive the motor; both-on is physically impossible", "Buttons work offline; travel-time calibration sets 0-100%", "Cloud sync self-test; schedule fires"],
    },
    bom: [
      ["U1", "1", "ESP32-WROOM-32E (4MB)", "SMD module", "Wi-Fi/BLE MCU module", "Main controller"],
      ["PS1", "1", "HLK-PM03 (5V 3W)", "SIP", "230VAC -> 5VDC isolated PSU", "2 relay coils + logic"],
      ["U2", "1", "AMS1117-3.3", "SOT-223", "5V -> 3.3V LDO", "MCU rail"],
      ["U3-U4", "2", "PC817", "DIP-4", "Opto-isolators", "Open + close"],
      ["Q1-Q2", "2", "S8050", "SOT-23", "NPN relay drivers", ""],
      ["D1-D2", "2", "1N4007", "DO-41", "Flyback diodes", "Across each coil"],
      ["K1-K2", "2", "SRD-05VDC-SL-C", "THT relay", "5V SPDT 10A", "Open / close (interlocked)"],
      ["RV1", "1", "7D471K", "disc", "MOV 470V", "Mains surge clamp"],
      ["F1", "1", "3A slow-blow", "5x20 holder", "Mains fuse", ""],
      ["SW1-SW3", "3", "Tactile 6mm", "THT", "Open / close / stop", ""],
      ["LED0", "1", "Green 3mm", "THT", "Power/online", ""],
      ["LED1-LED2", "2", "Teal 3mm", "THT", "Direction status", ""],
      ["J1", "1", "2P 5.08mm", "terminal", "Mains L/N in", ""],
      ["J2", "1", "3P 5.08mm", "terminal", "Open / close / common", "Motor"],
      ["JP", "1", "3P 2.54mm", "header", "UART (TX/RX/GND)", "Factory flashing"],
      ["R1-R10", "10", "10k/1k/330", "0805", "Pull/base/LED resistors", ""],
      ["C1", "1", "470uF/10V", "electrolytic", "5V bulk", ""],
      ["C2", "1", "100uF/6.3V", "electrolytic", "3.3V rail", ""],
      ["C3-C6", "4", "100nF", "0805", "Decoupling", ""],
      ["PCB", "1", "2-layer FR4 1.6mm", "-", "Main board", ">=8mm mains-LV creepage; 2oz Cu"],
      ["ENC", "1", "ABS wall box (UL94 V-0)", "-", "Controller box", "3 buttons + brand area"],
    ],
    enc: {
      type: "modular/wall ABS box (UL94 V-0), white + teal accent; mounts behind the curtain switch point.",
      size: "90 x 55 x 32 mm. 2x M3.",
      front: "3 buttons (open/close/stop) + status light-pipes + brand area.",
      openings: "cable entries for mains in + motor (open/close/common).",
      tooling: "injection mould (2 cavities); validate against PCB (70 x 50 mm).",
      carton: "E-flute, 4-color + matte lam, spot-UV logo",
      owes: "3D STEP, drop-test, motor-compatibility list + endurance cycling on the assembled unit.",
    },
    label: {
      brand: "Curtain Control", title: "Wi-Fi Curtain / Blind Controller",
      lines: ["Model: CV-CURT    Type: curtain", "Input: 100-240V ~ 50/60Hz", "AC tubular motor <= 6A", "Open/Close/Stop . Wi-Fi 2.4GHz", "Warranty: 12 months"],
      warn: "RISK OF SHOCK - Qualified electrician install only.",
    },
    box: { title: "Curtain Control", sub: ["Curtain / Blind", "Open . Close . %"], strip: "Position . Presets . Buttons . Sun times" },
    listing: {
      title: "Circuvent Smart Curtain & Blind Controller | Wi-Fi Motor Controller for AC Tubular Curtain Motors | Open/Close/Stop, % Position & Schedules | App + Alexa/Google | Made in India",
      category: "Home Improvement > Smart Home > Curtain & Blind Controllers", vertical: "Curtain Controllers",
      bullets: [
        "OPEN, CLOSE, STOP: Control your curtain or blind motor from the app, web, wall buttons or voice.",
        "SET ANY POSITION: Travel-time calibration lets you set curtains to any % - half-open, blackout, whatever.",
        "SUN SCHEDULES: Auto-open at sunrise and close at sunset, or on a timer.",
        "SAFE BY DESIGN: A hardware interlock means the open and close relays can never fight each other.",
        "MADE IN INDIA: 60-second Wi-Fi setup, OTA updates, offline buttons, 12-month warranty.",
      ],
      description: "The Circuvent Smart Curtain & Blind Controller motorises your curtains and blinds with app, schedule and voice control. It drives an AC tubular motor through two interlocked relays, supports precise % positioning via travel-time calibration, and keeps its three wall buttons working offline. Installation by a qualified electrician; use an AC tubular motor within the current limit.",
      aplus: ["Hero: curtain opening on a schedule.", "Any % position.", "Sunrise/sunset automation.", "Safe interlock.", "Wiring diagram (open/close/common).", "Specs + warranty + Made in India."],
      keywords: "smart curtain controller wifi, blind motor controller india, wifi curtain motor switch, alexa curtain controller, tubular motor smart controller",
    },
    manual: {
      sections: [
        { t: "Wire (electrician)", steps: ["Switch off the mains at the board.", "Connect incoming L/N to J1 (through the fuse).", "Connect the motor's open lead, close lead and common to J2 (open/close/common).", "Mount behind the curtain switch point."] },
        { t: "Power on & connect to Wi-Fi", steps: ["Power on - the green LED shows power.", "Join Wi-Fi \"Circuvent-Setup-XXXX\" on your phone.", "Open the setup page (or http://192.168.4.1); pick your Wi-Fi, Save & connect."] },
        { t: "Calibrate + link", steps: ["Open the Circuvent app -> Add a device -> enter the Device ID + Key.", "Run Calibrate: the controller times a full open + close to learn the travel.", "Optionally discover it in Alexa/Google as a blind."] },
        { t: "Use it", steps: ["Tap open/close/stop, or drag the position slider.", "Buttons work offline (open/close/stop).", "Schedules: open at sunrise, close at sunset, or set times."] },
      ],
      trouble: ["Direction reversed: swap the open/close leads at J2 (or flip in the app).", "Position drifts: re-run Calibrate; ensure the motor's limit switches are set.", "Offline: hold STOP/BOOT ~5 s to reopen the Wi-Fi setup portal."],
    },
  },
  {
    folder: "motion-sensor", slug: "motion-sensor", model: "CV-PIR", name: "Motion Sensor",
    product: "Wi-Fi Motion Sensor (PIR)", fwVer: "2.0.0",
    accent: "#ec4899", accent2: "#f472b6", illus: "pir",
    kicadDesc: "ESP32 PIR motion sensor (USB/battery) with optional light relay. Capture schematic from SCHEMATIC.md.",
    kicadVars: { SENSOR: "HC-SR501", POWER: "USB-C/18650", OPT_RELAY: "yes" },
    summary: "A Wi-Fi PIR motion sensor that fires instant alerts and automations - arm/disarm from the app, with an optional local relay to switch a light.",
    features: [
      "**Instant motion alerts** to the app; arm/disarm remotely.",
      "**Automations:** trigger lights, scenes or other Circuvent devices on motion.",
      "**Optional local relay** to switch a light directly (on-board provision).",
      "**USB or battery** powered (18650 variant with an on-board charger).",
      "Zero-touch Wi-Fi setup; secure OTA updates.",
    ],
    specs: [
      ["Supply", "USB-C 5 V (or 18650 Li-ion variant)"], ["Sensor", "HC-SR501 PIR, ~5-7 m / 110 deg"],
      ["Alerts", "cloud push on motion; arm/disarm"], ["Local out", "1x optional relay (light) - provision"],
      ["Connectivity", "Wi-Fi 2.4 GHz (ESP32)"], ["Operating temp", "0-50 degC"], ["Warranty", "12 months"],
    ],
    state: "`motion`, `armed`, `battery` (battery variant).",
    commands: "`{armed}`.",
    compliance: ["WPC/ETA for the 2.4 GHz radio", "CISPR EMC; RoHS; e-waste marks", "BIS for the bundled USB adapter (if included)"],
    inBox: "Motion sensor \u00b7 USB-C cable \u00b7 mounting pad + screws \u00b7 quick-start (`MANUAL.md`) \u00b7 warranty card.",
    schem: {
      intro: "ESP32 PIR motion sensor. A HC-SR501 module drives a GPIO; the ESP32 debounces and publishes motion + alerts. USB-C 5 V input (battery variant adds a TP4056 charger + 18650). An optional relay provision can switch a local light. Low voltage only.",
      power: [
        "USB-C 5V -> U2 AMS1117 -> 3V3 (ESP32) ; PIR VCC from 5V (or 3V3 module)",
        "C1 100u on 5V ; C2 100u 3V3 ; C3..C4 100n",
        "Battery variant: TP4056 charge + DW01/8205 protect + 18650 holder -> 5V",
      ],
      driveTitle: "Optional light relay (provision)",
      drive: [
        "Optional: IO26 -> Q1 -> K1 (5V relay) -> J2 dry contact ; D1 across coil",
        "Populate U3/Q1/K1/D1 only for the local-light variant",
      ],
      sensorTitle: "PIR sensor",
      sensor: [
        "HC-SR501: VCC->5V, GND->GND, OUT->IO27 (repeat-trigger mode, hold ~3-300 s)",
        "LED1 on IO2 blinks on motion / shows the armed state",
      ],
      safety: [
        "Keep the PIR dome away from heat sources, AC vents and direct sunlight to cut false triggers.",
        "If the optional relay switches mains, treat that section as mains (creepage + fuse + opto).",
        "Battery variant: use a protected 18650; TP4056 + DW01 for safe charge/discharge.",
      ],
    },
    pins: [
      { sig: "PIR_PIN", gpio: 27, net: "<- HC-SR501 OUT (3V3 logic)" },
      { sig: "LED_PIN", gpio: 2, net: "-> LED1 (motion / armed status)" },
    ],
    board: {
      layers: "2-layer FR4, 1.6 mm, HASL lead-free.",
      iso: "Low-voltage only (unless the optional mains relay is populated - then isolate it).",
      size: "45 x 35 mm", mounts: "2x M3 / adhesive",
      extra: ["Reserve a corner keep-out under the PIR dome; battery + charger on the back."],
      dfm: ["ERC/DRC clean at fab rules", "PIR OUT level matches 3V3 logic", "Optional relay section isolated if it switches mains", "Test points: 5V, 3V3, GND, IO27/2", "UART/EN/IO0 pads for the flashing jig; fiducials"],
      bringup: ["Rail before ESP32; flash test firmware over jig", "PIR triggers -> LED + cloud alert; arm/disarm works", "Battery variant: TP4056 charges; runtime measured", "Cloud sync self-test; automation fires a light"],
    },
    bom: [
      ["U1", "1", "ESP32-WROOM-32E (4MB)", "SMD module", "Wi-Fi/BLE MCU module", "Main controller"],
      ["M1", "1", "HC-SR501 PIR", "module", "PIR motion sensor", "Dome + lens"],
      ["U2", "1", "AMS1117-3.3", "SOT-223", "5V -> 3.3V LDO", "MCU rail"],
      ["J1", "1", "USB-C 16P", "SMD", "5V power in", ""],
      ["LED0", "1", "Green 3mm", "THT", "Power/online", ""],
      ["LED1", "1", "Pink 3mm", "THT", "Motion / armed", ""],
      ["R1-R6", "6", "10k/330", "0805", "Pull/LED resistors", ""],
      ["C1-C2", "2", "100uF", "electrolytic", "5V + 3.3V", ""],
      ["C3-C4", "2", "100nF", "0805", "Decoupling", ""],
      ["BT1", "1", "TP4056 + DW01/8205 + 18650 holder", "module", "Charger + protect + cell", "Battery variant only"],
      ["U3/Q1/K1/D1", "1", "PC817 + S8050 + SRD-05 + 1N4007", "mixed", "Optional light relay", "Local-light variant only"],
      ["JP", "1", "3P 2.54mm", "header", "UART (TX/RX/GND)", "Factory flashing"],
      ["PCB", "1", "2-layer FR4 1.6mm", "-", "Main board", "PIR keep-out corner"],
      ["ENC", "1", "ABS dome/corner (UL94 V-0)", "-", "Sensor housing", "Fresnel lens window"],
    ],
    enc: {
      type: "corner/wall ABS dome (UL94 V-0), white + pink accent, with a Fresnel lens window.",
      size: "50 x 50 x 40 mm (dome). Adhesive pad + 2x M3.",
      front: "PIR Fresnel lens + status LED + brand area.",
      openings: "USB-C entry; lens window; optional relay cable gland.",
      tooling: "injection mould (2 cavities); validate the lens focal distance to the sensor.",
      carton: "E-flute, 4-color + matte lam, spot-UV logo",
      owes: "3D STEP, detection-range validation, battery-runtime test on the assembled unit.",
    },
    label: {
      brand: "Motion Sensor", title: "Wi-Fi PIR Motion Sensor",
      lines: ["Model: CV-PIR    Type: motion-sensor", "Power: USB-C 5V / 18650", "PIR ~5-7m / 110 deg", "Instant alerts . Wi-Fi 2.4GHz", "Warranty: 12 months"],
      warn: "Keep the lens away from heat + sunlight.",
    },
    box: { title: "Motion Sensor", sub: ["PIR . Wi-Fi", "Instant alerts"], strip: "Motion . Automations . Arm / Disarm" },
    listing: {
      title: "Circuvent Wi-Fi Motion Sensor (PIR) | Instant Motion Alerts & Home Automations | Arm/Disarm from App | USB or Battery | Works with Alexa/Google Routines | Made in India",
      category: "Home Improvement > Smart Home > Sensors", vertical: "Sensors",
      bullets: [
        "INSTANT MOTION ALERTS: Get a push the moment motion is detected; arm or disarm from anywhere.",
        "AUTOMATE YOUR HOME: Trigger lights, scenes or any Circuvent device the instant someone walks in.",
        "OPTIONAL LOCAL LIGHT: A built-in relay provision can switch a light directly, even offline.",
        "USB OR BATTERY: Run it from USB-C, or choose the rechargeable 18650 variant for a wire-free install.",
        "MADE IN INDIA: 60-second Wi-Fi setup, OTA updates, 12-month warranty.",
      ],
      description: "The Circuvent Wi-Fi Motion Sensor watches a room and sends instant alerts, powering home automations across your Circuvent devices. Arm or disarm from the app, wire it via USB-C or the rechargeable battery variant, and optionally let it switch a light directly with its on-board relay provision. Place it in a corner ~2 m high for the widest coverage.",
      aplus: ["Hero: motion detected -> phone alert.", "Automate lights + scenes.", "Optional local light relay.", "USB or battery.", "Placement guide.", "Specs + warranty + Made in India."],
      keywords: "wifi motion sensor india, pir motion sensor smart home, motion sensor alexa routine, battery motion sensor wifi, motion sensor light automation",
    },
    manual: {
      sections: [
        { t: "Place & power", steps: ["Mount in a room corner, ~2 m high, facing the area to watch (away from AC vents/sunlight).", "Power via USB-C, or fit a charged 18650 (battery variant)."] },
        { t: "Connect to Wi-Fi", steps: ["The status LED shows power.", "Join Wi-Fi \"Circuvent-Setup-XXXX\" on your phone.", "Open the setup page (or http://192.168.4.1); pick your Wi-Fi, Save & connect."] },
        { t: "Link to your account", steps: ["Open the Circuvent app -> Add a device -> enter the Device ID + Key.", "The sensor appears with motion status and an arm/disarm switch."] },
        { t: "Use it", steps: ["Arm it to get motion alerts; disarm when you're home.", "Create automations: motion -> turn on a light or run a scene.", "Battery variant: check the battery % in the app."] },
      ],
      trouble: ["False triggers: move it away from heat/AC/sunlight; reduce the HC-SR501 sensitivity pot.", "Misses motion: increase sensitivity; lower the mount slightly; face the walk-path.", "Short battery life: raise the re-trigger hold time; disable the optional relay."],
    },
  },
  {
    folder: "energy-monitor", slug: "energy-monitor", model: "CV-EM", name: "Energy Monitor",
    product: "Wi-Fi Energy Monitor (Clamp CT)", fwVer: "2.0.0",
    accent: "#22c55e", accent2: "#16a34a", illus: "ctclamp",
    kicadDesc: "ESP32 clamp-CT energy monitor with optional voltage sense. Capture schematic from SCHEMATIC.md.",
    kicadVars: { SENSOR: "SCT-013", VSENSE: "ZMPT101B (opt)", ADC: "IO34" },
    summary: "A Wi-Fi whole-home energy monitor - clip a CT clamp around your incoming live wire to see live power (W) and cumulative energy (kWh) in the app.",
    features: [
      "**Non-invasive:** a clamp-on CT reads current without cutting any wire.",
      "**Live W + cumulative kWh** with cost estimates and daily/weekly charts.",
      "**Optional true-power** via the voltage-sense add-on (ZMPT101B) for real PF.",
      "**Alerts:** notify on high usage or a heavy load left on.",
      "Zero-touch Wi-Fi setup; secure OTA updates.",
    ],
    specs: [
      ["Supply", "100-240 V AC (built-in PSU) or USB-C 5 V"], ["Sensor", "SCT-013 clamp CT (30/60/100 A)"],
      ["Input", "3.5 mm CT jack + burden + bias network"], ["Voltage sense", "optional ZMPT101B (true power/PF)"],
      ["Connectivity", "Wi-Fi 2.4 GHz (ESP32)"], ["Operating temp", "0-50 degC"], ["Warranty", "12 months"],
    ],
    state: "`watts`, `kwh`, `current`, `voltage` (with add-on).",
    commands: "`{reset_kwh}`, `{cal:{ct_cal}}` (read-only otherwise).",
    compliance: ["WPC/ETA for the 2.4 GHz radio", "CISPR EMC; RoHS; e-waste marks", "BIS for the built-in mains-PSU variant"],
    inBox: "Energy monitor \u00b7 SCT-013 clamp CT \u00b7 quick-start (`MANUAL.md`) \u00b7 warranty card.",
    safetyNote: "Clip the CT around a SINGLE insulated conductor (live only). A qualified electrician should open the meter/DB box.",
    schem: {
      intro: "ESP32 energy monitor. A clamp-on CT feeds a burden resistor biased to mid-rail; the ESP32 samples Irms on an ADC pin and computes W/kWh. An optional ZMPT101B adds voltage sensing for true power. Powered by a small isolated mains PSU (or USB).",
      power: [
        "J1(L) --[F1 500mA]--> PS1.AC-L (HLK-PM01) ; J1(N) -> PS1.AC-N",
        "PS1.+5V -> U2 AMS1117 -> 3V3 (ESP32 + analog bias) ; C1 100u 5V ; C2 100u 3V3",
        "USB variant: USB-C 5V -> U2 (omit PS1)",
      ],
      sensorTitle: "CT front-end + optional voltage sense",
      sensor: [
        "CT jack J3 -> burden Rb (33R for SCT-013-030 => ~1 V at 30 A) across the CT secondary",
        "Mid-rail bias: 2x 10k (3V3/GND) at the ADC node + 10u decouple => 1.65 V bias",
        "IO34 (ADC1) samples; firmware computes Irms * V * PF (energy-monitor.ino)",
        "Optional: ZMPT101B voltage transformer -> conditioned -> IO35 for true power/PF",
      ],
      safety: [
        "Clamp a single INSULATED live conductor - never bare wire; keep the burden across the CT (open-secondary CTs develop dangerous voltage).",
        "The mains PSU section is isolated; the analog CT front-end sits on the LV side.",
        "Fuse the mains input; keep meter/DB-box work to a qualified electrician.",
        "Star-ground the analog bias; guard IO34 from digital noise.",
      ],
    },
    pins: [
      { sig: "CT_PIN", gpio: 34, net: "<- J3 CT jack -> burden -> mid-rail bias -> IO34 (ADC1)" },
    ],
    board: {
      layers: "2-layer FR4, 1.6 mm, HASL lead-free.",
      iso: "Isolated mains PSU island (PSU variant); analog front-end on LV side.",
      size: "50 x 45 mm", mounts: "2x M3",
      extra: ["Keep the burden + bias tight to the jack; guard-ring the ADC node."],
      dfm: ["ERC/DRC clean at fab rules", "Burden always across the CT (no open secondary)", "Bias network + ADC guard verified", "Test points: 5V, 3V3, GND, IO34 (+ IO35 add-on)", "UART/EN/IO0 pads for the flashing jig; fiducials"],
      bringup: ["Rail before ESP32; flash test firmware over jig", "Irms reads against a known load; calibrate CT_CAL", "kWh accumulates over time; cost estimate matches", "Cloud sync self-test; high-usage alert fires"],
    },
    bom: [
      ["U1", "1", "ESP32-WROOM-32E (4MB)", "SMD module", "Wi-Fi/BLE MCU module", "Main controller"],
      ["PS1", "1", "HLK-PM01 (5V 3W)", "SIP", "230VAC -> 5VDC isolated PSU", "Or USB-C variant"],
      ["U2", "1", "AMS1117-3.3", "SOT-223", "5V -> 3.3V LDO", "MCU + analog rail"],
      ["CT1", "1", "SCT-013-030", "clamp", "Clamp-on current transformer", "In the box"],
      ["J3", "1", "3.5mm jack", "THT", "CT input", ""],
      ["Rb", "1", "33R 0.5%", "0805", "Burden resistor", "Across CT secondary"],
      ["Rbias", "2", "10k 0.1%", "0805", "Mid-rail bias", "1.65 V node"],
      ["Cb", "1", "10uF", "0805", "Bias decouple", ""],
      ["ZMPT1", "1", "ZMPT101B module", "module", "Voltage sense (optional)", "True power/PF"],
      ["RV1", "1", "7D471K", "disc", "MOV 470V", "PSU variant"],
      ["F1", "1", "500mA", "1206 fuse", "Mains fuse", "PSU variant"],
      ["LED0", "1", "Green 3mm", "THT", "Power/online", ""],
      ["JP", "1", "3P 2.54mm", "header", "UART (TX/RX/GND)", "Factory flashing"],
      ["R1-R6", "6", "10k/330", "0805", "Pull/LED resistors", ""],
      ["C1-C2", "2", "100uF", "electrolytic", "5V + 3.3V", ""],
      ["C3-C5", "3", "100nF", "0805", "Decoupling", ""],
      ["PCB", "1", "2-layer FR4 1.6mm", "-", "Main board", "Isolated PSU island"],
      ["ENC", "1", "ABS DIN/wall box (UL94 V-0)", "-", "Monitor housing", "3.5mm CT jack"],
    ],
    enc: {
      type: "DIN-rail / wall ABS box (UL94 V-0), white + green accent, with a 3.5 mm CT jack.",
      size: "70 x 45 x 30 mm. 2x M3 / DIN clip.",
      front: "1 status LED + CT jack + brand area.",
      openings: "3.5 mm CT jack; mains/USB entry.",
      tooling: "injection mould (2 cavities); validate against PCB (50 x 45 mm).",
      carton: "E-flute, 4-color + matte lam, spot-UV logo",
      owes: "3D STEP, CT-accuracy calibration across ranges, drop-test on the assembled unit.",
    },
    label: {
      brand: "Energy Monitor", title: "Wi-Fi Energy Monitor (CT)",
      lines: ["Model: CV-EM    Type: energy-monitor", "Power: 100-240V or USB-C 5V", "SCT-013 clamp . W + kWh", "Opt. voltage sense . Wi-Fi 2.4GHz", "Warranty: 12 months"],
      warn: "Clip CT on a single INSULATED live wire only.",
    },
    box: { title: "Energy Monitor", sub: ["Clamp CT", "Live W + kWh"], strip: "Non-invasive . Charts . Alerts" },
    listing: {
      title: "Circuvent Wi-Fi Energy Monitor | Non-Invasive Clamp CT Power Meter | Live Watts, kWh & Cost in the App | High-Usage Alerts | Made in India",
      category: "Home Improvement > Smart Home > Energy Monitors", vertical: "Energy Monitors",
      bullets: [
        "SEE YOUR WHOLE-HOME ENERGY: Clip the CT around your incoming live wire - live watts, kWh and cost in the app.",
        "NON-INVASIVE: The clamp-on CT reads current without cutting or splicing any wire.",
        "CHARTS & ALERTS: Daily/weekly trends, plus a ping when usage is high or a heavy load is left on.",
        "TRUE POWER OPTION: Add the voltage-sense module for real power factor and precise kWh.",
        "MADE IN INDIA: 60-second Wi-Fi setup, OTA updates, 12-month warranty.",
      ],
      description: "The Circuvent Wi-Fi Energy Monitor shows exactly how much power your home is using and what it costs. Clip the included CT clamp around your incoming live conductor and read live watts, cumulative kWh and cost in the app - no rewiring. Add the optional voltage-sense module for true power and power factor. A qualified electrician should open the meter/DB box to fit the clamp.",
      aplus: ["Hero: clamp on the wire -> live W.", "Non-invasive install.", "kWh + cost charts.", "High-usage alerts.", "Optional true-power module.", "Specs + warranty + Made in India."],
      keywords: "wifi energy monitor india, clamp ct power meter, home electricity monitor smart, kwh monitor wifi, non invasive energy meter",
    },
    manual: {
      sections: [
        { t: "Fit the CT clamp (electrician)", steps: ["Switch off supply at the meter/DB box.", "Clip the CT around a SINGLE insulated live conductor (not the whole cable).", "Plug the CT into the 3.5 mm jack. Restore supply."] },
        { t: "Power on & connect to Wi-Fi", steps: ["Power the monitor (mains terminals or USB-C).", "Join Wi-Fi \"Circuvent-Setup-XXXX\" on your phone.", "Open the setup page (or http://192.168.4.1); pick your Wi-Fi, Save & connect."] },
        { t: "Link + calibrate", steps: ["Open the Circuvent app -> Add a device -> enter the Device ID + Key.", "Run a quick calibration against a known load (e.g., a 1000 W heater) to set CT_CAL."] },
        { t: "Use it", steps: ["Watch live watts on the dashboard.", "Track daily/weekly kWh and estimated cost.", "Set a high-usage alert threshold."] },
      ],
      trouble: ["Reads zero: check the CT is fully clamped around a single live wire and plugged in.", "Reading is off: re-run calibration; confirm the CT range matches your load.", "Offline: hold BOOT ~5 s to reopen the Wi-Fi setup portal."],
    },
  },
  {
    folder: "guardian", slug: "guardian", model: "CV-SOS", name: "Guardian SOS",
    product: "Guardian GPS + GSM SOS Beacon", fwVer: "2.0.0",
    accent: "#ef4444", accent2: "#f87171", illus: "sos",
    kicadDesc: "ESP32 personal SOS beacon: SIM800L (2G) + GPS + Li-ion. Capture schematic from SCHEMATIC.md.",
    kicadVars: { CELL: "SIM800L", GPS: "NEO-6M/L80", BATT: "18650" },
    summary: "A pocket SOS beacon - one press sends your live GPS location by SMS to a trusted contact, places an emergency call, and raises a cloud alert.",
    features: [
      "**One-press SOS:** sends GPS location by SMS + places a call (SIM800L) + a cloud alert.",
      "**Live GPS location**, battery telemetry and remote arm/disarm.",
      "**Rechargeable** 18650 with USB-C charging; a loud buzzer confirms each action.",
      "**Works anywhere with 2G/GSM** - no Wi-Fi needed in the field.",
      "Secure OTA updates when on Wi-Fi.",
    ],
    specs: [
      ["Power", "18650 Li-ion + USB-C charging"], ["Cellular", "SIM800L 2G GSM (SMS + voice)"],
      ["GPS", "NEO-6M / L80 (lat/lng)"], ["Trigger", "1x SOS button + buzzer"],
      ["Telemetry", "battery %, GPS, armed"], ["Connectivity", "Wi-Fi 2.4 GHz (OTA) + GSM"],
      ["Operating temp", "0-50 degC"], ["Warranty", "12 months"],
    ],
    state: "`sos`, `lat`, `lng`, `battery`, `armed`.",
    commands: "`{armed}`, `{clear}` (acknowledge SOS).",
    compliance: ["WPC/ETA for the 2.4 GHz + GSM radios", "SIM/telecom KYC for any bundled SIM", "CISPR EMC; RoHS; battery transport UN 38.3; e-waste marks"],
    inBox: "Guardian beacon \u00b7 USB-C cable \u00b7 lanyard \u00b7 quick-start (`MANUAL.md`) \u00b7 warranty card. (2G SIM sold separately.)",
    safetyNote: "Not a certified medical alarm. Test coverage and the trusted number regularly, and keep the battery charged.",
    schem: {
      intro: "ESP32 personal SOS beacon. A SIM800L (2G) sends SMS + places a call; a GPS module supplies location; a Li-ion cell with USB-C charging powers the unit. A button triggers SOS; a buzzer confirms. Low voltage / battery.",
      power: [
        "USB-C 5V -> TP4056 charge -> 18650 (BAT) -> DW01/8205 protection",
        "BAT -> 3V3 LDO/boost (ESP32) ; SIM800L runs 3.4-4.4 V DIRECT from BAT + C_bulk 1000u (2 A bursts)",
        "BATT_ADC: BAT --[100k/100k divider]--> IO34 (battery %)",
      ],
      driveTitle: "Radios + trigger",
      drive: [
        "SIM800L: VCC->BAT (3.4-4.4 V) + 1000u bulk ; NET antenna ; SIM holder ; UART2 IO16/17",
        "GPS: VCC->3V3 ; active antenna ; UART1 IO4/2 ; TinyGPSPlus parses NMEA",
        "SOS: hold SW1 (IO0) -> SMS(location) + call(TRUSTED_NUMBER) + cv.set(sos); buzzer on IO25 chirps",
        "Charge: TP4056 (USB-C) status LEDs ; DW01/8205 cell protection",
      ],
      safety: [
        "SIM800L draws ~2 A bursts: power from BAT direct + a large bulk cap - never from the 3V3 LDO.",
        "Use a protected 18650 (DW01 + dual MOSFET); fuse the USB-C input.",
        "Keep the GSM + GPS antennas apart; ground-plane relief under each antenna.",
        "Ship the battery per UN 38.3 transport rules.",
      ],
    },
    pins: [
      { sig: "SOS_BTN", gpio: 0, net: "SW1 panic (INPUT_PULLUP -> GND; also BOOT)" },
      { sig: "BUZZER", gpio: 25, net: "-> FB1 buzzer (confirmation)" },
      { sig: "BATT_ADC", gpio: 34, net: "<- battery divider (ADC1)" },
      { sig: "SIM_RX", gpio: 16, net: "<- SIM800L TX (UART2)" },
      { sig: "SIM_TX", gpio: 17, net: "-> SIM800L RX (UART2)" },
      { sig: "GPS_RX", gpio: 4, net: "<- GPS TX (UART1)" },
      { sig: "GPS_TX", gpio: 2, net: "-> GPS RX (UART1)" },
    ],
    board: {
      layers: "2-layer FR4, 1.6 mm, HASL lead-free.",
      iso: "Low voltage / battery; RF keep-outs under both antennas.",
      size: "60 x 40 mm (pendant)", mounts: "battery clips + 1x M2",
      extra: ["1000u bulk right at the SIM800L VCC; SMA/IPEX for GSM + active GPS antenna."],
      dfm: ["ERC/DRC clean; antenna keep-outs + ground relief", "SIM800L powered from BAT + bulk cap (not the LDO)", "SIM footprint + card cage; USB-C charge path", "Test points: BAT, 3V3, GND, IO0/25/34, UART1/2", "UART/EN/IO0 pads for the flashing jig; fiducials"],
      bringup: ["Charge cell; rails up; flash test firmware over jig", "SIM800L registers on the network; SMS + call succeed", "GPS gets a fix outdoors; battery % reads sane", "SOS button -> SMS(location) + call + cloud alert; buzzer confirms"],
    },
    bom: [
      ["U1", "1", "ESP32-WROOM-32E (4MB)", "SMD module", "Wi-Fi/BLE MCU module", "Main controller"],
      ["M1", "1", "SIM800L", "module", "2G GSM (SMS + voice)", "From BAT + bulk"],
      ["M2", "1", "NEO-6M / L80", "module", "GPS receiver", "Active antenna"],
      ["U3", "1", "TP4056 + DW01/8205", "module", "Li-ion charge + protection", "USB-C"],
      ["BT1", "1", "18650 Li-ion + holder", "cell", "Battery", "Protected"],
      ["FB1", "1", "Magnetic buzzer 5V", "THT", "Confirmation buzzer", ""],
      ["SW1", "1", "Tactile 6mm (guarded)", "THT", "SOS button", "Also BOOT"],
      ["J1", "1", "USB-C 16P", "SMD", "Charge in", ""],
      ["ANT1", "1", "GSM antenna (SMA/IPEX)", "-", "Cellular antenna", ""],
      ["ANT2", "1", "GPS active antenna", "-", "GPS antenna", ""],
      ["SIM1", "1", "Micro-SIM holder", "THT", "SIM card cage", ""],
      ["C1", "1", "1000uF/6.3V", "electrolytic", "SIM800L bulk", "2 A bursts"],
      ["LED0-LED1", "2", "3mm", "THT", "Power + status", ""],
      ["R1-R8", "8", "100k/10k/330", "0805", "Divider/pull/LED", ""],
      ["C2-C5", "4", "100nF/100uF", "0805/elec", "Decoupling + rails", ""],
      ["JP", "1", "3P 2.54mm", "header", "UART (TX/RX/GND)", "Factory flashing"],
      ["PCB", "1", "2-layer FR4 1.6mm", "-", "Main board", "Antenna keep-outs"],
      ["ENC", "1", "ABS pendant (IP54)", "-", "Handheld housing", "Lanyard loop + SOS cap"],
    ],
    enc: {
      type: "handheld pendant / keychain ABS (IP54), red + white; big guarded SOS button.",
      size: "70 x 45 x 18 mm. Lanyard loop.",
      front: "SOS button + status LED + brand area; USB-C on the edge.",
      openings: "USB-C port; buzzer vents; antenna windows.",
      tooling: "injection mould (2 cavities); RF-transparent window over the antennas.",
      carton: "E-flute, 4-color + matte lam, spot-UV logo",
      owes: "3D STEP, IP54 validation, drop-test, GSM/GPS field-coverage testing.",
    },
    label: {
      brand: "Guardian SOS", title: "GPS + GSM SOS Beacon",
      lines: ["Model: CV-SOS    Type: guardian", "Power: 18650 + USB-C", "SMS location + call + cloud", "2G GSM + GPS . Wi-Fi (OTA)", "Warranty: 12 months"],
      warn: "Not a certified medical alarm - test regularly.",
    },
    box: { title: "Guardian SOS", sub: ["GPS + GSM Beacon", "One-press SOS"], strip: "SMS location . Call . Cloud alert" },
    listing: {
      title: "Circuvent Guardian SOS Beacon | GPS + GSM Personal Safety Alarm | One-Press SMS Location + Emergency Call to a Trusted Contact | Rechargeable | Made in India",
      category: "Electronics > Personal Safety > SOS Devices", vertical: "Personal Safety",
      bullets: [
        "ONE-PRESS SOS: A single press texts your live GPS location to a trusted contact and places a call.",
        "WORKS WITHOUT WI-FI: Uses 2G GSM in the field - reach help from anywhere with a signal.",
        "LIVE GPS + BATTERY: See location and battery in the app; arm or disarm remotely.",
        "RECHARGEABLE & LOUD: 18650 with USB-C charging and a buzzer that confirms every action.",
        "MADE IN INDIA: Pocket/lanyard size, OTA updates on Wi-Fi, 12-month warranty.",
      ],
      description: "The Circuvent Guardian is a pocket SOS beacon for students, seniors, field workers and solo travellers. One press sends your live GPS location by SMS to a trusted contact, places an emergency call and raises a cloud alert - over 2G GSM, so it works far beyond Wi-Fi. Rechargeable via USB-C, with battery and location telemetry in the app. It is not a certified medical alarm; test coverage and the trusted number regularly.",
      aplus: ["Hero: press SOS -> SMS with location.", "Works on 2G anywhere.", "Live GPS + battery.", "Rechargeable + loud buzzer.", "Set-up the trusted contact.", "Specs + warranty + Made in India."],
      keywords: "sos beacon gps gsm, personal safety alarm india, panic button gps tracker, senior safety device sos, sos button location sms",
    },
    manual: {
      sections: [
        { t: "Insert SIM & charge", steps: ["Insert an activated 2G SIM (with SMS + a small balance).", "Charge fully via USB-C - the charge LED turns off when done."] },
        { t: "Set your trusted contact", steps: ["Open the Circuvent app -> Add a device -> enter the Device ID + Key.", "Enter the trusted phone number(s) that will receive the SOS SMS + call.", "Connect the beacon to Wi-Fi once (for OTA) via the setup portal \"Circuvent-Setup-XXXX\"."] },
        { t: "Test it", steps: ["Go outdoors for a GPS fix (first fix can take a minute).", "Press and hold SOS - confirm the SMS with a map link and the call arrive.", "Check location + battery appear in the app."] },
        { t: "Use it", steps: ["Carry it on the lanyard; keep it charged.", "Press SOS in an emergency; the buzzer confirms.", "Disarm in the app to silence accidental presses; re-arm afterwards."] },
      ],
      trouble: ["No SMS/call: check the SIM balance, 2G coverage and that the trusted number is saved.", "No GPS fix: test outdoors with a clear sky view; keep the GPS antenna up.", "Short runtime: charge fully; a fresh protected 18650 gives the best life."],
    },
  },
  {
    folder: "agri-starter", slug: "agri-starter", model: "CV-AGRI", name: "Agri Starter",
    product: "Agri GSM + Wi-Fi Pump Starter", fwVer: "2.0.0",
    accent: "#10b981", accent2: "#34d399", illus: "agri",
    kicadDesc: "ESP32 + SIM800L farm-pump starter: contactor-coil relay + mains sense + dry-run guard. Capture schematic from SCHEMATIC.md.",
    kicadVars: { CELL: "SIM800L", CONTROL: "contactor coil", DRYRUN: "mains-sense" },
    summary: "A Wi-Fi + GSM starter for farm pumps - start/stop by missed call, SMS or the app, with mains-presence sensing and dry-run protection. It switches the contactor coil, never the motor.",
    features: [
      "**Start/stop by missed call, SMS or app** - control the pump even from a basic phone.",
      "**Mains-presence sensing:** only runs when power is actually available (single or 3-phase).",
      "**Dry-run guard:** won't start without proper supply, and auto-restarts on power return.",
      "**Switches the contactor coil (A1/A2)** - never the motor current directly.",
      "Rugged IP54 enclosure; secure OTA updates on Wi-Fi.",
    ],
    specs: [
      ["Supply", "100-240 V AC (from one phase)"], ["Control", "1x relay -> contactor coil (A1/A2)"],
      ["Mains sense", "opto-isolated phase-present inputs (up to 3)"], ["Cellular", "SIM800L 2G GSM (missed call + SMS)"],
      ["Connectivity", "Wi-Fi 2.4 GHz + GSM"], ["Enclosure", "IP54 industrial box"],
      ["Operating temp", "0-55 degC"], ["Warranty", "12 months"],
    ],
    state: "`pump`, `power` (mains present), `uptime`.",
    commands: "`{pump}` (on/off).",
    compliance: ["BIS / CRS registration (mains device)", "WPC/ETA for the 2.4 GHz + GSM radios", "IEC 60335 / IS agri-safety + CISPR EMC; RoHS; e-waste"],
    inBox: "Agri starter \u00b7 GSM antenna \u00b7 wiring guide (`MANUAL.md`) \u00b7 warranty card. (2G SIM sold separately.)",
    safetyNote: "Wire to the contactor coil only, via a qualified electrician. Never switch the motor current directly through this board.",
    schem: {
      intro: "ESP32 + GSM agricultural pump starter. A relay switches an external contactor coil; opto-isolated inputs sense mains/phase presence for dry-run protection; a SIM800L accepts missed-call/SMS control. Mains and LV logic are isolated (HLK PSU + optos).",
      power: [
        "J1(L) --[F1 1A]--+--[RV1 MOV]--+--> PS1.AC-L (HLK-PM01)",
        "J1(N) -----------+-------------+--> PS1.AC-N",
        "PS1.+5V -> 5V rail (K1 coil, U2.IN) ; SIM800L from a 4V buck + 1000u bulk ; PS1.-V -> GND",
        "U2 AMS1117-3.3 -> 3V3 (ESP32) ; C1 470u 5V ; C2 100u 3V3 ; C3..C6 100n",
      ],
      driveTitle: "Contactor drive + mains sensing + GSM",
      drive: [
        "IO26 -> PC1 -> Q1 -> K1 coil ; D1 across coil ; K1 dry contact -> J2 (contactor A1/A2)",
        "Mains sense: phase --[R + PC814 AC opto]--> IO34 (HIGH = power present); repeat per phase",
        "SIM800L: 4V buck + 1000u bulk ; NET antenna ; SIM holder ; UART2 IO16/17",
        "Dry-run: firmware asserts K1 only while MAINS_SENSE is HIGH (agri-starter.ino applyPump)",
      ],
      safety: [
        "Switch the CONTACTOR COIL only (J2) - the motor runs through the contactor + overload relay, never this board.",
        "Fuse + MOV at entry; opto-isolate every phase-sense input; >= 8 mm creepage mains-to-LV.",
        "SIM800L bursts ~2 A: a dedicated 4 V buck + bulk cap; keep the GSM antenna clear of mains.",
        "IP54 gland entries; conformal-coat for farm humidity + dust.",
        "Silk: shock warning, ratings, serial/QR, CE/BIS mark area.",
      ],
    },
    pins: [
      { sig: "PUMP_RELAY", gpio: 26, net: "-> PC1 -> Q1 -> K1 -> J2 contactor coil (A1/A2)" },
      { sig: "MAINS_SENSE", gpio: 34, net: "<- PC2 AC opto (phase present, HIGH when powered)" },
      { sig: "SIM_RX", gpio: 16, net: "<- SIM800L TX (UART2)" },
      { sig: "SIM_TX", gpio: 17, net: "-> SIM800L RX (UART2)" },
    ],
    board: {
      layers: "2-layer FR4, 1.6 mm, HASL lead-free, 2 oz copper on mains.",
      iso: ">= 8 mm creepage / 6 mm clearance mains-to-LV; isolate each phase-sense input.",
      size: "80 x 60 mm", mounts: "4x M3",
      extra: ["4 V buck + 1000u bulk at the SIM800L; conformal-coat + IP54 glands for the field."],
      dfm: ["ERC/DRC clean at fab rules; mains clearances as keepout", "Contactor-coil relay + flyback verified; phase-sense optos isolated", "SIM800L on its own 4V buck + bulk cap", "Test points: 5V, 3V3, GND, IO26/34, UART2", "UART/EN/IO0 pads for the flashing jig; fiducials"],
      bringup: ["Rails before ESP32; flash test firmware over jig", "Relay drives a test contactor; mains-sense reads phase HIGH/LOW", "SIM registers; a missed call toggles the pump", "Dry-run: pump won't start with sense LOW; auto-restarts on return"],
    },
    bom: [
      ["U1", "1", "ESP32-WROOM-32E (4MB)", "SMD module", "Wi-Fi/BLE MCU module", "Main controller"],
      ["PS1", "1", "HLK-PM01 (5V 3W)", "SIP", "230VAC -> 5VDC isolated PSU", "From one phase"],
      ["U2", "1", "AMS1117-3.3", "SOT-223", "5V -> 3.3V LDO", "MCU rail"],
      ["U3", "1", "MP1584 buck (4V)", "module/SMD", "5V -> ~4V for SIM800L", "2 A capable"],
      ["M1", "1", "SIM800L", "module", "2G GSM (missed call + SMS)", ""],
      ["PC1", "1", "PC817", "DIP-4", "Opto-isolator", "Relay drive"],
      ["PC2-PC4", "3", "PC814 (AC input)", "DIP-4", "Phase-present optos", "Up to 3 phases"],
      ["Q1", "1", "S8050", "SOT-23", "NPN relay driver", ""],
      ["D1", "1", "1N4007", "DO-41", "Flyback diode", "Relay coil"],
      ["K1", "1", "SRD-05VDC-SL-C", "THT relay", "5V SPDT 10A", "Contactor coil switch"],
      ["RV1", "1", "7D471K", "disc", "MOV 470V", "Mains surge clamp"],
      ["F1", "1", "1A slow-blow", "5x20 holder", "Mains fuse", ""],
      ["SIM1", "1", "Micro-SIM holder", "THT", "SIM card cage", ""],
      ["ANT1", "1", "GSM antenna (SMA/IPEX)", "-", "Cellular antenna", ""],
      ["FB1", "1", "Buzzer 5V", "THT", "Status/alert buzzer", ""],
      ["C1", "1", "470uF/10V", "electrolytic", "5V bulk", ""],
      ["Cs", "1", "1000uF/6.3V", "electrolytic", "SIM800L bulk", "2 A bursts"],
      ["LED0-LED1", "2", "3mm", "THT", "Power + pump status", ""],
      ["J1", "1", "2P 5.08mm", "terminal", "Mains L/N in", ""],
      ["J2", "1", "2P 5.08mm", "terminal", "Contactor coil A1/A2", ""],
      ["J3", "1", "4P 5.08mm", "terminal", "Phase-sense in (up to 3)", ""],
      ["JP", "1", "3P 2.54mm", "header", "UART (TX/RX/GND)", "Factory flashing"],
      ["R1-R14", "14", "10k/1k/330 + opto R", "0805", "Pull/base/LED/sense", ""],
      ["C2-C7", "6", "100nF/100uF", "0805/elec", "Decoupling + rails", ""],
      ["PCB", "1", "2-layer FR4 1.6mm", "-", "Main board", ">=8mm mains-LV creepage; conformal coat"],
      ["ENC", "1", "ABS/PC box (IP54)", "-", "Industrial housing", "Wall mount + glands"],
    ],
    enc: {
      type: "IP54 industrial ABS/PC box (UL94 V-0), grey + emerald accent; wall-mount near the starter panel.",
      size: "120 x 90 x 55 mm. 4x M3 + wall ears.",
      front: "2 status LEDs (power/pump) + brand area; clear window optional.",
      openings: "cable glands for mains in, contactor coil out, phase-sense leads + antenna.",
      tooling: "off-the-shelf IP54 enclosure + custom label; validate against PCB (80 x 60 mm).",
      carton: "E-flute, 4-color + matte lam, spot-UV logo",
      owes: "IP54 validation, conformal-coat process, field EMC + surge testing on the assembled unit.",
    },
    label: {
      brand: "Agri Starter", title: "GSM + Wi-Fi Pump Starter",
      lines: ["Model: CV-AGRI    Type: agri-starter", "Input: 100-240V ~ 50/60Hz", "Contactor coil out (A1/A2)", "Dry-run guard . 2G GSM + Wi-Fi", "Warranty: 12 months"],
      warn: "Switch the CONTACTOR COIL only - not the motor.",
    },
    box: { title: "Agri Starter", sub: ["GSM Pump Starter", "Dry-run guard"], strip: "Missed-call . SMS . App . IP54" },
    listing: {
      title: "Circuvent Agri Pump Starter | GSM + Wi-Fi Farm Pump Controller | Start/Stop by Missed Call, SMS or App | Dry-Run Protection & Auto-Restart | IP54 | Made in India",
      category: "Industrial > Pumps & Controllers > Pump Starters", vertical: "Agriculture",
      bullets: [
        "START FROM A MISSED CALL: Turn your farm pump on/off with a missed call, SMS or the app - even from a basic phone.",
        "DRY-RUN PROTECTION: Mains-presence sensing means the pump only runs when real power is there; it auto-restarts on return.",
        "SAFE BY DESIGN: Switches the contactor coil (A1/A2), never the motor - works with your existing starter + overload.",
        "MADE FOR THE FIELD: IP54 enclosure, conformal-coated board, surge + fuse protection.",
        "MADE IN INDIA: 2G GSM + Wi-Fi (for OTA), 12-month warranty.",
      ],
      description: "The Circuvent Agri Pump Starter lets farmers start and stop a pump from anywhere - a missed call, an SMS or the Circuvent app - without walking to the field. It senses mains/phase presence for dry-run protection and auto-restarts when supply returns. It switches only the contactor coil, so it works safely with your existing starter and overload relay. Installation by a qualified electrician; IP54 for outdoor panels.",
      aplus: ["Hero: missed call -> pump starts.", "Dry-run protection.", "Switches the contactor coil safely.", "IP54 for the field.", "Wiring diagram (coil + phase sense).", "Specs + warranty + Made in India."],
      keywords: "gsm pump starter, farm pump controller missed call, agri motor starter wifi, dry run protection pump, mobile pump starter india",
    },
    manual: {
      sections: [
        { t: "Wire (electrician)", steps: ["Switch off supply at the panel.", "Power the unit from one phase L/N at J1 (through the fuse).", "Wire J2 to the contactor coil A1/A2 (in series with your existing start circuit).", "Wire each phase to a J3 sense input. Mount the IP54 box; use glands."] },
        { t: "Insert SIM & power on", steps: ["Insert an activated 2G SIM (SMS enabled).", "Power on - the power LED lights; the GSM module registers in ~30 s."] },
        { t: "Link + Wi-Fi (optional, for OTA)", steps: ["Open the Circuvent app -> Add a device -> enter the Device ID + Key.", "Optionally connect Wi-Fi via the \"Circuvent-Setup-XXXX\" portal for updates."] },
        { t: "Use it", steps: ["Give a missed call to the unit's number to toggle the pump, or send START/STOP by SMS.", "Or tap on/off in the app.", "If supply drops, the pump stops safely and restarts when power returns."] },
      ],
      trouble: ["Pump won't start: check the phase-sense inputs read power present and the contactor coil is wired to J2.", "No GSM control: verify SIM balance + 2G coverage; keep the antenna outside the metal panel.", "Frequent stops: confirm stable supply on the sensed phase(s); check the overload relay."],
    },
  },
  // <<DEVICES>>
];

DEVICES.forEach(emit);
console.log("\nGenerated " + DEVICES.length + " device packages under " + ROOT);
