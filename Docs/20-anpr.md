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

## 2a. ANPR on a camera that is not an ANPR camera

Everything above describes `anpr-cam`. Most accounts do not own one — they own a
`camera`, already mounted, already looking at the gate. A **lane** is what lets
that camera read plates, and it needs no firmware change at all.

The ordinary camera cannot decide when a vehicle is worth photographing, and it
has no notion of a lane, a burst or a capture id. But `firmware/camera` has
shipped two primitives since long before ANPR existed:

- it detects motion by frame differencing and publishes
  `{"type":"motion","source":"image"|"pir"}` on telemetry, and
- it answers `{"action":"snapshot"}` by publishing one still on `cv/<id>/frame`.

So the missing part is not hardware. It is the *decision of when*, the grouping
of frames into a burst, and the lane direction — all of which move into the
control plane. `platform/api/src/anpr/lane.ts` is the `anpr-cam` trigger state
machine, running on the server, driving a camera by command:

```
 telemetry {type:"motion"} ──▶ [cooldown] ──▶ N x {"action":"snapshot"}
                                                       │
 cv/<id>/frame ──▶ bus device:frame ──▶ [collect] ──────┘
                                             │
                                             ▼
                                    ingestFrame() — the same pipeline
```

**Nothing downstream knows the difference.** The read, the vote, the allow list,
the visit, the occupancy count, the automation, the webhook and the daily report
are the code paths §4 onwards describes. That is the point of entering at
`ingestFrame` rather than writing a second pipeline: a plate read from a camera
and a plate read from an ANPR camera must be the same kind of thing, or every
consumer needs to know which sort of hardware produced it.

### The frame tap

`handleFrame` in `mqtt.ts` drops every frame unless somebody is watching, which
is right for live video and exactly wrong here — a gate camera does its work
when nobody has the console open. `frameTaps` is a second set, held only for the
~2 s a burst takes, that `handleFrame` also consults.

It is deliberately **not** `watchedDevices`: that set is refcounted by `ws.ts`
against real sockets, and a lane writing into it would corrupt the count and
leave a camera streaming after the last viewer left.

### What is honestly worse about it

Stated here, and in the console where somebody is choosing, rather than
discovered at a barrier at night:

| | `anpr-cam` | camera lane |
| --- | --- | --- |
| Trigger latency | firmware, microseconds after the motion | a broker round trip plus the camera's own `MOTION_COOLDOWN_MS` |
| Region of interest | configurable rectangle; trees and footpaths excluded | whole frame — a swaying branch starts a burst |
| Exposure | `ae_level(-1)`, metered for a retro-reflective plate | metered for the whole scene, so a plate can clip to white under headlights |
| Frame selection | the camera picks sharp frames | the server picks the largest of what came back |

A vehicle that **stops** at a barrier reads well on a lane. One driving through
at speed is what the dedicated camera is for.

### Settings

`anpr_lanes`, one row per camera. Every bound is enforced server-side in
`LIMITS` because each is something a slider could otherwise be dragged to a
value that costs money or breaks the camera.

| Column | Default | Meaning |
| --- | --- | --- |
| `direction` | `both` | Same meaning as the `anpr-cam` state key — see §7 |
| `burst` | `3` | Frames per trigger, 1–8 |
| `burst_gap_ms` | `400` | 150–3000. Below ~150 ms the sensor is still reading out |
| `cooldown_ms` | `8000` | Minimum gap between **motion** triggers |
| `illuminate` | `0` | Flash level pulsed for the burst, then turned off |

**The cooldown never applies to a manual capture.** "Capture now" that silently
does nothing for eight seconds is a control that appears broken, and whoever
pressed it is usually standing at the barrier looking at the vehicle the camera
just missed.

**The illuminator is pulsed, never left on.** Held on continuously it is a
nuisance pointed at a window and the fastest way to cook an ESP32-CAM, so it is
turned off on every exit path — including the one where no frame came back.

**Enrolling a camera also turns its motion detection on.** A lane on a camera
that is not detecting motion is a switch that silently never fires.

**A camera that changes hands stops being a lane.** The row would go with the
device on a delete, but a *transfer* keeps the row and changes
`devices.owner_id`; a lane still holding the previous owner's id would file the
new owner's plate reads into the old owner's log.

### Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/anpr/lanes` | Every lane, plus the account's cameras and whether each is eligible |
| PUT | `/anpr/lanes/:deviceId` | Enrol a camera, or change its lane |
| DELETE | `/anpr/lanes/:deviceId` | Stop driving it |
| POST | `/anpr/devices/:id/capture` | Burst now — one route for both kinds of camera |

`PUT` refuses anything that is not a plain `camera`. An `anpr-cam` driven this
way would answer snapshots on the frame topic *as well as* publishing its own
bursts, so one vehicle would be read twice and paired into two visits.

