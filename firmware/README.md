# Circuvent Device Firmware

Proprietary, end-to-end firmware for every Circuvent device. Devices talk **MQTT
over TLS** to **our own self-hosted broker** (see `../platform/`) — no third-party
IoT cloud, no external broker. Commands arrive in **under a second** (push, not
polling).

```
Device (ESP32/ESP8266) ──mqtts:8883──►  Circuvent broker (Mosquitto)  ◄──►  Control-plane API
        firmware/            (our CA)          platform/                    REST + live /ws
                                                                                  ▲
                                        App (mobile/web)  ──https / wss──────────┘
```

## Devices

| Folder            | Product                     | Type id           | Key state / controls                |
|-------------------|-----------------------------|-------------------|-------------------------------------|
| `smart-plug/`     | Smart Plug                  | `smart-plug`      | `power`, `watts` · toggle           |
| `smart-switch/`   | Smart Switch (2-gang)       | `smart-switch`    | `power`, `power2` · toggle          |
| `aquaguard/`      | AquaGuard tank controller   | `aquaguard`       | `level`, `pump`, `dryRun` · pump    |
| `agri-starter/`   | Agri GSM pump starter       | `agri-starter`    | `pump`, `power_available` · pump    |
| `guardian/`       | Safety SOS beacon           | `guardian`        | `sos`, `battery`, `lat/lng`, `armed`|
| `energy-monitor/` | Whole-home energy monitor   | `energy-monitor`  | `watts`, `amps`, `kwh`              |
| `motion-sensor/`  | PIR motion sensor           | `motion-sensor`   | `motion`, `armed`                   |
| `camera/`         | ESP32-CAM video node        | `camera`          | `streaming`, `motionActive`, `flash` · live view / snapshot |
| `home-hub/`       | Automation hub              | `home-hub`        | `scene`, relays, `uptime`           |

## The protocol (MQTT)

Full contract in **`../platform/PROTOCOL.md`**. In short, each device uses:

| Topic | Dir | Purpose |
| --- | --- | --- |
| `cv/<id>/cmd` | in | commands (`{"action":"set", ...}`) — handled by the sketch's `onCommand` |
| `cv/<id>/state` | out | retained full state (published on a timer + on demand) |
| `cv/<id>/telemetry` | out | one-off readings |
| `cv/<id>/frame` | out | **raw binary JPEG** from camera devices — QoS 0, never retained, never stored |
| `cv/<id>/status` | out | `{"online":true}` on connect; Last-Will `{"online":false}` on drop |

Auth: MQTT **username = device id**, **password = device key**. TLS uses
Circuvent's own CA, embedded in `CircuventDevice.h` (`CIRCUVENT_DEFAULT_CA`).

## Build & flash (PlatformIO)

Every device runs the **same firmware** — no per-device id/key in code. Open the
folder for your device (e.g. `firmware/smart-plug/`) in the **PlatformIO IDE**
(each folder has its own `platformio.ini`), plug in the ESP32, and click
**Upload**. Flash the identical binary to every unit.

Legacy Arduino-IDE path:

1. **Arduino IDE** with the **ESP32** (or ESP8266) board core.
2. Install libraries (Library Manager): **ArduinoJson** (v7), **PubSubClient**,
   and per device: `fauxmoESP` (smart-plug, smart-switch), `TinyGPSPlus` (guardian).
3. Copy `firmware/CircuventDevice` into your `Arduino/libraries/` folder.
4. Open a sketch (e.g. `home-hub/home-hub.ino`), set the `DEVICE_ID` /
   `DEVICE_KEY` from provisioning (below). Wi-Fi is entered on-device via the
   captive portal (`Circuvent-Setup-XXXX`) — no need to hard-code it.
5. Select your board + port and **Upload**.

The broker defaults to `mqtt.circuvent.com:8883`. **Before you've set the DNS
record**, point a device straight at the VM IP in `setup()`:

```cpp
cv.setBroker("140.245.238.154");   // until mqtt.circuvent.com DNS is live
cv.begin();
```

## Onboarding a device (zero-touch — in the app, no `add-device.sh`)

The app does this automatically (Add device → Set up a new device): it reads the
device's setup hotspot (`GET /info`), provisions an identity from the control
plane, and pushes it + your Wi-Fi (`POST /save`). Broker credentials are created
by the control-plane via Mosquitto Dynamic Security. The steps below are the
underlying calls, for reference only:

1. **Provision** (creates the device + returns its one-time key):
   ```bash
   curl -s https://api.circuvent.com/devices/provision \
     -H "authorization: Bearer <YOUR_APP_TOKEN>" -H 'content-type: application/json' \
     -d '{"id":"hub-a1b2c3","type":"home-hub","name":"Living Room Hub"}'
   ```
2. **Grant broker access** on the server, then flash the id+key:
   ```bash
   cd platform && ./scripts/add-device.sh hub-a1b2c3 '<ONE-TIME-KEY>'
   ```

## Resetting & changing Wi-Fi

Every device has a **reset button** (wired to `GPIO0` / the BOOT button by
default — change it with `cv.setResetButton(pin)`), plus a `/reset` endpoint on
the setup portal:

| Action | How | Effect |
| --- | --- | --- |
| **Change Wi-Fi** | Hold the button **~3 s** (or `GET /reset` on the portal) | Clears only the stored Wi-Fi; **keeps the device identity** (id/key/history) and re-opens the `Circuvent-Setup-XXXX` hotspot so you can push a new network. |
| **Factory reset** | Hold the button **~8 s** (or `GET /reset?full=1`) | Wipes **all** NVS credentials — the device becomes brand-new and must be re-provisioned. |

In the app this is one tap: open a device → **Change Wi-Fi network**. On Android
the app **auto-discovers** the device's hotspot and **connects to it in-app** (no
trip to Settings), reads the nearby networks, and pushes the new Wi-Fi encrypted
to the device — which then reconnects with its existing identity. The setup
portal serves `GET /scan` from a **cached async Wi-Fi scan** (mode `WIFI_AP_STA`)
so the network list returns fast.

## Production hardening

- ✅ TLS to the broker via our own embedded CA (`setInsecure()` no longer used
  for MQTT).
- ✅ Captive-portal Wi-Fi provisioning + NVS credential storage.
- ✅ Last-Will online/offline + retained state so the app reflects reality instantly.
- Optional: signed OTA (`setOtaInterval(ms)` to enable; off by default).
- Future: delegate broker auth to Postgres (mosquitto-go-auth) so provisioning
  alone grants broker access without `add-device.sh`.
