// Postinstall patch: Expo SDK 51 modules crash Gradle 8.8 / AGP 8.6 before a
// single line of app code is compiled.
//
// Every Expo module's android/build.gradle calls useExpoPublishing(), defined in
// expo-modules-core/android/ExpoModulesCorePlugin.gradle. That helper exists so
// the modules can be published to the local Maven repo while working on Expo
// itself; an app build never uses it. It ends with:
//
//     project.afterEvaluate {
//       publishing {
//         publications {
//           release(MavenPublication) { from components.release }
//
// On newer AGP the `release` software component is not registered by the time
// that afterEvaluate block runs, so `components.release` throws:
//
//     Could not get unknown property 'release' for SoftwareComponent container
//
// and the whole build fails during configuration — for debug and release alike,
// with no useful pointer to the cause.
//
// The fix is to skip the publication when the component genuinely is not there,
// rather than let a developer-tooling convenience abort an app build. Where the
// component does exist, publishing behaves exactly as before.
//
// Idempotent — safe to run on every install (EAS / macOS / CI).
const fs = require("fs");
const path = require("path");

const file = path.join(
  __dirname, "..", "node_modules", "expo-modules-core", "android",
  "ExpoModulesCorePlugin.gradle"
);

const NEEDLE = "  project.afterEvaluate {\n    publishing {";
const REPLACEMENT =
  "  project.afterEvaluate {\n" +
  "    // Patched by scripts/patch-expo-android-publishing.js — see that file.\n" +
  "    // An app build has no need to publish modules to mavenLocal, and on\n" +
  "    // newer AGP this component does not exist, which aborts configuration.\n" +
  "    if (project.components.findByName('release') == null) {\n" +
  "      return\n" +
  "    }\n" +
  "    publishing {";

const MARKER = "patch-expo-android-publishing.js";

try {
  const src = fs.readFileSync(file, "utf8");

  if (src.includes(MARKER)) {
    console.log("[patch-expo-android-publishing] already patched — skipping");
    process.exit(0);
  }
  if (!src.includes(NEEDLE)) {
    // Not fatal: upstream may have fixed this, in which case the patch is no
    // longer wanted. Failing the install over it would be worse than saying so.
    console.log("[patch-expo-android-publishing] pattern not found (upstream changed?) — skipping");
    process.exit(0);
  }

  fs.writeFileSync(file, src.replace(NEEDLE, REPLACEMENT));
  console.log("[patch-expo-android-publishing] guarded components.release for app builds");
} catch (e) {
  console.warn("[patch-expo-android-publishing] skipped:", e.message);
}
