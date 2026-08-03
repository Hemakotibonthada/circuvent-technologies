#!/usr/bin/env node
/**
 * Guards the command → state projection.
 *
 * This bug has now shipped twice: once on the web (fixed in
 * smarthome-command-map.ts) and once in the app, where a Home Hub's
 * { ch, on } was merged straight into state. The switch snapped back on every
 * tap and stayed wrong until the device echoed, which reads to a user as "the
 * first control is instant but nothing changes, then it is unusably slow".
 *
 * Plain node, no test runner, matching the other scripts in this folder.
 */
const path = require("path");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src", "command-map.ts");

// Transpiled with the real compiler rather than stripped with regexes. The
// first attempt at this used a pile of replace() calls and fell over on the
// first generic it met — which would have meant "the test cannot load the
// module" masquerading as a passing suite if it had been any less noisy.
let tsc;
try {
  tsc = require("typescript");
} catch {
  console.log("  skipped: typescript not installed (run npm install)");
  process.exit(0);
}

const js = tsc.transpileModule(fs.readFileSync(SRC, "utf8"), {
  compilerOptions: { module: tsc.ModuleKind.CommonJS, target: tsc.ScriptTarget.ES2019 },
}).outputText;

const tmp = path.join(os.tmpdir(), `cv-cmdmap-${process.pid}.js`);
fs.writeFileSync(tmp, js);

let projectCommand;
try {
  ({ projectCommand } = require(tmp));
} catch (e) {
  console.error("✖ could not load command-map.ts for testing:", e.message);
  fs.unlinkSync(tmp);
  process.exit(1);
}

let failures = 0;
function eq(name, got, want) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) console.log(`  ok   ${name}`);
  else { console.error(`  FAIL ${name}\n       got  ${a}\n       want ${b}`); failures++; }
}

// The bug, stated directly: a Home Hub channel command must move the field the
// widget renders, and must not leave its own addressing in state.
eq("home-hub ch0 -> power", projectCommand("home-hub", { action: "set", ch: 0, on: true }), { power: true });
eq("home-hub ch1 -> power2", projectCommand("home-hub", { action: "set", ch: 1, on: true }), { power2: true });
eq("home-hub ch3 -> power4", projectCommand("home-hub", { action: "set", ch: 3, on: false }), { power4: false });
eq("home-hub never echoes ch/on", projectCommand("home-hub", { action: "set", ch: 9, on: true }), {});
eq("home-hub scene", projectCommand("home-hub", { action: "set", scene: "away" }),
  { scene: "away", power: false, power2: false, power3: false, power4: false });

eq("touchboard all", projectCommand("touchboard", { action: "set", all: true }), { g1: true, g2: true, g3: true });
eq("sentinel relay", projectCommand("sentinel", { action: "set", r3: true }), { r3: true });
eq("sentinel all needs the reported count", projectCommand("sentinel", { action: "set", all: true }), {});
eq("sentinel all with count", projectCommand("sentinel", { action: "set", all: true }, { relays: 2 }), { r1: true, r2: true });
eq("gate action -> barrier", projectCommand("rfid-gate", { action: "open" }), { barrier: "open" });
eq("lock action -> locked", projectCommand("smart-lock", { action: "unlock" }), { locked: false });
eq("pump drops auto", projectCommand("aquaguard", { action: "set", pump: true }), { pump: true, auto: false });
eq("generic scalar echo", projectCommand("smart-plug", { action: "set", power: true }), { power: true });

// A generic device must not have addressing keys land in its state either.
eq("generic skips structural keys", projectCommand("smart-plug", { action: "set", ch: 2, on: true }), {});

fs.unlinkSync(tmp);

if (failures) {
  console.error(`\n✖ ${failures} projection(s) wrong — controls will not respond.`);
  process.exit(1);
}
console.log("\n✓ command projections match the firmware's published fields");
