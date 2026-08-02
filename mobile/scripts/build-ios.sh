#!/usr/bin/env bash
#
# Build and run the Circuvent app on iOS, and write a log worth sharing.
#
#   cd mobile
#   ./scripts/build-ios.sh              # simulator
#   ./scripts/build-ios.sh --device     # a plugged-in iPhone (needed for Siri)
#   ./scripts/build-ios.sh --personal   # sign with a FREE Apple ID
#   ./scripts/build-ios.sh --clean      # wipe ios/ and Pods first
#   ./scripts/build-ios.sh --xcode      # prepare the project, then open Xcode
#
# --personal drops the three entitlements a free Apple ID cannot provision
# (Access WiFi Information, Hotspot, Push Notifications). Without it Xcode
# refuses to create a provisioning profile at all. Wi-Fi onboarding and push
# stop working; Siri and everything else are unaffected. See Docs/18.
#
# --xcode stops after prebuild and CocoaPods and hands over to Xcode. Use it
# when the Expo device flow will not cooperate: Expo SDK 51 predates Xcode 26
# and cannot always read its device tooling, but Xcode itself always can.
#
# Produces two files in mobile/:
#   buildlog.txt       small, redacted, errors first — this is the one to share
#   buildlog.full.txt  everything, for local digging
#
# Deliberately does NOT use `set -e`: a build that fails is the case this script
# exists for, and aborting the moment it does would skip writing the summary.

set -uo pipefail

# Resolved before the cd below: $0 is often relative, and after changing
# directory it would no longer point at this file — which broke --help.
SCRIPT="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"

cd "$(dirname "$0")/.." || exit 1
ROOT="$(pwd)"

LOG="$ROOT/buildlog.txt"
FULL="$ROOT/buildlog.full.txt"

DEVICE=0
CLEAN=0
XCODE_ONLY=0
PERSONAL=0
for arg in "$@"; do
  case "$arg" in
    --device)   DEVICE=1 ;;
    --clean)    CLEAN=1 ;;
    --xcode)    XCODE_ONLY=1 ;;
    --personal) PERSONAL=1 ;;
    -h|--help) sed -n '2,22p' "$SCRIPT"; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)"; exit 2 ;;
  esac
done

if [ "$PERSONAL" -eq 1 ]; then
  # Read by app.config.js. Changing entitlements changes the generated project,
  # so the native directory has to be rebuilt or the old one keeps the old ones.
  export CV_PERSONAL_TEAM=1
  CLEAN=1
fi

: > "$FULL"
FAILED_STEP=""
START_TS=$(date +%s)

# --------------------------------------------------------------- helpers ---

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; printf '\n==> %s\n' "$1" >> "$FULL"; }
note() { printf '    %s\n' "$1"; printf '    %s\n' "$1" >> "$FULL"; }

# Runs a command, streaming to the terminal and appending to the full log.
# Records the first step that fails and keeps going only where that is useful.
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
# `xcodebuild -version` prints two lines. Taking the first with `| head -1`
# under `set -o pipefail` makes xcodebuild die of SIGPIPE, the pipeline report
# failure, and the `|| echo missing` fire on a perfectly good Xcode — which is
# exactly what the first log from this script showed. Capture first, trim after.
XCODE_VER="$(xcodebuild -version 2>/dev/null || true)"
XCODE_VER="${XCODE_VER%%$'\n'*}"
{
  echo "date            : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "macOS           : $(sw_vers -productVersion 2>/dev/null || echo 'not macOS')"
  echo "arch            : $(uname -m)"
  echo "node            : $(node --version 2>/dev/null || echo missing)"
  echo "npm             : $(npm --version 2>/dev/null || echo missing)"
  echo "xcode-select    : $(xcode-select -p 2>/dev/null || echo missing)"
  echo "xcodebuild      : ${XCODE_VER:-missing}"
  echo "pod             : $(pod --version 2>/dev/null || echo missing)"
  echo "ruby            : $(ruby --version 2>/dev/null | awk '{print $2}' || echo missing)"
  echo "watchman        : $(watchman --version 2>/dev/null || echo 'not installed (fine)')"
  echo "expo (local)    : $(node -e "try{console.log(require('./node_modules/expo/package.json').version)}catch(e){console.log('not installed')}" 2>/dev/null)"
  echo "target          : $([ "$DEVICE" = 1 ] && echo 'physical device' || echo simulator)"
} | tee -a "$FULL"

