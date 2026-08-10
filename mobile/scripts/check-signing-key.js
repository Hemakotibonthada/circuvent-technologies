#!/usr/bin/env node
/*
 * Does this build carry the key Google Play will accept?
 *
 * A release was built, verified, published to dist/ and uploaded -- and Play
 * refused it: "signed with the wrong key". The verification that had been done
 * compared the signer against *previous local builds*, which proved only that
 * the same wrong key had been used before. Nothing on this machine knew what
 * Play expected, so nothing could tell.
 *
 * Two guards, both of which would have stopped it:
 *
 *   1. credentials/ must hold exactly one keystore. There were two -- a .jks
 *      from July and a .keystore generated beside it in August, by tooling that
 *      only looked for its own filename. The bash build script already refuses
 *      to run in that state; that check never ran here because bash on this
 *      machine is WSL with no distribution installed, so the build was driven
 *      through gradle directly and walked straight past it. Hence a Node port:
 *      a guard that only works on one platform is a guard that gets skipped.
 *
 *   2. A built artifact must be signed by the fingerprint Play expects, which
 *      is recorded in play-upload-key.json. Checked before upload, not after.
 */
const { execFileSync } = require("child_process");
const { readdirSync, existsSync, readFileSync, statSync } = require("fs");
const { join } = require("path");

const ROOT = join(__dirname, "..");
const CRED = join(ROOT, "credentials");
const EXPECTED = JSON.parse(readFileSync(join(ROOT, "play-upload-key.json"), "utf8"));

/*
 * --not-for-play: this artifact is being sideloaded, not uploaded.
 *
 * Only the AAB goes to Play. An APK is installed directly, and Play never sees
 * it, so "Play would refuse this" is not a reason to refuse to build one. While
 * the upload key reset is pending that distinction is the difference between
 * being able to test the app at all and not, and a guard that blocks work it
 * was never meant to block is one that gets disabled wholesale -- taking the
 * checks that did matter with it.
 *
 * The debug key is exempt from the exemption. Its password is published in the
 * React Native template, so anyone can sign an update that Android accepts as
 * the same app. That is worse on a sideloaded build, not better: there is no
 * store in front of it.
 */
const NOT_FOR_PLAY = process.argv.includes("--not-for-play");

let failed = false;
const fail = (title, lines) => {
  failed = true;
  console.log(`\n✗ ${title}`);
  for (const l of lines) console.log(`    ${l}`);
};
const ok = (msg) => console.log(`  ok   ${msg}`);

/* ---------------------------------------------------------------- 1 ---- */

/*
 * Which fingerprint must a build carry right now?
 *
 * There are two answers and the difference matters. Until Google approves the
 * upload key reset, Play still only accepts the original key — so a build
 * signed with the replacement is just as rejectable as one signed with the
 * wrong key, and saying "ok" for it would recreate the exact failure this
 * script exists to prevent. After approval the answer flips.
 */
const RESET_APPROVED = EXPECTED.resetStatus === "approved";
const REQUIRED = (RESET_APPROVED && EXPECTED.replacementKey ? EXPECTED.replacementKey.sha1 : EXPECTED.uploadCertificate.sha1).toUpperCase();
const REQUIRED_LABEL = RESET_APPROVED ? "the replacement upload key" : "the original upload key";

if (!existsSync(CRED)) {
  console.log("  --   no credentials/ yet; nothing to check");
} else {
  const keys = readdirSync(CRED).filter((f) => /\.(jks|keystore|p12|pfx)$/i.test(f));
  const active = EXPECTED.activeKeystore;

  if (keys.length > 1 && !active) {
    fail("credentials/ holds more than one keystore and none is designated", [
      ...keys.map((k) => `${k}  (${statSync(join(CRED, k)).mtime.toISOString().slice(0, 10)})`),
      "",
      "Only one of them signs the app on Play, and guessing is not safe.",
      `Play expects ${EXPECTED.uploadCertificate.sha1}.`,
      'Set "activeKeystore" in play-upload-key.json to the one the build should use.',
      "",
      "Fingerprints of the ones already known to be wrong are in play-upload-key.json.",
    ]);
  } else if (keys.length > 1 && active) {
    if (!keys.includes(active)) {
      fail(`play-upload-key.json names a keystore that is not in credentials/`, [
        `activeKeystore  ${active}`,
        `present         ${keys.join(", ")}`,
      ]);
    } else {
      ok(`${keys.length} keystores, using ${active} (the others are recorded as superseded or wrong)`);
    }
  } else if (keys.length === 1) {
    ok(`one keystore: ${keys[0]}`);
  } else {
    console.log("  --   credentials/ has no keystore yet");
  }
}

