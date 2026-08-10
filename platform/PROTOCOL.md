# Circuvent Device Protocol (MQTT)

The single source of truth for how devices, the control-plane, and the app talk.
Everything is JSON over MQTT on our own broker (`mqtts://mqtt.circuvent.com:8883`).

## Identity & auth
- Every device has a **`deviceId`** (e.g. `hub-a1b2c3`) and a secret **key**.
- The device authenticates to the broker with **username = `deviceId`**, **password = key**.
- ACLs restrict a device to its own topics only: `cv/<deviceId>/#`.
- The control-plane connects as user `control-plane` with full `cv/#` access.

## Topics
| Topic | Direction | QoS | Retain | Purpose |
| --- | --- | --- | --- | --- |
| `cv/<id>/cmd` | control-plane → device | 1 | no | Commands to actuate the device |
| `cv/<id>/state` | device → control-plane | 1 | yes | Current authoritative state (retained so the app sees it instantly) |
| `cv/<id>/telemetry` | device → control-plane | 0/1 | no | Time-series readings (power, level, temp…) |
| `cv/<id>/frame` | device → control-plane | 0 | **no** | **Raw binary JPEG** from camera devices. Relayed live, never stored. |
| `cv/<id>/anpr` | device → control-plane | 0 | **no** | **Vehicle capture** from an ANPR camera: 16-byte header + JPEG. Never stored as telemetry. See Docs/20-anpr.md |
| `cv/<id>/track` | device → control-plane | 0 | **no** | **Flight positions** from a drone link: 16-byte header + fixed 40-byte records, batched. Stored as columns in `flight_track`, never as telemetry. See Docs/21-drone.md |
| `cv/<id>/status` | device (LWT) | 1 | yes | `{"online":true}` on connect, `{"online":false}` via Last-Will |

### Why frames are not telemetry
The control-plane persists **every** `telemetry` message to Postgres. A camera at
10fps would write 36,000 rows an hour, each holding a whole picture — the table
would be unusable within a day and the disk gone within a week. `cv/<id>/frame`
is therefore a separate topic that the API **never persists**: it is decoded
straight onto the WebSocket fan-out and dropped. It is also the only topic with a
non-JSON payload — the bytes are the JPEG exactly as the camera sensor produced
them, with no base64 (which would cost +33% bandwidth and MCU RAM for nothing).

Frames are **not retained**. A retained frame would hand the last picture the
camera took to anything that subscribes later, which is a privacy leak, and a
stale frame has no value anyway.

## Payloads

### status (retained + Last-Will)
```json
{ "online": true, "fw": "1.2.0" }
```
Set the MQTT Last-Will to `cv/<id>/status` = `{"online":false}` (retained) so the
platform detects hard disconnects.

### state (retained) — full current state, device-type specific
Home Hub (4 relays + scene):
```json
{ "relays": [true, false, false, true], "scene": "home", "rssi": -58 }
```
AquaGuard (water tank):
```json
{ "level": 72, "pump": true, "mode": "auto", "startPct": 30, "stopPct": 90, "dryRun": false }
```
Smart Plug:
```json
{ "on": true, "power_w": 42.6, "energy_kwh": 3.11 }
```
Camera (ESP32-CAM):
```json
{
  "hasCamera": true, "ready": true, "psram": true,
  "streaming": false, "fps": 8, "resolution": "VGA", "quality": 12,
  "rotation": 0, "flash": 0,
  "motion": true, "sensitivity": 45, "motionActive": false,
  "motionCount": 12, "snapshots": 3, "frames": 4821, "dropped": 2
}
```
`hasCamera: true` is how both apps discover that a device has a video source,
independently of its type string.

### telemetry — append-only readings
```json
{ "power_w": 42.6, "voltage": 232, "level": 71 }
```
Cameras emit **events**, not images, on this topic — the picture goes to
`cv/<id>/frame`:
```json
{ "type": "motion",   "source": "image", "ts": 1712345678 }
{ "type": "snapshot", "bytes": 18422, "w": 640, "h": 480, "ts": 1712345678 }
```

### cmd — commands (device applies, then republishes `state`)
All commands use `"action":"set"` with device-specific fields alongside it. The
control-plane publishes these to `cv/<id>/cmd`; the app calls
`POST /devices/<id>/command` with the same JSON body.

Home Hub:
```json
{ "action": "set", "ch": 2, "on": true }
{ "action": "set", "relays": [true, false, false, true] }
{ "action": "set", "scene": "night" }
```
AquaGuard (water tank):
```json
{ "action": "set", "pump": true }
{ "action": "set", "auto": true }
{ "action": "set", "startPct": 30, "stopPct": 90 }
```
Smart Plug / Smart Switch:
```json
{ "action": "set", "power": true }
{ "action": "set", "power": true, "power2": false }
```
Guardian (safety) / Motion sensor / Agri starter:
```json
{ "action": "set", "armed": true }
{ "action": "set", "sos": false }
{ "action": "set", "pump": true }
```
Camera — unlike other devices these are not all `"set"`, because starting a
stream is an ongoing lease rather than a stored setting:
```json
{ "action": "stream",   "on": true, "fps": 8 }
{ "action": "snapshot" }
{ "action": "flash",    "level": 60 }
{ "action": "reboot" }
{ "action": "set", "resolution": "VGA", "quality": 12, "rotation": 180,
                   "motion": true, "sensitivity": 45, "fps": 8 }
```
`resolution` ∈ `QQVGA | QVGA | CIF | VGA | SVGA | XGA | SXGA | UXGA` (clamped to
`VGA` on boards without PSRAM). `quality` is the JPEG quantiser, 4 (best) – 63
(worst). `fps` is clamped to 1–15.

**A stream is a lease, not a switch.** The camera stops on its own ~20s after the
last `{"action":"stream","on":true}`, so a viewer that closes its laptop lid
cannot leave the board streaming — and cooking — indefinitely. Clients re-arm
every few seconds while the live view is open.

## Latency model
- App → API (`POST /devices/:id/command`) → broker → device: typically **<1s**.
- Device → broker → API → app WebSocket (`/ws`): typically **<1s**.
- No polling anywhere in the hot path.

## App real-time channel
Connect: `wss://api.circuvent.com/ws?token=<JWT>`
Server pushes: `{ "type": "device:update", "deviceId", "kind": "state|telemetry|status", "payload", "at" }`
The app sends commands via REST (`POST /devices/:id/command`) — reliable + logged.

### Live video over the same socket
Frames are **opt-in**. An app that is not showing a camera receives none, which
is what keeps an idle phone off the video path entirely.

```json
→ { "type": "watch",   "deviceId": "cam-a1b2c3" }
→ { "type": "unwatch", "deviceId": "cam-a1b2c3" }
← { "type": "device:frame", "deviceId": "cam-a1b2c3",
    "jpeg": "<base64 JPEG>", "bytes": 18422, "at": "2025-04-05T18:14:38.901Z" }
```
Rules the server enforces, so a client cannot talk itself into more video than it
is entitled to:
- A `watch` for a device the socket does not own is **silently ignored** —
  ownership is re-checked on every single frame, not just at watch time, so
  unclaiming a camera cuts the feed immediately.
- At most **8** cameras watched per socket.
- Frames are dropped (not queued) when the socket's send buffer exceeds 1MB. A
  slow viewer falls behind by losing frames rather than by playing further and
  further into the past.
- Frames larger than 512KB, and any device exceeding 30fps, are dropped at the
  broker edge.

`jpeg` is base64 only on this hop: browsers and React Native need a data URL, and
the socket is already JSON. The device-to-broker hop stays raw binary.