PREFLIGHT_OK=1

# Expo SDK 51 is built and tested against Node 18 and 20. Newer majors mostly
# work, but they are also the first suspect when an install completes without
# actually installing everything.
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -gt 22 ] 2>/dev/null; then
  note "WARNING: Node $(node --version) is newer than Expo SDK 51 supports (18 or 20)."
  note "  If dependencies behave oddly, install Node 20 alongside it:"
  note "    brew install node@20 && export PATH=\"/opt/homebrew/opt/node@20/bin:\$PATH\""
  note "  (or nvm, if you use it)"
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
  note "PROBLEM: xcodebuild not found. Install Xcode from the App Store."
  PREFLIGHT_OK=0
fi

# The single most common cause of "xcodebuild requires Xcode": the command line
# tools are selected instead of the full Xcode app.
XPATH="$(xcode-select -p 2>/dev/null || true)"
case "$XPATH" in
  *CommandLineTools*)
    note "PROBLEM: xcode-select points at the Command Line Tools, not Xcode."
    note "  Fix with: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
    PREFLIGHT_OK=0
    ;;
esac

if ! command -v pod >/dev/null 2>&1; then
  note "PROBLEM: CocoaPods not found. Install with: sudo gem install cocoapods"
  note "  (Apple Silicon: brew install cocoapods is usually smoother)"
  PREFLIGHT_OK=0
fi

if [ "$PREFLIGHT_OK" -ne 1 ]; then
  FAILED_STEP="preflight"
fi

# Not fatal, and not the cause of most failures — but CocoaPods and Xcode build
# phases have a long history of mishandling spaces in paths, and when they do
# the error never mentions the path. Cheap to say now, expensive to find later.
case "$ROOT" in
  *\ *)
    note "NOTE: this project lives in a path containing a space:"
    note "  $ROOT"
    note "  That is a known source of CocoaPods and Xcode build-phase failures."
    note "  If the build fails in a way that makes no sense, try moving the repo"
    note "  somewhere without spaces before spending long on it."
    ;;
esac

# ----------------------------------------------------------------- build ---

