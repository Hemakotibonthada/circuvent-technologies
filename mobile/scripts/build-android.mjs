#!/usr/bin/env node
/*
 * Build the Android release on any platform, with the signing checks that
 * matter run before and after.
 *
 * scripts/build-android.sh is the documented path and it is a good script --
 * it refuses to build when credentials/ holds more than one keystore, which is
 * exactly the mistake that got a bundle rejected by Play. It could not run on
 * this machine: `bash` here is WSL with no distribution installed. So the build
 * was driven through expo prebuild and gradle by hand, which walked straight
 * past every check the script performs.
 *
 * A guard that only exists on one platform is a guard that gets skipped on the
 * day it matters. This is the same sequence in Node.
 *
 *   node scripts/build-android.mjs            # apk + aab
 *   node scripts/build-android.mjs --apk      # apk only
 *   node scripts/build-android.mjs --aab      # play bundle only
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

/*
 * Reject flags this script does not understand.
 *
 * `--not-for-play` is the *checker's* flag, and passing it here looked exactly
 * like it worked: no error, no warning, and a build that then failed the Play
 * check anyway. An unrecognised argument silently doing nothing is worse than
 * refusing it, because the only symptom is the thing you were trying to avoid.
 */
const KNOWN = new Set(["--apk", "--aab", "--not-for-play"]);
const unknown = args.filter((a) => !KNOWN.has(a));
if (unknown.length) {
  console.log(`\n✗ Unknown option${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}`);
  console.log("    usage: build-android.mjs [--apk] [--aab] [--not-for-play]");
  console.log("    --apk           sideload build; skips the Play upload-key check");
  console.log("    --aab           Play bundle; enforces the upload key");
  console.log("    --not-for-play  same as --apk, kept because the checker spells it this way");
  process.exit(1);
}

/*
 * `--not-for-play` is accepted as a synonym for `--apk`: it is what the
 * signing checker calls the same idea, and having the two scripts disagree on
 * the spelling is how the silent no-op happened in the first place.
 */
const apkOnly = args.includes("--apk") || args.includes("--not-for-play");
const wantApk = apkOnly || !args.includes("--aab");
const wantAab = args.includes("--aab") || !apkOnly;

const say = (s) => console.log(`\n=== ${s}`);
const die = (s, extra = []) => {
  console.log(`\n✗ ${s}`);
  for (const l of extra) console.log(`    ${l}`);
  process.exit(1);
};

/* ------------------------------------------------------------ preflight -- */

/*
 * An APK is sideloaded and an AAB is uploaded, so they answer to different
 * rules. The signing check is told which one is being built: for a Play bundle
 * it enforces the upload certificate, for an APK alone it reports a mismatch
 * and carries on. It refuses the debug key either way.
 */
const forPlay = wantAab;

say(`Checking the signing key before building anything${forPlay ? "" : " (apk only — not checked against Play)"}`);
const pre = spawnSync(
  process.execPath,
  [join(ROOT, "scripts/check-signing-key.js"), ...(forPlay ? [] : ["--not-for-play"])],
  { stdio: "inherit" },
);
if (pre.status !== 0) {
  die("Not building: the signing check failed.", [
    "Building now would produce an artifact Google Play refuses, which is a",
    "seven-minute build and an upload before anything tells you.",
  ]);
}

/*
 * The version the app *displays* has to match the one it is built as.
 *
 * `version:check` already existed and already catches this, but it only ran
 * under `npm run typecheck` — so bumping app.json and building produced an APK
 * whose About screen confidently reported the previous build number. Nothing
 * failed; the artifact was just quietly mislabelled, which is the worst way to
 * get a bug report about a version that was never shipped.
 */
say("Checking the displayed version matches the build");
const ver = spawnSync(process.execPath, [join(ROOT, "scripts/version-check.js")], {
  stdio: "inherit",
});
if (ver.status !== 0) {
  die("Not building: app.json and src/version.ts disagree.", [
    "The About screen would report a different build than the one produced.",
  ]);
}

/* -------------------------------------------------------------- gradle --- */

