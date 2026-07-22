# Circuvent Device Firmware

Proprietary, end‑to‑end firmware for every Circuvent device. All devices speak
one simple, Circuvent‑owned HTTPS protocol to the Circuvent cloud — no
third‑party IoT platform, no external broker.

```
Device (ESP32/ESP8266)  ──HTTPS──►  Circuvent Cloud (/api/devices/*)  ──►  App (/shop/devices)
        firmware/                     Next.js API + file store                 web dashboard
```

## Devices

| Folder            | Product                     | Type id           | Key telemetry / controls            |
|-------------------|-----------------------------|-------------------|-------------------------------------|
| `smart-plug/`     | Smart Plug                  | `smart-plug`      | `power`, `watts` · toggle           |
| `smart-switch/`   | Smart Switch (2‑gang)       | `smart-switch`    | `power`, `power2` · toggle          |
| `aquaguard/`      | AquaGuard tank controller   | `aquaguard`       | `level`, `pump`, `dryRun` · pump    |
| `agri-starter/`   | Agri GSM pump starter       | `agri-starter`    | `pump`, `power_available` · pump    |
| `guardian/`       | Safety SOS beacon           | `guardian`        | `sos`, `battery`, `lat/lng`, `armed`|
| `energy-monitor/` | Whole‑home energy monitor   | `energy-monitor`  | `watts`, `amps`, `kwh`              |
| `motion-sensor/`  | PIR motion sensor           | `motion-sensor`   | `motion`, `armed`                   |
| `home-hub/`       | Automation hub              | `home-hub`        | `scene`, `power`, `uptime`          |

## The protocol (proprietary)

A device makes **one** call on a timer:

```
POST {API}/api/devices/sync
Headers: x-device-id, x-device-key
Body:    { "type": "<type id>", "state": { ...telemetry } }
→ 200:   { "ok": true, "claimed": true|false, "commands": [ { "action": "set", "params": {...} }, ... ] }
```

- **Telemetry up, commands down** in a single request (efficient for battery/polled devices).
- Commands are **drained** on read; the firmware applies each via its `onCommand` handler.
- `claimed` tells the device whether an account has linked it yet.

App‑side (authenticated with the customer's account token):
`GET /api/devices` · `POST /api/devices/claim {deviceId,key,name}` · `POST /api/devices/command {deviceId,action,params}`.

## Build & flash

1. **Arduino IDE** with the **ESP32** (or ESP8266) board core.
2. Install libraries (Library Manager): **ArduinoJson** (v7), and per device:
   `fauxmoESP` (smart‑plug, smart‑switch), `TinyGPSPlus` (guardian).
3. Copy `firmware/CircuventDevice` into your `Arduino/libraries/` folder.
4. Open the device sketch (e.g. `smart-plug/smart-plug.ino`), set `WIFI_SSID`,
   `WIFI_PASS`, and the `DEVICE_ID` / `DEVICE_KEY` printed on the unit.
5. Select your board + port and **Upload**.

Set the cloud endpoint by passing a base URL to the constructor if self‑hosting,
e.g. `CircuventDevice cv(ID, KEY, "smart-plug", "https://circuvent.com");`.

## Provisioning & linking

- Every unit ships with a unique **Device ID** + **Device Key** (sticker).
- On first boot the device auto‑registers itself (unclaimed) via `/sync`.
- The owner opens **Store → Devices**, taps **Add a device**, and enters the
  ID + key to link it to their account. From then on the dashboard shows live
  state and can send commands.

## Production hardening (TODO)

- Pin the Circuvent TLS certificate in `CircuventDevice.h` (replace `setInsecure()`).
- Store credentials in NVS + add Wi‑Fi provisioning (SoftAP/BLE) instead of hard‑coding.
- Add signed OTA firmware updates.
- Rotate device keys; rate‑limit `/api/devices/sync` per device.
