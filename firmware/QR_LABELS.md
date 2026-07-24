# Circuvent — Device Setup QR Labels

Every Circuvent device flashes **identical firmware** (no baked id or secret).
The QR sticker on the box/device therefore carries only **non‑secret setup
hints** — enough to make onboarding one‑tap, while the real trust still comes
from the A+B flow (encrypted Wi‑Fi handoff + TLS self‑provision). A stolen QR
grants nothing: it cannot join Wi‑Fi, cannot mint a device secret, and is
useless without physical access to the un‑provisioned device's hotspot.

## What the app does with a scan

`Add device → Scan device QR` opens the camera, reads the label, then:
- pre‑selects the **device type** (skips the type grid), and
- if present, shows the exact **hotspot name** to join in the connect step.

It then continues the normal secure flow (mint token → join hotspot → encrypt
Wi‑Fi creds to the device key → device self‑provisions over TLS).

## Payload format

Any one of these encodings is accepted (parser: `mobile/src/qr.ts`):

| # | Encoding | Example |
| - | -------- | ------- |
| 1 | URI | `circuvent://setup?type=smart-plug&ssid=Circuvent-Setup-ab12&name=Overhead%20Tank` |
| 2 | JSON | `{"t":"smart-plug","s":"Circuvent-Setup-ab12","n":"Overhead Tank"}` |
| 3 | Bare type | `smart-plug` |
| 4 | Bare hotspot | `Circuvent-Setup-ab12` |

Fields (all optional, but include at least `type` **or** `ssid`):

| Field | Alias | Meaning |
| ----- | ----- | ------- |
| `type` | `t` | Device type id — one of: `smart-plug`, `smart-switch`, `aquaguard`, `home-hub`, `energy-monitor`, `guardian`, `motion-sensor`, `agri-starter`. |
| `ssid` | `s` | The device's SoftAP name — `Circuvent-Setup-<shortId>` (the `<shortId>` is the device's MAC‑derived suffix, printed at manufacture). |
| `name` | `n` | Optional friendly default name. |

## Two label strategies

1. **Per‑SKU (bulk, cheapest).** Print one QR per product type carrying only the
   type — e.g. `circuvent://setup?type=aquaguard`. Same sticker on every
   AquaGuard. Onboarding skips type selection; the app still scans for the
   `Circuvent-Setup-…` hotspot.

2. **Per‑device (best UX).** At the manufacturing/flashing station, power the
   unit, read its SoftAP name (`Circuvent-Setup-<shortId>`, or its MAC), and
   print a label that also carries `ssid=` so the app can point the user
   straight at the right hotspot:
   `circuvent://setup?type=aquaguard&ssid=Circuvent-Setup-ab12`.

## Generating labels

The payload is just a text string — any QR generator works. To batch‑generate
PNGs with Node and the [`qrcode`](https://www.npmjs.com/package/qrcode) package:

```js
// gen-labels.mjs  —  node gen-labels.mjs
import QRCode from "qrcode";                 // npm i qrcode
const build = (t, s) =>
  `circuvent://setup?type=${t}${s ? `&ssid=${encodeURIComponent(s)}` : ""}`;

// Per‑SKU labels
for (const t of ["smart-plug", "smart-switch", "aquaguard", "home-hub",
                 "energy-monitor", "guardian", "motion-sensor", "agri-starter"]) {
  await QRCode.toFile(`label-${t}.png`, build(t), { margin: 2, width: 512 });
}

// Per‑device label (read the SoftAP name off the unit at flashing time)
await QRCode.toFile("label-unit-ab12.png",
  build("aquaguard", "Circuvent-Setup-ab12"), { margin: 2, width: 512 });
```

Quick terminal preview without installing anything global:

```bash
npx qrcode-terminal "circuvent://setup?type=smart-plug"
```

## Reading a unit's `shortId` for a per‑device label

The SoftAP name a device advertises is `Circuvent-Setup-<shortId>`. On the
flashing bench you can read it from the serial log at boot or by listing Wi‑Fi
APs after power‑on. `<shortId>` is derived from the device MAC in
`firmware/CircuventDevice/CircuventDevice.h` (`_shortId()`), so it is stable per
unit and safe to print.