In the console: **Security → Vehicles → Cameras**.

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
| `ANPR_THUMBNAIL_MAX_KB` | `96` | Larger captures are recorded without an image — **only when there is no bucket** |
| `ANPR_IMAGE_MAX_KB` | `1024` | The same ceiling when captures go to a bucket |
| `ANPR_MIN_CONFIDENCE` | `70` | Below this, never `allow` |

### Where the image lives

Two backends, one URL. `GET /anpr/reads/:id/image` serves either, so a bucket
can be switched on for an existing deployment without a migration and without
breaking a single historical read.

**In the row (`plate_reads.thumb`, base64).** The original, and still the
fallback. It is why `ANPR_THUMBNAIL_MAX_KB` is only 96 KB: base64 inflates a
JPEG by a third, TOAST compresses it badly because it is already compressed, and
every `pg_dump` and every replica carries every photograph of every car that
ever came to the gate. The cap is paid for in evidence — a capture over it was
recorded with **no image at all**, which is exactly the read somebody later
disputes.

**In a bucket (`plate_reads.image_key`).** S3 or Cloudflare R2, signed by hand
in `storage/objects.ts` — the same SigV4 routine `scripts/upload-firmware-to-r2.cjs`
has run in production, typed and shared, rather than 15 MB of `@aws-sdk` across
40 packages to issue three request shapes on a 1 vCPU VM. Configuring a bucket
removes the reason for the small ceiling, so `ANPR_IMAGE_MAX_KB` takes over at
1 MB — comfortably more than the largest frame an OV2640 can produce.

**The bucket must be private, and there is no setting that publishes it.** This
is deliberately *not* the `circuvent-firmware` bucket: that one is public
because an ESP32 doing an OTA check cannot sign a request. This one holds
photographs of vehicles, and of whoever happened to be walking past.
`S3_PRESIGN_GET` will redirect to a five-minute presigned URL to move the bytes
off the VM's uplink, and it is **off by default** — a presigned URL, however
short-lived, is a fetchable link that then exists in browser history and in any
referrer that leaks.

**A failed upload falls back to the row.** An expired key, a bucket at its
quota, a partition between the VM and Cloudflare — none of those should cost the
arrival. Losing the photograph of one vehicle is a bad day; losing the vehicle
because its picture would not upload is a gate that stopped working.

**Retention deletes the object first, then forgets the key.** The other
order — clear the column, then delete — loses the key on any failure and orphans
the object forever, because the row was the only thing that knew its name. This
way a bucket refusing deletes today costs nothing: the rows keep their keys and
the next sweep retries them. The sweep is batched, and stops early when a whole
batch fails rather than turning a wrong credential into ten thousand requests.

Rough disk cost with no bucket: a busy gate at ~50 vehicles/day, ~90 KB a
capture, base64 inflated by a third, over 30 days ≈ **200 MB** in Postgres.

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

## 8. Site policy: occupancy, capacity and overstays

The layer above a single vehicle. `visits.ts` answers "when did this car arrive
and leave"; this answers "what is the state of the site right now", which is
what a gate desk actually opens the console for.

**Everything here is off by default and every limit is nullable.** A customer
who bought a camera to see who comes to their house must not discover capacity
management by having the console announce their driveway is full. `null` and
`0` are deliberately different: a capacity of 0 would mean permanently full, so
the console uses a toggle plus a number rather than an empty box meaning "off".

### Occupancy is counted, never tallied

`occupancy()` counts open visits. A running total incremented on entry and
decremented on exit would be biased permanently by a single missed read — which
is routine here — with no way to tell a real occupancy of 12 from a drifted
one. Counting open visits is self-correcting: the retention sweep closes out
stale visits, so the number heals rather than accumulating error.

Over-capacity is reachable and is handled rather than hidden: entry is never
refused, and a missed exit inflates the count, so free spaces clamp at zero and
the percentage clamps at 100.

**Capacity is reported, never enforced.** The gate still opens for an allowed
vehicle when the site is full. A barrier that strands a resident outside their
own home at midnight is a worse failure than an over-full car park, and the
person at the gate can see the count and decide.

### Alerts fire once

| Setting | Default | Behaviour |
| --- | --- | --- |
| `capacity` | `null` | Unmanaged |
| `overstay_hours` | `null` | Never flag |
| `alert_full` | `true` | Only meaningful once a capacity is set |
| `alert_unknown` | `false` | Notify the first time a plate is ever seen |

The full-site alert is **edge-triggered** — it fires as the last space is taken,
not on every arrival while full, the same rule every state trigger in
`automations.ts` follows. Overstay is stamped with `overstay_alerted_at` in the
same statement that selects it, so two overlapping sweeps cannot both alert and
a vehicle is announced once rather than every ten minutes. An alert that repeats
all afternoon gets muted, and a muted channel is where the next real one dies —
the same reasoning behind the Sentinel's latching gas alarm.

