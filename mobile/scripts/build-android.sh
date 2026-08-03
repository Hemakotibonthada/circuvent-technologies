#!/usr/bin/env bash
#
# Build the Circuvent Android app, and write a log worth sharing.
#
#   cd mobile
#   ./scripts/build-android.sh              # AAB for Play + APK for sideloading
#   ./scripts/build-android.sh --apk        # APK only (fastest; cannot go to Play)
#   ./scripts/build-android.sh --aab        # Play bundle only
#   ./scripts/build-android.sh --install    # also install the APK on a plugged-in phone
#   ./scripts/build-android.sh --debug      # debug APK, no keystore needed, testing only
#   ./scripts/build-android.sh --clean      # wipe android/ and rebuild from scratch
#   ./scripts/build-android.sh --bump       # +1 the Android versionCode first
#
# GOOGLE PLAY TAKES AN .AAB, NOT AN .APK. Every app first published after
# August 2021 must be uploaded as an Android App Bundle; the Play Console
# rejects a plain APK. The APK this produces is for sideloading and for handing
# testers a file they can install directly. Both are built by default.
#
# Signing: a release upload keystore is created on first run under
# credentials/, which is git-ignored. Back that file up. It is the identity of
# the app on Play, and this script cannot recreate it.
#
# Produces two files in mobile/:
#   buildlog.txt       small, redacted, errors first — this is the one to share
#   buildlog.full.txt  everything, for local digging
#
# Deliberately does NOT use `set -e`: a build that fails is the case this script
# exists for, and aborting the moment it does would skip writing the summary.

set -uo pipefail

# Resolved before the cd below: $0 is often relative, and after changing
# directory it would no longer point at this file — which broke --help in the
# iOS script.
SCRIPT="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"

cd "$(dirname "$0")/.." || exit 1
ROOT="$(pwd)"

LOG="$ROOT/buildlog.txt"
FULL="$ROOT/buildlog.full.txt"
CRED_DIR="$ROOT/credentials"
KEYSTORE="$CRED_DIR/circuvent-upload.keystore"
KEYPROPS="$CRED_DIR/upload-keystore.properties"
KEY_ALIAS="circuvent-upload"

WANT_APK=0
WANT_AAB=0
INSTALL=0
CLEAN=0
DEBUG_BUILD=0
BUMP=0
for arg in "$@"; do
  case "$arg" in
    --apk)     WANT_APK=1 ;;
    --aab)     WANT_AAB=1 ;;
    --install) INSTALL=1; WANT_APK=1 ;;
    --debug)   DEBUG_BUILD=1; WANT_APK=1 ;;
    --clean)   CLEAN=1 ;;
    --bump)    BUMP=1 ;;
    -h|--help) sed -n '2,28p' "$SCRIPT"; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)"; exit 2 ;;
  esac
done
# Default: both, because the one people ask for (APK) is not the one Play wants.
if [ "$WANT_APK" -eq 0 ] && [ "$WANT_AAB" -eq 0 ]; then WANT_APK=1; WANT_AAB=1; fi
if [ "$DEBUG_BUILD" -eq 1 ]; then WANT_AAB=0; fi

: > "$FULL"
FAILED_STEP=""
START_TS=$(date +%s)

# --------------------------------------------------------------- helpers ---

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; printf '\n==> %s\n' "$1" >> "$FULL"; }
note() { printf '    %s\n' "$1"; printf '    %s\n' "$1" >> "$FULL"; }

run() {
  local label="$1"; shift
  say "$label"
  # pipefail is set, so this is the command's status, not tee's.
  "$@" 2>&1 | tee -a "$FULL"
  local status=${PIPESTATUS[0]}
  if [ "$status" -ne 0 ]; then
    note "FAILED (exit $status): $*"
    [ -z "$FAILED_STEP" ] && FAILED_STEP="$label"
  fi
  return $status
}

# ------------------------------------------------------------- preflight ---

say "Environment"

# `java -version` prints to stderr and spans several lines. Capture, then trim —
# piping it straight into head under pipefail is what made the iOS script report
# a perfectly good Xcode as missing.
JAVA_RAW="$(java -version 2>&1 || true)"
JAVA_VER="$(printf '%s\n' "$JAVA_RAW" | head -1)"
JAVA_MAJOR="$(printf '%s\n' "$JAVA_RAW" | sed -nE 's/.*version "([0-9]+).*/\1/p' | head -1)"

