/*
 * Generates the firmware catalogue from the firmware itself.
 *
 * The catalogue was hand-maintained and had drifted into fiction: twelve of
 * thirteen entries advertised versions that were never built, the camera was
 * fourteen minor versions stale in the other direction, and eleven device types
 * were missing entirely. Because the console decides "this device is behind" by
 * comparing against it, every unit running the newest firmware there is was
 * being told it was out of date — and an OTA campaign filtered on version would
 * have found nothing to install.
 *
 * The firmware declares its own version and documents its own history, so that
 * is now the source and this file is the copy. Run after changing any firmware:
 *
 *   node scripts/generate-firmware-catalog.cjs
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const FW = path.join(ROOT, "firmware");
const OUT = path.join(ROOT, "src/lib/firmware-catalog.generated.ts");

function sourceFor(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ino"));
  return files.length ? path.join(dir, files[0]) : null;
}

/** `#define CV_FW_VERSION "2.3.1"` */
function declaredVersion(src) {
  return src.match(/#define\s+CV_FW_VERSION\s+"([^"]+)"/)?.[1] ?? null;
}

/**
 * The version history a sketch documents about itself.
 *
 * Two shapes are in use. Most sketches write a prose sentence — "1.1.0 is the
 * first build that survives a power cut with the router still down" — inside
 * one comment. A few keep a structured list, one indented entry per release.
 * Both are the firmware describing itself, so both are read; inventing notes
 * for the sketches that document nothing would be worse than showing none.
 */
function history(src, declared) {
  const lines = src.split(/\r?\n/);
  const start = lines.findIndex((l) => /Version history/i.test(l));
  if (start === -1) return [];

  // ── structured: ` * 2.3.0  prose`, continuations indented further ──
  const entries = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\*\/|^#define|^#include/.test(line)) break;

    const head = line.match(/^\s*\*\s{1,3}(\d+\.\d+\.\d+)\s{2,}(.*)$/);
    if (head) {
      entries.push({ version: head[1], text: head[2].trim() });
      continue;
    }
    const cont = line.match(/^\s*\*\s{4,}(\S.*)$/);
    if (cont && entries.length) entries[entries.length - 1].text += " " + cont[1].trim();
  }
  if (entries.length) {
    return entries.map((e) => ({ version: e.version, notes: e.text.replace(/\s+/g, " ").trim() }));
  }

  // ── prose: everything from "Version history" to the end of the comment ──
  let text = "";
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    text += " " + line;
    if (/\*\//.test(line)) break;
    if (/^#define|^#include/.test(line)) break;
  }
  const cleaned = text
    .replace(/\/\*+|\*+\//g, " ")
    .replace(/^\s*\*/gm, " ")
    .replace(/Version history:?/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned ? [{ version: declared, notes: cleaned }] : [];
}

const devices = [];
for (const dir of fs.readdirSync(FW).sort()) {
  const full = path.join(FW, dir);
  if (!fs.statSync(full).isDirectory() || dir === ".pio" || dir === "CircuventDevice") continue;
  const file = sourceFor(full);
  if (!file) continue;
  const src = fs.readFileSync(file, "utf8");
  const version = declaredVersion(src);
  if (!version) continue;
  devices.push({ deviceType: dir, latestVersion: version, changelog: history(src, version) });
}

const body = devices
  .map((d) => {
    const notes = d.changelog
      .map((c) => `    { version: ${JSON.stringify(c.version)}, notes: [${JSON.stringify(c.notes)}] },`)
      .join("\n");
    return `  {
    deviceType: ${JSON.stringify(d.deviceType)},
    latestVersion: ${JSON.stringify(d.latestVersion)},
    changelog: [
${notes}
    ],
  },`;
  })
  .join("\n");

fs.writeFileSync(
  OUT,
  `// GENERATED FILE — do not edit by hand.
//
// Produced by scripts/generate-firmware-catalog.cjs from the firmware sources,
// which declare their own version and document their own history. The console
// compares a device's reported version against this to decide whether it is
// behind, so a hand-maintained copy that drifts tells every up-to-date unit it
// is out of date and makes an OTA campaign filtered on version match nothing.
//
// Regenerate after changing any firmware:  node scripts/generate-firmware-catalog.cjs

import type { FirmwareInfo } from "./smarthome-firmware";

export const GENERATED_FIRMWARE_CATALOG: FirmwareInfo[] = [
${body}
];
`,
  "utf8"
);

console.log(`${devices.length} device types written to ${path.relative(ROOT, OUT)}`);
for (const d of devices) {
  console.log(`  ${d.deviceType.padEnd(18)} ${d.latestVersion.padEnd(9)} ${d.changelog.length} history entries`);
}

