/*
 * Renders the Witness schematic to SVG.
 *
 * A generator rather than a drawn file, for the same reason the product art is
 * generated: the diagram and the netlist in Docs/39-witness.md have to agree,
 * and the only way to keep two hand-maintained things in step is to stop
 * maintaining one of them by hand.
 *
 *   node scripts/gen-witness-schematic.js
 */
const fs = require("fs");
const path = require("path");

const W = 1200;
const H = 620;

const INK = "#e2e8f0";
const DIM = "#64748b";
const WIRE = "#94a3b8";
const ACCENT = "#22d3ee";
const WARN = "#f97316";
const BG = "#0b1220";

/** A titled block with pin labels down each side. */
function block(x, y, w, h, title, sub, accent = ACCENT) {
  return `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8"
          fill="${accent}" fill-opacity="0.07" stroke="${accent}" stroke-width="1.6"/>
    <text x="${x + w / 2}" y="${y + 22}" fill="${INK}" font-size="14" font-weight="700"
          text-anchor="middle" font-family="ui-sans-serif,system-ui">${title}</text>
    ${
      sub
        ? `<text x="${x + w / 2}" y="${y + 40}" fill="${DIM}" font-size="11"
                 text-anchor="middle" font-family="ui-monospace,monospace">${sub}</text>`
        : ""
    }
  </g>`;
}

function wire(pts, color = WIRE, dash = "") {
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ");
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`;
}

function label(x, y, text, color = DIM, size = 11, anchor = "start") {
  return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" text-anchor="${anchor}"
            font-family="ui-monospace,monospace">${text}</text>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="28" y="34" fill="${INK}" font-size="17" font-weight="700"
        font-family="ui-sans-serif,system-ui">Circuvent Witness — signal chain</text>
  <text x="28" y="54" fill="${DIM}" font-size="12" font-family="ui-sans-serif,system-ui">
    One split-core transformer does two jobs: it powers the board and it measures the load. Nothing here touches mains.
  </text>

  <!-- ================= the conductor under test ================= -->
  <g>
    <text x="28" y="100" fill="${WARN}" font-size="12" font-weight="700"
          font-family="ui-monospace,monospace">APPLIANCE FLEX (not connected to this board)</text>
    ${wire([[28, 132], [1152, 132]], WARN)}
    <text x="1152" y="118" fill="${DIM}" font-size="11" text-anchor="end"
          font-family="ui-monospace,monospace">live conductor, 230 V</text>
  </g>

  <!-- clamp -->
  <g>
    <ellipse cx="150" cy="132" rx="34" ry="22" fill="none" stroke="${ACCENT}" stroke-width="3"/>
    ${label(150, 178, "CT1  split core", ACCENT, 12, "middle")}
    ${label(150, 194, "1000:1, 10 A", DIM, 11, "middle")}
  </g>
  ${wire([[150, 154], [150, 214]])}

  <!-- ================= protection ================= -->
  ${block(70, 214, 160, 92, "Protection", "SW1 + D1 TVS", WARN)}
  ${label(80, 274, "shorts CT when idle", WARN, 10)}
  ${label(80, 288, "open secondary = kV", WARN, 10)}

  ${wire([[150, 306], [150, 342]])}

  <!-- split: harvest and measure -->
  ${wire([[150, 342], [150, 366], [330, 366]])}
  ${wire([[150, 342], [150, 470], [330, 470]])}
  ${label(158, 358, "harvest", DIM)}
  ${label(158, 462, "measure", DIM)}

  <!-- ================= harvest path ================= -->
  ${block(330, 330, 170, 74, "Rectifier", "D2–D5 Schottky")}
  ${wire([[500, 366], [560, 366]])}
  ${block(560, 322, 200, 90, "Harvester", "BQ25504 boost + MPPT")}
  ${label(570, 396, "cold start 330 mV", DIM, 10)}
  ${wire([[760, 366], [820, 366]])}
  ${block(820, 322, 150, 90, "Storage", "C1 0.47 F 5.5 V")}
  ${wire([[970, 366], [1020, 366]])}
  ${block(1020, 336, 130, 62, "LDO 3V3", "TPS7A02")}

  <!-- ================= measure path ================= -->
  ${block(330, 434, 170, 74, "Burden", "R1 22 Ω 0.1%")}
  ${wire([[500, 470], [560, 470]])}
  ${block(560, 434, 200, 74, "Bias + filter", "½VDD, 1 kHz LPF")}
  ${wire([[760, 470], [820, 470]])}

  <!-- ================= MCU ================= -->
  ${block(820, 434, 330, 132, "ESP32-C6-MINI-1", "802.15.4 + BLE 5 + Wi-Fi 6")}
  ${label(836, 502, "ADC1_CH4  ← burden", DIM, 11)}
  ${label(836, 520, "GPIO      → SW1 short", DIM, 11)}
  ${label(836, 538, "ADC1_CH0  ← C1 volts", DIM, 11)}
  ${label(836, 556, "deep sleep 7 µA", ACCENT, 11)}

  <!-- rail from LDO to MCU -->
  ${wire([[1085, 398], [1085, 420], [985, 420], [985, 434]], ACCENT)}
  ${label(1092, 416, "3V3", ACCENT)}

  <!-- antenna -->
  ${wire([[1150, 470], [1166, 470]], ACCENT)}
  ${label(1146, 456, "ant", ACCENT, 10, "end")}

  <!-- notes -->
  ${label(28, 596, "No galvanic connection to mains. The core clamps around the outside of the flex; the board sees only the induced secondary current.", DIM, 11)}
</svg>
`;

const out = path.join(__dirname, "..", "public", "img", "witness-schematic.svg");
fs.writeFileSync(out, svg);
console.log("wrote", path.basename(out), svg.length, "bytes");
