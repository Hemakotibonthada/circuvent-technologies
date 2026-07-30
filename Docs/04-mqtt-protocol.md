# 04 — MQTT protocol

The contract between devices, the control plane and the apps. The authoritative
short version lives at `platform/PROTOCOL.md`; this document adds the operational
detail and the parts the code enforces that the protocol note does not mention.

Broker: `mqtts://mqtt.circuvent.com:8883` (TLS, public) and `mqtt://mosquitto:1883`
(plaintext, reachable only on the internal Docker network).

## Identity and authentication

- Every device has a **`deviceId`** (e.g. `hub-a1b2c3`) and a secret **key**.
- The device authenticates to the broker with **username = `deviceId`**,
  **password = key**.
- ACLs restrict a device to its own topics: `cv/<deviceId>/#`.
- The control plane connects as `control-plane` with full `cv/#` access, over the
  internal listener only.

### Device credentials are created automatically

`platform/README.md` steps 6 and 7.2 tell you to run `mosquitto_passwd` by hand.
**That is out of date.** `platform/mosquitto/mosquitto.conf` loads the Dynamic
Security plugin:

```
allow_anonymous false
plugin /usr/lib/mosquitto_dynamic_security.so
plugin_opt_config_file /mosquitto/data/dynamic-security.json
```

and `platform/api/src/mqtt.ts` drives it over the `$CONTROL/dynamic-security/v1`
channel:

| Function | What it does |
| --- | --- |
| `bootstrapDynsec()` | Idempotently creates the `controlplane` and `device` roles on every boot |
| `provisionBrokerClient(id, key)` | Creates the broker client for a newly provisioned device and grants it the `device` role |
| `deprovisionBrokerClient(id)` | Deletes the broker client when a device is unclaimed or removed |

The `device` role is scoped with `cv/%u/#`, where `%u` is the connecting
username — which is why a device can only ever reach its own topics.

So **provisioning a device needs no manual server step**. The one-time key
returned by `POST /devices/provision` is already a working broker credential.

`platform/mosquitto/aclfile` is still mounted by `docker-compose.yml` but is not
referenced by `mosquitto.conf`; the dynsec plugin supersedes it. It is harmless,
and left in place, but do not edit it expecting an effect.

## Topics

| Topic | Direction | QoS | Retained | Purpose |
| --- | --- | --- | --- | --- |
| `cv/<id>/cmd` | control plane → device | 1 | no | Commands to actuate the device |
| `cv/<id>/state` | device → control plane | 1 | **yes** | Full authoritative state |
| `cv/<id>/telemetry` | device → control plane | 0/1 | no | Time-series readings |
| `cv/<id>/frame` | device → control plane | 0 | **no** | Raw binary JPEG from cameras |
| `cv/<id>/status` | device (and Last-Will) | 1 | **yes** | `{"online":true|false}` |

`state` and `status` are retained so a newly connected app sees the current
value immediately instead of waiting for the next change. `frame` must never be
retained — a retained frame hands the camera's last picture to anything that
subscribes later.

## Payloads

### `status` — retained, plus Last-Will

```json
{ "online": true, "fw": "1.2.0" }
```

Set the MQTT Last-Will to `cv/<id>/status` = `{"online":false}`, retained, so the
platform detects hard disconnects rather than waiting for a timeout.

### `state` — retained, device-type specific

```json
// home-hub
{ "relays": [true, false, false, true], "scene": "home", "rssi": -58 }

// aquaguard
{ "level": 72, "pump": true, "mode": "auto", "startPct": 30, "stopPct": 90, "dryRun": false }

// smart-plug
{ "on": true, "power_w": 42.6, "energy_kwh": 3.11 }

// camera
{ "hasCamera": true, "ready": true, "psram": true,
  "streaming": false, "fps": 8, "resolution": "VGA", "quality": 12,
  "rotation": 0, "flash": 0,
  "motion": true, "sensitivity": 45, "motionActive": false,
  "motionCount": 12, "snapshots": 3, "frames": 4821, "dropped": 2 }
```

`hasCamera: true` is how both apps discover a video source independently of the
device's type string.

### `telemetry` — append-only

```json
{ "power_w": 42.6, "voltage": 232, "level": 71 }
```

Cameras publish **events** here, never images:

```json
{ "type": "motion",   "source": "image", "ts": 1712345678 }
{ "type": "snapshot", "bytes": 18422, "w": 640, "h": 480, "ts": 1712345678 }
```

