// Generates the product illustrations under public/img.
//
// These are deliberately illustrations rather than photographs: rendering a
// realistic-looking photo of hardware would imply a finish and form factor the
// boards may not have. A clean vector drawing communicates what the device is
// without claiming what it looks like on a shelf.
//
// The frame — dark gradient, faint grid, accent glow, Circuvent wordmark — is
// shared so a shop grid reads as one family. Only the centre art differs.
//
// Run with:  node scripts/gen-product-art.js
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "public", "img");

/** The shared frame every product illustration sits in. */
function frame(accent, label, art) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" role="img" aria-label="Circuvent ${label}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0d1226"/><stop offset="1" stop-color="#0a0f1f"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="55%">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.45"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#06b6d4"/><stop offset="1" stop-color="#8b5cf6"/>
    </linearGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e2e8f0"/><stop offset="1" stop-color="#94a3b8"/>
    </linearGradient>
    <linearGradient id="accentFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.95"/><stop offset="1" stop-color="${accent}" stop-opacity="0.6"/>
    </linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#bg)"/>
  <g opacity="0.12" stroke="#5b6488" stroke-width="1">
    <path d="M0 100H800M0 200H800M0 300H800M0 400H800M0 500H800M0 600H800M0 700H800"/>
    <path d="M100 0V800M200 0V800M300 0V800M400 0V800M500 0V800M600 0V800M700 0V800"/>
  </g>
  <rect width="800" height="800" fill="url(#glow)"/>
${art}
  <circle cx="120" cy="690" r="10" fill="url(#brand)"/>
  <text x="146" y="697" fill="#e7ecff" font-family="system-ui,Segoe UI,Roboto,sans-serif" font-size="30" font-weight="800">Circuvent</text>
  <text x="680" y="697" fill="${accent}" font-family="system-ui,Segoe UI,Roboto,sans-serif" font-size="26" font-weight="700" text-anchor="end">${label}</text>
