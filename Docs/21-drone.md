# 21 — Drone Link

The ANPR camera answers "who came through the gate". This answers "where is the
aircraft, what is it doing, and what happened on the flight that just ended".

Device type id: `drone-link`. Firmware: `firmware/drone-link/`. Control plane:
`platform/api/src/drone/`. Console: `/smarthome/drone`.

---

## 1. What this device is, and what it refuses to be

It is a **companion computer**. It rides on the airframe next to a real flight
controller — ArduPilot or PX4 — talks to it over a serial link in MAVLink v2,
and bridges that to Circuvent over Wi-Fi.

It does **not** stabilise the aircraft, and nothing in this design should ever
be changed so that it does.

Attitude stabilisation is a hard real-time loop running at 400 Hz with a state
estimator that has to stay numerically sane while the airframe is vibrating,
the magnetometer is being corrupted by motor current, and the barometer is
being disturbed by prop wash. ArduPilot and PX4 represent millions of flight
hours of exactly that problem being got wrong and then fixed. An estimator
written fresh for an ESP32 would fly acceptably on the bench on a calm day and
then drop a two-kilogram aircraft on somebody.

So the split is the one the ANPR camera already makes:

| | ANPR camera | Drone Link |
| --- | --- | --- |
| The part that must not be got wrong | reading a plate | keeping the aircraft in the air |
| Who does it | the control plane's OCR | the flight controller |
| What the ESP32 does | decides *when* a vehicle is present | decides *what* the operator wants, and reports what is happening |

The ESP32 is on the airframe because it is the only thing there that knows both
what the autopilot is saying and what the operator on the ground wants. That is
the job.

---

## 2. Why the cloud is never in the control loop

Every command this device accepts is a **whole intent** that is safe to finish
on its own: take off to an altitude, go to a coordinate, return home, land, run
a stored mission.

There is deliberately no "nudge forward while I hold this button", and there
never will be. Continuous manual control over a link with reconnect backoff,
NAT timeouts and a radio that fades behind a building is not control; it is a
way of discovering where the aircraft ends up when the last packet through was
the one that said "forward".

If the link dies mid-flight, the worst case is that a mission the operator
already authorised runs to completion, or the flight controller's own failsafe
brings the aircraft home.

```
 operator ──▶ console ──▶ control plane ──▶ cv/<id>/cmd ──▶ [drone-link]
                                                                │ MAVLink v2
                                                                ▼
                                                        flight controller
                                                         (ArduPilot / PX4)
```

**The failsafe is the flight controller's, not ours.** This device checks it is
configured before allowing an arm, and then stays out of the way. A companion
computer that enforced its own failsafe would be the single point of failure it
exists to avoid: if this board browns out, MAVLink stops arriving at the
autopilot and the autopilot acts — but only if the autopilot was set up to.

### Modes an operator may select remotely

`loiter`, `althold`, `poshold`, `guided`, `auto`, `rtl`, `smartrtl`, `land`,
`brake`.

ACRO, FLIP, STABILIZE, DRIFT and SPORT are **not** offered. They are manual
stick modes; selecting one from a web page hands an airborne aircraft to a pilot
who is not holding a transmitter. There is no safe remote meaning for them, so
they are not in the list, and `safety.ts` refuses them by name rather than by
omission.

---

## 3. The preflight gate

Arming is the one irreversible thing this system can ask for. Props spin, and
everything after that is the aircraft's problem.

The gate lives in **two places on purpose**:

| | Firmware (`preflight()`) | Control plane (`checkCommand`) |
| --- | --- | --- |
| Works with no network | ✅ | ❌ |
| Can be changed for a fleet | ❌ | ✅ |
| Knows the aircraft | ✅ | only what it last published |
| Knows the account | ❌ | ✅ |

Neither copy is redundant. A limit that lives only on the aircraft cannot be
managed; a limit that lives only on the server cannot be enforced.

Firmware refuses to arm when:

- the operator has grounded the airframe (`allowArm` false)
- no autopilot heartbeat, or the last one is over 3 s old
- GPS fix is worse than 3D
- fewer satellites than `minSats` (default 8)
- HDOP worse than `maxHdop` (default 2.00)
- the EKF reports no usable horizontal position estimate
- no home position, when `requireHome` is set
- battery below `minBatt` (default 25%)
- there is no battery telemetry at all

The refusal carries a reason, and that reason is what the console shows. A
generic "not ready" sends a pilot looking; "too few satellites" sends them to
the right place.

### Disarming in flight

Disarm cuts the motors. It is a legitimate last resort — an aircraft heading for
a crowd is better dropped where it is than allowed to arrive — and it is never
what "disarm" means when a pilot is tidying up after a landing. In every ground
station ever built those two are one tap apart.

