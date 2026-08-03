#!/usr/bin/env node
/**
 * Every theme's text must stay readable.
 *
 * Palettes are hand-picked hex values, and the ones that fail do so quietly —
 * a caption at 2.9:1 looks "subtle" on the designer's monitor and is invisible
 * on a phone in daylight. Two of the themes added here shipped their first
 * draft below the line and were only caught by measuring.
 *
 * WCAG AA is 4.5:1 for body text. `faint` carries real content — room names,
 * "Off", timestamps — so it is held to the same bar as the rest, not the
 * 3:1 large-text exception.
 */
const fs = require("fs");
const path = require("path");

const SRC = fs.readFileSync(path.join(__dirname, "..", "src", "theme.ts"), "utf8");

function luminance(hex) {
  const s = hex.replace("#", "");
  const v = [0, 2, 4]
    .map((i) => parseInt(s.substr(i, 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}

function ratio(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// Each palette is a flat object literal in buildPalette(). Pull the fields that
// matter and the surface they sit on.
const blocks = SRC.split(/return \{/).slice(1);
const AA = 4.5;

let checked = 0;
let failures = 0;

for (const block of blocks) {
  const body = block.split(/\n\s*\};/)[0];
  const get = (k) => {
    const m = new RegExp(`\\b${k}:\\s*"(#[0-9a-fA-F]{6})"`).exec(body);
    return m ? m[1] : null;
  };
  const modeM = /\bmode,\s*scheme(?::\s*"(\w+)")?/.exec(body);
  const card = get("card");
  if (!card) continue;

  // buildPalette spreads `mode` from its argument, so the literal name is not
  // in the text. The surface colour identifies the block well enough for a
  // failure message to be actionable.
  const name = `palette card=${card}${modeM && modeM[1] ? ` scheme=${modeM[1]}` : ""}`;

  for (const field of ["text", "textDim", "faint"]) {
    const fg = get(field);
    if (!fg) continue;
    checked++;
    const r = ratio(fg, card);
    if (r < AA) {
      console.error(`  FAIL ${name}  ${field} ${fg} on ${card} = ${r.toFixed(2)}:1 (need ${AA})`);
      failures++;
    }
  }
}

if (!checked) {
  console.error("✖ parsed no palettes from theme.ts — did buildPalette change shape?");
  process.exit(1);
}

if (failures) {
  console.error(`\n✖ ${failures} of ${checked} colour pairs are below WCAG AA.`);
  process.exit(1);
}
console.log(`✓ all ${checked} theme text colours meet WCAG AA against their surface`);