# Gradle needs to be told where the SDK is. ANDROID_HOME is the modern name,
# ANDROID_SDK_ROOT the older one, and Android Studio installs to a fixed path.
SDK=""
for candidate in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
  if [ -n "$candidate" ] && [ -d "$candidate" ]; then SDK="$candidate"; break; fi
done

{
  echo "date            : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "macOS           : $(sw_vers -productVersion 2>/dev/null || echo 'not macOS')"
  echo "arch            : $(uname -m)"
  echo "node            : $(node --version 2>/dev/null || echo missing)"
  echo "npm             : $(npm --version 2>/dev/null || echo missing)"
  echo "java            : ${JAVA_VER:-missing}"
  echo "ANDROID_HOME    : ${SDK:-missing}"
  echo "adb             : $(adb version 2>/dev/null | head -1 || echo 'not on PATH')"
  echo "expo (local)    : $(node -e "try{console.log(require('./node_modules/expo/package.json').version)}catch(e){console.log('not installed')}" 2>/dev/null)"
  echo "app version     : $(node -e "const a=require('./app.json').expo;console.log(a.version+' (versionCode '+a.android.versionCode+')')" 2>/dev/null || echo unknown)"
  echo "outputs         : $([ "$WANT_AAB" = 1 ] && printf 'aab '; [ "$WANT_APK" = 1 ] && printf 'apk'; [ "$DEBUG_BUILD" = 1 ] && printf ' (debug)')"
} | tee -a "$FULL"

PREFLIGHT_OK=1

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -gt 22 ] 2>/dev/null; then
  note "WARNING: Node $(node --version) is newer than Expo SDK 51 supports (18 or 20)."
  note "  If dependencies behave oddly, install Node 20 alongside it:"
  note "    brew install node@20 && export PATH=\"/opt/homebrew/opt/node@20/bin:\$PATH\""
fi

# React Native 0.74 (Expo SDK 51) builds with JDK 17. JDK 21+ trips Gradle
# version checks with errors that read like plugin bugs.
if [ -z "${JAVA_MAJOR:-}" ]; then
  note "PROBLEM: no Java found. Android builds need JDK 17."
  note "  brew install --cask temurin@17"
  note "  Then: export JAVA_HOME=\$(/usr/libexec/java_home -v 17)"
  PREFLIGHT_OK=0
elif [ "$JAVA_MAJOR" -lt 17 ] 2>/dev/null; then
  note "PROBLEM: Java $JAVA_MAJOR is too old. React Native 0.74 needs JDK 17."
  note "  brew install --cask temurin@17"
  note "  Then: export JAVA_HOME=\$(/usr/libexec/java_home -v 17)"
  PREFLIGHT_OK=0
elif [ "$JAVA_MAJOR" -gt 17 ] 2>/dev/null; then
  note "WARNING: Java $JAVA_MAJOR is newer than React Native 0.74 targets (17)."
  note "  If Gradle fails with an unsupported class file version, switch:"
  note "    export JAVA_HOME=\$(/usr/libexec/java_home -v 17)"
fi

if [ -z "$SDK" ]; then
  note "PROBLEM: no Android SDK found."
  note "  Easiest route, no Android Studio needed:"
  note "    brew install --cask android-commandlinetools"
  note "    export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools"
  note "    sdkmanager 'platform-tools' 'platforms;android-34' 'build-tools;34.0.0'"
  note "  Add the export to ~/.zshrc so it survives a new terminal."
  note ""
  note "  Or skip the local toolchain entirely and build in Expo's cloud:"
  note "    npx eas-cli build --platform android --profile preview   # APK"
  note "    npx eas-cli build --platform android --profile production # AAB for Play"
  PREFLIGHT_OK=0
fi

if [ "$PREFLIGHT_OK" -ne 1 ]; then
  FAILED_STEP="Preflight"
fi

# ------------------------------------------------------------- versioning ---

