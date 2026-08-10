# 20 — ANPR: reading vehicle number plates

The `anpr-cam` device type, the capture protocol, the recognition pipeline and
the allow / deny / watch list.

This document is written from the code. Where behaviour is described, it was
read out of the file it names.

---

## 1. The division of labour, and why it is where it is

```
 ESP32-S3 camera            control plane (the VM)              apps
 ───────────────            ──────────────────────              ────
 watches one lane
 detects a vehicle
 takes 3 sharp frames
        │
        └── cv/<id>/anpr ──▶ collect the burst
                             recognise each frame
                             vote across frames        ──┐
                             apply the allow list        │
                             store the read              │
                             ├── cv/<id>/cmd  (echo) ────┘
                             ├── /ws  device:update
                             ├── webhook  plate.read
                             └── automations, push, events
```

**The device does not read plates, and this is not a limitation waiting to be
lifted.** Plate localisation plus character recognition is a two-stage neural
pipeline; the smallest useful models want tens of MB of weights and hundreds of
MFLOPs a frame. An ESP32-S3 has 8 MB of PSRAM shared with the frame buffer and
no NPU. Anything on the device claiming to do it would be a template matcher
that works on the plate it was tuned against and silently misreads every other
one — and a misread plate opens a gate for the wrong car.

**The device is not a dumb streamer either.** A continuous 10 fps SVGA stream is
~250 kB/s per camera, forever, and every frame would have to be run through a
detector. A gate sees a vehicle a few dozen times a day. Sending ~3 frames per
arrival means the recogniser runs on the order of a hundred times a day rather
than a million — the difference between the VM in
[12 — VM runbook](./12-vm-runbook.md) coping and not.

So the device does the one thing only it can: it is the only component that
knows what the lane looks like right now, so it decides what is worth sending.

---

## 2. The firmware — `firmware/anpr-cam/`

### Boards

| Env | Board | Notes |
| --- | --- | --- |
| `anpr-cam` | Freenove ESP32-S3 WROOM CAM | **Primary.** Native USB, 8 MB PSRAM, enough spare GPIO that the loop input, illuminator and relay do not fight the camera bus |
| `anpr-cam-xiao` | Seeed XIAO ESP32S3 Sense | Discreet installs; few exposed pads |
| `anpr-cam-aithinker` | AI-Thinker ESP32-CAM | **Fallback.** Works, with real limits — see below |

```bash
cd firmware/anpr-cam
pio run -e anpr-cam -t upload
```

The AI-Thinker fallback is honest about what it is: 4 MB PSRAM caps sustained
capture at SVGA, the OV2640 is noisier after dark, and it needs an FTDI adapter
to flash. Expect it to read plates on a stopping vehicle at 3–4 m in daylight,
and to need the IR illuminator and a slower approach at night.

**Its reset button is disabled** (`CV_RESET_BTN=-1`). The pin the other profiles
use, GPIO 0, is this board's camera XCLK — the fault described in
[15 — Troubleshooting](./15-troubleshooting.md), where `esp_camera_init()`
returns OK and the device reports a healthy sensor while sending nothing. The
`CV_PIN_CLASH` guard in `anpr-cam.ino` fails the build rather than trusting
anyone to remember.

### The trigger state machine

```
IDLE ──motion inside the ROI, or the loop input closes──▶ SETTLE
SETTLE ──settleMs──▶ BURST ──burst × burstGapMs──▶ COOLDOWN ──cooldownMs──▶ IDLE
```

**The region of interest is the point of a dedicated device type.** A road
camera sees trees, sky, a footpath and next door's gate; a whole-frame motion
detector fires on all of them all day. Motion is counted only inside a
configurable rectangle, expressed in percent so it survives a resolution change.

A **loop detector or IR beam** on `LOOP_GPIO_NUM` is strictly better than image
motion where it is fitted — it cannot be fooled by a shadow, a headlight sweep
or rain. It is active-low, which is also the safe failure direction: a cut cable
reads open and stops triggering rather than holding the lane permanently busy.
Image motion is consulted only while the loop reads clear, so a fitted loop does
not double-trigger.

### Sensor tuning, and why it is not the default

`initCamera()` sets `ae_level(-1)` and `gainceiling(8X)`. A plate is a small,
high-contrast, **retro-reflective** target in a scene that is usually much
darker than it is. Default auto-exposure meters the whole frame, so at night it
exposes for the dark surroundings and the plate — lit by the car's own
headlights and bouncing them straight back — clips to white. Metering down keeps
the plate inside the sensor's range at the cost of a background nobody reads.

