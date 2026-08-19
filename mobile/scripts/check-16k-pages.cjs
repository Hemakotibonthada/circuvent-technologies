/*
 * Checks every 64-bit native library in an AAB/APK for 16 KB page alignment.
 *
 * Google Play requires this for apps targeting Android 15+, because arm64
 * devices are moving from 4 KB to 16 KB memory pages. A library whose LOAD
 * segments are only 4 KB aligned cannot be mapped on such a device — the app
 * installs and then crashes on launch, on hardware the developer probably does
 * not own. Play rejects the bundle rather than let that ship.
 *
 * Reads the ELF program headers directly: p_align on every PT_LOAD segment
 * must be >= 16384.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const AdmZip = null;

const file = process.argv[2];
if (!file) {
  console.error("usage: node check-16k.cjs <app.aab|app.apk>");
  process.exit(2);
}

const PT_LOAD = 1;
const REQUIRED = 16384;

/** Returns the largest p_align across PT_LOAD segments, or null if not ELF64. */
function loadAlign(buf) {
  if (buf.length < 64) return null;
  if (buf[0] !== 0x7f || buf[1] !== 0x45 || buf[2] !== 0x4c || buf[3] !== 0x46) return null;
  if (buf[4] !== 2) return null; // not ELF64 — 32-bit ABIs are exempt

  const phoff = Number(buf.readBigUInt64LE(32));
  const phentsize = buf.readUInt16LE(54);
  const phnum = buf.readUInt16LE(56);

  let worst = null;
  for (let i = 0; i < phnum; i++) {
    const off = phoff + i * phentsize;
    if (off + 56 > buf.length) break;
    if (buf.readUInt32LE(off) !== PT_LOAD) continue;
    const align = Number(buf.readBigUInt64LE(off + 48));
    if (worst === null || align < worst) worst = align;
  }
  return worst;
}

// Unzip with the system tool rather than a dependency.
const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "cv16k-"));
execSync(
  `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${path.resolve(file)}' -DestinationPath '${tmp}' -Force"`,
  { stdio: "ignore" },
);

const found = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".so")) found.push(p);
  }
})(tmp);

const bad = [];
let checked = 0;
for (const p of found) {
  const rel = path.relative(tmp, p).replace(/\\/g, "/");
  // Only 64-bit ABIs are subject to the requirement.
  if (!/arm64-v8a|x86_64/.test(rel)) continue;
  const align = loadAlign(fs.readFileSync(p));
  if (align === null) continue;
  checked++;
  if (align < REQUIRED) bad.push({ rel, align });
}

console.log(`checked ${checked} 64-bit libraries`);
if (bad.length === 0) {
  console.log("PASS — every LOAD segment is aligned to at least 16 KB");
} else {
  console.log(`FAIL — ${bad.length} libraries are not 16 KB aligned:`);
  for (const b of bad.slice(0, 25)) console.log(`  ${b.align.toString().padStart(6)}  ${b.rel}`);
  if (bad.length > 25) console.log(`  … and ${bad.length - 25} more`);
}
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(bad.length === 0 ? 0 : 1);