/* ---------------------------------------------------------------- 2 ---- */

/** Where a release artifact ends up, in the order worth checking. */
const ARTIFACTS = [
  join(ROOT, "android/app/build/outputs/bundle/release/app-release.aab"),
  join(ROOT, "android/app/build/outputs/apk/release/app-release.apk"),
  ...(existsSync(join(ROOT, "dist"))
    ? readdirSync(join(ROOT, "dist"))
        .filter((f) => /\.(aab|apk)$/i.test(f))
        .map((f) => join(ROOT, "dist", f))
    : []),
];

function jdkTool(name) {
  const home = process.env.JAVA_HOME;
  if (home) {
    const p = join(home, "bin", process.platform === "win32" ? `${name}.exe` : name);
    if (existsSync(p)) return p;
  }
  return name;
}

/** SHA1 and owner of the signing certificate. Works for both .apk and .aab. */
function signerInfo(file) {
  try {
    // keytool -printcert -jarfile reads the signature block out of any signed
    // JAR-format archive, which both an APK and an AAB are. jarsigner was tried
    // first and does not print a fingerprint at all -- it names the signer and
    // its algorithm, which is exactly enough information to feel verified
    // while telling you nothing about which key it was.
    const out = execFileSync(jdkTool("keytool"), ["-printcert", "-jarfile", file], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const m = out.match(/SHA1:\s*([0-9A-F:]{40,})/i);
    const owner = out.match(/Owner:\s*(.+)/i);
    return { sha1: m ? m[1].toUpperCase() : null, owner: owner ? owner[1].trim() : "" };
  } catch {
    return { sha1: null, owner: "" };
  }
}

const signerSha1 = (file) => signerInfo(file).sha1;

/*
 * A debug certificate is identified by its subject, not its fingerprint.
 *
 * android/app/debug.keystore is generated per machine, so its fingerprint is
 * whatever was rolled here -- the one recorded in play-upload-key.json is only
 * this machine's. A fresh clone, or CI, produces a different fingerprint that
 * matches no record, and matching on the record alone would wave it through as
 * merely "unrecognised". The distinguished name is fixed by the Android tooling
 * that creates it, so it is the same everywhere and is what actually says
 * "debug".
 */
const isDebugCert = (owner) => /\bCN=Android Debug\b/i.test(owner || "");

const latest = ARTIFACTS.filter(existsSync).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];

/*
 * Fingerprint everything in dist/, not just the newest.
 *
 * The moment the key changed is obvious from the list and invisible from any
 * single artifact: 1.1.0 through 1.8.0 carry the key Play accepts, and
 * everything from 1.10.0 carries the one it refuses. Reading only the latest
 * build tells you that it is wrong; reading the series tells you when it went
 * wrong, which is what leads to the keystore that did it.
 */
