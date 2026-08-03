// Every device type the app can render must also be offerable in Add Device.
//
// The list used to be hand-maintained beside DEVICE_META and drifted: five
// shipped types (touchboard, watertank, rfid-gate, facedoor, sentinel) could be
// controlled but never added. It is derived now, and this guards the derivation
// rather than trusting it.
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

function metaTypes() {
  const src = fs.readFileSync(path.join(root, "src/theme.ts"), "utf8");
  const block = src.split("export const DEVICE_META")[1].split("\n};")[0];
  return [...new Set((block.match(/^\s*"?([a-z0-9-]+)"?:\s*\{/gm) || [])
    .map((s) => s.trim().replace(/[":{]/g, "").trim()))];
}

function orderList() {
  const src = fs.readFileSync(path.join(root, "src/screens/AddDevice.tsx"), "utf8");
  const m = src.match(/const ORDER = \[([\s\S]*?)\];/);
  if (!m) return null;
  return (m[1].match(/"([a-z0-9-]+)"/g) || []).map((s) => s.replace(/"/g, ""));
}

const meta = metaTypes();
const order = orderList();

let bad = 0;

if (!order) {
  console.error("✖ could not find ORDER in AddDevice.tsx — was the list hardcoded again?");
  process.exit(1);
}

// Types absent from ORDER still appear (the derivation appends them), so this
// is a presentation warning rather than a failure.
const unordered = meta.filter((t) => !order.includes(t));
if (unordered.length) {
  console.log(`  note: not in ORDER, will appear last — ${unordered.join(", ")}`);
}

// A name in ORDER that no longer exists is dead weight and usually means a type
// was renamed on one side only.
const stale = order.filter((t) => !meta.includes(t));
if (stale.length) {
  console.error(`  FAIL stale entries in ORDER with no DEVICE_META: ${stale.join(", ")}`);
  bad++;
}

// The real guard: the screen must not go back to a literal list.
const src = fs.readFileSync(path.join(root, "src/screens/AddDevice.tsx"), "utf8");
if (/const TYPES\s*=\s*\[\s*\{\s*id:/.test(src)) {
  console.error("  FAIL TYPES is a hardcoded array again — derive it from DEVICE_META");
  bad++;
}

if (bad) {
  console.error(`\n✖ ${bad} problem(s): some device types would be unaddable.`);
  process.exit(1);
}
console.log(`✓ all ${meta.length} device types are offerable in Add Device`);
