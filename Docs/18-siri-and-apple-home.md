# 18 — Siri and Apple Home

What is possible, what is not, and why.

---

## 1. Apple Home cannot work the way Alexa and Google do

The Alexa and Google integrations in `platform/api/src/routes/smarthome.ts` are
**cloud-to-cloud**: Amazon and Google call our server, our server talks to the
fleet. That is why they were straightforward to add.

**Apple offers no equivalent.** There is no cloud-to-cloud path into Apple Home
for third parties. An accessory has to be reachable on the customer's own
network, speaking one of two protocols:

| Route | What it needs |
| --- | --- |
| **HAP** (HomeKit Accessory Protocol) | Runs on the device. Commercial products require **MFi licensing** from Apple. |
| **Matter** | Runs on the device. Requires **CSA membership and certification** to ship commercially. |

A bridge (Homebridge and friends) can expose cloud devices to Apple Home, but
the bridge itself must run **inside the customer's home** — HomeKit discovers
accessories over Bonjour on the local network. A bridge on our VM is not merely
slow, it is undiscoverable.

That leaves three real options, and they differ in cost and licensing rather
than in engineering:

1. **Siri via App Intents** — what is built. No Apple licensing, no new
   hardware, no firmware change. Does *not* appear in the Apple Home app.
2. **Matter in firmware** — true Apple Home. Every firmware here is
   Arduino-framework on `esp32dev`; Matter needs ESP-IDF, a larger flash
   partition layout, and CSA certification. A programme, not a task.
3. **A local bridge appliance** — a Pi-class device in each home. Works, but it
   is a hardware product decision, and shipping one commercially needs MFi.

---

## 2. What is built

`mobile/modules/circuvent-siri` — a local Expo module adding **App Intents**
(iOS 16+). Users can say:

> "Turn on the porch light with Circuvent"
> "Lock up with Circuvent"
> "Check a device with Circuvent"

and use the same actions in Shortcuts and on the Lock Screen.

| File | Responsibility |
| --- | --- |
| `ios/SiriStore.swift` | Cached devices (UserDefaults) + token (**Keychain**) |
| `ios/SiriApi.swift` | Direct `URLSession` calls to the control plane |
| `ios/DeviceEntity.swift` | `AppEntity` + query, so Siri resolves spoken names |
| `ios/ControlIntents.swift` | Control, lock, unlock, status |
| `ios/CircuventShortcuts.swift` | Phrases available with no user setup |
| `ios/CircuventSiriModule.swift` | The React Native bridge |
| `src/siri-sync.ts` | Builds the payload and keeps the cache current |

### The intents never start React Native

Siri allows a couple of seconds. Booting the JS runtime to send one command
would routinely miss that, so everything an intent needs is written to disk when
it changes and read natively. The intent then makes one HTTP call.

### The token is in the Keychain, not UserDefaults

UserDefaults is a plist in the app container — readable from a backup and not
protected once the device has been unlocked. That is the wrong place for a
credential that opens a front door. It is stored with
`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`: available to a background
intent, but never carried to another phone by a restore.

Device names are not credentials, so they stay in UserDefaults.

### Device-type knowledge stays in TypeScript

Swift never learns what a "curtain" is. `siri-sync.ts` computes each device's
`toggleField` and `kind` from the tables already in `theme.ts` and `store.tsx`,
and syncs them. Adding a device type means editing those tables as usual — the
intents do not change, and the two cannot drift apart about what "on" means.

### Unlocking requires an unlocked phone

`UnlockDeviceIntent` sets `authenticationPolicy = .requiresAuthentication`.
Locking a door you are next to is harmless; unlocking one is not, and Siri will
answer a voice through a window. Locking stays unauthenticated so it is never
discouraged.

---

## 3. Classification came from the firmware, not the device names

Reading `onCommand` in each firmware corrected three guesses that would have
shipped broken:

| Device | Looked like | Actually accepts | Result |
| --- | --- | --- | --- |
| `guardian` | a sensor | `{action:"set", armed}` | Armable — was going to be uncontrollable |
| `motion-sensor` | a sensor | `{action:"set", armed}` | Armable — same |
| `watertank` | a gauge | `{action:"set", pump}` | Drives a pump — was marked read-only |
| `energy-monitor` | a sensor | *no `onCommand` at all* | Genuinely read-only |

Alarms report as **armed / disarmed** rather than on / off. "The guardian is on"
is technically true and useless for something guarding a house.

All 17 shipped device types are either controllable by voice or correctly
read-only. `camera` and `energy-monitor` are the only read-only ones.

---

## 4. No firmware change was needed

Worth stating plainly, because it is the natural assumption.

The firmware already accepts every command these intents send — that was
verified by reading `onCommand` in all 17 device folders, not assumed. It also
already publishes **retained state on change** plus a heartbeat, with an LWT for
online/offline, which is exactly what any future bridge would need too.

Firmware work only becomes necessary for route 2 (Matter), and that is a rewrite
rather than an addition.

---

## 5. Building it

Requires a **development build** — Expo Go cannot load a local native module.

### The easy way

```bash
cd mobile
./scripts/build-ios.sh              # simulator
./scripts/build-ios.sh --device     # a plugged-in iPhone (needed for spoken Siri)
./scripts/build-ios.sh --clean      # wipe ios/ and start over
```

It checks the environment, typechecks, runs `expo prebuild`, builds, launches,
and writes two files:

| File | Use |
| --- | --- |
| `buildlog.txt` | Small, redacted, errors first — **this is the one to share** |
| `buildlog.full.txt` | Everything, for digging locally |

