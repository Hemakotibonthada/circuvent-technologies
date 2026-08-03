# 19 — Publishing the Android app

The iOS route is in [18 — Siri and Apple Home](18-siri-and-apple-home.md) §6.
This one covers getting an Android build onto Google Play.

---

## Google Play does not take an APK

Every app first published after August 2021 must be uploaded as an **Android App
Bundle (`.aab`)**. The Play Console rejects a bare `.apk`, and it does so after
the upload rather than at build time.

Both are still useful, so the build script produces both:

| File | What it is for |
| --- | --- |
| `app-release.aab` | The upload to Play Console |
| `app-release.apk` | Sideloading, and handing a tester a file they can install |

---

## One command

```bash
cd mobile
./scripts/build-android.sh            # AAB + APK, release-signed
```

Other modes:

```bash
./scripts/build-android.sh --apk      # APK only — fastest loop
./scripts/build-android.sh --install  # build an APK and push it to a plugged-in phone
./scripts/build-android.sh --debug    # debug APK, no keystore needed, cannot go to Play
./scripts/build-android.sh --bump     # +1 the versionCode first
./scripts/build-android.sh --clean    # discard android/ and regenerate
```

It writes `buildlog.txt` (small, redacted, errors first — this is the one to
share) and `buildlog.full.txt`.

### What it needs

- **JDK 17.** React Native 0.74 builds with 17; newer majors produce Gradle
  errors that read like plugin bugs.
  `brew install --cask temurin@17 && export JAVA_HOME=$(/usr/libexec/java_home -v 17)`
- **Android SDK.** Android Studio installs one, or take the command-line tools:
  ```bash
  brew install --cask android-commandlinetools
  export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
  sdkmanager 'platform-tools' 'platforms;android-34' 'build-tools;34.0.0'
  ```

The script checks both before doing anything slow and prints these commands if
either is missing.

### No local toolchain? Build in the cloud

`eas.json` is already configured, and EAS runs a toolchain matched to the SDK:

```bash
npx eas-cli build --platform android --profile production   # AAB for Play
npx eas-cli build --platform android --profile preview      # APK for testers
```

---

## Signing

Play identifies an app by the key that signs it. The build script creates an
**upload key** on first run:

```
mobile/credentials/circuvent-upload.keystore      the key
mobile/credentials/upload-keystore.properties     its passwords, chmod 600
```

`credentials/`, `*.jks` and `*.keystore` are all git-ignored, and they must stay
that way. **Back both files up somewhere other than this repo.** Nothing here
can regenerate them.

The script refuses to create a second key when one already exists — including a
key under a different filename. That check was added the hard way: an earlier
version matched only its own filename, did not notice a `circuvent-upload.jks`
sitting beside it, and generated a competing key. Had the first one already
published, every later upload would have been refused with "signed with the
wrong key", an error that says nothing about a stray file on disk.

### Why a config plugin

`expo prebuild` regenerates `android/` from the React Native template, and that
template signs the **release** build with the **debug** key:

```gradle
buildTypes {
    release {
        signingConfig signingConfigs.debug
```

That is fine upstream — it makes a release variant runnable with no setup — but
it produces an artifact Play rejects, and React Native's debug keystore ships
with a published password, so a debug-signed release is one anybody could forge
an update for.

`plugins/withAndroidSigning.js` rewrites that during prebuild, reading
credentials from Gradle properties so nothing secret is committed. It walks
braces rather than pattern-matching the file, because `signingConfigs` and
`buildTypes` both contain a block called `release` and an unbounded regex
happily matches across the two — which silently leaves the release build
debug-signed while every other check still passes.

`npm run android:signing:check` verifies the patch against the generated project
(or the template, before the first prebuild). The build script runs it too, and
then checks the finished artifact's actual certificate: a signer of
`CN=Android Debug` fails the build rather than becoming a Play rejection.

---

## Publishing

1. Play Console → **Create app**.
2. Upload the **`.aab`**.
3. Leave **Play App Signing** enabled. Google then holds the real signing key
   and the upload key is only your ticket in — which is the arrangement that can
   be recovered through support if the upload key is ever lost.
4. `versionCode` must increase with every upload. It lives in
   `app.json` → `expo.android.versionCode`; `--bump` increments it.

---

## Known toolchain issue

Expo SDK 51 modules call `useExpoPublishing()`, which publishes each module to
the local Maven repo — something an app build never needs. On newer AGP the
software component it asks for is not registered when that code runs, and the
build dies during configuration:

```
Could not get unknown property 'release' for SoftwareComponent container
```

It fails debug and release alike and points at Expo's own Gradle rather than
anything in this repo. `scripts/patch-expo-android-publishing.js` guards it, and
runs from `postinstall` so it survives a fresh `npm install` on any machine,
including EAS. It is idempotent and skips quietly if upstream changes.

This is the second such patch — `patch-expo-sdk35.js` fixes a null-safety
compile error against `compileSdk 35`. Both are narrow, both are commented with
their reason, and both should be deleted when the SDK is next upgraded and the
underlying problems are gone.