Here they are not:

- the firmware refuses an in-flight disarm without an explicit `force` flag
- the server refuses it too, and returns a reason
- **unknown airborne state fails closed** — a device that has not published, or
  whose state is stale, is treated as flying
- the console hides it behind a second confirmation that states the altitude
- a forced disarm is recorded at `alert` severity and appears in the daily
  report

---

## 4. The wire protocol

### `cv/<id>/track` — position batches

A flight track is worth very little at 1 Hz. At 15 m/s that is fifteen metres
between samples, which turns a straight transect into a dotted line and loses a
crash entirely: the aircraft is at 40 m in one sample and on the ground in the
next, with nothing in between to say how it got there.

So position is sampled at up to 10 Hz and published in **batches**. MQTT's
per-publish overhead is comparable to the payload itself, and every publish
competes with the operator's commands on the same radio, so ten publishes a
second cost several times what one publish of ten records costs.

```
HEADER, 16 bytes
offset  size  field
0       4     magic     "CVDT"
4       1     ver       format version (1)
5       1     count     records in this batch
6       1     recBytes  size of one record
7       1     flags     bit0 in-flight, bit1 armed
8       4     bootId    uint32 LE — identifies a power cycle
12      4     seq       uint32 LE — batch counter, for gap detection

RECORD, 40 bytes, repeated `count` times
0   u32  ms since boot          20  i16  climb, cm/s
4   i32  lat, degE7             22  u16  battery, mV
8   i32  lon, degE7             24  i16  current, cA (-1 = not measured)
12  i16  alt rel home, dm       26  i8   battery %  (-1 = unknown)
14  i16  alt MSL, m             27  u8   satellites
16  u16  heading, centideg      28  u8   GPS fix quality
18  u16  ground speed, cm/s     29  u8   flight mode
30  i16  roll, centideg         35  u8   link quality %
32  i16  pitch, centideg        36  u16  HDOP, cm
34  u8   flags                  38  u16  distance from home, m
```

**`recBytes` travels on the wire, and it is the field worth defending.** Without
it, a firmware that grows the record by four bytes is read by an older parser at
the old stride: every record after the first is offset a little further, the
coordinates drift progressively into nonsense — and the result still plots as a
continuous line. A corrupt track that looks like a real one is worse than no
track. With it, an old parser steps by the size it was told and ignores the tail
it does not understand.

Mirrored by `TrackHeader` / `TrackRec` in `firmware/drone-link/drone-link.h`,
which carry `static_assert`s on their sizes.

### Why not `telemetry`

Every message on `cv/<id>/telemetry` is INSERTed into Postgres as JSONB. An
aircraft sampling at 10 Hz would write 36,000 rows an hour holding data that
belongs in `flight_track` as typed columns. Same reasoning as `frame` and
`anpr`.

### MAVLink subset

Read: `HEARTBEAT`, `SYS_STATUS`, `GPS_RAW_INT`, `ATTITUDE`,
`GLOBAL_POSITION_INT`, `VFR_HUD`, `BATTERY_STATUS`, `HOME_POSITION`,
`MISSION_CURRENT`, `MISSION_COUNT`, `EKF_STATUS_REPORT`, `COMMAND_ACK`,
`STATUSTEXT`.

Written: `HEARTBEAT`, `SET_MODE`, `COMMAND_LONG`,
`SET_POSITION_TARGET_GLOBAL_INT`.

Hand-rolled rather than generated. The generated headers add megabytes of
dialect source for fifteen messages and tie the firmware to a generator version;
the framing is stable and short enough to own outright.

Two details that are easy to get wrong and fail silently:

- **v2 truncates trailing zero bytes.** The receive buffer is zeroed before each
  payload lands in it. Without that, a truncated field silently inherits a
  plausible-looking value from the previous, unrelated message.
- **We announce as component 191, not as a GCS.** If this board announced itself
  as a ground station, its going quiet would look to ArduPilot like the
  operator's radio disappearing, and could trigger a failsafe RTL every time the
  bridge rebooted — mid-flight, for a reason nobody watching could explain.

---

## 5. What counts as a flight

A flight starts when the aircraft **arms** and ends when it **disarms**. Both
come from the autopilot rather than from anything inferred, and both are the
boundary a regulator, an insurer and a pilot already think in.

The cheaper design — store positions, cut them into flights wherever there is a
gap — was rejected. A radio dropout behind a treeline in the middle of a long
transect looks exactly like a landing followed by a take-off, so the log book
invents flights that never happened; and two real flights with a quick battery
swap produce no gap at all and get merged into one. Every derived number then
inherits the error: duration, distance, cycle count on the pack.

