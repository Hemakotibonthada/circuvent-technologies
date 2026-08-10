#!/usr/bin/env node
/*
 * Every iOS permission the app can trigger must have a usage description.
 *
 * iOS does not warn about a missing NSxxxUsageDescription -- it terminates the
 * app the instant the API is touched. On a phone that means the user taps
 * "scan the QR label" during setup and the app disappears, with nothing in the
 * UI to explain it. This is the one class of mistake that cannot be found by
 * using the app on Android.
 *
 * So: find the APIs in the source, and check the plist covers them.
 */
const { readFileSync, readdirSync, statSync } = require("fs");
const { join, relative } = require("path");

const ROOT = join(__dirname, "..");
const app = JSON.parse(readFileSync(join(ROOT, "app.json"), "utf8"));
const plist = app.expo?.ios?.infoPlist ?? {};
const androidPerms = app.expo?.android?.permissions ?? [];

/** [what the code does, the key iOS needs, the Android permission] */
const NEEDS = [
  { match: /expo-camera|CameraView|useCameraPermissions|BarCodeScanner/, key: "NSCameraUsageDescription", android: "android.permission.CAMERA", why: "camera (QR scanning during setup)" },
  { match: /expo-location|getCurrentPositionAsync|requestForegroundPermissions/, key: "NSLocationWhenInUseUsageDescription", android: "android.permission.ACCESS_FINE_LOCATION", why: "location (finding nearby devices)" },
  { match: /expo-av|Audio\.Recording|startRecordingAsync|RECORD_AUDIO/, key: "NSMicrophoneUsageDescription", android: "android.permission.RECORD_AUDIO", why: "microphone" },
  { match: /MediaLibrary|saveToLibraryAsync|createAssetAsync/, key: "NSPhotoLibraryAddUsageDescription", android: "android.permission.WRITE_EXTERNAL_STORAGE", why: "saving to the photo library" },
  { match: /expo-contacts|Contacts\.getContactsAsync/, key: "NSContactsUsageDescription", android: "android.permission.READ_CONTACTS", why: "contacts" },
  { match: /Notifications\.requestPermissionsAsync|expo-notifications/, key: null, android: "android.permission.POST_NOTIFICATIONS", why: "notifications" },
  /*
   * Face ID is the sharpest version of what this script is for.
   *
   * Without NSFaceIDUsageDescription, authenticateAsync does not fail and does
   * not warn -- iOS terminates the process. So an app lock, whose entire job is
   * to run before anything else, would close the app on every launch on any
   * Face ID iPhone, while behaving perfectly on Android and on Touch ID Macs.
   *
   * The string was added by hand when the lock was written and nothing was
   * checking it, which is precisely the state this file exists to prevent.
   */
  { match: /expo-local-authentication|LocalAuthentication\.authenticateAsync/, key: "NSFaceIDUsageDescription", android: "android.permission.USE_BIOMETRIC", why: "Face ID / fingerprint app lock" },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const files = walk(join(ROOT, "src"));
const problems = [];
const notes = [];
const found = [];

/*
 * Android permissions are not all in app.json.
 *
 * expo-camera and expo-notifications inject CAMERA and POST_NOTIFICATIONS
 * through their config plugins, so app.json lists neither and the built APK
 * has both. Checking app.json alone reported two defects that did not exist
 * and would have had someone add redundant entries. The merged manifest is the
 * only honest source, and it only exists after a prebuild -- so when it is not
 * there, this says so rather than guessing.
 */
const MERGED = join(ROOT, "android", "app", "src", "main", "AndroidManifest.xml");
let manifest = null;
try {
  manifest = readFileSync(MERGED, "utf8");
} catch {
  /* not prebuilt */
}

for (const need of NEEDS) {
  const users = files.filter((f) => need.match.test(readFileSync(f, "utf8")));
  if (!users.length) continue;
  found.push({ why: need.why, count: users.length, sample: relative(ROOT, users[0]) });

  // iOS: a missing usage description is a hard termination, and app.json is
  // the whole truth for it.
  if (need.key && !plist[need.key]) {
    problems.push(`iOS would terminate on first use of ${need.why}: app.json is missing ios.infoPlist.${need.key}\n      used in ${relative(ROOT, users[0])}`);
  }

  if (!need.android) continue;
  const declared = androidPerms.includes(need.android);
  const inManifest = manifest ? manifest.includes(need.android) : null;
  if (declared || inManifest) continue;
  if (inManifest === null) {
    notes.push(`can't verify ${need.android} for ${need.why} — no merged manifest; run expo prebuild first`);
  } else {
    problems.push(`Android is missing ${need.android} for ${need.why}\n      used in ${relative(ROOT, users[0])}`);
  }
}

console.log("permission-gated APIs in use:");
for (const f of found) console.log(`  ${f.why.padEnd(42)} ${f.count} file(s), e.g. ${f.sample}`);

// A description that exists but says nothing is its own failure: App Review
// rejects "We need your camera", and rightly.
for (const [k, v] of Object.entries(plist)) {
  if (/UsageDescription$/.test(k) && typeof v === "string" && v.trim().length < 25) {
    problems.push(`${k} is too vague to pass App Review: "${v}"`);
  }
}

if (problems.length) {
  console.log("\n✗ permissions:check");
  for (const p of problems) console.log(`   - ${p}`);
  process.exitCode = 1;
} else {
  for (const n of notes) console.log(`\n  note: ${n}`);
  console.log("\n✓ permissions:check — every permission-gated API has a usage description");
}