### `cmd` — commands

Most commands are `{"action":"set", ...}` with device-specific fields. The API
publishes the body of `POST /devices/:id/command` unchanged.

```json
{ "action": "set", "ch": 2, "on": true }              // home-hub
{ "action": "set", "relays": [true,false,false,true] }
{ "action": "set", "pump": true }                     // aquaguard
{ "action": "set", "power": true }                    // smart-plug / switch
{ "action": "set", "armed": true }                    // guardian
```

Cameras are the exception, because starting a stream is an ongoing lease rather
than a stored setting:

```json
{ "action": "stream",   "on": true, "fps": 8 }
{ "action": "snapshot" }
{ "action": "flash",    "level": 60 }
{ "action": "reboot" }
{ "action": "set", "resolution": "VGA", "quality": 12, "rotation": 180,
                   "motion": true, "sensitivity": 45, "fps": 8 }
```

Ranges the firmware enforces: `resolution` ∈ `QQVGA | QVGA | CIF | VGA | SVGA |
XGA | SXGA | UXGA`, clamped to `VGA` without PSRAM; `quality` 4 (best) – 63
(worst); `fps` 1–15.

**A stream is a lease.** The camera stops on its own about 20 s after the last
`{"action":"stream","on":true}`, so a viewer that closes a laptop lid cannot
leave a board streaming and overheating. Clients re-arm every few seconds while
a live view is open (the web console and the app both use an 8 s interval).

## The app real-time channel

Connect: `wss://api.circuvent.com/ws?token=<JWT>`

Server pushes:

```json
{ "type": "device:update", "deviceId": "...", "kind": "state|telemetry|status",
  "payload": { … }, "at": "2026-04-05T18:14:38.901Z" }
```

Commands go over REST rather than the socket, because REST is reliable and
logged.

### Live video on the same socket

Frames are opt-in, so an app that is not showing a camera is off the video path
entirely.

```json
→ { "type": "watch",   "deviceId": "cam-a1b2c3" }
→ { "type": "unwatch", "deviceId": "cam-a1b2c3" }
← { "type": "device:frame", "deviceId": "cam-a1b2c3",
    "jpeg": "<base64 JPEG>", "bytes": 18422, "at": "…" }
```

Limits the server enforces, so a client cannot talk itself into more video than
it is entitled to:

| Rule | Value | Why |
| --- | --- | --- |
| Watch a device you do not own | Silently ignored | Ownership re-checked **on every frame**, so unclaiming cuts the feed at once |
| Cameras watched per socket | 8 | Bounds fan-out cost per client |
| Socket send buffer | Frames dropped above 1 MB | A slow viewer loses frames rather than falling further behind |
| Frame size | Dropped above 512 KB | `MAX_FRAME_BYTES` in `platform/api/src/mqtt.ts` |
| Frame rate | Dropped above 30 fps | `MAX_FPS` in the same file |
| Nobody watching | Frame discarded before base64 | `watchedDevices` is checked first, so an unwatched camera costs a set lookup |

`jpeg` is base64 **only on this hop**, because browsers and React Native need a
data URL and the socket is already JSON. The device-to-broker hop stays raw
binary; base64 there would cost 33 % more bandwidth and MCU RAM for nothing.

## Latency model

- App → API → broker → device: typically **< 1 s**.
- Device → broker → API → app socket: typically **< 1 s**.
- `set_tcp_nodelay true` in `mosquitto.conf` disables Nagle's algorithm so small
  control packets are sent immediately rather than buffered for ~40 ms.

## Broker limits

From `platform/mosquitto/mosquitto.conf`, tuned for a free-tier VM:

```
max_queued_messages 1000
max_inflight_messages 40
persistence true
```

## Testing the bus by hand

```bash
# Watch everything (from the VM, or with the CA trusted)
mosquitto_sub -h mqtt.circuvent.com -p 8883 --capath /etc/ssl/certs \
  -u control-plane -P '<password>' -t 'cv/#' -v

# Send a command directly, bypassing the API
mosquitto_pub -h mqtt.circuvent.com -p 8883 --capath /etc/ssl/certs \
  -u control-plane -P '<password>' \
  -t 'cv/hub-a1b2c3/cmd' -m '{"action":"set","ch":1,"on":true}'
```

Publishing directly bypasses ownership checks and command logging. Use it to
diagnose, not to operate.
