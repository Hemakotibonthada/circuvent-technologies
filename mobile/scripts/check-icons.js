#!/usr/bin/env node
/**
 * Verifies every glyph name in src/icons.tsx exists in the installed
 * @expo/vector-icons glyphmaps.
 *
 * A wrong name is invisible to TypeScript in a `satisfies` table and renders at
 * runtime as a blank tofu box — on a screen you may not open during testing.
 * This turns that into a build-time failure.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const GLYPH_DIR = path.join(
  ROOT,
  "node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps"
);

const FAMILIES = { ion: "Ionicons", mci: "MaterialCommunityIcons" };

function loadGlyphs(file) {
  const p = path.join(GLYPH_DIR, `${file}.json`);
  if (!fs.existsSync(p)) {
    console.error(`✖ glyphmap not found: ${p}`);
    process.exit(1);
  }
  return new Set(Object.keys(JSON.parse(fs.readFileSync(p, "utf8"))));
}

const glyphs = Object.fromEntries(
  Object.entries(FAMILIES).map(([k, f]) => [k, loadGlyphs(f)])
);

const src = fs.readFileSync(path.join(ROOT, "src/icons.tsx"), "utf8");
const re = /(?:^|\s)"?([\w-]+)"?:\s*(ion|mci)\("([^"]+)"\)/g;

const bad = [];
let count = 0;
let m;
while ((m = re.exec(src))) {
  const [, key, fam, name] = m;
  count++;
  if (!glyphs[fam].has(name)) bad.push({ key, fam, name });
}

if (count === 0) {
  console.error("✖ parsed 0 icons from src/icons.tsx — the registry format changed?");
  process.exit(1);
}

if (bad.length) {
  console.error(`✖ ${bad.length} of ${count} icon names do not exist:\n`);
  for (const b of bad) {
    const pool = [...glyphs[b.fam]];
    const stem = b.name.split("-")[0];
    const near = pool.filter((g) => g.startsWith(stem)).slice(0, 6);
    console.error(`  ${b.key}: ${b.fam}("${b.name}")`);
    if (near.length) console.error(`      did you mean: ${near.join(", ")}`);
  }
  process.exit(1);
}

console.log(`✓ all ${count} icon names resolve against the installed glyphmaps`);
