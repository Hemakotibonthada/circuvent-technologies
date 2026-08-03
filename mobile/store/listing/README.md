# Publishing Circuvent to Google Play

Everything Play Console asks for, with the answers that match what the app
actually does. Where a question has a wrong answer that gets an app rejected or
suspended, that is called out rather than left to guess.

---

## 1. Build the artifact

```bash
cd mobile
./scripts/build-android.sh --bump    # +1 versionCode first
```

Upload the **`.aab`**, not the `.apk`. Play has required an App Bundle for every
app first published since August 2021 and rejects a bare APK — after the upload,
not at build time. The APK is for sideloading and for handing testers a file.

The build fails rather than succeeds if the artifact is signed with React
Native's debug key or is missing its JavaScript bundle. Both are conditions that
otherwise install fine and fail later, one at review and one on a user's phone.

**`versionCode` must be strictly higher than anything previously uploaded**,
including anything uploaded to a closed or internal track and later discarded.
Play will not let you reuse one, and there is no way to free it.

---

## 2. Signing

Keep **Play App Signing** enabled. Google then holds the real signing key and the
key in `mobile/credentials/` is only an upload key — which can be reset through
support if it is ever lost. Opting out means losing that key ends the app's
ability to ever update.

Back up `mobile/credentials/` somewhere that is not this repository. It is
git-ignored and nothing here can regenerate it.

---

## 3. Store listing

| Field | File |
| --- | --- |
| App name (30) | `listing/title.txt` |
| Short description (80) | `listing/short-description.txt` |
| Full description (4000) | `listing/full-description.txt` |
| What's new (500) | `listing/whats-new/<version>.txt` |

Graphics are already generated:

| Asset | Path | Play requirement |
| --- | --- | --- |
| App icon | `store/icon-512.png` | 512×512 PNG, 32-bit |
| Feature graphic | `store/feature-graphic.png` | 1024×500 |
| Phone screenshots | `store/screenshots/phone/` | 2–8, 9:16 |
| 7" tablet | `store/screenshots/tablet7/` | optional |
| 10" tablet | `store/screenshots/tablet10/` | optional |

Regenerate with `node store/gen-assets.js` and `node store/gen-screenshots.js`.

Category **House & Home**. Tags: smart home, home automation, IoT.

---

## 4. Permissions — the part that gets apps rejected

The app declares `ACCESS_FINE_LOCATION`. Play treats location as sensitive and
will ask why, and a vague answer is refused.

The honest answer, which is also the one Play accepts: **Android requires
location permission for any app that scans for or connects to Wi-Fi networks.**
Circuvent needs that during device onboarding, when the phone joins the
hardware's temporary setup hotspot to hand over the home's Wi-Fi credentials.
The app does not read, store, or transmit the device's geographic position.

Declare it as **used only in the foreground**, during setup. There is no
background location use, and claiming otherwise triggers a review the app does
not need.

| Permission | Why |
| --- | --- |
| `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | Android's precondition for Wi-Fi scanning during onboarding |
| `NEARBY_WIFI_DEVICES` | The Android 13+ replacement for the above. Declared with `neverForLocation` (see `plugins/withNeverForLocation.js`) so the platform and Play know no position is derived from it |
| `ACCESS_WIFI_STATE`, `CHANGE_WIFI_STATE` | Join the device's setup hotspot and return to the home network |
| `ACCESS_NETWORK_STATE`, `CHANGE_NETWORK_STATE` | Detect connectivity and route the setup handshake |
| `CAMERA` | Scan the QR label on the hardware |

The remainder — `INTERNET`, `VIBRATE`, `WAKE_LOCK`, `POST_NOTIFICATIONS`,
`RECEIVE_BOOT_COMPLETED`, the c2dm receive permission and the launcher badge
permissions — come from notifications and are not classed as dangerous.

### Permissions deliberately removed

Libraries pull in more than the app uses, and every one of them appears on the
store listing for users to read. These are stripped in
`app.json` → `android.blockedPermissions`:

| Removed | Why it was there, and why it is wrong |
| --- | --- |
| `RECORD_AUDIO` | expo-camera requests the microphone so video can be recorded with sound. This app only ever puts the camera in barcode mode to read a QR label, and expo-speech is output-only. Left in, Play lists "Microphone" against a home-control app — alarming, unexplainable, and untrue |
| `SYSTEM_ALERT_WINDOW` | React Native's development overlay. Useless in a release build and shown to users as the "Display over other apps" special permission |
| `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` | Legacy storage access nothing here uses. Asking for it invites a scoped-storage declaration that has no honest answer |

`blockedPermissions` emits `tools:node="remove"`, which is a merge instruction
rather than a guarantee — a dependency can still win. Confirm against the built
artifact, not the source manifest:

```bash
$ANDROID_HOME/build-tools/<ver>/aapt2 dump permissions app-release.apk
```

Verified absent from the 1.10.0 build.

A **prominent disclosure** must be shown before the first location request,
explaining the use in plain language. The onboarding flow does this; do not
remove it.

---

## 5. Data safety

Answer from what the app actually transmits.

**Collected and linked to the user**
- Email address — account sign-in
- Device names, rooms, and state — the point of the product
- Device telemetry (power, temperature, water level, sensor readings)

**Collected, not linked**
- Crash and diagnostic data, if analytics is enabled

**Not collected**
- Location. The permission exists so Android will allow Wi-Fi scanning during
  onboarding; no position is read, and `NEARBY_WIFI_DEVICES` is declared
  `neverForLocation` to state that to the platform.
- Contacts, calendar, SMS, call logs, photos, audio recordings.
- Microphone. The permission is stripped from the build — see below.
- Camera frames are shown live and are not uploaded to Circuvent servers by the
  app.

**Also declare**
- Data is encrypted in transit (TLS to the control plane, TLS to the broker).
- Users can request deletion — link the account deletion route.

Play cross-checks these answers against the APK's declared permissions and
libraries. An answer that contradicts the manifest gets the release rejected, so
re-check this section whenever a dependency is added.

---

## 6. Content rating

Complete the questionnaire honestly. For a home-control utility with no ads, no
user-generated content and no purchases inside the app, the outcome is normally
**Everyone / PEGI 3**. The rating is generated from the answers — do not pick a
target and work backwards.

---

## 7. Before pressing publish

- [ ] `versionCode` higher than every previous upload
- [ ] `whats-new/<version>.txt` written and under 500 characters
- [ ] Uploading the `.aab`
- [ ] Play App Signing on
- [ ] `mobile/credentials/` backed up off this machine
- [ ] Privacy policy URL reachable and mentioning the Wi-Fi/location use
- [ ] Data safety answers match the manifest
- [ ] Installed the APK on a real phone and signed in
- [ ] Confirmed the app opens with no development machine on the network — this
      is the failure that shipped on iOS as "No bundle URL present"

---

## 8. First release

Use **Internal testing** first. It reaches testers in minutes rather than the
days a production review takes, and it is the cheapest way to find out that a
build is signed wrongly or missing its bundle.

Promote the same artifact to production once it has been opened on a real
device. Rebuilding for promotion means a different `versionCode` and a second
review for no benefit.
