#!/usr/bin/env node
/**
 * Checks plugins/withAndroidSigning.js against the real React Native template.
 *
 * The patch is a pair of regexes over generated Gradle, which is exactly the
 * kind of thing that keeps working until a template bump moves a brace. It is
 * also invisible when it goes wrong: the build still succeeds and produces an
 * APK signed with React Native's published debug key, which Google Play only
 * rejects after the upload.
 *
 * The template shipped in node_modules is the input, so this fails the moment
 * an upgrade changes the shape the plugin depends on.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

/**
 * Inputs, in order of preference.
 *
 * The generated project is the real thing the plugin runs against, so it is
 * tested when present. The React Native template is the stable fallback that
 * exists straight after `npm install`, before anything has been prebuilt.
 *
 * Testing only the template is what let a bug through once already: the
 * template matched, the generated directory did not, and the plugin threw
 * during a real build.
 */
const CANDIDATES = [
  path.join(ROOT, "android/app/build.gradle"),
  path.join(ROOT, "node_modules/react-native/template/android/app/build.gradle"),
];

const { patchBuildGradle } = require(path.join(ROOT, "plugins/withAndroidSigning.js"));

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    console.error(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
    failures++;
  }
}

const TEMPLATE = CANDIDATES.find((p) => fs.existsSync(p));
if (!TEMPLATE) {
  console.error("✖ no build.gradle to check against. Run npm install first.");
  process.exit(1);
}
console.log(`  using ${path.relative(ROOT, TEMPLATE)}`);

const original = fs.readFileSync(TEMPLATE, "utf8");
const patched = patchBuildGradle(original);

check(
  "release buildType picks its config at build time",
  /release\s*\{[\s\S]*?signingConfig project\.hasProperty\('CV_UPLOAD_STORE_FILE'\)/.test(patched)
);

check(
  "a release signingConfig exists",
  /signingConfigs\s*\{[\s\S]*?release\s*\{[\s\S]*?storeFile file\(project\.property\('CV_UPLOAD_STORE_FILE'\)\)/.test(patched)
);

// There are two `signingConfig` lines — one in buildTypes.debug and one in
// buildTypes.release. Only the second should move. A greedy regex rewrites the
// debug variant instead and leaves release debug-signed, which is the failure
// this file exists to catch.
const debugBlock = patched.match(/buildTypes\s*\{[\s\S]*?debug\s*\{([\s\S]*?)\}/);
check(
  "debug buildType still uses the debug key",
  debugBlock && /signingConfig\s+signingConfigs\.debug\s*$/m.test(debugBlock[1]),
  "the patch hit buildTypes.debug instead of buildTypes.release"
);

check(
  "exactly one conditional signingConfig was written",
  (patched.match(/project\.hasProperty\('CV_UPLOAD_STORE_FILE'\) \? signingConfigs\.release/g) || []).length === 1
);

// android/ is generated and git-ignored, so prebuild frequently runs against a
// directory a previous build already patched. A second pass must not stack
// another block or corrupt the first.
check("patch is idempotent", patchBuildGradle(patched) === patched);

// The case that actually broke a real build: a leftover android/ carrying a
// signing config from older tooling, using different property names. The
// plugin has to take ownership of that line rather than refuse to run.
const foreign = original.replace(
  /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/,
  "$1signingConfig project.hasProperty('LEGACY_STORE_FILE') ? signingConfigs.release : signingConfigs.debug"
);
let foreignPatched = null;
try {
  foreignPatched = patchBuildGradle(foreign);
} catch (e) {
  /* reported by the check below */
}
check(
  "adopts a foreign signing config left in a stale android/",
  foreignPatched && OURS_ONLY(foreignPatched),
  "a stale generated directory would fail every build until deleted by hand"
);
function OURS_ONLY(text) {
  return (
    /signingConfig project\.hasProperty\('CV_UPLOAD_STORE_FILE'\)/.test(text) &&
    !/LEGACY_STORE_FILE/.test(text)
  );
}

// A file that is not recognisably a Gradle build script must fail loudly rather
// than silently emitting a project signed with the debug key.
let threw = false;
try {
  patchBuildGradle("plugins { id 'com.android.application' }\n");
} catch {
  threw = true;
}
check("throws when the file shape is unrecognised", threw);

if (failures) {
  console.error(`\n✖ ${failures} check(s) failed — release builds may be debug-signed.`);
  process.exit(1);
}
console.log("\n✓ android release signing patch verified");
