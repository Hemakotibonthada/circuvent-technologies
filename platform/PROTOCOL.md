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
| `cv/<id>/status` | device (LWT) | 1 | yes | `{"online":true}` on connect, `{"online":false}` via Last-Will |

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

### telemetry — append-only readings
```json
{ "power_w": 42.6, "voltage": 232, "level": 71 }
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

## Latency model
- App → API (`POST /devices/:id/command`) → broker → device: typically **<1s**.
- Device → broker → API → app WebSocket (`/ws`): typically **<1s**.
- No polling anywhere in the hot path.

## App real-time channel
Connect: `wss://api.circuvent.com/ws?token=<JWT>`
Server pushes: `{ "type": "device:update", "deviceId", "kind": "state|telemetry|status", "payload", "at" }`
The app sends commands via REST (`POST /devices/:id/command`) — reliable + logged.
