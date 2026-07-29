// Fails if src/version.ts has drifted from app.json.
//
// The About screen showed a hardcoded "1.0.0" for four releases because nothing
// checked it. This runs in `npm run typecheck` so the drift can't come back.

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const app = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8")).expo;
const src = fs.readFileSync(path.join(root, "src", "version.ts"), "utf8");

const version = (src.match(/APP_VERSION\s*=\s*"([^"]+)"/) || [])[1];
const build = Number((src.match(/APP_BUILD\s*=\s*(\d+)/) || [])[1]);

// android/ is prebuilt and checked in, so app.json does NOT drive the APK
// manifest — build.gradle does. Bumping app.json alone silently ships an APK
// stamped with the old version, which is exactly what happened for 1.5.0.
const gradlePath = path.join(root, "android", "app", "build.gradle");
const gradle = fs.existsSync(gradlePath) ? fs.readFileSync(gradlePath, "utf8") : "";
const gName = (gradle.match(/versionName\s+"([^"]+)"/) || [])[1];
const gCode = Number((gradle.match(/versionCode\s+(\d+)/) || [])[1]);

const errors = [];
if (version !== app.version) {
  errors.push(`APP_VERSION "${version}" !== app.json expo.version "${app.version}"`);
}
if (build !== app.android?.versionCode) {
  errors.push(`APP_BUILD ${build} !== app.json expo.android.versionCode ${app.android?.versionCode}`);
}
if (gradle && gName !== version) {
  errors.push(`build.gradle versionName "${gName}" !== APP_VERSION "${version}"`);
}
if (gradle && gCode !== build) {
  errors.push(`build.gradle versionCode ${gCode} !== APP_BUILD ${build}`);
}

if (errors.length) {
  console.error("version:check FAILED\n  " + errors.join("\n  "));
  process.exit(1);
}
console.log(`version:check ok — ${version} (${build})`);
