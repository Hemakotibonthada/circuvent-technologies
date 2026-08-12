#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// NAV TARGETS — is every tab still big enough to hit?
// ═══════════════════════════════════════════════════════════════
// The bottom bar divides one row between a fixed home button and N pills, each
// `flex: 1`. So every tab added makes every tab narrower, silently, everywhere,
// and the phone where it stops being tappable is not the one on this desk.
//
// This computes the pill width from the real constants in Shell.tsx at the
// screen widths people actually have, and fails when the effective target — the
// pill plus its hitSlop — drops below the 48dp minimum that both Material and
// Apple's HIG land on.
//
// It reads the numbers out of Shell.tsx rather than restating them, because a
// guard holding its own copy of the layout is a guard that passes after the
// layout changes.
//
//   node scripts/check-nav-targets.js

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const shell = readFileSync(join(here, "..", "src", "screens", "Shell.tsx"), "utf8");

const fail = (msg) => {
  console.error(`\n✗ nav:targets — ${msg}\n`);
  process.exit(1);
};

/** Pull a single number out of a style declaration, e.g. `width: 62,`. */
function styleNumber(block, prop) {
  const m = new RegExp(`${prop}:\\s*(\\d+)`).exec(block);
  return m ? Number(m[1]) : null;
}

function blockFor(name) {
  const start = shell.indexOf(`${name}: {`);
  if (start === -1) return null;
  const end = shell.indexOf("},", start);
  return end === -1 ? null : shell.slice(start, end);
}

// How many pills share the row. TABS minus the ones excluded from PILL_TABS.
const tabKeys = [...shell.matchAll(/\{\s*key:\s*"([a-z]+)"/g)].map((m) => m[1]);
if (tabKeys.length === 0) fail("could not find the TABS list in Shell.tsx");

const excluded = [...shell.matchAll(/t\.key\s*!==\s*"([a-z]+)"/g)].map((m) => m[1]);
const pills = tabKeys.filter((k) => !excluded.includes(k));
if (pills.length === 0) fail("could not work out which tabs are pills");

const navWrap = blockFor("navWrap");
const homeBtn = blockFor("homeBtn");
if (!navWrap || !homeBtn) fail("could not find navWrap / homeBtn styles");

const left = styleNumber(navWrap, "left") ?? 0;
const right = styleNumber(navWrap, "right") ?? 0;
const gap = styleNumber(navWrap, "gap") ?? 0;
const home = styleNumber(homeBtn, "width") ?? 0;

// hitSlop on the pill Pressable. Taken as the smallest one present, so a
// generous slop elsewhere cannot flatter the result.
const slops = [...shell.matchAll(/hitSlop=\{(\d+)\}/g)].map((m) => Number(m[1]));
const slop = slops.length ? Math.min(...slops) : 0;

/*
 * Widths in dp of phones still in use. 320 is the floor Android itself
 * guarantees; 360 is the single most common Android width; 411 is a Pixel;
 * 320 is also what a large-display accessibility setting produces on a phone
 * that would otherwise be 411, which is the case people forget.
 */
const SCREENS = [
  { dp: 320, note: "smallest supported / large-display setting" },
  { dp: 360, note: "most common Android width" },
  { dp: 393, note: "Pixel 8" },
  { dp: 411, note: "Pixel 7 / emulator" },
];

const MIN_TARGET = 48;

console.log(
  `nav:targets — ${pills.length} pills (${pills.join(", ")}), ` +
    `home ${home}dp, gutters ${left}+${right}, gap ${gap}, hitSlop ${slop}`
);

let worst = Infinity;
const failures = [];

for (const s of SCREENS) {
  const rowWidth = s.dp - left - right;
  const pillRow = rowWidth - home - gap;
  const each = pillRow / pills.length;
  const effective = each + slop * 2;
  worst = Math.min(worst, effective);

  const ok = effective >= MIN_TARGET;
  console.log(
    `  ${String(s.dp).padStart(4)}dp  pill ${each.toFixed(1)}dp  ` +
      `+slop ${effective.toFixed(1)}dp  ${ok ? "ok" : "TOO SMALL"}   ${s.note}`
  );
  if (!ok) failures.push(`${s.dp}dp → ${effective.toFixed(1)}dp`);
}

if (failures.length) {
  fail(
    `a tab is smaller than the ${MIN_TARGET}dp minimum on: ${failures.join(", ")}.\n` +
      `  Adding a tab makes every tab narrower. Either remove one, move it into More,\n` +
      `  or make the bar scroll horizontally instead of dividing a fixed row.`
  );
}

console.log(
  `\n✓ nav:targets ok — smallest effective target ${worst.toFixed(1)}dp, ` +
    `minimum ${MIN_TARGET}dp\n`
);
