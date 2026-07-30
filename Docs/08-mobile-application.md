# 08 — Mobile application

Expo / React Native. Source in `mobile/`. Ships as an Android APK today; the iOS
configuration is present but not part of the current release flow.

- Package / bundle id: `com.circuvent.app`
- Current version: **1.8.0**, Android `versionCode` **10**
- Scheme: `circuvent://`

## Configuration

```ts
// mobile/src/config.ts — the real endpoints
export const API_BASE = "https://api.circuvent.com";
export const WS_URL   = "wss://api.circuvent.com/ws";
```

The app talks **directly to the control plane**, not to the Next.js site.

> `mobile/app.json` also carries `extra.apiBase: "https://circuvent.com"`.
> **Nothing reads it.** It is dead configuration and is not the endpoint the app
> uses. Change `src/config.ts` if you need to repoint the app.

### Android permissions

Declared in `app.json` for Wi-Fi provisioning and QR scanning:
`ACCESS_NETWORK_STATE`, `CHANGE_NETWORK_STATE`, `ACCESS_WIFI_STATE`,
`CHANGE_WIFI_STATE`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`,
`NEARBY_WIFI_DEVICES`.

Android requires location permission to enumerate Wi-Fi networks, which is why a
smart-home app asks for it during setup.

### Plugins

- `expo-build-properties` — `compileSdkVersion` 35, `targetSdkVersion` 35,
  `buildToolsVersion` 35.0.0, and `usesCleartextTraffic: true` (needed to reach
  a device's `http://192.168.4.1` setup page)
- `expo-camera` — QR label scanning
- `react-native-wifi-reborn` — joining the device's setup hotspot

## Scripts

```bash
npm start              # expo start
npm run android        # expo run:android
npm run ios            # expo run:ios
npm run typecheck      # version:check && tsc --noEmit
npm run version:check  # asserts the four version fields agree
npm run icons:check    # asserts every icon name resolves
```

`postinstall` runs `scripts/patch-expo-sdk35.js`.

## Version bumping — four files must agree

`npm run version:check` fails the build if they drift.

| File | Fields |
| --- | --- |
| `mobile/src/version.ts` | `APP_VERSION`, `APP_BUILD` |
| `mobile/app.json` | `expo.version`, `expo.android.versionCode` |
| `mobile/android/app/build.gradle` | `versionName`, `versionCode` |

`mobile/android/` is **gitignored**, so the Gradle values are not in version
control. Bump all four anyway — the check runs locally and the build uses Gradle.

## Building a release APK

### The path-with-spaces problem

The repository lives under `…\Office Apps\…`. `expo-modules-core`'s ninja step
**fails on paths containing spaces**, and a directory junction does not help
because CMake canonicalises through it. The only reliable fix is to build from a
real copy at a space-free path.

```powershell
# 1. bump the four version fields, then:
cd mobile
npm run version:check
npm run icons:check
npx tsc --noEmit

# 2. mirror to a space-free path, preserving node_modules and build caches
robocopy "…\WebSite\mobile" "C:\cvapp" /MIR `
  /XD node_modules android\build android\app\build android\.gradle .expo dist

# 3. build
cd C:\cvapp\android
.\gradlew assembleRelease
```

Output: `C:\cvapp\android\app\build\outputs\apk\release\app-release.apk`.

### Verify the binary before shipping

Never trust that Gradle built what you think. Build tools live under
`%LOCALAPPDATA%\Android\Sdk\build-tools\30.0.3\`.

```powershell
$apk = "C:\cvapp\android\app\build\outputs\apk\release\app-release.apk"
$bt  = "$env:LOCALAPPDATA\Android\Sdk\build-tools\30.0.3"

# Right version?
& "$bt\aapt2.exe" dump badging $apk | Select-String "^package:"
#   expect versionCode='10' versionName='1.8.0'

# Signed with the real certificate, not a debug key?
& "$bt\apksigner.bat" verify --print-certs $apk | Select-String "certificate DN"
#   expect CN=Circuvent Technologies, OU=Mobile, O=Circuvent, L=Hyderabad, ST=Telangana, C=IN
```

Also check the APK's timestamp. A failed Gradle run leaves the **previous** APK
in place, and it is easy to verify a stale binary and believe the build worked.

### Confirming your code actually shipped

The JS bundle is **Hermes bytecode**, not text. Searching it for a UTF-8 string
will miss anything containing a non-ASCII character, because those live in a
UTF-16 string table.

```powershell
$b = "C:\cvapp\android\app\build\generated\assets\createBundleReleaseJsAndAssets\index.android.bundle"
# ASCII-only strings: plain UTF-8 search works
([regex]::Matches([IO.File]::ReadAllText($b), "Live view is off")).Count

# Strings with any non-ASCII character (…, ·, ⟨⟩): search UTF-16LE bytes
$needle = [Text.Encoding]::Unicode.GetBytes("Waiting for the first frame")
```

A file starting with magic `C6 1F BC 03` is Hermes bytecode.

### Publishing

Copy to `mobile/dist/circuvent-<version>-vc<code>.apk`. Note that
`mobile/dist/` is **gitignored** — APKs are not versioned in this repository.

## Application structure

| Path | Purpose |
| --- | --- |
| `src/api.ts` | REST client for the control plane, and all shared types |
| `src/live.ts` | WebSocket client: device updates and camera frames |
| `src/store.tsx` | Device state provider, optimistic commands, `capabilities()` |
| `src/ui.tsx` | Design system: theme, primitives, `DEFAULT_MODE`/`DEFAULT_SCHEME` |
| `src/theme.ts` | `deviceMeta` — per-type icon, gradient and label |
| `src/icons.tsx` | Icon name → glyph mapping (validated by `icons:check`) |
| `src/widgets.ts` | Switch/gang helpers shared by tiles and timers |
| `src/cameras.ts` | Camera model, including `isCameraDevice` |
| `src/screens/` | Screens; `Control.tsx` is the device detail page |
| `src/screens/enterprise/` | Fleet admin, diagnostics, automation planner |
| `src/screens/more/` | Secondary screens: cameras, schedules, settings |

## Theming

Defaults are glass / dark / coral (`DEFAULT_MODE`, `DEFAULT_SCHEME`,
`DEFAULT_ACCENT` in `src/ui.tsx`). The app persists a theme **only when the user
explicitly changes it**, so changing a default is safe and does not need the
migration dance the web console required.
