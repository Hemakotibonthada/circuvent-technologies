# Circuvent Mobile App (Expo / React Native)

Cross-platform (iOS + Android) app to control your Circuvent devices —
**Home Automation Hub** and **AquaGuard Water Tank Controller** — using the same
Circuvent cloud APIs as the website.

## Features
- Email sign-in / sign-up with OTP (same accounts as circuvent.com).
- Live device list with online status + at-a-glance state (poll every 5s).
- Link a new device by **Device ID + Key** (`/api/devices/claim`).
- Per-device control screens:
  - **AquaGuard:** live tank level gauge, auto/manual, pump on/off, start/stop % thresholds, dry-run/overflow alerts.
  - **Home Hub:** 4 channel switches + scenes (home/away/night/movie).

## Run it
```bash
cd mobile
npm install
# set your server in src/config.ts (API_BASE). Use your LAN IP for local dev.
npm run start      # then press a for Android / i for iOS, or scan the QR in Expo Go
```

## Build for the stores (later)
```bash
npm i -g eas-cli
eas build -p android    # AAB for Play Store
eas build -p ios        # for App Store (Apple Developer account required)
```

## Structure
```
App.tsx              root: auth gate + simple navigation
src/config.ts        API_BASE (point at your server)
src/api.ts           fetch client + token storage (AsyncStorage)
src/auth.tsx         auth context (login/register/verify-otp/logout)
src/screens/         Login, Devices (list + claim), Control (per-type)
```

## Notes
- Talks only to the proprietary Circuvent API — no third-party IoT cloud.
- Push notifications (FCM/APNs) for dry-run/overflow/offline alerts are a
  planned addition (see `hardware/CHECKLIST.md`).
