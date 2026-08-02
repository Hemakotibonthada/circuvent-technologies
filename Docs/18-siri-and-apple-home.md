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

```bash
cd mobile
npx expo prebuild --platform ios --clean   # regenerates ios/ with the module
npx expo run:ios                            # or open ios/*.xcworkspace in Xcode
```

Notes:

- **iOS 16+** for App Intents. Older devices simply see no Siri features;
  `siriAvailable()` returns false and every call is a no-op.
- The intents live in the **main app target**, so no App Group and no extra
  entitlement is needed.
- Phrases must contain the app name — Apple's requirement, which is why they
  read "…with Circuvent".
- Apple caps App Shortcuts at **10**.
- Devices appear to Siri only **after signing in** and once the device list has
  loaded, since the cache is written from the app.

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