### Missing data is a state, not a guess

| Outcome | Meaning |
| --- | --- |
| `open` | in progress |
| `landed` | clean disarm |
| `stale` | stopped reporting and never came back |
| `aborted` | closed by an operator |

**`stale` is never folded into `landed`.** A flight that ends in silence is
precisely the one an investigator goes looking for, and a log that quietly calls
it a normal landing has hidden the only record of it.

`ended_at` for a stale flight is **the last sample actually received**, not the
moment we noticed. Writing "now" would give a lost aircraft credit for the
minutes it spent missing.

Other places the same principle applies:

- **Airborne time is `null`, not `0`,** when an aircraft armed and never left
  the ground. Zero is a claim that it flew for no time, and reads as a real
  flight in every average computed downstream.
- **Take-off time is not arm time.** They are sometimes minutes apart while a
  pilot waits for a clearance. Duty time built on the wrong one is wrong by
  exactly that gap.
- **A GPS jump over 200 m between samples is not credited to distance.** At
  10 Hz nothing this platform carries covers more than a few metres per sample,
  so a step that large is a bad fix. The position is still recorded; only the
  distance credit is withheld, because a single glitch would otherwise corrupt
  the flight's distance permanently.
- **Telemetry gaps are written down** as `flight_events` rows when the batch
  sequence skips. A track with holes looks like a track without them once it is
  drawn as a line, so the gap has to be recorded at the moment it is noticed —
  an absence is not evidence.

`STALE_AFTER_MS` is three minutes, not thirty seconds: telemetry drops behind a
building routinely and comes back, and closing on the first gap would shred one
sortie into a dozen log entries.

---

## 6. Batteries

A lithium pack is the only part of a multirotor that wears out on a schedule
anybody can act on. Motors and ESCs mostly fail suddenly or not at all; a pack
degrades predictably over a couple of hundred cycles, loses the ability to hold
voltage under load, and then sags below the point where the aircraft can stay
up — usually on the last leg home, because that is when it is emptiest.

Cycles are counted **per pack**, not per airframe. Hours against the airframe
cannot see this: the pack that has done 190 cycles and the pack that has done 6
are the same aircraft.

| Band | Threshold | What to do |
| --- | --- | --- |
| `good` | under 80% of rated | fly it |
| `ageing` | 80–100% | keep it off the long jobs |
| `retire` | at or past rated | stop flying it |

`ageing` exists because a binary good/bad flag gives an operator nothing to do
until the day it flips, which in practice means the pack flies until it fails.

A cycle is credited **only on a clean landing of a flight the pack was assigned
to**. A stale flight has an unknown ending, and inventing a cycle for it would
slowly inflate the number a retirement decision is made from.

Cycle counts are editable, because a pack bought second-hand — or flown before
this system existed — has a history the log cannot reconstruct. Refusing to let
it be set would mean the count is wrong forever and everybody learns to ignore
it.

---

## 7. The daily flight report

Sent from `info@circuvent.com` through the Postfix server in `Mail.circuvent` —
the same SMTP path OTP and the gate report use, so there is one mail transport
to keep working rather than three.

**It leads with exceptions, not totals.** The person reading it is accountable
for the aircraft, and what they are accountable for is not "how many flights".
It is: did anything go wrong, is any pack due for retirement, and can I produce
a log if I am asked for one. A report that opened with "7 flights, 2.3 hours"
and buried a failsafe three sections down would be read for a week and skimmed
forever after.

Configured under **Drone → Safety**. The address is per account and defaults to
nobody: the person who should read a flight report is often not the account
holder — a chief pilot, an operations inbox.

Idempotency rides `scheduler_ticks`, keyed `drone-report:<owner>:<IST date>`.
That makes it exactly-once across replicas *and* restarts. The key is namespaced
separately from the gate report's `report:` prefix — an account running both a
gate and a drone fleet must get both emails, and a shared key would silently
deliver whichever swept first.

---

## 8. Voice assistants

`drone-link` is deliberately absent from `onOff()` in
`platform/api/src/routes/smarthome.ts`, and returns `"sensor"` from `kindOf` in
`mobile/src/siri-sync.ts`.

Its only boolean is `allowArm` — an aircraft's permission to fly. There is no
phrasing of "turn on the drone" a voice assistant should be able to act on, and
no phrasing of "turn it off" that should be able to ground an aircraft a pilot
is walking out to fly. Voice can be told where the drone is; it can do nothing
to it.

It is also absent from `masterPower`, so a room or group "all off" cannot touch
an aircraft, and `allowArm` is in `NON_LOAD_FIELDS` so the schedule builder does
not offer it as a switch — "turn on at 07:00" against an aircraft reads as a
scheduled take-off, and somebody would build it.