if [ "$PREFLIGHT_OK" -eq 1 ] && [ "$BUMP" -eq 1 ]; then
  say "Bumping the Android versionCode"
  node -e "
    const fs=require('fs');
    const a=JSON.parse(fs.readFileSync('app.json','utf8'));
    const before=a.expo.android.versionCode;
    a.expo.android.versionCode=before+1;
    fs.writeFileSync('app.json', JSON.stringify(a,null,2)+'\n');
    console.log('versionCode '+before+' -> '+a.expo.android.versionCode);
  " 2>&1 | tee -a "$FULL"
  # version-check.js keeps app.json and the rest of the app in agreement; a
  # bump that breaks it should stop here rather than at upload time.
  run "Re-checking version consistency" npm run version:check
fi

# --------------------------------------------------------------- keystore ---

if [ "$PREFLIGHT_OK" -eq 1 ] && [ "$DEBUG_BUILD" -eq 0 ]; then
  # Any keystore already in credentials/ wins, whatever it is called.
  #
  # Keying this decision on our own filename was a real bug: a keystore left by
  # earlier tooling as circuvent-upload.jks was invisible to the check, so a
  # second, different key got generated beside it. Had the first one already
  # published, every later upload would have been refused with "signed with the
  # wrong key" — an error that says nothing about a stray file on disk.
  EXISTING_KEYS="$(find "$CRED_DIR" -maxdepth 1 \( -name '*.jks' -o -name '*.keystore' \) 2>/dev/null | sort)"
  KEY_COUNT="$(printf '%s\n' "$EXISTING_KEYS" | grep -c . || true)"

  if [ "${KEY_COUNT:-0}" -gt 1 ]; then
    say "Upload keystore"
    note "PROBLEM: credentials/ holds more than one keystore:"
    printf '%s\n' "$EXISTING_KEYS" | sed "s|$CRED_DIR/|      |" | tee -a "$FULL"
    note "  Only one of them signs the app on Play, and guessing is not safe."
    note "  Keep the one you published with, move the others out, and re-run."
    FAILED_STEP="Upload keystore"

  elif [ "${KEY_COUNT:-0}" -eq 1 ]; then
    FOUND_KEY="$(printf '%s\n' "$EXISTING_KEYS" | head -1)"
    if [ -f "$KEYPROPS" ]; then
      say "Using the existing upload keystore"
      note "$(printf '%s' "$FOUND_KEY" | sed "s|$HOME|~|")"
    else
      say "Upload keystore"
      note "PROBLEM: found $(basename "$FOUND_KEY") but no credentials/upload-keystore.properties."
      note "  A keystore cannot be opened without its password, and generating a"
      note "  replacement would change the app's identity on Play."
      note ""
      note "  Restore the properties file from your backup, or write it by hand:"
      note "    CV_UPLOAD_STORE_FILE=$FOUND_KEY"
      note "    CV_UPLOAD_STORE_PASSWORD=<store password>"
      note "    CV_UPLOAD_KEY_ALIAS=<alias>"
      note "    CV_UPLOAD_KEY_PASSWORD=<key password>"
      note ""
      note "  List its aliases with:"
      note "    keytool -list -v -keystore $(basename "$FOUND_KEY")"
      note ""
      note "  If this key was never published, deleting it and re-running makes"
      note "  a fresh one."
      FAILED_STEP="Upload keystore"
    fi

  else
    say "Creating an upload keystore"
    mkdir -p "$CRED_DIR"
    STORE_PASS="$(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32)"
    if keytool -genkeypair -v \
        -keystore "$KEYSTORE" \
        -alias "$KEY_ALIAS" \
        -keyalg RSA -keysize 2048 \
        -validity 10000 \
        -storepass "$STORE_PASS" -keypass "$STORE_PASS" \
        -dname "CN=Circuvent Technologies, OU=Mobile, O=Circuvent Technologies, L=Hyderabad, S=Telangana, C=IN" \
        >> "$FULL" 2>&1; then
      umask 077
      cat > "$KEYPROPS" <<EOF
