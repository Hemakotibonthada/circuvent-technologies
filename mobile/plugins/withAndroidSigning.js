const { withAppBuildGradle } = require("expo/config-plugins");

/**
 * Teaches the generated Android project how to sign a release build.
 *
 * WHY THIS IS NEEDED
 *
 * `expo prebuild` generates android/app/build.gradle from the React Native
 * template, and that template signs the *release* build with the *debug* key:
 *
 *     buildTypes {
 *         release {
 *             signingConfig signingConfigs.debug
 *
 * That is deliberate upstream — it makes a release variant runnable with no
 * setup — but it produces an artifact Google Play rejects, and the rejection
 * arrives after the upload rather than at build time. Worse, the debug
 * keystore ships inside React Native itself with a published password, so a
 * debug-signed release is one anybody could forge an update for.
 *
 * HOW IT SIGNS
 *
 * Credentials are read from Gradle properties rather than written into this
 * file, so nothing secret is ever committed:
 *
 *     CV_UPLOAD_STORE_FILE, CV_UPLOAD_STORE_PASSWORD,
 *     CV_UPLOAD_KEY_ALIAS,  CV_UPLOAD_KEY_PASSWORD
 *
 * scripts/build-android.sh writes them into android/gradle.properties, which
 * lives inside the generated (git-ignored) native directory. They work equally
 * well in ~/.gradle/gradle.properties, which keeps them out of the repo tree
 * altogether.
 *
 * WHY IT FALLS BACK INSTEAD OF FAILING
 *
 * With the properties absent, the release build keeps the template's debug
 * signing. Failing hard would break `expo run:android` for anyone who only
 * wants to run the app, and this plugin is applied unconditionally. The build
 * script verifies the finished artifact's actual signer instead, so a build
 * that ended up debug-signed is caught there rather than shipped.
 */

/** The template's `signingConfigs { ... }` block, which we extend. */
const SIGNING_CONFIGS = /signingConfigs\s*\{/;
/** `buildTypes { ... }`, which holds the release variant we repoint. */
const BUILD_TYPES = /buildTypes\s*\{/;
/** Our own conditional, used to stay idempotent. */
const OURS = /signingConfig\s+project\.hasProperty\('CV_UPLOAD_STORE_FILE'\)/;

const RELEASE_CONFIG = `
        release {
            // Populated from Gradle properties by scripts/build-android.sh.
            // Absent during a plain \`expo run:android\`, which is why every
            // access below is guarded.
            if (project.hasProperty('CV_UPLOAD_STORE_FILE')) {
                storeFile file(project.property('CV_UPLOAD_STORE_FILE'))
                storePassword project.property('CV_UPLOAD_STORE_PASSWORD')
                keyAlias project.property('CV_UPLOAD_KEY_ALIAS')
                keyPassword project.property('CV_UPLOAD_KEY_PASSWORD')
            }
        }
`;

const OUR_SIGNING_LINE =
  "signingConfig project.hasProperty('CV_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug";

/**
 * Returns the body span of the block a regex opens, by counting braces.
 *
 * Gradle nests, and `signingConfigs` is followed later in the same file by
 * `buildTypes`, which has a `release` block of its own. An unbounded `[\s\S]*?`
 * search for "does signingConfigs already define release" happily runs past the
 * end of signingConfigs and finds buildTypes.release instead — so the plugin
 * concludes there is nothing to add, adds nothing, and the release build stays
 * debug-signed while every other check still passes. Counting braces bounds the
 * search to the block actually asked about.
 */
function blockBody(contents, opener, fromIndex = 0) {
  const re = new RegExp(opener.source, opener.flags.includes("g") ? opener.flags : opener.flags + "g");
  re.lastIndex = fromIndex;
  const m = re.exec(contents);
  if (!m) return null;
  const bodyStart = m.index + m[0].length;   // just past the '{'
  let depth = 1;
  for (let i = bodyStart; i < contents.length; i++) {
    const ch = contents[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return { start: bodyStart, end: i, text: contents.slice(bodyStart, i) };
    }
  }
  return null;                                // unbalanced; caller treats as unknown
}

function patchBuildGradle(contents) {
  let out = contents;

  // ---- 1. make sure signingConfigs defines a `release` entry ----
  const signing = blockBody(out, SIGNING_CONFIGS);
  if (!signing) {
    // The template changed shape. Saying so beats emitting a project that
    // looks signed and is not.
    throw new Error(
      "[withAndroidSigning] no balanced signingConfigs block in android/app/build.gradle — " +
        "the React Native template changed and this plugin needs updating."
    );
  }
  if (!/(^|\s)release\s*\{/.test(signing.text)) {
    out = out.slice(0, signing.start) + "\n" + RELEASE_CONFIG + out.slice(signing.start);
  }

  // ---- 2. point buildTypes.release at it ----
  //
  // Located by walking braces rather than by matching the template's exact
  // wording. `android/` is generated and git-ignored, so it can legitimately
  // already contain a previous run's patch — or, as happened here, a stale one
  // from some older tooling using different property names. Rewriting whatever
  // signingConfig the release block currently has makes this plugin
  // authoritative over a directory that is disposable anyway, and keeps a
  // second prebuild from either stacking edits or refusing to run.
  const buildTypes = blockBody(out, BUILD_TYPES);
  if (!buildTypes) {
    throw new Error(
      "[withAndroidSigning] no balanced buildTypes block in android/app/build.gradle — " +
        "the React Native template changed and this plugin needs updating."
    );
  }
  const release = blockBody(out, /release\s*\{/, buildTypes.start);
  if (!release || release.end > buildTypes.end) {
    throw new Error(
      "[withAndroidSigning] no release block inside buildTypes in android/app/build.gradle — " +
        "the React Native template changed and this plugin needs updating."
    );
  }

  const existing = /^([ \t]*)signingConfig[ \t]+.*$/m.exec(release.text);
  if (existing) {
    const replaced = release.text.replace(
      /^([ \t]*)signingConfig[ \t]+.*$/m,
      (_m, indent) => `${indent}${OUR_SIGNING_LINE}`
    );
    out = out.slice(0, release.start) + replaced + out.slice(release.end);
  } else {
    out = out.slice(0, release.start) + `\n            ${OUR_SIGNING_LINE}` + out.slice(release.start);
  }

  if (!OURS.test(out)) {
    // Belt and braces: never return something that only looks patched.
    throw new Error(
      "[withAndroidSigning] failed to write the release signingConfig — refusing to " +
        "produce a project that would be signed with the debug key."
    );
  }

  return out;
}

module.exports = function withAndroidSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") {
      throw new Error(
        `[withAndroidSigning] expected a Groovy build.gradle, got ${cfg.modResults.language}`
      );
    }
    cfg.modResults.contents = patchBuildGradle(cfg.modResults.contents);
    return cfg;
  });
};

// Exported for the unit test, which exercises the patch against the template
// text rather than requiring a full prebuild.
module.exports.patchBuildGradle = patchBuildGradle;
