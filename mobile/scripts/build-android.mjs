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
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const wantApk = args.includes("--apk") || !args.includes("--aab");
const wantAab = args.includes("--aab") || !args.includes("--apk");

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

const tasks = [];
if (wantApk) tasks.push("assembleRelease");
if (wantAab) tasks.push("bundleRelease");

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
const build = spawnSync(gradlew, [...tasks, "--no-daemon"], { cwd: join(ROOT, "android"), stdio: "inherit", shell: true });
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