# Upload key for Google Play. Generated by scripts/build-android.sh.
# Git-ignored, and it must stay that way.
#
# BACK THIS UP, together with the keystore it points at. Play identifies the
# app by this key; without it you cannot publish an update from a clean
# machine. (Play App Signing does allow an upload key reset through support,
# but that is a support ticket, not a five-minute job.)
CV_UPLOAD_STORE_FILE=$KEYSTORE
CV_UPLOAD_STORE_PASSWORD=$STORE_PASS
CV_UPLOAD_KEY_ALIAS=$KEY_ALIAS
CV_UPLOAD_KEY_PASSWORD=$STORE_PASS
EOF
      chmod 600 "$KEYPROPS" 2>/dev/null || true
      note "Created $(printf '%s' "$KEYSTORE" | sed "s|$HOME|~|")"
      note "Password written to credentials/upload-keystore.properties (chmod 600)."
      note "BACK BOTH FILES UP before you publish."
    else
      note "PROBLEM: keytool failed to create the keystore."
      FAILED_STEP="Creating an upload keystore"
    fi
  fi
fi

# ---------------------------------------------------------------- install ---

if [ -z "$FAILED_STEP" ]; then
  # `node_modules` existing is not the same as dependencies being installed —
  # assuming otherwise is what made the first iOS run fail at typecheck.
  run "Installing JavaScript dependencies" npm install
fi

if [ -z "$FAILED_STEP" ]; then
  run "Typechecking" npx tsc --noEmit
fi

if [ -z "$FAILED_STEP" ]; then
  # The signing patch is regex over generated Gradle. If a template bump moves a
  # brace it stops applying, the build still succeeds, and the artifact is
  # signed with React Native's published debug key — which Play only rejects
  # after the upload. Cheap to check here, expensive to discover there.
  run "Verifying the release signing patch" node scripts/check-android-signing.js
fi

# --------------------------------------------------------------- prebuild ---

if [ -z "$FAILED_STEP" ]; then
  if [ "$CLEAN" -eq 1 ] && [ -d android ]; then
    say "Removing android/ for a clean build"
    rm -rf android
  fi
  run "Generating the native Android project (expo prebuild)" npx expo prebuild --platform android
fi

# Gradle finds the SDK through local.properties or ANDROID_HOME. Writing it
# explicitly means the build does not depend on the shell that launched it.
if [ -z "$FAILED_STEP" ] && [ -d android ]; then
  export ANDROID_HOME="$SDK"
  export ANDROID_SDK_ROOT="$SDK"
  printf 'sdk.dir=%s\n' "$SDK" > android/local.properties

  if [ "$DEBUG_BUILD" -eq 0 ] && [ -f "$KEYPROPS" ]; then
    # Rewritten rather than appended. `expo prebuild` reuses an existing
    # android/, so a plain >> stacked another copy of every property on each
    # run — Gradle takes the last one so it still worked, which is exactly why
    # it would have gone unnoticed while the file grew forever.
    if [ -f android/gradle.properties ]; then
      grep -v '^CV_UPLOAD_' android/gradle.properties > android/gradle.properties.tmp \
        && mv android/gradle.properties.tmp android/gradle.properties
    fi
    grep -v '^#' "$KEYPROPS" | grep -v '^[[:space:]]*$' >> android/gradle.properties
    note "Signing properties written into android/gradle.properties (generated, git-ignored)."
  fi
fi

# ------------------------------------------------------------------ build ---

APK_PATH=""
AAB_PATH=""

if [ -z "$FAILED_STEP" ] && [ -d android ]; then
  note "First Android build downloads Gradle and the toolchain — expect 10-20 minutes."
  cd android || exit 1

  if [ "$DEBUG_BUILD" -eq 1 ]; then
    run "Assembling the debug APK" ./gradlew assembleDebug --no-daemon
    APK_PATH="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
  else
    if [ "$WANT_APK" -eq 1 ] && [ -z "$FAILED_STEP" ]; then
      run "Assembling the release APK" ./gradlew assembleRelease --no-daemon
      APK_PATH="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
    fi
    if [ "$WANT_AAB" -eq 1 ] && [ -z "$FAILED_STEP" ]; then
      run "Bundling the release AAB for Play" ./gradlew bundleRelease --no-daemon
      AAB_PATH="$ROOT/android/app/build/outputs/bundle/release/app-release.aab"
    fi
  fi

  cd "$ROOT" || exit 1
