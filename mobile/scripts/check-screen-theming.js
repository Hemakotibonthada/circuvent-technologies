#!/usr/bin/env node
/**
 * A screen that inherits its background must not hardcode its foreground.
 *
 * Automations.tsx defined its whole palette inline — a #0b1020 wrapper, #fff
 * headings, #e5e7eb inputs — and then dropped its own background to
 * "transparent" when rendered with `embedded`, which is how Automate shows it.
 * The background then comes from the theme while the text stays white, so on
 * any light scheme the entire form was white on near-white. It had been
 * invisible there for as long as a light theme has existed, and nothing failed:
 * it typechecks, it renders, it just cannot be read.
 *
 * The rule is narrow on purpose, because it is describing that specific
 * combination and not "hardcoded colours are bad":
 *
 *   A component that can render transparent or embedded — i.e. one that
 *   inherits a surface it does not control — must be theme-aware.
 *
 * Screens that paint their own full-screen background are exempt and correct.
 * Onboarding is the example: it draws its own dark gradient, so its light text
 * is readable under every theme, and forcing it through the palette would make
 * a deliberate branded splash worse.
 *
 *   node scripts/check-screen-theming.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "src", "screens");

/** Colours that mean the same thing in every theme, so they stay literal. */
const SEMANTIC = /#(ef4444|f59e0b|22c55e|fca5a5|dc2626|16a34a|eab308)\b/i;

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    if (entry.endsWith(".tsx")) files.push(p);
  }
})(ROOT);

if (files.length === 0) {
  console.error("FAILED: no screens found — the scan is broken, not the code.");
  process.exit(1);
}

const offenders = [];
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");

  // Does this component inherit a surface it does not own?
  const inherits = /"transparent"/.test(src) || /\bembedded\b/.test(src);
  if (!inherits) continue;

  // Does it paint its own full-screen background regardless? Then it is safe.
  const paintsOwn = /backgroundColor:\s*["'`]#/.test(src) && !/embedded\s*&&/.test(src);

  const themeAware = /useTheme\s*\(/.test(src);
  if (themeAware || paintsOwn) continue;

  // Count only foreground colours that are not semantic.
  const literals = (src.match(/["']#[0-9a-fA-F]{3,8}["']/g) || []).filter((h) => !SEMANTIC.test(h));
  if (literals.length > 0) {
    offenders.push({ file: path.relative(path.join(__dirname, ".."), file), count: literals.length });
  }
}

console.log(`Checked ${files.length} screens for inherited-surface theming.`);
if (offenders.length) {
  console.error(`\n${offenders.length} screen(s) inherit their background but hardcode their foreground:`);
  for (const o of offenders) console.error(`  ${o.file} — ${o.count} non-semantic colour literal(s)`);
  console.error(
    `\nThese render unreadable on any theme whose surface differs from the one the\n` +
    `colours assume. Take colours from useTheme(), or paint a full-screen\n` +
    `background of your own so the foreground is guaranteed to contrast.`
  );
  process.exit(1);
}
console.log("✓ every screen that inherits a surface takes its colours from the theme");