</svg>
`;
}

/** A wall-plate body used by the switch-like products. */
function plate(w, h, r = 28) {
  return `    <rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${r}" fill="url(#metal)"/>
    <rect x="${-w / 2 + 10}" y="${-h / 2 + 10}" width="${w - 20}" height="${h - 20}" rx="${r - 8}" fill="#f8fafc"/>`;
}

const art = {
  // ---- new devices -------------------------------------------------------
  watertank: `  <g transform="translate(400 360)">
    <!-- overhead tank -->
    <g transform="translate(-150 -120)">
      <rect x="-95" y="-90" width="190" height="180" rx="18" fill="#1e293b" stroke="#475569" stroke-width="5"/>
      <rect x="-83" y="-10" width="166" height="88" rx="10" fill="url(#accentFill)"/>
      <path d="M-83 -10 q41 -16 83 0 q41 16 83 0 v14 h-166 z" fill="${"#38bdf8"}" opacity="0.85"/>
      <text x="0" y="-40" fill="#cbd5e1" font-family="system-ui,sans-serif" font-size="26" font-weight="800" text-anchor="middle">OH</text>
    </g>
    <!-- sump -->
    <g transform="translate(150 120)">
      <rect x="-95" y="-70" width="190" height="150" rx="18" fill="#1e293b" stroke="#475569" stroke-width="5"/>
      <rect x="-83" y="20" width="166" height="48" rx="10" fill="url(#accentFill)" opacity="0.8"/>
      <text x="0" y="-20" fill="#cbd5e1" font-family="system-ui,sans-serif" font-size="26" font-weight="800" text-anchor="middle">SUMP</text>
    </g>
    <!-- pump + pipe -->
    <path d="M150 40 V-30 H-150 V-20" fill="none" stroke="#64748b" stroke-width="12" stroke-linecap="round"/>
    <g transform="translate(60 -30)">
      <circle r="34" fill="#0f172a" stroke="${"#0ea5e9"}" stroke-width="6"/>
      <path d="M-13 -13 L15 0 L-13 13 Z" fill="${"#0ea5e9"}"/>
    </g>
    <!-- ultrasonic pings -->
    <g stroke="${"#0ea5e9"}" stroke-width="4" fill="none" opacity="0.65" stroke-linecap="round">
      <path d="M-150 -196 q-26 20 0 40"/><path d="M-150 -206 q-40 30 0 60"/>
    </g>
  </g>`,

  touchboard: `  <g transform="translate(400 350)">
${plate(360, 300)}
    <g>
      <circle cx="-100" cy="-40" r="42" fill="#0f172a"/>
      <circle cx="-100" cy="-40" r="42" fill="none" stroke="${"#2dd4bf"}" stroke-width="5"/>
      <circle cx="0" cy="-40" r="42" fill="#0f172a"/>
      <circle cx="0" cy="-40" r="42" fill="none" stroke="${"#2dd4bf"}" stroke-width="5" opacity="0.55"/>
      <circle cx="100" cy="-40" r="42" fill="#0f172a"/>
      <circle cx="100" cy="-40" r="42" fill="none" stroke="${"#2dd4bf"}" stroke-width="5" opacity="0.55"/>
      <circle cx="-100" cy="-40" r="16" fill="${"#2dd4bf"}"/>
    </g>
    <!-- metering readout -->
    <rect x="-140" y="34" width="280" height="76" rx="14" fill="#0f172a"/>
    <text x="0" y="72" fill="${"#2dd4bf"}" font-family="ui-monospace,Menlo,monospace" font-size="30" font-weight="700" text-anchor="middle">230V  1.4A</text>
    <text x="0" y="100" fill="#94a3b8" font-family="ui-monospace,Menlo,monospace" font-size="22" text-anchor="middle">322 W · PF 0.98</text>
  </g>`,

  "touchboard-8": `  <g transform="translate(400 350)">
${plate(400, 330)}
    <!-- 8 pads, two rows of four, mirroring the physical plate -->
    <g>
      ${[0, 1, 2, 3]
        .map(
          (i) => `<circle cx="${-150 + i * 100}" cy="-88" r="38" fill="#0f172a"/>
      <circle cx="${-150 + i * 100}" cy="-88" r="38" fill="none" stroke="${"#2dd4bf"}" stroke-width="5" opacity="${i === 0 ? 1 : 0.55}"/>`
        )
        .join("\n      ")}
      ${[0, 1, 2, 3]
        .map(
          (i) => `<circle cx="${-150 + i * 100}" cy="8" r="38" fill="#0f172a"/>
      <circle cx="${-150 + i * 100}" cy="8" r="38" fill="none" stroke="${"#2dd4bf"}" stroke-width="5" opacity="${i === 2 ? 1 : 0.55}"/>`
        )
        .join("\n      ")}
      <circle cx="-150" cy="-88" r="14" fill="${"#2dd4bf"}"/>
      <circle cx="50" cy="8" r="14" fill="${"#2dd4bf"}"/>
    </g>
    <!-- metering readout -->
    <rect x="-160" y="76" width="320" height="76" rx="14" fill="#0f172a"/>
    <text x="0" y="114" fill="${"#2dd4bf"}" font-family="ui-monospace,Menlo,monospace" font-size="30" font-weight="700" text-anchor="middle">230V  3.6A</text>
    <text x="0" y="142" fill="#94a3b8" font-family="ui-monospace,Menlo,monospace" font-size="22" text-anchor="middle">828 W · PF 0.97</text>
  </g>`,

  facedoor: `  <g transform="translate(400 350)">
    <!-- door -->
    <rect x="-150" y="-230" width="300" height="460" rx="20" fill="#1e293b" stroke="#475569" stroke-width="6"/>
    <rect x="-120" y="-200" width="240" height="180" rx="12" fill="#0f172a"/>
    <!-- face scan -->
    <g transform="translate(0 -110)" stroke="${"#f43f5e"}" stroke-width="6" fill="none" stroke-linecap="round">
      <path d="M-70 -50 v-22 h22"/><path d="M70 -50 v-22 h-22"/>
      <path d="M-70 50 v22 h22"/><path d="M70 50 v22 h-22"/>
    </g>
    <g transform="translate(0 -110)" fill="none" stroke="#e2e8f0" stroke-width="5" stroke-linecap="round" opacity="0.9">
      <circle cx="0" cy="-8" r="30"/><path d="M-34 46 q34 -30 68 0"/>
    </g>
    <!-- keypad -->
    <g transform="translate(0 60)" fill="#0f172a">
      <rect x="-96" y="-24" width="192" height="150" rx="14"/>
    </g>
    <g transform="translate(0 60)" fill="#64748b">
      <circle cx="-56" cy="12" r="13"/><circle cx="0" cy="12" r="13"/><circle cx="56" cy="12" r="13"/>
      <circle cx="-56" cy="56" r="13"/><circle cx="0" cy="56" r="13"/><circle cx="56" cy="56" r="13"/>
      <circle cx="-56" cy="100" r="13"/><circle cx="0" cy="100" r="13"/><circle cx="56" cy="100" r="13"/>
    </g>
    <!-- handle + strike -->
    <circle cx="112" cy="10" r="14" fill="url(#metal)"/>
    <rect x="150" y="-30" width="22" height="90" rx="8" fill="url(#metal)"/>
  </g>`,

  "rfid-gate": `  <g transform="translate(400 380)">
    <!-- posts -->
    <rect x="-300" y="-160" width="34" height="240" rx="10" fill="url(#metal)"/>
    <rect x="266" y="-160" width="34" height="240" rx="10" fill="url(#metal)"/>
    <!-- boom, raised -->
    <g transform="translate(-283 -140) rotate(-32)">
      <rect x="0" y="-14" width="470" height="28" rx="12" fill="${"#f59e0b"}"/>
      <g fill="#0f172a" opacity="0.85">
        <rect x="60" y="-14" width="46" height="28"/><rect x="180" y="-14" width="46" height="28"/><rect x="300" y="-14" width="46" height="28"/>
      </g>
    </g>
    <!-- reader -->
    <g transform="translate(283 -190)">
      <rect x="-40" y="-46" width="80" height="92" rx="12" fill="#0f172a" stroke="${"#f59e0b"}" stroke-width="5"/>
      <g stroke="${"#f59e0b"}" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.8">
        <path d="M-58 -18 q-22 18 0 36"/><path d="M-76 -32 q-36 32 0 64"/>
      </g>
    </g>
    <!-- car -->
    <g transform="translate(-60 40)">
      <path d="M-130 30 l24 -56 h190 l30 56 z" fill="#334155"/>
      <rect x="-140" y="30" width="290" height="46" rx="16" fill="#475569"/>
      <circle cx="-78" cy="80" r="26" fill="#0f172a"/><circle cx="92" cy="80" r="26" fill="#0f172a"/>
      <rect x="-40" y="-20" width="56" height="26" rx="6" fill="${"#f59e0b"}" opacity="0.9"/>
    </g>
  </g>`,

  camera: `  <g transform="translate(400 350)">
    <!-- body -->
    <rect x="-160" y="-110" width="320" height="200" rx="34" fill="#1e293b" stroke="#475569" stroke-width="6"/>
    <!-- lens -->
    <circle cx="-30" cy="-10" r="86" fill="#0f172a"/>
    <circle cx="-30" cy="-10" r="86" fill="none" stroke="url(#metal)" stroke-width="8"/>
    <circle cx="-30" cy="-10" r="52" fill="url(#accentFill)" opacity="0.35"/>
    <circle cx="-30" cy="-10" r="30" fill="#020617"/>
    <circle cx="-52" cy="-32" r="12" fill="#e2e8f0" opacity="0.75"/>
    <!-- illuminator + status -->
    <circle cx="106" cy="-50" r="18" fill="#fde68a"/>
    <circle cx="106" cy="6" r="10" fill="${"#a855f7"}"/>
    <!-- mount -->
    <rect x="-34" y="90" width="68" height="52" rx="12" fill="#475569"/>
    <rect x="-86" y="142" width="172" height="26" rx="12" fill="url(#metal)"/>
    <!-- wifi -->
    <g transform="translate(150 -150)" stroke="${"#a855f7"}" stroke-width="7" fill="none" stroke-linecap="round">
      <path d="M-34 10 q34 -34 68 0"/><path d="M-52 -8 q52 -52 104 0"/>
      <circle cx="0" cy="30" r="7" fill="${"#a855f7"}" stroke="none"/>
    </g>
  </g>`,

  // ---- products that had no illustration ---------------------------------
  "anpr-cam": `  <g transform="translate(400 350)">
    <!-- housing: a bullet camera on a bracket, not a dome -->
    <rect x="-176" y="-96" width="300" height="172" rx="42" fill="#1e293b" stroke="#475569" stroke-width="6"/>
    <rect x="124" y="-70" width="34" height="120" rx="14" fill="url(#metal)"/>
    <!-- lens -->
    <circle cx="-64" cy="-10" r="78" fill="#0f172a"/>
    <circle cx="-64" cy="-10" r="78" fill="none" stroke="url(#metal)" stroke-width="8"/>
    <circle cx="-64" cy="-10" r="46" fill="url(#accentFill)" opacity="0.35"/>
    <circle cx="-64" cy="-10" r="26" fill="#020617"/>
    <circle cx="-84" cy="-30" r="10" fill="#e2e8f0" opacity="0.75"/>
    <!-- IR illuminator ring -->
    <g fill="${"#0ea5e9"}" opacity="0.85">
      <circle cx="58" cy="-52" r="11"/><circle cx="92" cy="-52" r="11"/>
      <circle cx="58" cy="-16" r="11"/><circle cx="92" cy="-16" r="11"/>
    </g>
    <!-- mount -->
    <rect x="-40" y="76" width="60" height="46" rx="12" fill="#475569"/>
    <rect x="-92" y="122" width="164" height="26" rx="12" fill="url(#metal)"/>
    <!--
      The number plate. Drawn with real geometry rather than a single stroked
      line: a straight line stroked with an objectBoundingBox gradient has a
      zero-width bounding box and paints nothing at all, which is the trap
      Docs/07-adding-a-new-device.md warns about.
    -->
    <g transform="translate(0 218)">
      <rect x="-190" y="-46" width="380" height="92" rx="12" fill="#f8fafc" stroke="#0f172a" stroke-width="6"/>
      <rect x="-190" y="-46" width="52" height="92" rx="12" fill="${"#0ea5e9"}"/>
      <text x="-164" y="10" fill="#f8fafc" font-family="ui-sans-serif,system-ui,sans-serif" font-size="22" font-weight="800" text-anchor="middle">IND</text>
      <text x="26" y="18" fill="#0f172a" font-family="ui-monospace,Menlo,monospace" font-size="52" font-weight="800" text-anchor="middle">KA 01 AB</text>
    </g>
    <!-- scan brackets over the plate -->
    <g stroke="${"#0ea5e9"}" stroke-width="8" fill="none" stroke-linecap="round">
      <path d="M-226 148 v-32 h32"/><path d="M226 148 v-32 h-32"/>
      <path d="M-226 288 v32 h32"/><path d="M226 288 v32 h-32"/>
    </g>
  </g>`,

  "drone-x1": `  <g transform="translate(400 340)">
    <!--
      The X1 seen from above: four arms, four props, and the flight controller
      as the lit centre. The board is the product here, not the airframe, so it
      carries the accent while the frame stays dark.

      Arms are rects rather than stroked lines: a straight line stroked with an
      objectBoundingBox gradient has a zero-width bounding box and paints
      nothing, which is the trap Docs/07-adding-a-new-device.md warns about.
    -->
    <g stroke="none">
      <rect x="-14" y="-158" width="28" height="158" rx="12" fill="#334155" transform="rotate(45)"/>
      <rect x="-14" y="-158" width="28" height="158" rx="12" fill="#334155" transform="rotate(135)"/>
      <rect x="-14" y="-158" width="28" height="158" rx="12" fill="#334155" transform="rotate(225)"/>
      <rect x="-14" y="-158" width="28" height="158" rx="12" fill="#334155" transform="rotate(315)"/>
    </g>
    <!-- prop discs, alternating rotation shown by the arc direction -->
    <g fill="${"#6366f1"}" opacity="0.14">
      <circle cx="-112" cy="-112" r="70"/><circle cx="112" cy="-112" r="70"/>
      <circle cx="-112" cy="112"  r="70"/><circle cx="112" cy="112"  r="70"/>
    </g>
    <g stroke="${"#6366f1"}" stroke-width="5" fill="none" opacity="0.75" stroke-linecap="round">
      <path d="M-152 -112 a40 40 0 0 1 80 0"/>
      <path d="M152 -112 a40 40 0 0 0 -80 0"/>
      <path d="M-152 112 a40 40 0 0 0 80 0"/>
      <path d="M152 112 a40 40 0 0 1 -80 0"/>
    </g>
    <g fill="url(#metal)">
      <circle cx="-112" cy="-112" r="24"/><circle cx="112" cy="-112" r="24"/>
      <circle cx="-112" cy="112"  r="24"/><circle cx="112" cy="112"  r="24"/>
    </g>
    <!-- centre stack: frame plate, then the flight controller -->
    <rect x="-84" y="-64" width="168" height="128" rx="26" fill="#1e293b" stroke="#475569" stroke-width="6"/>
    <rect x="-56" y="-40" width="112" height="80" rx="12" fill="#0f172a" stroke="${"#6366f1"}" stroke-width="5"/>
    <rect x="-40" y="-24" width="46" height="30" rx="6" fill="url(#accentFill)" opacity="0.65"/>
    <circle cx="30" cy="-8" r="7" fill="${"#6366f1"}"/>
    <circle cx="30" cy="14" r="5" fill="#22c55e"/>
    <!-- battery strap -->
    <rect x="-84" y="6" width="168" height="16" rx="8" fill="#475569" opacity="0.85"/>
  </g>`,
  "drone-link": `  <g transform="translate(400 340)">
    <!--
      A quadcopter seen from slightly above, with the companion board on top.
      The board is the product; the airframe is context, so it is drawn darker
      and the board carries the accent.

      Every arm is a real rect rather than a stroked line: a straight line
      stroked with an objectBoundingBox gradient has a zero-width bounding box
      and paints nothing at all, which is the trap Docs/07-adding-a-new-device.md
      warns about.
    -->
    <g stroke="none">
      <!-- arms -->
      <rect x="-16" y="-150" width="32" height="150" rx="14" fill="#334155" transform="rotate(45)"/>
      <rect x="-16" y="-150" width="32" height="150" rx="14" fill="#334155" transform="rotate(135)"/>
      <rect x="-16" y="-150" width="32" height="150" rx="14" fill="#334155" transform="rotate(225)"/>
      <rect x="-16" y="-150" width="32" height="150" rx="14" fill="#334155" transform="rotate(315)"/>
    </g>
    <!-- motors and prop discs -->
    <g>
      <circle cx="-106" cy="-106" r="62" fill="${"#6366f1"}" opacity="0.13"/>
      <circle cx="106"  cy="-106" r="62" fill="${"#6366f1"}" opacity="0.13"/>
      <circle cx="-106" cy="106"  r="62" fill="${"#6366f1"}" opacity="0.13"/>
      <circle cx="106"  cy="106"  r="62" fill="${"#6366f1"}" opacity="0.13"/>
      <circle cx="-106" cy="-106" r="22" fill="url(#metal)"/>
      <circle cx="106"  cy="-106" r="22" fill="url(#metal)"/>
      <circle cx="-106" cy="106"  r="22" fill="url(#metal)"/>
      <circle cx="106"  cy="106"  r="22" fill="url(#metal)"/>
    </g>
    <!-- body -->
    <rect x="-96" y="-72" width="192" height="144" rx="30" fill="#1e293b" stroke="#475569" stroke-width="6"/>
    <!-- the companion board, sitting on the deck -->
    <rect x="-64" y="-44" width="128" height="88" rx="12" fill="#0f172a" stroke="${"#6366f1"}" stroke-width="5"/>
    <rect x="-46" y="-28" width="52" height="34" rx="6" fill="url(#accentFill)" opacity="0.6"/>
    <circle cx="34" cy="-12" r="8" fill="${"#6366f1"}"/>
    <!--
      Antenna and telemetry arcs, in the centre column.

      They were first drawn off the body's top-right corner, which put them
      inside the top-right prop disc (centre 106,-106 r 62). The arcs read as a
      broken circle rather than as radiating signal — an artefact that parses
      perfectly and looks like a rendering fault. The column between the two
      front discs (x -44..44 above y -168) is the only clear space, so that is
      where they go.
    -->
    <rect x="-6" y="-150" width="12" height="82" rx="6" fill="#475569"/>
    <circle cx="0" cy="-156" r="11" fill="${"#6366f1"}"/>
    <g stroke="${"#6366f1"}" stroke-width="6" fill="none" stroke-linecap="round" opacity="0.85">
      <path d="M-26 -178 a36 36 0 0 1 52 0"/>
      <path d="M-46 -202 a66 66 0 0 1 92 0"/>
    </g>
    <!-- landing legs -->
    <rect x="-70" y="66" width="16" height="52" rx="8" fill="#475569"/>
    <rect x="54"  y="66" width="16" height="52" rx="8" fill="#475569"/>
  </g>`,

  "energy-monitor": `  <g transform="translate(400 350)">
    <rect x="-190" y="-150" width="380" height="290" rx="26" fill="#1e293b" stroke="#475569" stroke-width="6"/>
    <rect x="-160" y="-120" width="320" height="150" rx="14" fill="#0f172a"/>
    <text x="0" y="-58" fill="${"#f59e0b"}" font-family="ui-monospace,Menlo,monospace" font-size="52" font-weight="800" text-anchor="middle">1.82 kW</text>
    <!-- live trace -->
    <path d="M-146 -6 L-104 -26 L-62 -14 L-20 -44 L22 -22 L64 -38 L106 -12 L146 -30"
          fill="none" stroke="${"#f59e0b"}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <!-- CT clamp -->
    <g transform="translate(0 88)">
      <circle r="46" fill="none" stroke="url(#metal)" stroke-width="16"/>
      <rect x="-10" y="-64" width="20" height="34" rx="6" fill="#475569"/>
      <path d="M-120 0 H-52 M52 0 H120" stroke="#64748b" stroke-width="12" stroke-linecap="round"/>
    </g>
  </g>`,

  "home-hub": `  <g transform="translate(400 350)">
    <rect x="-170" y="-120" width="340" height="230" rx="34" fill="#1e293b" stroke="#475569" stroke-width="6"/>
    <circle cx="0" cy="-16" r="62" fill="#0f172a"/>
    <circle cx="0" cy="-16" r="62" fill="none" stroke="${"#14b8a6"}" stroke-width="6"/>
    <circle cx="0" cy="-16" r="24" fill="url(#brand)"/>
    <!-- linked nodes -->
    <g stroke="${"#14b8a6"}" stroke-width="4" opacity="0.55">
      <path d="M0 -16 L-210 -170 M0 -16 L210 -170 M0 -16 L-230 60 M0 -16 L230 60"/>
    </g>
    <g fill="#0f172a" stroke="${"#14b8a6"}" stroke-width="5">
      <rect x="-244" y="-204" width="68" height="68" rx="16"/>
      <rect x="176" y="-204" width="68" height="68" rx="16"/>
      <rect x="-264" y="26" width="68" height="68" rx="16"/>
      <rect x="196" y="26" width="68" height="68" rx="16"/>
    </g>
    <g transform="translate(0 74)" fill="#475569">
      <rect x="-96" y="0" width="192" height="16" rx="8"/>
    </g>
  </g>`,

  "smart-switch": `  <g transform="translate(400 350)">
${plate(320, 340)}
    <!-- two rockers -->
    <g>
      <rect x="-110" y="-116" width="94" height="150" rx="16" fill="#0f172a"/>
      <rect x="16" y="-116" width="94" height="150" rx="16" fill="#0f172a"/>
      <rect x="-110" y="-116" width="94" height="72" rx="16" fill="${"#22d3ee"}" opacity="0.9"/>
      <rect x="16" y="-38" width="94" height="72" rx="16" fill="#334155"/>
    </g>
    <circle cx="-63" cy="74" r="10" fill="${"#22d3ee"}"/>
    <circle cx="63" cy="74" r="10" fill="#475569"/>
    <text x="0" y="128" fill="#64748b" font-family="system-ui,sans-serif" font-size="24" font-weight="700" text-anchor="middle">2 GANG</text>
  </g>`,

  "motion-sensor": `  <g transform="translate(400 340)">
    <!-- dome -->
    <path d="M-120 60 a120 120 0 0 1 240 0 z" fill="url(#metal)"/>
    <path d="M-120 60 a120 120 0 0 1 240 0 z" fill="none" stroke="#cbd5e1" stroke-width="4"/>
    <rect x="-132" y="60" width="264" height="34" rx="16" fill="#e2e8f0"/>
    <circle cx="0" cy="18" r="34" fill="#0f172a"/>
    <circle cx="0" cy="18" r="12" fill="${"#a78bfa"}"/>
    <!-- detection cone -->
    <path d="M0 94 L-210 300 L210 300 Z" fill="${"#a78bfa"}" opacity="0.14"/>
    <g stroke="${"#a78bfa"}" stroke-width="4" opacity="0.5" fill="none">
      <path d="M-96 180 q96 42 192 0"/><path d="M-150 240 q150 56 300 0"/>
    </g>
    <!-- walker -->
    <g transform="translate(0 232)" fill="${"#a78bfa"}">
      <circle cx="0" cy="-34" r="17"/>
      <path d="M-4 -16 h10 l10 42 h-14 l-4 -20 l-10 22 h-14 z"/>
    </g>
  </g>`,

  "agri-starter": `  <g transform="translate(400 350)">
    <!-- controller box -->
    <rect x="-160" y="-140" width="320" height="230" rx="26" fill="#1e293b" stroke="#475569" stroke-width="6"/>
    <rect x="-130" y="-110" width="260" height="96" rx="12" fill="#0f172a"/>
    <text x="0" y="-46" fill="${"#34d399"}" font-family="ui-monospace,Menlo,monospace" font-size="34" font-weight="800" text-anchor="middle">PUMP ON</text>
    <!-- gsm bars -->
    <g transform="translate(-96 26)" fill="${"#34d399"}">
      <rect x="0" y="18" width="14" height="18" rx="4"/><rect x="22" y="6" width="14" height="30" rx="4"/>
      <rect x="44" y="-8" width="14" height="44" rx="4"/><rect x="66" y="-22" width="14" height="58" rx="4" opacity="0.4"/>
    </g>
    <circle cx="106" cy="34" r="22" fill="${"#34d399"}"/>
    <!-- antenna: solid stroke, not url(#metal) — a vertical line has a
         zero-width bounding box, so an objectBoundingBox gradient never paints -->
    <path d="M150 -140 v-70" stroke="#cbd5e1" stroke-width="10" stroke-linecap="round"/>
    <circle cx="150" cy="-218" r="12" fill="${"#34d399"}"/>
    <!-- crop rows -->
    <g transform="translate(0 168)" stroke="${"#34d399"}" stroke-width="7" stroke-linecap="round" opacity="0.85" fill="none">
      <path d="M-210 40 v-52 M-210 -4 l-22 -22 M-210 -4 l22 -22"/>
      <path d="M-70 40 v-52 M-70 -4 l-22 -22 M-70 -4 l22 -22"/>
      <path d="M70 40 v-52 M70 -4 l-22 -22 M70 -4 l22 -22"/>
      <path d="M210 40 v-52 M210 -4 l-22 -22 M210 -4 l22 -22"/>
    </g>
  </g>`,

  // The Sentinel leads with the gas grille, because that is the part that makes
  // it a different product from the Touch Switchboard rather than a variant.
  sentinel: `  <g transform="translate(400 350)">
${plate(380, 330)}
    <g transform="translate(-108 -78)">
      <circle cx="0" cy="0" r="62" fill="#0f172a"/>
      <circle cx="0" cy="0" r="62" fill="none" stroke="${"#ef4444"}" stroke-width="5"/>
      <g stroke="${"#ef4444"}" stroke-width="4" stroke-linecap="round" opacity="0.75">
        <path d="M-34 -14H34M-34 0H34M-34 14H34"/>
      </g>
    </g>
    <g transform="translate(84 -92)">
      <text x="0" y="0" fill="#0f172a" font-family="system-ui,Segoe UI,Roboto,sans-serif" font-size="58" font-weight="800" text-anchor="middle">24°</text>
      <text x="0" y="42" fill="#475569" font-family="system-ui,Segoe UI,Roboto,sans-serif" font-size="28" font-weight="600" text-anchor="middle">55% RH</text>
    </g>
    <g transform="translate(0 62)">
      <rect x="-152" y="-34" width="68" height="68" rx="20" fill="#0f172a"/>
      <rect x="-152" y="-34" width="68" height="68" rx="20" fill="none" stroke="${"#ef4444"}" stroke-width="5"/>
      <rect x="-58" y="-34" width="68" height="68" rx="20" fill="#0f172a"/>
      <rect x="-58" y="-34" width="68" height="68" rx="20" fill="none" stroke="${"#ef4444"}" stroke-width="5" opacity="0.4"/>
      <rect x="36" y="-34" width="68" height="68" rx="20" fill="#0f172a"/>
      <rect x="36" y="-34" width="68" height="68" rx="20" fill="none" stroke="${"#ef4444"}" stroke-width="5" opacity="0.4"/>
      <rect x="130" y="-34" width="68" height="68" rx="20" fill="#0f172a"/>
      <rect x="130" y="-34" width="68" height="68" rx="20" fill="none" stroke="${"#ef4444"}" stroke-width="5" opacity="0.4"/>
    </g>
    <g transform="translate(0 148)">
      <rect x="-150" y="-7" width="300" height="14" rx="7" fill="#e2e8f0"/>
      <rect x="-150" y="-7" width="112" height="14" rx="7" fill="${"#ef4444"}"/>
    </g>
  </g>`,
};

const LABELS = {
  watertank: ["WaterTank Duo", "#0ea5e9"],
  touchboard: ["Touch Switchboard", "#2dd4bf"],
  "touchboard-8": ["Touch Switchboard 8", "#2dd4bf"],
  facedoor: ["FaceDoor", "#f43f5e"],
  "rfid-gate": ["RFID Gate", "#f59e0b"],
  camera: ["Camera", "#a855f7"],
  "anpr-cam": ["ANPR Camera", "#0ea5e9"],
  "drone-link": ["Drone Link", "#6366f1"],
  "drone-x1": ["Drone X1", "#6366f1"],
  "energy-monitor": ["Energy Monitor", "#f59e0b"],
  "home-hub": ["Home Hub", "#14b8a6"],
  "smart-switch": ["Smart Switch", "#22d3ee"],
  "motion-sensor": ["Motion Sensor", "#a78bfa"],
  "agri-starter": ["Agri GSM Starter", "#34d399"],
  sentinel: ["Sentinel", "#ef4444"],
};

fs.mkdirSync(OUT, { recursive: true });
let written = 0;
for (const [key, body] of Object.entries(art)) {
  const [label, accent] = LABELS[key];
  const file = path.join(OUT, `product-${key}.svg`);
  fs.writeFileSync(file, frame(accent, label, body));
  written++;
  console.log(`wrote product-${key}.svg`);
}
console.log(`\n${written} illustrations written to public/img`);