fi

# --------------------------------------------------------- signature check ---
#
# The whole point of the plugin is that the release artifact is NOT signed with
# React Native's debug key. That key has a fixed, published identity, so the
# check is exact rather than a guess. Doing it here turns a Play rejection into
# a local failure.

SIGNER=""
if [ "$DEBUG_BUILD" -eq 0 ] && [ -z "$FAILED_STEP" ]; then
  CHECK_TARGET=""
  [ -n "$AAB_PATH" ] && [ -f "$AAB_PATH" ] && CHECK_TARGET="$AAB_PATH"
  [ -z "$CHECK_TARGET" ] && [ -n "$APK_PATH" ] && [ -f "$APK_PATH" ] && CHECK_TARGET="$APK_PATH"

  if [ -n "$CHECK_TARGET" ]; then
    say "Checking what actually signed the build"
    SIGNER="$(keytool -printcert -jarfile "$CHECK_TARGET" 2>/dev/null | sed -nE 's/^ *Owner: *//p' | head -1)"
    note "signer: ${SIGNER:-unknown}"
    printf 'signer: %s\n' "${SIGNER:-unknown}" >> "$FULL"

    if printf '%s' "$SIGNER" | grep -qi "CN=Android Debug"; then
      note "PROBLEM: this artifact is signed with the Android debug key."
      note "  Google Play will reject it. The signing plugin did not take effect."
      FAILED_STEP="Checking what actually signed the build"
    elif [ -z "$SIGNER" ]; then
      note "WARNING: could not read the certificate. Check it by hand before uploading:"
      note "  keytool -printcert -jarfile <file>"
    fi
  fi
fi

# ---------------------------------------------------------------- install ---

if [ "$INSTALL" -eq 1 ] && [ -z "$FAILED_STEP" ] && [ -n "$APK_PATH" ] && [ -f "$APK_PATH" ]; then
  if command -v adb >/dev/null 2>&1; then
    DEVICES="$(adb devices | awk 'NR>1 && $2=="device" {print $1}')"
    COUNT="$(printf '%s\n' "$DEVICES" | grep -c . || true)"
    if [ "${COUNT:-0}" -ge 1 ]; then
      run "Installing on the connected phone" adb install -r "$APK_PATH"
    else
      note "No phone detected by adb. Enable Developer options > USB debugging,"
      note "plug it in, and accept the 'Allow USB debugging' prompt."
    fi
  else
    note "adb is not on PATH — skipping install. It ships in platform-tools."
  fi
fi

# --------------------------------------------------------------- summary ---

ELAPSED=$(( $(date +%s) - START_TS ))
APK_SIZE=""
AAB_SIZE=""
[ -n "$APK_PATH" ] && [ -f "$APK_PATH" ] && APK_SIZE="$(du -h "$APK_PATH" | awk '{print $1}')"
[ -n "$AAB_PATH" ] && [ -f "$AAB_PATH" ] && AAB_SIZE="$(du -h "$AAB_PATH" | awk '{print $1}')"