The overstay sweep runs every 10 minutes on its own timer, separate from the
daily retention job: retention is housekeeping, an overstay is something
somebody is meant to act on, and a five-hour-late alert is not worth sending.
It is one indexed `UPDATE` across the whole fleet per tick, not one query per
account.

### Time-boxed access

`plate_rules` carries `valid_from` / `valid_to`, and the console offers them as
an expiry when a plate is added — a contractor for the day, a delivery for two
hours. The window is sent as an **absolute instant**, not a duration, so a rule
saved at 17:59 cannot mean something different by the time the request lands.
An expired pass stays visible and is styled as expired: it must not read as an
active one, or a contractor whose access lapsed at noon looks identical to a
permanent resident.

### Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/anpr/occupancy` | Live count, free spaces, and the overdue list |
| GET | `/anpr/settings` | Current policy |
| PATCH | `/anpr/settings` | Change it |
| GET | `/v1/occupancy` | The same count for an integration or a gate display |

`/anpr/occupancy` is its own endpoint rather than a field on `/anpr/summary`
because a kiosk polls it every few seconds and must not drag a week of
aggregate statistics along with it.

### The daily report

A summary of the previous IST day, emailed each morning: traffic and read rate,
who is still on site, anything overdue, blocked vehicles, and the vehicles that
come most.

**It goes to a configured address, not to the account holder.** The person who
should read a gate report is usually a facilities inbox, a security desk or a
building manager. Defaulting to the login address with no way to change it
would make the feature useless to exactly the sites that most want it.
`anpr_settings.report_email` holds the recipient and **no address means no
report** — nothing is sent to anybody by default.

Sent **from `info@circuvent.com`** through the indigenous Postfix server in the
`Mail.circuvent` repository, over the same `SMTP_*` transport OTP already uses,
with Resend as the fallback. `REPORT_FROM` is deliberately separate from
`EMAIL_FROM`: that one signs OTP and password resets and belongs to a no-reply
identity, while a report is something a recipient hits reply on. Both must stay
on a domain `mail.circuvent.com` signs with DKIM, or they fail DMARC and land
in spam.

| Setting | Default | Meaning |
| --- | --- | --- |
| `report_email` | `NULL` | Recipient. Null = no report |
| `report_hour` | `7` | IST, the same zone the automation scheduler uses |
| `REPORT_FROM` | `Circuvent <info@circuvent.com>` | Sender |

**Exactly once per day, per account.** The sweep claims
`report:<owner>:<IST date>` in the same `scheduler_ticks` table the automation
scheduler uses. That makes it exactly-once across replicas *and* across
restarts — a process that crashes after sending would otherwise send again on
boot, and a duplicate report every morning is how a report becomes something
people filter away unread. It rides the ten-minute tick rather than an hourly
timer, because it only has to land inside the configured hour and an hourly
timer would miss it entirely if the process restarted across it.

**The report explains its own zeroes.** A 0% read rate has two entirely
different causes, and saying "0%" without saying which sends a facilities
manager up a ladder to inspect a camera that is working exactly as configured.
So the body distinguishes "no recogniser is configured — this is a setting, not
a camera fault" from "fewer than 6 in 10 plates were read", and a day with no
vehicles says so along with what to check.

`POST /anpr/report/test` sends one immediately. It runs `sendReport`, the same
function the scheduler runs, rather than rendering a preview: the failures
worth catching are all in delivery — a sender domain that fails DMARC, an SMTP
host that rejects the mailbox, a typo in the recipient — and a preview cannot
see any of them.

---

## 9. Reaching it from outside

### Automations

The plate event is `{ "type": "plate", … }` on the telemetry channel, so it
matches the **existing** `event` trigger with no new trigger kind:

```json
{ "type": "event", "deviceId": "anpr-cam-a1b2c3",
  "eventType": "plate",
  "match": { "plate": "KA01AB1234", "direction": "in", "decision": "allow" } }
```

The rule builder offers plate, direction and list membership as real fields
rather than the raw `key=value` box. Reading a plate is the headline reason to
own one of these cameras, and "type `plate=KA01AB1234`, without spaces, or it
silently never fires" is not a feature anybody can use.

**The plate in a trigger is normalised server-side, in `routes/automations.ts`.**
The pipeline publishes `payload.plate` already normalised, so a rule stored as
typed — `KA 01 AB 1234` — could never equal the read of that exact vehicle, and
would fail the way rules fail worst: enabled, correct-looking, never firing.
Normalising in the route rather than the console means every client gets it and
there is one normaliser rather than a copy per client that can drift from what
the pipeline emits. A string that is *not* a registration is left as typed —
rewriting it would hide the mistake from somebody reading their own rule back.
`plate-trigger.test.ts` proves this over real HTTP.

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

## 10. Installing one

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