const CRED = join(ROOT, "credentials");
const propsFile = join(CRED, "upload-keystore.properties");
if (!existsSync(propsFile)) die(`No ${propsFile.replace(ROOT, ".")} — a keystore cannot be opened without its password.`);

const props = Object.fromEntries(
  readFileSync(propsFile, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.startsWith("CV_UPLOAD"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const keystores = existsSync(CRED) ? readdirSync(CRED).filter((f) => /\.(jks|keystore|p12|pfx)$/i.test(f)) : [];
/*
 * More than one keystore used to be an automatic refusal, because two of them
 * appearing side by side is what got a bundle rejected by Play. During an
 * upload key reset that state is legitimate and unavoidable — the old key has
 * to stay until Google approves the replacement — so the rule is now that one
 * of them must be *named*, in play-upload-key.json, rather than that only one
 * may exist. Guessing is still refused.
 */
const expected = JSON.parse(readFileSync(join(ROOT, "play-upload-key.json"), "utf8"));
let chosen;
if (keystores.length === 1) {
  chosen = keystores[0];
} else if (keystores.length === 0) {
  die("No keystore in credentials/.");
} else if (!expected.activeKeystore) {
  die(
    `Found ${keystores.length} keystores in credentials/ (${keystores.join(", ")}) and play-upload-key.json does not say which to use.\n` +
      `Set "activeKeystore" to one of them.`
  );
} else if (!keystores.includes(expected.activeKeystore)) {
  die(`play-upload-key.json names "${expected.activeKeystore}", which is not in credentials/ (${keystores.join(", ")}).`);
} else {
  chosen = expected.activeKeystore;
}
const keystore = join(CRED, chosen).replace(/\\/g, "/");
say(`signing with ${chosen}`);

say("expo prebuild");
execFileSync("npx", ["expo", "prebuild", "--platform", "android", "--no-install"], { cwd: ROOT, stdio: "inherit", shell: true });

say("Writing signing properties");
const gp = join(ROOT, "android", "gradle.properties");
let text = readFileSync(gp, "utf8");
/*
 * The trailing newline is load-bearing. Appending to a file that does not end
 * in one produced `android.extraMavenRepos=[]CV_UPLOAD_STORE_FILE=...`, which
 * gradle read as a single unknown property -- so the release build silently
 * fell back to the debug key and shipped an APK anybody could forge.
 */
if (!text.endsWith("\n")) text += "\n";
text = text.replace(/^CV_UPLOAD_.*\n/gm, "");
text +=
  `CV_UPLOAD_STORE_FILE=${keystore}\n` +
  `CV_UPLOAD_STORE_PASSWORD=${props.CV_UPLOAD_STORE_PASSWORD}\n` +
  `CV_UPLOAD_KEY_ALIAS=${props.CV_UPLOAD_KEY_ALIAS}\n` +
  `CV_UPLOAD_KEY_PASSWORD=${props.CV_UPLOAD_KEY_PASSWORD}\n`;
writeFileSync(gp, text);

/*
 * Some ABIs cannot be built from a path this deep, and it is measurable which.
 *
 * ninja stats its dependencies as paths relative to its own working directory,
 * and the longest pair in a React Native build is
 *
 *   cwd  <root>\node_modules\expo-modules-core\android\.cxx\RelWithDebInfo\<hash>\<abi>
 *   dep  ../prefab/<abi>/prefab/lib/<triple>/cmake/ReactAndroid/ReactAndroidConfigVersion.cmake
 *
 * Windows length-checks that against MAX_PATH after joining and BEFORE
 * collapsing the "..", so the ABI name counts twice and the toolchain triple
 * once. For armeabi-v7a from this checkout it comes to 261 against a limit of
 * 260 -- over by a single character, because the repository lives under
 * "Office Apps\Office Apps". arm64-v8a comes to 257 and builds.
 *
 * The symptom names none of this. The stat fails, so ninja concludes that a
 * file which is plainly on disk does not exist; a file that cannot exist can
 * never be made clean; so it regenerates the manifest, re-checks, and gives up
 * after a hundred rounds with "manifest 'build.ninja' still dirty after 100
 * tries". LongPathsEnabled is already 1 here and does not help: ninja is not
 * marked long-path aware, so it never gets the longer limit.
 *
 * Substituting a drive letter was tried and does not work. Gradle canonicalises
 * paths, which resolves the substitution straight back to C:\ -- it invokes
 * ninja with the long path regardless, and the shortening looks broken rather
 * than ignored. A junction fails the same way for the same reason.
 *
 * So the honest options are to move the checkout somewhere shorter or to build
 * the ABIs that fit. This builds the ones that fit and says which it dropped.
 */
const MAX_PATH = 260;
const CXX_SUFFIX = 69; // \node_modules\expo-modules-core\android\.cxx\RelWithDebInfo\<hash>\
const DEP_FIXED = 73; // ../prefab//prefab/lib//cmake/ReactAndroid/ReactAndroidConfigVersion.cmake
const TRIPLE = {
  "armeabi-v7a": "arm-linux-androideabi",
  "arm64-v8a": "aarch64-linux-android",
  x86: "i686-linux-android",
  x86_64: "x86_64-linux-android",
};

/** Longest path Windows will have to length-check while building this ABI. */
const abiPathBudget = (abi) => ROOT.length + CXX_SUFFIX + abi.length + 1 + DEP_FIXED + abi.length + TRIPLE[abi].length;

const configuredAbis = (() => {
  const gp = join(ROOT, "android/gradle.properties");
  const m = existsSync(gp) && readFileSync(gp, "utf8").match(/^reactNativeArchitectures=(.+)$/m);
  return m ? m[1].split(",").map((s) => s.trim()).filter((a) => TRIPLE[a]) : Object.keys(TRIPLE);
})();

const tooDeep = process.platform === "win32" ? configuredAbis.filter((a) => abiPathBudget(a) > MAX_PATH) : [];
const buildableAbis = configuredAbis.filter((a) => !tooDeep.includes(a));

if (tooDeep.length) {
  console.log(`\n  !    dropping ${tooDeep.join(", ")} — this checkout is too deep for the Windows native build`);
  for (const a of tooDeep) console.log(`       ${a.padEnd(12)} needs ${abiPathBudget(a)} characters, MAX_PATH is ${MAX_PATH}`);
  console.log(`       building ${buildableAbis.join(", ") || "nothing"}`);
  if (!buildableAbis.length) {
    die("No ABI fits. Move the checkout to a shorter path.", [
      `This one is ${ROOT.length} characters and would need to lose ${Math.max(...configuredAbis.map(abiPathBudget)) - MAX_PATH}.`,
    ]);
  }
  console.log("       32-bit-only devices will not be able to install the result.");
}

const tasks = [];
if (wantApk) tasks.push("assembleRelease");
if (wantAab) tasks.push("bundleRelease");

/*
 * A CMake configuration remembers the ABIs it was configured for.
 *
 * So narrowing the ABI list on its own changes nothing: gradle finds an
 * existing .cxx directory holding a configuration for armeabi-v7a, reuses it,
 * and builds the ABI that cannot work. Configurations for a dropped ABI are
 * therefore discarded, and only those.
 */
function dropStaleNativeConfig(dropped) {
  if (!dropped.length) return;
  const candidates = [join(ROOT, "android/app/.cxx")];
  const modules = join(ROOT, "node_modules");
  if (existsSync(modules)) {
    for (const entry of readdirSync(modules)) {
      const dirs = entry.startsWith("@")
        ? readdirSync(join(modules, entry)).map((s) => join(modules, entry, s))
        : [join(modules, entry)];
      for (const d of dirs) {
        const cxx = join(d, "android/.cxx");
        if (existsSync(cxx)) candidates.push(cxx);
      }
    }
  }

  for (const cxx of candidates) {
    for (const abi of dropped) {
      for (const dir of findAbiDirs(cxx, abi)) {
        rmSync(dir, { recursive: true, force: true });
        console.log(`  cleared ${dir.replace(ROOT, ".")}`);
      }
    }
  }
}

/** Directories named after an ABI below a .cxx directory. */
function findAbiDirs(dir, abi, depth = 0) {
  if (depth > 4 || !existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const p = join(dir, e.name);
    if (e.name === abi) out.push(p);
    else out.push(...findAbiDirs(p, abi, depth + 1));
  }
  return out;
}

dropStaleNativeConfig(tooDeep);

/*
 * An ABI that is dropped must also not be packaged.
 *
 * reactNativeArchitectures only decides what gets compiled from source. The
 * prebuilt .so files inside the AAR dependencies are packaged for every ABI
 * regardless, so the first build produced an APK containing an armeabi-v7a
 * directory with 46 of the 47 libraries in it -- everything except the one
 * that had been skipped, libexpo-modules-core.so.
 *
 * That is worse than not supporting the ABI. Android picks the directory
 * matching the device, so a 32-bit phone installs the app successfully and
 * then dies on the missing library at startup. Filtering the packaging makes
 * the same device refuse the install instead, which is a message someone can
 * act on. This is written after prebuild because prebuild regenerates it.
 */
if (tooDeep.length) {
  const bg = join(ROOT, "android/app/build.gradle");
  let gradle = readFileSync(bg, "utf8");
  gradle = gradle.replace(/\n *ndk \{\n *abiFilters[^\n]*\n *\}\n/g, "\n");
  const filters = buildableAbis.map((a) => `'${a}'`).join(", ");
  gradle = gradle.replace(/(defaultConfig \{\n)/, `$1        ndk {\n            abiFilters ${filters}\n        }\n`);
  writeFileSync(bg, gradle);
  console.log(`  packaging only ${buildableAbis.join(", ")}`);
}

say(`gradle ${tasks.join(" ")}`);
/*
 * .\ is not optional, even though cmd normally searches the working directory.
 *
 * It searches it unless NoDefaultCurrentDirectoryInExePath is set, which it is
 * on this machine -- a hardening measure against dropping a lookalike binary
 * into a directory someone is about to run a command in. With it set, a bare
 * gradlew.bat is "not recognized" while sitting in the same folder, which reads
 * as a missing Android toolchain rather than a path rule. The unix branch has
 * always had ./ for the same reason and never hit it.
 */
const gradlew = process.platform === "win32" ? ".\\gradlew.bat" : "./gradlew";
const gradleArgs = [...tasks, "--no-daemon"];
if (tooDeep.length) gradleArgs.push(`-PreactNativeArchitectures=${buildableAbis.join(",")}`);
const build = spawnSync(gradlew, gradleArgs, { cwd: join(ROOT, "android"), stdio: "inherit", shell: true });
if (build.status !== 0) die("gradle failed");

/* -------------------------------------------------------------- verify --- */

say("Verifying what was actually produced");
const version = JSON.parse(readFileSync(join(ROOT, "app.json"), "utf8")).expo;
const dist = join(ROOT, "dist");
mkdirSync(dist, { recursive: true });

const outputs = [
  ["apk", join(ROOT, "android/app/build/outputs/apk/release/app-release.apk")],
  ["aab", join(ROOT, "android/app/build/outputs/bundle/release/app-release.aab")],
];
for (const [kind, file] of outputs) {
  if (!existsSync(file)) continue;
  const named = join(dist, `circuvent-${version.version}-${version.android.versionCode}.${kind}`);
  copyFileSync(file, named);
  console.log(`  ${named.replace(ROOT, ".")}`);
}

const post = spawnSync(
  process.execPath,
  [join(ROOT, "scripts/check-signing-key.js"), ...(forPlay ? [] : ["--not-for-play"])],
  { stdio: "inherit" },
);
if (post.status !== 0) {
  die("The build finished but is signed with the wrong key. Do not upload it.");
}

console.log(
  forPlay
    ? "\n✓ built and signed with the key Play expects"
    : "\n✓ built and signed — sideload this; it is not the key Play accepts",
);