if [ "$PREFLIGHT_OK" -eq 1 ]; then

  # Always run it. An earlier version skipped this when node_modules existed,
  # which was wrong: a partial or interrupted install leaves the directory in
  # place but missing packages, and the failure then surfaces much later as
  # "Cannot find module 'expo-haptics'" or a prebuild plugin error that looks
  # like a config problem. npm install is idempotent and quick when there is
  # nothing to do, so there is no reason to guess.
  run "Installing JavaScript dependencies" npm install

  # Catches a broken TypeScript change before spending minutes in Xcode.
  run "Typechecking" npx tsc --noEmit
  run "Checking version consistency" npm run version:check

  if [ "$CLEAN" -eq 1 ]; then
    say "Cleaning native project"
    rm -rf ios
    note "removed ios/"
  fi

  # Regenerates ios/ from app.json and links local modules, including
  # modules/circuvent-siri. Expo Go cannot load that module, so a development
  # build is the only way to exercise Siri.
  run "Generating the native iOS project (expo prebuild)" \
    npx expo prebuild --platform ios $([ "$CLEAN" -eq 1 ] && echo --clean)

  # A prebuild that dies partway leaves ios/ half-written, and every later run
  # says "reusing /ios" and trips over the wreckage — the pbxproj fails to parse
  # and Xcode itself refuses to open the project. The directory is generated and
  # gitignored, so there is nothing in it worth protecting: throw it away and
  # try once more rather than making someone diagnose a corrupt project file.
  if [ -n "$FAILED_STEP" ] && [ "$FAILED_STEP" = "Generating the native iOS project (expo prebuild)" ]; then
    note "Prebuild failed. ios/ is generated, so discarding it and retrying once."
    rm -rf ios
    FAILED_STEP=""
    run "Regenerating the native iOS project from scratch" \
      npx expo prebuild --platform ios --clean
  fi

  if [ -z "$FAILED_STEP" ]; then
    if [ "$XCODE_ONLY" -eq 1 ]; then
      WS="$(ls -d ios/*.xcworkspace 2>/dev/null | head -1)"
      if [ -n "$WS" ]; then
        say "Opening Xcode"
        note "Project prepared. Finish in Xcode:"
        note "  1. Pick your iPhone in the device menu at the top."
        note "  2. Target Circuvent > Signing & Capabilities > tick"
        note "     'Automatically manage signing' and choose your Team."
        note "  3. Press the Run button."
        open "$WS"
      else
        note "No .xcworkspace found in ios/ — prebuild may not have completed."
        FAILED_STEP="opening Xcode"
      fi
    elif [ "$DEVICE" -eq 1 ]; then
      note "Building for a physical device. It must be plugged in, unlocked and trusted."
      note "A free Apple ID works, but the app expires after 7 days."

      # Expo needs to know which device, and asks interactively. Everything here
      # is piped through tee, so stdout is not a terminal and Expo refuses to
      # prompt ("Input is required, but 'npx expo' is in non-interactive mode").
      # Resolving the UDID ourselves removes the question entirely, and is more
      # reliable than a prompt anyway: Expo 51 predates Xcode 26 and warns that
      # it cannot read the newer devicectl output.
      DEVICE_ID=""
      if command -v xcrun >/dev/null 2>&1; then
        # xctrace lists physical devices with a UDID in parentheses. Simulators
        # appear as "Simulator" and are filtered out.
        DEVICES="$(xcrun xctrace list devices 2>/dev/null \
          | sed -n '/^== Devices ==/,/^== /p' \
          | grep -v Simulator \
          | grep -oE '\([0-9A-Fa-f-]{25,}\)' \
          | tr -d '()' || true)"
        COUNT="$(printf '%s\n' "$DEVICES" | grep -c . || true)"
        if [ "${COUNT:-0}" -eq 1 ]; then
          DEVICE_ID="$(printf '%s\n' "$DEVICES" | head -1)"
          note "Found one connected device: $DEVICE_ID"
        elif [ "${COUNT:-0}" -gt 1 ]; then
          note "More than one device is connected. Unplug the others, or run:"
          note "  npx expo run:ios --device <udid>"
          printf '%s\n' "$DEVICES" | sed 's/^/      /' | tee -a "$FULL"
        else
          note "No physical device detected. Check it is plugged in, unlocked,"
          note "and that you tapped Trust on the phone."
        fi
      fi

      if [ -n "$DEVICE_ID" ]; then
        run "Building and installing on device" npx expo run:ios --device "$DEVICE_ID"
      else
        run "Building and installing on device" npx expo run:ios --device
      fi
    else
      run "Building and launching in the simulator" npx expo run:ios
    fi
  else
    note "Skipping the Xcode build because an earlier step failed."
  fi
fi

# --------------------------------------------------------------- summary ---

ELAPSED=$(( $(date +%s) - START_TS ))