Both are gitignored. `buildlog.txt` puts the failing step and the deduplicated
errors at the top, so a failure is legible without scrolling an Xcode log, and
it rewrites `$HOME` to `~` and redacts anything shaped like a token before you
paste it anywhere.

The preflight catches the two things that go wrong most often and says how to
fix each:

- `xcode-select` pointing at the Command Line Tools instead of Xcode — the usual
  cause of "xcodebuild requires Xcode".
- CocoaPods missing.

### Or by hand

```bash
cd mobile
npm install
npx expo prebuild --platform ios --clean
npx expo run:ios
```

---

## 5a. Installing on your own iPhone

The simulator cannot take dictation, so real Siri testing needs the phone.

### One-time setup

1. **Plug the iPhone into the Mac**, unlock it, and tap **Trust** when asked.
2. **Open the project in Xcode once** to set the signing team:
   ```bash
   npx expo prebuild --platform ios     # creates ios/ if not already there
   open ios/Circuvent.xcworkspace
   ```
   Select the **Circuvent** target → **Signing & Capabilities** → tick
   *Automatically manage signing* → pick your **Team**. A free Apple ID works;
   add one under Xcode → Settings → Accounts.

   If it complains the bundle identifier is unavailable, change
   `expo.ios.bundleIdentifier` in `app.json` to something unique such as
   `com.yourname.circuvent` and re-run prebuild. Free Apple IDs cannot reuse an
   identifier someone else has registered.

3. **Build and install**:
   ```bash
   ./scripts/build-ios.sh --device
   ```

4. **Trust the certificate on the phone.** The first launch will refuse with
   "Untrusted Developer" until you do:
   **Settings → General → VPN & Device Management → your Apple ID → Trust**

### After that

Re-running `./scripts/build-ios.sh --device` reinstalls over the top; there is
no need to repeat any of the above.

### How long it lasts

| Account | App expires after | Notes |
| --- | --- | --- |
| **Free Apple ID** | **7 days** | Re-run the script to reinstall. Limited to 3 apps and 10 devices. |
| **Apple Developer ($99/yr)** | 1 year | Also unlocks TestFlight, which installs over the air with no cable. |

The 7-day expiry is an Apple limit on free accounts, not something the project
can change. When it lapses the app simply stops opening — reinstalling restores
it, and your data is untouched.

### A free Apple ID cannot sign this app as-is

Xcode will refuse before it even builds:

> Cannot create a iOS App Development provisioning profile for
> `com.circuvent.app`. Personal development teams, including "…", do not support
> the **Access WiFi Information, Hotspot, and Push Notifications** capabilities.

The message blames the capabilities, so it reads like a project fault. It is
not — a personal team simply cannot provision those three, and they come from
dependencies the app genuinely uses:

| Entitlement | Comes from |
| --- | --- |
| `com.apple.developer.networking.wifi-info` | `react-native-wifi-reborn` |
| `com.apple.developer.networking.HotspotConfiguration` | `react-native-wifi-reborn` |
| `aps-environment` | `expo-notifications` |

Build with `--personal` to strip them:

```bash
./scripts/build-ios.sh --device --personal
```

That sets `CV_PERSONAL_TEAM=1`, which `app.config.js` reads and uses to delete
those three entitlements after every other plugin has written its own. It also
forces a clean prebuild, since a native project generated earlier still carries
the old entitlements.

**What stops working in that build:**

- Wi-Fi device onboarding — joining a device's setup hotspot.
- Push notifications.

Siri and everything else are unaffected, which is what makes it a usable way to
test voice control on a free account. Release builds go through EAS without the
flag and keep every capability, so this changes nothing about what ships.

If Xcode says the bundle identifier is unavailable, set your own:

```bash
CV_BUNDLE_ID=com.yourname.circuvent ./scripts/build-ios.sh --device --personal
```

### Sharing it with other people

A cable-installed build only works on phones plugged into that Mac. For anyone
else, use **TestFlight**, which needs the paid account:

```bash
npx eas build --platform ios --profile preview
npx eas submit --platform ios
```

Testers then install from the TestFlight app with no cable and no Mac.

---

### Notes

- **iOS 16+** for App Intents. Older devices simply see no Siri features;
  `siriAvailable()` returns false and every call is a no-op.
- The intents live in the **main app target**, so no App Group and no extra
  entitlement is needed.
- Phrases must contain the app name — Apple's requirement, which is why they
  read "…with Circuvent".
- Apple caps App Shortcuts at **10**.
- Devices appear to Siri only **after signing in** and once the device list has
  loaded, since the cache is written from the app.
- **Spoken Siri needs a real device.** The simulator exposes the actions in the
  Shortcuts app but will not take dictation.

### Checking it works

1. Sign in, let the device list load.
2. Settings → Siri & Search → Circuvent should list the shortcuts.
3. Say "Turn on the porch light with Circuvent".
4. In Shortcuts, add a Circuvent action — the device picker should list real
   devices.

If devices do not appear, the cache was never written: confirm sign-in, then
check `cachedDeviceCount()`.

---

## 6. Limitations

- **Not in the Apple Home app.** Siri and Shortcuts only. Apple Home needs route
  2 or 3 above.
- **No automations from Apple Home**, for the same reason.
- **Status answers from cache**, so it can be stale between syncs. Deliberate: a
  status question that takes four seconds to answer is worse than one a minute
  out of date. Commands are always live.
- **Toggle uses the last known state**, so it can invert the wrong way if
  something changed the device since the last sync. Siri says which way it went,
  so the user hears the mistake immediately.
- **`touchboard` switches gang 1** on a bare "turn on", matching the app's own
  inline toggle.