{
  echo "================== CIRCUVENT ANDROID BUILD =================="
  echo "when     : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "duration : ${ELAPSED}s"
  echo "variant  : $([ "$DEBUG_BUILD" = 1 ] && echo 'debug (testing only)' || echo release)"
  if [ -z "$FAILED_STEP" ]; then
    echo "result   : SUCCESS"
  else
    echo "result   : FAILED at \"$FAILED_STEP\""
  fi
  echo
  echo "--- environment ---"
  sed -n '/^date  *:/,/^outputs  *:/p' "$FULL" | head -20
  echo

  if [ -n "$FAILED_STEP" ]; then
    echo "--- errors (deduplicated) ---"
    grep -E "(PROBLEM:|error:|FAILURE:|What went wrong|Caused by:|✖|Execution failed|Could not )" "$FULL" \
      | grep -vE "0 errors" \
      | sed "s|$ROOT|.|g" \
      | awk '!seen[$0]++' \
      | head -60
    echo
    echo "--- last 120 lines ---"
    tail -120 "$FULL" | sed "s|$ROOT|.|g"

    # Matched against Gradle's own words, not the environment dump: the header
    # of every log contains the string ANDROID_HOME, so grepping for that alone
    # printed "no Android SDK" after failures that had nothing to do with the
    # SDK. Wrong advice on a failure costs more time than no advice.
    if grep -q "unknown property 'release' for SoftwareComponent" "$FULL" 2>/dev/null; then
      echo
      echo "--- Expo module publishing vs newer AGP ---"
      echo "Every Expo module calls useExpoPublishing(), which publishes it to the"
      echo "local Maven repo — something an app build never needs. On newer AGP the"
      echo "component it asks for does not exist yet, and configuration aborts."
      echo "scripts/patch-expo-android-publishing.js guards it. Re-apply with:"
      echo
      echo "    npm install     # runs it via postinstall"
      echo "    # or directly:"
      echo "    node scripts/patch-expo-android-publishing.js"
    fi

    if grep -qE "SDK location not found|Failed to find target with hash string|sdkmanager|ANDROID_HOME is not set" "$FULL" 2>/dev/null; then
      echo
      echo "--- no Android SDK ---"
      echo "Install the command-line tools (no Android Studio needed):"
      echo "    brew install --cask android-commandlinetools"
      echo "    export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools"
      echo "    sdkmanager 'platform-tools' 'platforms;android-34' 'build-tools;34.0.0'"
      echo
      echo "Or build in Expo's cloud and skip the toolchain entirely:"
      echo "    npx eas-cli build --platform android --profile production"
    fi
  else
    echo "Artifacts"
    [ -n "$AAB_SIZE" ] && echo "  AAB (upload this to Play) : android/app/build/outputs/bundle/release/app-release.aab  [$AAB_SIZE]"
    [ -n "$APK_SIZE" ] && echo "  APK (sideload / testers)  : ${APK_PATH#"$ROOT"/}  [$APK_SIZE]"
    [ -n "$SIGNER" ] && echo "  signed by                 : $SIGNER"
    echo
    if [ "$DEBUG_BUILD" -eq 1 ]; then
      echo "This is a DEBUG build. It cannot be uploaded to Google Play."
      echo "Re-run without --debug for a release build."
    else
      echo "Publishing to Google Play"
      echo "  1. Play Console > Create app (or pick the existing one)."
      echo "  2. Upload the .AAB — not the .APK. Play has required App Bundles"
      echo "     for new apps since August 2021 and rejects a bare APK."
      echo "  3. Leave Play App Signing enabled. Google then holds the real"
      echo "     signing key and your upload key is only your ticket in, which"
      echo "     is the recoverable arrangement."
      echo "  4. versionCode must increase with every upload. This build used"
      echo "     $(node -e "console.log(require('./app.json').expo.android.versionCode)" 2>/dev/null || echo '?')."
      echo "     Next time: ./scripts/build-android.sh --bump"
      echo
      echo "Back up credentials/ now — the keystore in it is the app's identity"
      echo "on Play, and nothing in this repo can regenerate it."
    fi
  fi
  echo
  echo "Full log: buildlog.full.txt ($(wc -l < "$FULL" | tr -d ' ') lines)"
  echo "============================================================"
} > "$LOG"

# Paths carry the account name, and the keystore password is in this build's
# environment — neither should travel with a log that gets pasted into a chat.
if [ -n "${HOME:-}" ]; then
  sed -i '' "s|$HOME|~|g" "$LOG" 2>/dev/null || sed -i "s|$HOME|~|g" "$LOG"
fi
sed -i '' -E 's/(TOKEN|SECRET|PASSWORD|API_KEY|APIKEY|BEARER|STORE_PASSWORD|KEY_PASSWORD)([":= ]+)[^ "]*/\1\2<redacted>/gI' "$LOG" 2>/dev/null \
  || sed -i -E 's/(TOKEN|SECRET|PASSWORD|API_KEY|APIKEY|BEARER|STORE_PASSWORD|KEY_PASSWORD)([":= ]+)[^ "]*/\1\2<redacted>/gI' "$LOG"

echo
cat "$LOG"
echo
if [ -n "$FAILED_STEP" ]; then
  echo "Share mobile/buildlog.txt — it is small and already redacted."
  exit 1
fi
exit 0