### State keys

```json
{
  "hasCamera": true, "ready": true, "psram": true, "board": "esp32s3-wroom-cam",
  "armed": true, "phase": "idle", "streaming": false,
  "resolution": "SVGA", "quality": 10, "rotation": 0, "illum": 0,
  "sensitivity": 55, "burst": 3, "burstGapMs": 220,
  "settleMs": 350, "cooldownMs": 6000,
  "roiX": 0, "roiY": 25, "roiW": 100, "roiH": 65,
  "hasLoop": true, "hasRelay": true, "direction": "both",
  "vehiclePresent": false, "motionActive": false,
  "captures": 41, "published": 123, "dropped": 0, "reads": 38,
  "lastPlate": "KA01AB1234", "lastConfidence": 88,
  "lastDecision": "allow", "lastPlateAt": 1712345678
}
```

`phase` ∈ `idle | settle | burst | cooldown`.
`direction` ∈ `in | out | both` — see [§6 Vehicles](#6-vehicles-in-out-and-dwell-time).

### Commands

```json
{ "action": "set", "armed": true, "sensitivity": 55, "burst": 3,
                   "settleMs": 350, "cooldownMs": 6000,
                   "resolution": "SVGA", "quality": 10, "rotation": 180,
                   "illum": 40, "roi": { "x": 10, "y": 30, "w": 80, "h": 50 } }
{ "action": "capture" }                       // burst now, ignoring the cooldown
{ "action": "stream", "on": true, "fps": 8 }  // aiming only — see below
{ "action": "illuminate", "level": 60 }
{ "action": "open" }                          // pulse the barrier relay
{ "action": "result", "plate": "…", "confidence": 88,
                      "decision": "allow", "open": true }
{ "action": "reboot" }
```

**The ROI is set as a group.** Accepting one edge at a time would let a
half-applied rectangle (new x with the old width) exist between two messages,
and that rectangle is what motion is judged against.

**Live view is an aiming tool, not a feed.** The firmware drops to a lighter
resolution while streaming and expires the lease after 20 s, exactly like
`firmware/camera`. It is deliberately excluded from the camera wall in both apps
(`isCameraDevice` in `mobile/src/cameras.ts` returns false for `anpr-cam`)
because watching it would degrade capture for as long as anyone had the wall
open.

**`{"action":"result"}` is display state.** Nothing in the firmware decides
anything from it. The single action it may take is pulsing the relay, and only
when the control plane has already decided `allow` *and* explicitly asked. The
decision is made where the allow-list lives; a plate string on the wire never
authorises anything by itself.

---

## 3. The wire format — `cv/<id>/anpr`

Binary, QoS 0, **never retained**, **never persisted as telemetry** — the same
rules as `frame`, for the same reasons ([04 — MQTT protocol](./04-mqtt-protocol.md)).

It is a **separate topic from `frame`**, and that is load-bearing: a frame is
dropped unless a client is actively watching, whereas a capture must be
processed precisely when nobody is watching. Reusing `frame` would mean plates
were only ever read while an operator happened to have the live view open.

Each payload is a 16-byte header followed by the JPEG:

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 4 | magic `CVAN` |
| 4 | 1 | format version (1) |
| 5 | 1 | `seq` — index within the burst |
| 6 | 1 | `burst` — frames in this burst |
| 7 | 1 | `reason` — 0 motion, 1 loop, 2 manual, 3 periodic |
| 8 | 4 | `capture` (uint32 LE) — groups a burst |
| 12 | 2 | `width` (uint16 LE) |
| 14 | 2 | `height` (uint16 LE) |

Mirrored by `AnprHeader` in the firmware (which carries a `static_assert` on its
size) and parsed by `platform/api/src/anpr/protocol.ts`.

A **bare JPEG with no header is accepted** as a single-frame manual capture.
That lets a test fixture or `mosquitto_pub -f plate.jpg` feed the pipeline, and
means a future header version this build does not understand degrades to "we
still got a picture" rather than to silence.

The device also publishes a telemetry event the moment a vehicle is detected,
*before* the images:

```json
{ "type": "vehicle", "capture": 41, "reason": "loop", "ts": 1712345678 }
```

so the timeline shows an arrival even when every frame turns out unreadable.
"A vehicle came and we could not read it" and "nothing happened" must not look
the same.

---

## 4. Recognition — `platform/api/src/anpr/`

| File | Responsibility |
| --- | --- |
| `protocol.ts` | The wire format. Pure. |
| `plate.ts` | **Decides what is true.** Normalisation, shape fitting, validation, burst voting. Pure — no network, no database, no clock. |
| `recognizer.ts` | The OCR boundary. Pluggable, and optional. |
| `index.ts` | Burst collection, rule evaluation, storage, announcement, retention. |
| `plate.test.ts` | The tests. A gate opens on this logic. |

> The governing principle is the one in [16 — AI assistant](./16-ai-assistant.md):
> **`plate.ts` decides what is true; the recogniser only proposes.**

### Positional correction

Every OCR confuses `O` with `0`, `I` with `1`, `S` with `5`, `B` with `8`. The
naive fix — pick one direction and always apply it — is wrong in both
directions at once, because a plate contains letter slots and digit slots. An
Indian plate has a known *shape*, so the class each position must hold is known
before the character is read. `analysePlate()` fits the string to each candidate
shape, coercing per position, and the shape needing **fewest corrections** wins.

Shapes are restricted by state where the format is. Delhi's letter district
(`DL1CAA1111`, shape `AA9AAA9999`) is **DL-only** — leaving it open was a trap
rather than a feature: `MH1ZAB1Z34` fits it with one correction and the correct
`AA99AA9999` with two, so the wrong shape won and silently produced
`MH1ZAB1234`, a valid-looking plate one character from the real one. There is a
regression test.

A well-shaped string with an unregistered state code (`XX01AB1234`) is
**rejected**. Without that check a smudge that OCRs into a plausible shape
becomes a confident read, and a confident wrong read is what opens a gate for a
stranger.

### Burst voting

`voteOnBurst()` scores, in order of weight:

1. **agreement across frames** — 60 %
2. the recogniser's own confidence — 25 %
3. format cleanliness — 15 %

The recogniser is deliberately the smallest term. Providers report confidence on
incomparable scales and all of them are overconfident on a blurred plate; the
number that survived contact with reality is how many independent frames
produced the same string.

An unreadable burst returns `valid: false` rather than the least-bad guess.

### Frame selection

`pickSharpest()` sends the **largest** JPEGs. At a fixed quantiser, file size
tracks high-frequency detail: a sharp plate has edges to encode, a
motion-blurred one does not. It costs a length comparison, needs no decode, and
beats "take the first frame" — which is systematically the worst one, because
the vehicle is still moving.

### Providers

| `ANPR_PROVIDER` | Behaviour |
| --- | --- |
| `none` *(default)* | No OCR. Everything else still works — see below |
| `platerecognizer` | platerecognizer.com. Purpose-built, best accuracy |
| `openai` | Any OpenAI-compatible vision endpoint, including self-hosted |
| `http` | Your own wrapper. Accepts `{plate, confidence}` or `{results:[…]}` |

**With no recogniser configured the pipeline still runs end to end**: captures
arrive, arrivals are recorded, thumbnails are kept, the timeline fills in and
automations on `vehicle` events fire. Reads are stored as `unrecognised` with
reason `no_recogniser`, and the console says so in as many words — because the
only visible symptom otherwise is an empty column that looks exactly like broken
hardware.

The `openai` provider is meaningfully worse than a purpose-built ANPR model and
is documented that way rather than presented as equivalent: a general vision
model will cheerfully return a plausible plate for a blurred rectangle. That is
survivable *here specifically* because `plate.ts` refuses anything that is not a
real registration and requires frames to agree, so a hallucination must be
hallucinated identically two or three times before it can be believed.

---

## 5. Decisions

`decide()` in `anpr/index.ts` reads `plate_rules`.

| Rule | Effect |
| --- | --- |
| `deny` | Never admitted; security event + push. **Wins over `allow` unconditionally** |
| `allow` | Admitted automatically — but **only when the read is confident** |
| `watch` | Not blocked; the owner is notified |
| no rule | `unknown`. Logged, nothing actuated |

Two properties worth stating:

- **A read below `ANPR_MIN_CONFIDENCE` never resolves to `allow`.** It may still
  resolve to `deny` — being unsure is a reason not to open a barrier, never a
  reason to skip a block.
- **`decision` is stored on the read, not recomputed.** A rule edited next week
  must not silently rewrite what the gate did last night.

Rules are stored through the same `normalisePlate` a read goes through, so
`KA 01 AB 1234` typed by a person and `KA01AB1234` read by a camera are the same
row. Doing this anywhere other than at both ends is how an allow-list silently
stops matching — and it fails open-ended: nothing errors, the gate simply never
recognises the owner's own car. A unique index refuses to hold a plate on two
lists at once, because that is not a policy, it is an argument at a barrier.

---

## 6. Storage and retention

`plate_reads` is a table of its own rather than rows in `telemetry`, because it
is queried **by plate** (an index, not a sequential scan over JSONB), it holds
an image, and it needs its own retention.

| Variable | Default | Meaning |
| --- | --- | --- |
| `ANPR_RETENTION_DAYS` | `90` | Plate history — reads **and visits** |
| `ANPR_IMAGE_RETENTION_DAYS` | `30` | **Images, cleared first** |
| `ANPR_THUMBNAIL_MAX_KB` | `96` | Larger captures are recorded without an image |
| `ANPR_MIN_CONFIDENCE` | `70` | Below this, never `allow` |

**Images expire before the metadata, and that gap is the point.** "A vehicle
with this plate arrived at 19:42" is what an access review needs months later.
The photograph — which also contains whoever was walking past, and the inside of
the car — is only useful for the few weeks in which somebody might question a
specific read. Plate reads are personal data about people who never agreed to
anything.

**Visits are swept on the same clock as reads, explicitly.** `plate_visits` has
no foreign key to `plate_reads` — a visit deliberately outlives the two reads
that formed it, so that deleting one read cannot silently destroy a stay —
which means nothing deletes visits implicitly. They are also the *more*
sensitive half: a read is one sighting, a visit is a record of when a named
person's vehicle arrived and left. An old `open` visit is swept too, because a
visit still open past the retention window is a missed exit rather than a car
parked for three months, and leaving it would keep a vehicle counted as "on the
property" forever.

Rough disk cost: a busy gate at ~50 vehicles/day, ~90 KB a capture, base64
inflated by a third, over 30 days ≈ **200 MB**.

---

## 7. Vehicles: in, out and dwell time

A read is a *sighting*. A visit is two sightings paired across time, and that
pairing is what turns "we saw KA01AB1234 at 08:14 and again at 17:32" into
"it was here for nine hours".

### Which way was it going?

Direction is a property of the **installation**, not of a capture — the
mounting decides it, and it cannot change between two frames of one burst. So
it lives on the device as `direction`, published in state and set from the
console:

| Setting | Meaning |
| --- | --- |
| `in` | An entry lane. Every read here is an arrival. |
| `out` | An exit lane. |
| `both` | One camera covering a shared lane, the cheap single-camera install. |

A `both` lane is resolved by **alternating against the vehicle's own state**:
if the ledger says the car is currently inside, this sighting is it leaving.
That inference is only as good as the previous read, which is exactly why a
dedicated in/out pair is the better install and why the console says so. It is
still far better than refusing to guess — a shared lane is the common install,
and "unknown" on every read would make the feature useless there.

A dedicated lane always wins over the ledger: the camera *observed* the
movement, the ledger only *inferred* the state, and an observation beats an
inference.

### Missed reads are a state, not an error

Gate cameras miss. A car tailgates another through one barrier cycle; a plate
is unreadable in rain; a van leaves while the device is rebooting.

Strict entry/exit alternation is not merely incomplete here, it is **actively
corrupting**: one missed exit makes the *next* entry close a visit that never
ended, so that visit records a dwell time spanning the gap — and every pairing
after it is off by one, forever. The damage is silent and unbounded.

So `plate_visits` names the unpaired cases and resynchronises at the next clean
read:

| Status | Meaning |
| --- | --- |
| `open` | Inside now — entry read, no exit yet |
| `closed` | Both ends observed. **Only this status yields a duration** |
| `entry_missed` | Seen leaving with no recorded arrival |
| `exit_missed` | Arrived again before the previous departure was read |

Two rules follow from that, and both matter more than they look:

- **A missed read never produces a duration**, not even zero. Zero reads as a
  real measurement, and dwell figures are exactly what somebody later bills or
  audits against.
- **A missing exit is never back-filled** with the next arrival. Inventing a
  departure timestamp would produce a stay that looks authoritative and is
  fabricated.

The console shows the count of affected visits and explains why, because an
unexplained gap in the history gets read as the system being wrong about
everything else too.

### Concurrency

`applyRead` runs in a transaction with the open visit locked `FOR UPDATE`. Two
frames of one burst can produce two reads, and two cameras can see one vehicle
within a second; without the lock both would find "no open visit", open two,
and leave a phantom that never closes and a vehicle permanently "inside".

### Aggregates are derived, never counted

`listVehicles` aggregates from `plate_reads` and `plate_visits` rather than
maintaining a `vehicles` counter table. A counter would have to be written on
every read and corrected on every retention sweep, and the first divergence
would be invisible — a vehicle showing 40 passes with 38 reads behind it, and
no way to tell which is right. Deriving costs a little more per query and
cannot drift.

### Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/anpr/vehicles?days=&limit=` | Every distinct vehicle: passes, entries, exits, first/last seen, `inside`, average stay |
| GET | `/anpr/vehicles/:plate` | One vehicle: summary, visit history with in/out times and durations, every capture, and its list entry |

The plate in the path is normalised, so a URL pasted from a report with spaces
or dashes resolves to the same vehicle the camera recorded. A plate with no
sightings returns **404** rather than an empty profile — "came zero times"
looks like a working answer to a typo.

### In the console

**Security → Vehicles** has three views: the **plate log** (the stream, with an
in/out tag per read), the **vehicle register** (distinct plates, pass counts,
who is on the property right now), and the **allow & block lists**. A plate in
the log links straight to its profile.

---

## 8. Reaching it from outside

### Automations

The plate event is `{ "type": "plate", … }` on the telemetry channel, so it
matches the **existing** `event` trigger with no new trigger kind:

```json
{ "type": "event", "deviceId": "anpr-cam-a1b2c3",
  "eventType": "plate", "match": { "plate": "KA01AB1234" } }
```

### Webhooks

`plate.read` is its own event, **not** also delivered as `device.telemetry`. An
integration that wants plate reads should not have to subscribe to every power
reading in the fleet to find them. Nothing regressed: no plate events existed
before the event did.

### Developer API

Scopes are `plates:read` and `plates:write` — deliberately **not** folded into
`telemetry:read`. A telemetry key reads power and water level; a plate log is a
record of which vehicles came to a property and when, about people who are not
the account holder.

| Method | Path |
| --- | --- |
| GET | `/v1/plates` |
| GET | `/v1/plates/{id}/image` |
| GET | `/v1/vehicles` |
| GET | `/v1/vehicles/{plate}` |
| GET | `/v1/plate-rules` |
| POST | `/v1/plate-rules` |
| DELETE | `/v1/plate-rules/{id}` |

The list returns `hasImage` and an `imageUrl` rather than inlining the JPEG: a
page of 100 reads stays a few KB, and most rows are never opened.

### Console and app

- **Console** → `/smarthome/traffic` (plate log + lists), and the device panel
  under the camera itself for aiming and tuning.
- **Mobile** → the device screen. `anpr-cam` is in the `KNOWN` array in
  `mobile/src/screens/Control.tsx`; see the three silent failures in
  [07 — Adding a new device](./07-adding-a-new-device.md).

---

## 9. Installing one

1. Mount 3–5 m from where the vehicle stops, **1–1.5 m high**, angled so the
   plate is roughly square to the lens. A plate needs ~100 px across its
   characters; SVGA at 4 m is about the floor.
2. Claim it in the app, then open its panel and press **Live view (aim)**.
3. Drag the watched-lane rectangle over the road surface only — not the sky,
   not the footpath, not next door's gate.
4. Fit a loop detector or IR beam if you can. It is the single biggest
   improvement to trigger reliability.
5. Press **Capture now** with a car in front of it and check `/smarthome/traffic`.
6. Add the household's own plates to the allow list — from the log, not by
   typing them, so a transcription error cannot be baked in.

### When plates are not being read

| Symptom | Cause |
| --- | --- |
| Every read `no_recogniser` | `ANPR_PROVIDER` is unset. Not a camera fault |
| Every read `no_plate` | Too far, too dark, or the ROI misses the plate |
| `invalid_format` with a plausible string | Aimed at a bumper sticker or a dealer frame |
| Nothing at all, `captures` climbing | Frames are being dropped — check `dropped` and Wi-Fi at the gate |
| Nothing at all, `captures` at 0 | ROI misses the lane, or `armed` is false |
| `ready: false` | The sensor never started. Ribbon cable or 5 V supply |