The device tile in both apps shows status and the grounding switch only. Flight
controls live at `/smarthome/drone`, where the preflight verdict, the envelope
and the refusal reasons are on screen with them. A flight command two rows below
a bedroom lamp is a flight command somebody sends with their thumb while
walking.

---

## 9. Compliance

The report carries an **operator identification** field (`operator_id`), free
text because the format differs per country — UAOP in India, an operator ID
under EASA, a Part 107 certificate number in the US.

The default altitude ceiling is **120 m**, which is the legal limit in
uncontrolled airspace under DGCA, EASA and FAA Part 107 alike. The console warns
when it is raised above that.

The flight log exports as CSV from the API — not assembled in the browser — so
the file a pilot attaches to an insurance claim or a regulator's request is
byte-for-byte the one support would generate.

**What this does not do:** it is not a Remote ID broadcast module, and does not
claim to be. Remote ID in most jurisdictions requires a broadcast over
Bluetooth or Wi-Fi Beacon in a specified format directly from the aircraft, with
its own conformance testing. This device reports to your account over the
internet, which is a different thing and does not satisfy that requirement.

---

## 10. Hardware

| | |
| --- | --- |
| Board | ESP32-WROOM-32 (default), ESP32-S3, or ESP32-C3 |
| Link to autopilot | UART1, 3.3 V TTL, 57600 baud default |
| Power | 5 V from a BEC — **not** the receiver's rail |
| Flash used | ~53% of a 1.9 MB OTA slot |

UART0 stays on USB so the bridge can be debugged while it is bridging.

```
FC TELEM TX  ──▶  MAV_RX_PIN
FC TELEM RX  ◀──  MAV_TX_PIN
FC 5V        ──▶  5V
FC GND       ───  GND
```

Do not share a regulator with the RC receiver. A brownout here is harmless; a
brownout on the RC link is not, and sharing a rail couples them.

A compile-time `CV_PIN_CLASH` guard fails the build if the status LED or reset
button collides with the MAVLink UART. That collision does not fail at build
time or at boot on its own — it fails as intermittent corruption on the
telemetry link, in the air, and gets diagnosed as a bad radio.

### Building

```bash
cd firmware/drone-link
pio run                       # ESP32-WROOM-32
pio run -e drone-link-s3      # ESP32-S3
pio run -e drone-link-c3      # ESP32-C3
```

`lib_ignore = drone-link` in `platformio.ini` is load-bearing: `lib_extra_dirs =
..` makes every folder under `firmware/` a candidate library, so the moment this
project gained a header of its own, PlatformIO started compiling the sketch as a
library — outside the src build, with no access to `lib_deps`, failing on
`ArduinoJson.h` with no hint as to why.

---

## 11. API

All routes require auth and are scoped to the caller's own devices.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/drone/live` | every aircraft, live state, warnings, limits |
| POST | `/drone/:id/command` | relay one command — 409 with a reason if refused |
| GET | `/drone/flights` | the log book |
| GET | `/drone/flights/:id` | one flight plus its events |
| GET | `/drone/flights/:id/track` | thinned position track |
| GET | `/drone/flights.csv` | log book export |
| PATCH | `/drone/flights/:id` | notes, battery assignment |
| GET/POST/DELETE | `/drone/missions` | stored waypoint routes |
| GET/POST/PATCH/DELETE | `/drone/batteries` | the pack register |
| GET/PUT | `/drone/settings` | envelope, alerts, report |
| POST | `/drone/report/test` | send today's report now |
| GET | `/drone/events` | recent flight events |

`flightTrack` **thins** rather than truncates. A twenty-minute flight at 10 Hz
is 12,000 points; a map cannot draw that and a phone should not download it.
Truncating to the first N would draw the beginning of the flight and silently
omit the end — which is the half that matters after an incident — so it samples
evenly across the whole flight instead.

---

## 12. Testing

```bash
cd platform/api && npm test        # includes drone/*.test.ts
cd firmware/drone-link && pio run
```

- `track.test.ts` — every field's scaling, forward compatibility via `recBytes`,
  truncated batches, null island, unmeasured current vs zero current
- `safety.test.ts` — every refusal, especially in-flight disarm and the
  fail-closed behaviour on unknown state
- `flights.test.ts` — duration vs airborne time, null-not-zero, stale never
  called landed, and the report body

## What is not proven

- **No aircraft has flown this.** The MAVLink offsets are from the specification
  and the parser is unit-tested against synthetic frames, but nothing here has
  been read back from a real ArduPilot.
- The daily report has never been sent through a live SMTP server.
- Flash and RAM figures are from `pio run`; power draw is not measured.
