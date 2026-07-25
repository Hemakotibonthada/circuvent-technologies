// Postinstall patch: Expo SDK 51's expo-modules-core accesses
// PackageInfo.requestedPermissions as non-null, which fails to compile against
// Android compileSdk 35 (where the platform marks it @Nullable). Google Play
// now requires targetSdk 35, so we compile against 35 and apply this safe-call
// fix. Idempotent — safe to run on every install (EAS / macOS / CI).
const fs = require("fs");
const path = require("path");

const file = path.join(
  __dirname, "..", "node_modules", "expo-modules-core", "android", "src", "main",
  "java", "expo", "modules", "adapters", "react", "permissions", "PermissionsService.kt"
);

try {
  let src = fs.readFileSync(file, "utf8");
  const bad = "return requestedPermissions.contains(permission)";
  const good = "return requestedPermissions?.contains(permission) ?: false";
  if (src.includes(bad)) {
    fs.writeFileSync(file, src.replace(bad, good));
    console.log("[patch-expo-sdk35] applied requestedPermissions null-safety fix");
  } else {
    console.log("[patch-expo-sdk35] already patched (or upstream changed) — skipping");
  }
} catch (e) {
  console.warn("[patch-expo-sdk35] skipped:", e.message);
}
