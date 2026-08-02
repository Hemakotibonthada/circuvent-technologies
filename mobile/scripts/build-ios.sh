#!/usr/bin/env bash
#
# Build and run the Circuvent app on iOS, and write a log worth sharing.
#
#   cd mobile
#   ./scripts/build-ios.sh              # simulator
#   ./scripts/build-ios.sh --device     # a plugged-in iPhone (needed for Siri)
#   ./scripts/build-ios.sh --clean      # wipe ios/ and Pods first
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
for arg in "$@"; do
  case "$arg" in
    --device) DEVICE=1 ;;
    --clean)  CLEAN=1 ;;
    -h|--help) sed -n '2,14p' "$SCRIPT"; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)"; exit 2 ;;
  esac
done

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
{
  echo "date            : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "macOS           : $(sw_vers -productVersion 2>/dev/null || echo 'not macOS')"
  echo "arch            : $(uname -m)"
  echo "node            : $(node --version 2>/dev/null || echo missing)"
  echo "npm             : $(npm --version 2>/dev/null || echo missing)"
  echo "xcode-select    : $(xcode-select -p 2>/dev/null || echo missing)"
  echo "xcodebuild      : $(xcodebuild -version 2>/dev/null | head -1 || echo missing)"
  echo "pod             : $(pod --version 2>/dev/null || echo missing)"
  echo "ruby            : $(ruby --version 2>/dev/null | awk '{print $2}' || echo missing)"
  echo "watchman        : $(watchman --version 2>/dev/null || echo 'not installed (fine)')"
  echo "expo (local)    : $(node -e "try{console.log(require('./node_modules/expo/package.json').version)}catch(e){console.log('not installed')}" 2>/dev/null)"
  echo "target          : $([ "$DEVICE" = 1 ] && echo 'physical device' || echo simulator)"
} | tee -a "$FULL"

PREFLIGHT_OK=1

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

# ----------------------------------------------------------------- build ---

if [ "$PREFLIGHT_OK" -eq 1 ]; then

  if [ ! -d node_modules ]; then
    run "Installing JavaScript dependencies" npm install
  else
    note "node_modules present — skipping npm install"
  fi

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

  if [ -z "$FAILED_STEP" ]; then
    if [ "$DEVICE" -eq 1 ]; then
      note "Building for a physical device. It must be plugged in, unlocked and trusted."
      note "A free Apple ID works, but the app expires after 7 days."
      run "Building and installing on device" npx expo run:ios --device
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
  else
    echo "The app built and launched. Nothing further needed."
    echo
    echo "To try Siri:"
    echo "  1. Sign in and let the device list load."
    echo "  2. Settings > Siri & Search > Circuvent — the shortcuts should be listed."
    echo "  3. Say: \"Turn on the porch light with Circuvent\""
    echo "  Note: spoken Siri needs a real device; the simulator only shows Shortcuts."
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
