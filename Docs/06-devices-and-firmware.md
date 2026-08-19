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
| `anpr-cam` | ANPR Camera | Reads vehicle number plates at a gate — see [20 — ANPR](./20-anpr.md) |
| `motion-sensor` | Motion Sensor | PIR intrusion detection |
| `guardian` | Guardian | Safety / SOS unit |
| `energy-monitor` | Energy Monitor | Whole-home CT clamp metering |
| `aquaguard` | AquaGuard | Single-tank pump controller |
| `watertank` | WaterTank Duo | Sump + overhead, ultrasonic, dry-run trip |
| `agri-starter` | Agri GSM Starter | GSM pump starter for fields |
| `sentinel` | Sentinel | Gas + climate safety panel, touch relays, optional camera |

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

### Sharing GPIO0 with a local button

Most relay devices put their own button on GPIO0 too — the same pin
`setResetButton(0)` watches. The pin then has two owners: a **tap** means
"toggle the light / cycle the fan / throw the bolt", and a **multi-second hold**
is the platform reset gesture.

Reading the pin directly gets this wrong twice, and both were shipped:

```c
// WRONG. Not "on press" — "every 400 ms for as long as it is held".
if (digitalRead(BTN_PIN) == LOW && millis() - lastBtn > 400) { ... }
```

1. **A hold drives the device all the way through.** Holding BOOT for eight
   seconds to factory-reset a fan walked it through twenty speed changes,
   switching the relay and writing NVS each time. On a lock it was the bolt
   thrown twenty times, ending unlocked about half the time. On a gate, a
   barrier motor reversed every 600 ms under load.
2. **A pin that is already low at boot is not a press.** GPIO0 is a strapping
   pin, usually on an RC network, and can sit low for seconds while the rail
   comes up after a power cut. Acting on its release means the power came back
   and the door unlocked itself.

Use **`CvTapButton`**, which acts on release, ignores anything long enough to be
a reset gesture, and refuses to arm until it has seen the pin released:

```c
CvTapButton btn;
void setup() { btn.begin(BTN_PIN); }          // defaults: 40 ms .. 700 ms
void loop()  { if (btn.tapped()) toggle(); }
```

`tests/firmware-shared-button.test.ts` checks every sketch that shares the pin
uses it, and that the level test does not come back.

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

## Sentinel — the two-board split

`firmware/sentinel` builds two different products from one source file:

```bash
pio run -e sentinel      -t upload   # ESP32 DevKit: 4 relays, 4 touch pads, gas, DHT, buzzer, PIR
pio run -e sentinel-cam  -t upload   # ESP32-CAM:    camera, 2 relays, 2 pads, DHT — no gas
```

The camera build is not a stripped-down edition for pricing reasons. Gas sensing
and a camera **cannot** coexist on this hardware:

- An MQ-2 is an analog sensor, so it needs an ADC pin.
- ADC2 stops converting the moment Wi-Fi starts, so the sensor must sit on ADC1
  (GPIO 32–39).
- The AI-Thinker ESP32-CAM already uses every ADC1 pin except GPIO 33, and that
  one drives the on-board LED, which would bias the reading.

Relays are on GPIO 19/21/22/23 and touch pads on 4/13/14/33, both chosen to
avoid the strapping pins. A relay on GPIO 0/2/5/12/15 clicks on every boot,
which on a mains board means the lights flick each time the power blinks; GPIO
12 additionally selects the flash voltage at reset, so a hand resting on the
panel during a power cut could stop the board coming back up.

**The firmware never reports a gas concentration.** An MQ-2 cannot produce a
calibrated ppm without a per-gas curve, a known load resistance and temperature
compensation, so it publishes `gasRaw` (ADC counts), `gasPct` (relative to its
own clean-air baseline) and the `gasAlarm` boolean. The UI shows those and
nothing more. Related behaviour worth knowing before changing it:

| Behaviour | Reason |
| --- | --- |
| 90 s warm-up before any alarm decision | MQ-2s read high until the heater settles — alarming during it means a false alarm after every power cut, which teaches people to ignore the panel |
| Hysteresis (alarm 700, clear 450) + 3 s sustained | Stops an aerosol or a lighter emptying the house |
| The alarm latches | Someone should look before it is dismissed |
| The baseline never re-learns during an alarm | Otherwise the sensor is taught that a leak is normal |
| Muting expires after 5 minutes | A permanently silenced gas alarm is worse than none, because it still looks like it works |
| A single DHT checksum failure keeps the last good value | Those are routine; publishing NaN would hole every chart |

`safetyCutMask` cuts the chosen appliances on alarm and `exhaustRelay` drives
extraction — detection with no action is only a noise-maker.

Every state change carries `lastSource` (`touch`, `cloud`, `schedule`,
`gas-alarm`, `auto-off`, `restore`, `away-mode`) so the timeline can say *why* a
relay moved. Touch presses call `publishStateNow()` rather than waiting for the
next periodic publish, which is what makes a physical press show up in the app
immediately.

The standard board uses `min_spiffs.csv`. The default table leaves two 1.25 MB
app slots and a 1.5 MB filesystem this firmware never touches, which put the
image at ~80% of its slot; an OTA has to fit in the other one.

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
