# Circuvent Smart-Home Zones

The Circuvent home ecosystem is organised into **five zones**. Every zone runs on
the **existing Circuvent protocol** — devices speak MQTT over TLS to our own
broker on the topics `cv/<id>/cmd | state | telemetry | status` (see
`../platform/PROTOCOL.md`). This means the broker↔Postgres bridge, the web
`/console`, and the mobile app pick these devices up **with no protocol changes**;
"zone" is metadata (a room/group tag) layered on top, not a new topic tree.

| Zone | Purpose | Device type(s) (firmware folder) |
| --- | --- | --- |
| 1 · Gate & Vehicle Access | Driveway UHF-RFID barrier | `rfid-gate/` |
| 2 · Main Entry Door | Face/fingerprint/keypad lock + bell | `facedoor/` |
| 3 · Living Room & Environment | Touch switchboards + metering, PIR, AQI, climate | `touchboard/`, `motion-sensor/`, `energy-monitor/`, `smart-fan/`, `smart-light/`, `curtain/` |
| 4 · Bathroom | Occupancy light + exhaust timer | `motion-sensor/` (occupancy profile) |
| 5 · Water Management | Sump + overhead tank auto-fill | `watertank/` (also legacy `aquaguard/` single-tank) |

Commands are the standard envelope: `{"action":"set", ...}` published to
`cv/<id>/cmd`. Discrete happenings (tag reads, door access, bell) are pushed to
`cv/<id>/telemetry` with a `type` field **and** mirrored into retained `state`
fields (counters) so late subscribers still see the latest event.

---

## Zone 1 — `rfid-gate`

**State** (`cv/<id>/state`, retained): `barrier` ("open"|"closed"), `mode`
("auto"|"manual"), `vehiclePresent` (bool), `lastTag` (long), `lastAllowed`
(bool), `scanCount` (long, increments per scan), `tagCount` (int).

**Event** (`telemetry`): `{ "type":"rfid", "tag":<long>, "allowed":<bool>, "ts":<s> }`.

**Commands**: `{"action":"open"}` · `{"action":"close"}` ·
`{"action":"grantOpen"}` (hub already validated a guest QR/PIN) ·
`{"action":"set","addTag":<n>}` / `"removeTag":<n>` / `"autoCloseSec":<n>` /
`"mode":"auto"|"manual"}`.

Wiegand-26 D0/D1 are decoded via GPIO interrupts; the low 24 bits are the tag id.

## Zone 2 — `facedoor`

**State**: `locked` (bool), `lastMethod` ("face"|"fingerprint"|"keypad"|"app"),
`lastName` (string), `accessCount` (long), `bellCount` (long), `autoLockSec` (int).

**Events** (`telemetry`):
`{ "type":"access", "method":..., "name":..., "ok":<bool>, "ts":<s> }` and
`{ "type":"bell", "ts":<s> }`.

**Commands**: `{"action":"unlock","method":"face","name":"Hema"}` (the hub's AI
node sends this on a face match) · `{"action":"lock"}` ·
`{"action":"set","locked":<bool>,"autoLockSec":<n>,"pin":"1234"}`.

Fingerprint module speaks over Serial2 (`MATCH:<id>` / `NOMATCH`). Face
recognition runs on the hub (Frigate/OpenCV) — the door only actuates the lock
and emits events, keeping biometrics off the microcontroller.

**Welcome trigger:** an `owner_access` event (method=face/fingerprint with a
known name) is what the hub's Room Automation Engine keys on to run the greeting
+ lights + AC sequence.

## Zone 3 — `touchboard`

**State**: `g1`,`g2`,`g3` (bool relays), `backlight` (0–100), `watts`,`volts`,
`amps`,`pf`,`kwh` (floats, HLW8012 metering).

**Commands**: `{"action":"set","g1":<b>,"g2":<b>,"g3":<b>,"all":<b>,"backlight":<0-100>}`.

Capacitive pads use the ESP32 built-in `touchRead`; a tap flips the relay and
pushes state within ~1 s (`publishStateNow`).

## Zone 4 — Bathroom (`motion-sensor` occupancy profile)

Reuses the PIR `motion-sensor` firmware with an occupancy-timeout + humidity
rule enforced by the hub: light ON while occupied, exhaust fan runs on a timer
after the room clears or while humidity is high.

## Zone 5 — `watertank`

**State**: `ohPct`,`sumpPct` (0–100), `ohLitres`,`sumpLitres` (int), `pump`
(bool), `auto` (bool), `dryRun` (bool), `overflow` (bool), `amps` (float),
`ohFault`,`sumpFault` (bool), `startPct`,`stopPct`,`sumpMinPct` (int).

**Commands**: `{"action":"set","pump":<b>,"auto":<b>,"startPct":<n>,"stopPct":<n>,
"sumpMinPct":<n>,"ohCapacityL":<f>,"sumpCapacityL":<f>,"ohEmptyCm":<f>,"ohFullCm":<f>,
"sumpEmptyCm":<f>,"sumpFullCm":<f>}` · `{"action":"resetDryRun"}` ·
`{"action":"pump"}` / `{"action":"stop"}`.

**Auto-fill:** pump ON when `ohPct <= startPct` **and** `sumpPct > sumpMinPct`;
OFF at `ohPct >= stopPct` or when the sump is exhausted. **Dry-run trip:** if the
pump draws current (ACS712) yet `ohPct` does not rise ≥2% within 60 s, the motor
is cut and `dryRun` latches until `resetDryRun`. Overflow float, max-runtime and
restart cool-down back it up. Both tanks report litres for the 3D fluid
visualizers on web + mobile.

---

## Cross-zone automation (hub)

The local hub's Room Automation Engine subscribes to the event/telemetry topics
and runs sub-50 ms local rules, e.g.:

```
facedoor owner_access(name) ->
    tts "Welcome home, {name}"
    touchboard/livingroom set all lights ON (PIR-gated)
    ac set power ON, target = owner's saved temperature
    if indoorAQI > threshold -> airpurifier ON
```

Rules live in the platform hub (`../platform/`); adding a rule never requires a
firmware change — it is pure topic wiring.
