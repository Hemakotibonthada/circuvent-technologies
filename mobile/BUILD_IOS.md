# Building the Circuvent app for your iPhone

The Android APK is built by CI/locally already:
`mobile\android\app\build\outputs\apk\release\app-release.apk`

**iOS cannot be built on Windows** (Apple requires macOS + Xcode to compile and
sign an `.ipa`). You have two ways to get it onto your iPhone. Option A works
from any machine; Option B uses your MacBook directly.

---

## Option A — EAS Build (cloud, recommended, no Mac needed)

Expo builds and signs the app on their macOS cloud and gives you an install link.

1. Install the CLI and log in (once):
   ```bash
   npm i -g eas-cli
   eas login            # your Expo account
   ```
2. From `mobile\`, link the project (once) — creates the EAS project id:
   ```bash
   cd mobile
   eas init
   ```
3. Register your iPhone for ad-hoc install and build the `preview` profile:
   ```bash
   eas device:create        # follow the link on your iPhone to register its UDID
   eas build -p ios --profile preview
   ```
   - This needs an **Apple Developer account** ($99/yr) for signing an
     installable device build. When prompted, log in with your Apple ID and let
     EAS manage credentials.
   - When the build finishes, EAS prints a URL + QR code. Open it on the iPhone
     to install (the device must be the one you registered).

> No paid Apple account? Use **Option B** (free 7-day signing) or build the
> iOS **Simulator** with `eas build -p ios --profile development` and run it in
> Xcode's Simulator on a Mac.

---

## Option B — MacBook + Xcode (free Apple ID, 7-day signing)

On your MacBook (which already has Xcode / the PlatformIO toolchain):

1. Pull the repo and install deps:
   ```bash
   git clone <repo> && cd circuvent-technologies/mobile   # or your checkout
   npm install
   ```
2. Generate the native iOS project and install pods:
   ```bash
   npx expo prebuild -p ios --clean
   cd ios && pod install && cd ..
   ```
3. Open the workspace in Xcode:
   ```bash
   open ios/Circuvent.xcworkspace
   ```
4. In Xcode: select the **Circuvent** target → **Signing & Capabilities** →
   check **Automatically manage signing** → pick your personal Apple ID team.
   Change the **Bundle Identifier** if Xcode complains it's taken
   (e.g. `com.circuvent.app.<yourname>`).
5. Plug in your iPhone, select it as the run target, press **▶ Run**.
   - First run: on the iPhone, trust the developer cert under
     **Settings → General → VPN & Device Management**.
   - Free Apple IDs expire the build after **7 days** (just re-run to renew).
     A paid account (or Option A) gives longer-lived installs.

---

## Notes baked into the config

- `app.json` → `ios.infoPlist` already grants **Camera** (QR scan) and
  **Local Network** access (`NSAllowsLocalNetworking`), which the device
  onboarding flow needs to talk to the setup hotspot at `192.168.4.1`.
- **Device onboarding works in-app on iOS.** iOS cannot *scan* for nearby
  Wi-Fi networks — no entitlement unlocks that — so the radar screen is
  Android-only. It can *join* a network it is given the name of, through the
  Hotspot Configuration entitlement, and the QR label scanned a moment earlier
  supplies the name. So iOS skips discovery and offers "Join
  Circuvent-Setup-XXXX for me" directly. If that is refused, the manual
  "join in Settings" steps are still on the same screen.
- **Push notifications** are left to EAS. `expo-notifications` sets
  `aps-environment` through its own config plugin and EAS picks the value that
  matches the build profile, so nothing is pinned in `ios.entitlements` — a
  hardcoded `production` there would stop a development profile installing.
  The one case where push genuinely does not work is Option B with a free
  Apple ID (`CV_PERSONAL_TEAM=1`), which strips the entitlement because Xcode
  refuses to provision it at all; `app.config.js` says so at the point it
  deletes it.
- `eas.json` defines `development` (simulator/dev-client), `preview`
  (installable internal build), and `production` (App Store `.aab`/`.ipa`).
- Bundle id: `com.circuvent.app`. Version and build number are read from
  `app.json` — keep `ios.buildNumber` equal to `android.versionCode` so a
  report from either platform names the same build.
