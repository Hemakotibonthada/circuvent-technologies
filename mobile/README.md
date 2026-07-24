# Circuvent Mobile App (Expo / React Native)

Cross-platform (iOS + Android) app to control your Circuvent devices —
**Home Automation Hub**, **AquaGuard Water Tank Controller** and the rest —
against the **self-hosted Circuvent control plane** (`../platform/`). No
third-party IoT cloud.

## Features
- Email sign-in / sign-up (JWT; same control-plane accounts).
- **Live device list + control over a real-time WebSocket** (`/ws`) — commands
  reach the device in under a second (no polling in the hot path).
- Link a new device by **Device ID + Key** (`POST /devices/claim`).
- Per-device control screens:
  - **AquaGuard:** live tank-level gauge, auto/manual, pump on/off, start/stop
    % thresholds, dry-run/overflow alerts.
  - **Home Hub:** 4 channel switches + scenes (home/away/night/movie).
  - Other device types show live state (extend `Control.tsx` as needed).

## Run it
```bash
cd mobile
npm install
# Point the app at your control plane in src/config.ts:
#   API_BASE = https://api.circuvent.com   WS_URL = wss://api.circuvent.com/ws
# (Requires the api.circuvent.com DNS record -> your VM IP.)
npm run start      # press a for Android / i for iOS, or scan the QR in Expo Go
```

## Build for the stores (later)
```bash
npm i -g eas-cli
eas build -p android    # AAB for Play Store
eas build -p ios        # App Store (Apple Developer account required)
```

## Structure
```
App.tsx              root: auth gate + simple navigation
src/config.ts        API_BASE + WS_URL (control plane)
src/api.ts           fetch client + JWT storage (AsyncStorage)
src/auth.tsx         auth context (login / register / logout)
src/live.ts          live device WebSocket hook (auto-reconnecting)
src/screens/         Login, Devices (list + claim), Control (per-type)
```

## Notes
- Talks only to our own control plane + broker — fully self-owned.
- Push notifications (Expo push) for dry-run/overflow/offline alerts are the
  next planned addition (the control plane already tracks device online/offline
  via MQTT Last-Will, so server-side triggers are ready to wire up).