function auditHistory() {
  const dist = join(ROOT, "dist");
  if (!existsSync(dist)) return;
  const files = readdirSync(dist)
    .filter((f) => /\.(aab|apk)$/i.test(f))
    .sort();
  if (!files.length) return;

  const want = REQUIRED;
  const rows = files.map((f) => ({ f, ...signerInfo(join(dist, f)) }));
  const good = rows.filter((r) => r.sha1 === want).map((r) => r.f);
  const bad = rows.filter((r) => r.sha1 && r.sha1 !== want);

  console.log(`\n  dist/ — ${good.length} signed with ${REQUIRED_LABEL}, ${bad.length} not`);
  if (bad.length) {
    for (const r of bad) console.log(`         wrong: ${r.f}  ${r.sha1}`);
  }

  /*
   * A forgeable artifact anywhere in dist/ fails the run, not just the newest.
   *
   * Everything above this point judges one artifact -- whichever was written
   * last. A build that emits both an apk and an aab therefore has only one of
   * them checked, and the other is mentioned in a list and otherwise ignored.
   * That is survivable for the upload key, where the artifact that goes to Play
   * is the one being examined. It is not survivable for the debug key: dist/ is
   * where builds are picked up from to be handed round, and an entry in a
   * printed list is not a guard.
   */
  const forgeable = rows.filter((r) => isDebugCert(r.owner));
  if (forgeable.length) {
    fail(`${forgeable.length === 1 ? "an artifact in dist/ is" : `${forgeable.length} artifacts in dist/ are`} signed with a debug key`, [
      ...forgeable.map((r) => `${r.f}  ${r.sha1}  ${r.owner}`),
      "",
      "A debug certificate's password is published in the Android tooling that",
      "generates it, so anyone can sign an update Android will install over the",
      "top of this app. Delete these, or rebuild them with the release key.",
    ]);
  }
}

if (!latest) {
  console.log("  --   no built artifact to check yet");
} else {
  const { sha1, owner } = signerInfo(latest);
  const want = REQUIRED;

  if (!sha1) {
    console.log(`  --   could not read the signer of ${latest.replace(ROOT, ".")} (needs a JDK on PATH or JAVA_HOME)`);
  } else if (sha1 === want) {
    ok(`${latest.replace(ROOT, ".")} is signed with ${REQUIRED_LABEL}`);
  } else {
    const known = EXPECTED.knownWrongKeys.find((k) => k.sha1.toUpperCase() === sha1);
    const isReplacement = EXPECTED.replacementKey && EXPECTED.replacementKey.sha1.toUpperCase() === sha1;
    const isDebugKey = isDebugCert(owner) || (known && /debug\.keystore$/i.test(known.file));

    if (NOT_FOR_PLAY && !isDebugKey) {
      console.log(`\n  !    ${latest.replace(ROOT, ".")} is not the key Play accepts — fine for sideloading, not uploadable`);
      console.log(`       signed by ${sha1}`);
      console.log(`       Play expects ${want}  (${REQUIRED_LABEL})`);
      console.log("       Build with --aab, or without a target, to have this enforced.");
    } else if (isDebugKey) {
      fail("this release artifact is signed with the debug key", [
        `artifact  ${latest.replace(ROOT, ".")}`,
        `signed by ${sha1}   ${known ? known.file : owner}`,
        "",
        ...(known ? [known.why, ""] : ["Its password is published in the Android tooling that generates it.", ""]),
        "This is refused for a sideloaded build too. Android identifies an app by",
        "its signing certificate, so anyone who wanted to could build an 'update'",
        "this device would install over the top of it.",
      ]);
    } else {
      fail("this build would be rejected by Google Play", [
      `artifact  ${latest.replace(ROOT, ".")}`,
      `signed by ${sha1}`,
      `expected  ${want}  (${REQUIRED_LABEL})`,
      "",
      ...(isReplacement
        ? [
            "That is the replacement upload key, and the reset has not been approved yet.",
            `play-upload-key.json says resetStatus is "${EXPECTED.resetStatus}".`,
            "Play will keep refusing this until Google confirms the reset; once they do,",
            'set resetStatus to "approved" and this build becomes the correct one.',
            "",
          ]
        : known
          ? [`That is ${known.file}.`, known.why, ""]
          : ["That key is not one of the ones recorded in play-upload-key.json.", ""]),
      "Point CV_UPLOAD_STORE_FILE at the keystore whose certificate matches, and rebuild.",
      "If the matching keystore is lost, see howToCompleteTheReset in play-upload-key.json.",
      ]);
    }
  }
}

auditHistory();

if (failed) {
  process.exitCode = 1;
} else if (NOT_FOR_PLAY) {
  console.log("\n✓ signing:key — nothing here is signed with a forgeable key (Play acceptance not checked)");
} else {
  console.log("\n✓ signing:key — nothing here would be refused by Play");
}
