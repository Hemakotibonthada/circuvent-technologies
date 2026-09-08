// Postinstall patch: React Native / Expo iOS build scripts split paths at spaces
// when invoked via `sh -c "$VAR $SCRIPT"`. Idempotent.
const fs = require("fs");
const path = require("path");

const mobileRoot = path.join(__dirname, "..");
const rnRoot = path.join(mobileRoot, "node_modules", "react-native");

const patches = [
  {
    file: path.join(rnRoot, "scripts", "react_native_pods_utils", "script_phases.rb"),
    bad: '/bin/sh -c "$WITH_ENVIRONMENT $SCRIPT_PHASES_SCRIPT"',
    good: '"$WITH_ENVIRONMENT" "$SCRIPT_PHASES_SCRIPT"',
    label: "script_phases.rb",
  },
  {
    file: path.join(rnRoot, "scripts", "codegen", "generate-artifacts-executor.js"),
    bad: '/bin/sh -c "$WITH_ENVIRONMENT $SCRIPT_PHASES_SCRIPT"',
    good: '"$WITH_ENVIRONMENT" "$SCRIPT_PHASES_SCRIPT"',
    label: "generate-artifacts-executor.js",
  },
  {
    file: path.join(rnRoot, "scripts", "xcode", "with-environment.sh"),
    bad: "  $1\n",
    good: '  "$@"\n',
    label: "with-environment.sh",
  },
  {
    file: path.join(mobileRoot, "node_modules", "expo-constants", "ios", "EXConstants.podspec"),
    bad: ':script => \'bash -l -c "$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh"\',',
    good: ':script => \'bash -l "$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh"\',',
    label: "EXConstants.podspec",
  },
];

for (const { file, bad, good, label } of patches) {
  try {
    const src = fs.readFileSync(file, "utf8");
    if (src.includes(good)) {
      console.log(`[patch-rn-path-spaces] ${label} already patched — skipping`);
      continue;
    }
    if (!src.includes(bad)) {
      console.log(`[patch-rn-path-spaces] ${label} upstream changed — skipping`);
      continue;
    }
    fs.writeFileSync(file, src.replace(bad, good));
    console.log(`[patch-rn-path-spaces] patched ${label}`);
  } catch (e) {
    console.warn(`[patch-rn-path-spaces] ${label} skipped:`, e.message);
  }
}
