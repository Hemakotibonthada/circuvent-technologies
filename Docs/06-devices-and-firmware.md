# 06 — Devices and firmware

## The fleet

Seventeen device types have firmware in `firmware/`, each its own PlatformIO
project. All of them speak the same protocol
([04 — MQTT protocol](./04-mqtt-protocol.md)) through the shared
`CircuventDevice` library.

| Type id | Product name | What it does |
| --- | --- | --- |
| `home-hub` | Home Hub | Multi-relay hub with scenes |
| `smart-plug` | Smart Plug | Switched socket with energy metering |
| `smart-switch` | Smart Switch | Multi-gang wall switch |
| `touchboard` | Touch Switchboard | 3 capacitive gangs + HLW8012 metering |
| `smart-light` | Smart Light | Dimmable / colour light |
| `smart-fan` | Smart Fan Controller | Fan speed control |
| `curtain` | Smart Curtain | Motorised curtain, position control |
| `smart-lock` | Smart Lock | Electronic deadbolt |
| `facedoor` | FaceDoor | PIN + fingerprint + face door controller |
| `rfid-gate` | RFID Gate | Long-range UHF vehicle barrier |
| `camera` | Camera | ESP32-CAM live video node |
| `motion-sensor` | Motion Sensor | PIR intrusion detection |
| `guardian` | Guardian | Safety / SOS unit |
| `energy-monitor` | Energy Monitor | Whole-home CT clamp metering |
| `aquaguard` | AquaGuard | Single-tank pump controller |
| `watertank` | WaterTank Duo | Sump + overhead, ultrasonic, dry-run trip |
| `agri-starter` | Agri GSM Starter | GSM pump starter for fields |

`hardware/` holds the KiCad project, datasheet, manual, enclosure notes and
marketplace listings for most of these.

## The shared library — `firmware/CircuventDevice/CircuventDevice.h`

Every sketch includes it. It provides:

- Wi-Fi connection, with a **provisioning access point** when no credentials are
  stored (`Circuvent-Setup-XXXX`, captive page at `192.168.4.1`)
- MQTT connection over TLS with the device's own credentials, plus Last-Will on
  `cv/<id>/status`
- Self-provisioning: redeeming a short-lived token to obtain its permanent id and
  key, so the secret never crosses the local setup link
- `cv.set(key, value)` to build state, `cv.publishStateNow()` to publish it
- `cv.onCommand(handler)` for inbound commands
- `cv.publishTelemetry(obj)` for readings
- `cv.publishFrame(buf, len)` for camera JPEG (chunked, so a large frame cannot
  stall the TCP write in one call)
- Optional physical reset button: ~3 s clears Wi-Fi, ~8 s factory resets
- Credential storage in NVS via `Preferences`

### The reset-button trap

`setResetButton(pin)` calls `pinMode(pin, INPUT_PULLUP)` at boot. If that pin is
also a camera pin, the camera silently stops working — `esp_camera_init()`
already returned OK, so the device reports a healthy sensor and sends nothing.
This actually happened: the AI-Thinker profile had the reset button on GPIO 0,
which is the camera's XCLK. `firmware/camera/camera.ino` now carries a
compile-time `CV_PIN_CLASH` guard that fails the build if any auxiliary pin
collides with a camera pin. See [15 — Troubleshooting](./15-troubleshooting.md).

## Building and flashing

Each device folder is a PlatformIO project.

```bash
cd firmware/<device>
pio run                 # compile
pio run -t upload       # flash over USB
pio device monitor      # serial at 115200
```

The AI-Thinker ESP32-CAM has no USB: wire an FTDI adapter to U0R/U0T, bridge IO0
to GND, and press RESET to enter the bootloader before uploading.

Board profiles are selected with a build flag, e.g. in
`firmware/camera/platformio.ini`:

```ini
build_flags =
    -DCV_CAM_BOARD=1     ; 1=AI-Thinker 2=WROVER-KIT 3=M5Stack-Wide 4=TTGO T-Journal
    -DPIR_GPIO_NUM=-1
```

## Provisioning a device

The app-driven flow, which is what customers use:

1. The app calls `POST /provisioning/token` and receives a **15-minute** JWT.
2. The device is joined to the customer's Wi-Fi through its setup AP, and given
   that token.
3. The device calls `POST /provisioning/self` over TLS and receives its permanent
   `deviceId` and key.
4. The API creates the broker client automatically via Dynamic Security
   (`provisionBrokerClient`), so there is **no manual server step**.
5. The device stores the credentials in NVS and connects to the broker.

The manual flow, for bench work, is `POST /devices/provision` with an
authenticated call; it returns the one-time key, which is already a working
broker credential.

> `platform/README.md` step 7.2 tells you to run `mosquitto_passwd` afterwards.
> That is out of date — see [04 — MQTT protocol](./04-mqtt-protocol.md).

## Automations

Stored in the control plane and executed by
`platform/api/src/automations.ts`.

### Triggers

| Type | Fields | Notes |
| --- | --- | --- |
| `state` | `deviceId`, `field`, `op`, `value` | **Edge-triggered**: fires when the condition becomes true, not on every poll |
| `time` | `at` (`HH:MM`), `days` (0=Sun…6=Sat) | Evaluated in **IST (`Asia/Kolkata`)**, not the browser's zone. Missing or empty `days` means daily |
| `event` | `deviceId`, `eventType`, `match` | Matches a telemetry event: door access, RFID, doorbell |

Operators: `<`, `<=`, `>`, `>=`, `==`, `!=`, `truthy`, `falsy`.

### Actions

`action` is a single object **or an ordered array of up to 12 steps**.

| Type | Fields |
| --- | --- |
| `command` | `deviceId`, `command` |
| `notify` | `title`, `body` |
| `tts` | `deviceId`, `text` — `{name}` is substituted from the triggering event |

Every step may carry `delayMs` (0–30000), a pause **before** that step runs. This
is what makes "unlock, wait 2 s, announce, wait 30 s, lock again" one automation.

The scheduler polls every 20 s and de-duplicates by minute, so a time rule fires
once per minute at most.

> Zod strips unknown keys. Any new trigger or action field **must** be added to
> `triggerSchema` / `actionSchema` in `platform/api/src/routes/automations.ts`, or
> it will be silently dropped on every write.

## OTA updates

`POST /admin/devices/:id/ota` pushes a firmware URL to one device;
`POST /admin/ota-broadcast` pushes to every device of a type. The device
downloads and applies it, then reports its new `fw_version` in `status`.