{
  echo "==================== CIRCUVENT iOS BUILD ===================="
  echo "when     : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "duration : ${ELAPSED}s"
  echo "target   : $([ "$DEVICE" = 1 ] && echo 'physical device' || echo simulator)"
  [ "$PERSONAL" = 1 ] && echo "signing  : personal team (Wi-Fi, Hotspot and Push entitlements removed)"
  if [ -z "$FAILED_STEP" ]; then
    echo "result   : SUCCESS"
  else
    echo "result   : FAILED at \"$FAILED_STEP\""
  fi
  echo
  echo "--- environment ---"
  sed -n '/^date  *:/,/^target  *:/p' "$FULL" | head -20
  echo

  if [ -n "$FAILED_STEP" ]; then
    echo "--- errors (deduplicated) ---"
    # Preflight problems, Swift/clang diagnostics, and Xcode's own failure lines.
    grep -E "(PROBLEM:|error:|fatal error:|❌|The following build commands failed|Command .* failed|✖|Error: )" "$FULL" \
      | grep -vE "0 errors|error: none" \
      | sed "s|$ROOT|.|g" \
      | awk '!seen[$0]++' \
      | head -60
    echo
    echo "--- last 120 lines ---"
    tail -120 "$FULL" | sed "s|$ROOT|.|g"

    if [ "$DEVICE" -eq 1 ]; then
      echo
      echo "--- if the device step is what failed ---"
      echo "Expo SDK 51 predates Xcode 26 and cannot always read its device"
      echo "tooling. The project itself is fine by this point — prebuild and"
      echo "CocoaPods both completed — so finish in Xcode instead:"
      echo
      echo "    ./scripts/build-ios.sh --xcode"
      echo
      echo "then pick your iPhone at the top of the Xcode window, set your Team"
      echo "under Signing & Capabilities, and press Run."
    fi

    # The single most confusing failure for anyone using a free Apple ID: Xcode
    # will not create a profile at all, and the message blames capabilities
    # rather than the account type.
    if grep -qE "Personal development teams|do not support the Access WiFi|No profiles for" "$FULL" 2>/dev/null; then
      echo
      echo "--- free Apple ID detected ---"
      echo "A personal team cannot provision Access WiFi Information, Hotspot or"
      echo "Push Notifications, so Xcode refuses to make a profile at all."
      echo "Rebuild without them:"
      echo
      echo "    ./scripts/build-ios.sh --device --personal"
      echo
      echo "Wi-Fi onboarding and push stop working in that build. Siri and"
      echo "everything else are unaffected."
    fi
  else
    echo "The app built and launched."
    echo
    if [ "$DEVICE" -eq 1 ]; then
      echo "First install on this iPhone? iOS will refuse to open it until you trust"
      echo "the certificate:"
      echo "  Settings > General > VPN & Device Management > your Apple ID > Trust"
      echo
      echo "With a free Apple ID the app stops opening after 7 days. Re-run this"
      echo "script to reinstall it; a paid Apple Developer account lasts a year."
      echo
    fi
    echo "To try Siri:"
    echo "  1. Sign in and let the device list load."
    echo "  2. Settings > Siri & Search > Circuvent — the shortcuts should be listed."
    echo "  3. Say: \"Turn on the porch light with Circuvent\""
    if [ "$DEVICE" -eq 0 ]; then
      echo "  Note: spoken Siri needs a real device. Re-run with --device for that."
    fi
  fi
  echo
  echo "Full log: buildlog.full.txt ($(wc -l < "$FULL" | tr -d ' ') lines)"
  echo "============================================================"
} > "$LOG"

# Paths contain the account name, and a stray token in an environment dump
# should not travel with a log that gets pasted into a chat.
if [ -n "${HOME:-}" ]; then
  sed -i '' "s|$HOME|~|g" "$LOG" 2>/dev/null || sed -i "s|$HOME|~|g" "$LOG"
fi
sed -i '' -E 's/(TOKEN|SECRET|PASSWORD|API_KEY|APIKEY|BEARER)([":= ]+)[^ "]*/\1\2<redacted>/gI' "$LOG" 2>/dev/null \
  || sed -i -E 's/(TOKEN|SECRET|PASSWORD|API_KEY|APIKEY|BEARER)([":= ]+)[^ "]*/\1\2<redacted>/gI' "$LOG"

echo
cat "$LOG"
echo
if [ -n "$FAILED_STEP" ]; then
  echo "Share mobile/buildlog.txt — it is small and already redacted."
  exit 1
fi
exit 0
