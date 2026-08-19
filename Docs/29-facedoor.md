# 29 · Face recognition and the FaceDoor lock

How a face opens a door, why it is arranged the way it is, and what it does
badly. Read `04-mqtt-protocol.md` first if the `cv/<id>/…` topics are unfamiliar.

---

## The problem this solves

`firmware/facedoor/facedoor.ino` was written against a design where "the hub's
AI node" watches a camera, recognises somebody, and posts the result to the
control plane. The server then sends the lock a command it already understood:

```json
{ "action": "unlock", "method": "face", "name": "Asha" }
```

Everything on both sides of that arrangement existed and was tested. The node in
the middle did not. There is no AI node in a Circuvent home — no Frigate box, no
NVR, nothing running a model — so the practical state of the feature was:

- faces could be enrolled and stored,
- thresholds could be tuned,
- the attempt log could be read,
- and **nothing ever looked at anybody.**

A lock that is fully implemented and never fires is worse than an unimplemented
one, because everything about it reports success.

Two pieces were added to close that:

1. **`platform/face`** — a small container that turns a photograph into a
   descriptor. This is the model.
2. **`platform/api/src/face/door.ts`** — a driver that makes an ordinary ESP32
   camera behave like a doorbell camera. This is the node in the middle.

---

## The shape of it

```
  motion / bell / "Look now"
            │
            ▼
      triggerDoor()  ──▶  cv/<camera>/cmd  {"action":"snapshot"} × 3
                                                    │
  cv/<camera>/frame  ◀────────────────────────── camera
            │
            ▼
      bus device:frame ──▶ door.ts ──▶ POST face:8000/embed
                                              │
                             ┌────────────────┴────────────────┐
                             ▼                                 ▼
                      enrolling?  addSample()            decideFace()
                                                               │
                                                               ▼
                                              cv/<lock>/cmd {"action":"unlock"}
```

Frames are handled **one at a time**, in arrival order. The embedder holds a
single lock around the model, so firing three at once does not make anything
parallel — it only means the third request spends the first two embeds queued.
On a two-core VM that was enough to push it past the ten-second client timeout,
and the symptom was maddening: the face service logged a successful embed, and
no access attempt appeared anywhere. Serialising also makes "first confident
frame wins" pay, because once one frame opens the door the rest are dropped
without being sent at all.

### Why this is not `anpr/lane.ts`

It is deliberately the same *arrangement* and deliberately not the same code.
The two share a mechanism — trigger, ask for a burst, feed the frames somewhere
— and disagree about everything that matters:

| | ANPR lane | Door camera |
|---|---|---|
| what a burst is for | three frames **voting** on one plate string | three chances at **one confident** match |
| how long is acceptable | a car will pass again | somebody is standing there |
| when unsure | log it, decide later | refuse, keep the door shut |
| cooldown | 8 s — one car must not read as twelve | 4 s — a resident must not wait |

Merging them would put a car park barrier and a front door behind one set of
tuning constants.

---

## The embedder (`platform/face`)

A ~350-line Python service on `python:3.11-slim` with OpenCV, exposing exactly
the contract `platform/api/src/face/embedder.ts` already defined for
`FACE_EMBEDDER=http`:

```
POST /embed   body: raw image bytes
  → {"descriptor": [128 floats], "faces": 1}
  → {"faces": 0}      no face
  → {"faces": 3}      more than one
GET  /health
```

Two models, both from OpenCV's own zoo, baked into the image at build time:

- **YuNet** (227 KB) — detection plus five landmarks.
- **SFace** (37 MB) — the embedding.

It runs on hardware already paid for, costs nothing per face, and never sends a
photograph of somebody's family to a third party. Same reasoning as
`ANPR_PROVIDER=local`.

It is a separate container because the API runs on `node:20-alpine` and OpenCV
needs glibc; rebasing the API image would also put a CPU-bound model in the same
process as the MQTT bridge. Memory is capped at 384 MB so it can never be the
reason the OOM killer picks Postgres. Measured resident: **89 MB**.

### The calibration — read this before changing the model

`match.ts` compares descriptors with Euclidean distance against a threshold of
0.6, and caps configuration at 0.6 (`MAX_THRESHOLD`) so nobody can loosen a door
by editing an environment variable. That 0.6 is the **dlib** convention.

SFace is not dlib. Its features are unit-norm and its documented same-person
boundary is a cosine similarity of 0.363 — a Euclidean distance of

```
sqrt(2 × (1 − 0.363)) = 1.128
```

Feeding raw SFace vectors into a 0.6 threshold would reject almost everybody:
the door fails *safe*, but it never opens for the people it is meant to.

So the vectors are scaled once, in `embed.py`, by `0.6 / 1.128 ≈ 0.532`.
Distances then land on the scale `match.ts` was written and tested against, and
its threshold, its margin rule and its refusal to be loosened all keep meaning
what they say.

Calibrating at the model rather than moving the door's threshold is deliberate:
the model is the thing that changed, and a door's safety rules should not have
to be renegotiated every time it does.

**Swapping the model means recomputing `SAME_PERSON_L2` for it. It does not mean
touching the door.**

### Measured behaviour

`platform/face/calibrate.py` was run against 13 identities — two real
photographs of one person, three portraits, and ten faces cropped from a group
selfie — comparing the worst same-person distance against the best
different-people distance:

| min face height | identities | same person (max) | different people (min) | at 0.6 |
|---|---|---|---|---|
| 60 px | 13 | 0.549 | 0.561 | **overlap** |
| 90 px | 9 | 0.403 | 0.589 | **overlap** |
| 120 px | 5 | 0.254 | 0.665 | clean |

Two real photographs of the same person, taken separately: **0.391**.

The conclusion drove the default. Below roughly 100 pixels the two distributions
touch, which means *no* threshold anywhere can separate them and a door using
those faces is guessing. `FACE_MIN_PX` therefore defaults to **120**: the line
under which this model has nothing trustworthy to say. The cost is that somebody
standing too far back is not recognised and the door stays shut — the safe
direction, but not the same as working, which is why the console says so.

### Two bugs the measurements found

**Detection got worse on large images.** A 1618×1522 portrait with a face
filling a third of the frame was detected *not at all* at full size, and at 0.92
confidence once reduced to 1024. YuNet is a fixed-scale detector; more pixels do
not help it. Since enrolment from the app sends whatever the phone camera
produced — routinely 3000 px wide — this was the common case failing. Detection
now runs on a reduced copy (`FACE_MAX_DETECT_PX`, default 1024) with the
landmarks scaled back up, so the crop handed to SFace still comes from the
original image at full resolution.

**The first inference took 9.1 seconds.** Loading the models is not enough;
the first *inference* is where OpenCV allocates buffers and picks kernels. Warm,
the same call takes 0.3–0.4 s. The API's embed timeout is 10 s. So without a
warm-up the first person to use the door after any restart waited nine seconds
or was refused — at exactly the moment somebody is most likely to be standing
there testing a deploy. `warmup()` now runs one real inference at boot (~4 s)
before the socket is opened.

---

## The lock firmware (1.4.0)

`firmware/facedoor/facedoor.ino`. The ESP32 has no camera and recognises
nobody. What it owns is the door: the strike, the keypad, the display, and the
guarantee that an enrolment window ends.

### Added in 1.4.0

**A 128×64 SSD1306 OLED** on I²C (SDA 21, SCL 22). It shows locked/unlocked and
who was let in, masked PIN entry, the enrolment countdown and sample count, the
lockout timer, and setup mode. The panel is optional — `begin()` returns false
when nothing answers on I²C and everything else carries on without it, because a
door with a dead screen must still be a door.

**PINs are salted-hashed, not stored in clear.** Flash on an ESP32 is not a
secret: the chip is screwed to the *outside* of the door and esptool reads it
over the same pins used to program it. Hashing does not stop somebody who can
dump flash from attacking the door, but it stops the dump from handing them the
code, and it stops that code from working on the customer's other doors. A PIN
written in clear by 1.3.0 is migrated on first boot and the old key deleted.

**Failed-attempt lockout.** A 4-digit PIN is 10,000 guesses and a keypad accepts
them as fast as fingers move. After `maxFails` wrong entries the keypad locks
out, doubling each round to a 15-minute ceiling. The counters are **persisted**,
so pulling the fuse does not clear them — cutting power to a door controller is
already the attack the fail-secure rule exists for.

**A held key no longer types itself repeatedly.** The old scan emitted a key
every 220 ms for as long as one was touched, so resting a finger on a digit
typed it a dozen times and ran past the PIN length. On a keypad with no display,
nobody could see why. Now one event per press, with the release required.

**A half-typed PIN is discarded after 10 s.** Somebody types three digits and
walks off; the next person to touch the keypad was completing a stranger's
entry.

**An on-device admin menu**, opened with `A` and the admin PIN:

```
1 Enrol face      2 Change PIN
3 Admin PIN       4 Lock      * Exit
```

There is deliberately **no default admin PIN**. A menu that opens on 1234 out of
the box is worse than no menu, because every installer would leave it there.

### Enrolment started at the door

The door cannot name a person or invent a profile id — those live in the
database with permissions attached. So it publishes a request:

```json
{ "type": "enrol", "state": "requested", "source": "keypad" }
```

`door.ts` creates a profile named `Enrolled at the door 14:32`, opens the
capture window, and sends the `enrol` command back. Enrolment started at the
door therefore goes through exactly the same server-side path as enrolment
started from the app: **standing next to the hardware grants no extra
authority.** The placeholder name is conspicuous on purpose — a face that opens
the front door and is labelled with a timestamp is an obvious loose end in the
roster; one labelled "User" would not be.

The server's window is a few seconds **shorter** than the door's, so the two
cannot disagree about who is still enrolling.

---

## Configuration

```ini
# The API — platform/.env
FACE_EMBEDDER=http
FACE_BASE_URL=http://face:8000
FACE_API_KEY=            # optional; the service is on the internal network
FACE_TIMEOUT_MS=10000

# The face container
FACE_SCORE_THRESHOLD=0.7   # detector confidence floor
FACE_MIN_PX=120            # see the table above — this is a security setting
FACE_MAX_DETECT_PX=1024    # raising this makes detection worse, not better
FACE_LOCK_WAIT_S=6         # answer "busy" rather than queue silently
```

With `FACE_EMBEDDER=none` (the default) everything except enrolment from a
photograph still works, and the API starts normally. The `face` service is
deliberately **not** in the API's `depends_on`: a model that fails to load must
not keep the control plane, and therefore every other device in every home, from
starting.

---

## Using a camera as a door camera

Console → the camera → **Face unlock**. One button. Behind it:

```
PUT    /face/doors/:deviceId      { lockId?, enabled?, burst?, cooldownMs?, … }
DELETE /face/doors/:deviceId
POST   /face/doors/:deviceId/capture     "Look now"
GET    /face/doors
```

Enabling raises the camera's still resolution to **SVGA** if it is lower and
turns motion detection on, then says what it changed. SVGA rather than the VGA
ANPR asks for: a plate is a high-contrast strip that survives being small, a
face is not (see the table).

`lockId` is optional. Without it, faces are recognised and logged and nothing is
unlocked — useful for enrolling a household before the lock is fitted. The
roster hangs off the lock when there is one and the camera otherwise, so fitting
a lock later does not split a household in two.

### What is honestly worse than a real doorbell camera

Stated here rather than discovered on a doorstep:

- The round trip is broker → camera → broker → embedder, so recognition lands
  roughly a second after the motion rather than instantly.
- The camera's motion detector is whole-frame, so a cat starts a burst.
- A face needs to be about 120 px tall, which on VGA means standing close enough
  to press a doorbell. Further away the door simply does not recognise anyone.

---

## Verified end to end

On the live account, against `camera-e8fc-648a`:

```
[face] embed 22702 bytes -> no face in 474ms      ← the camera's own frame
[face] embed 47493 bytes -> descriptor in 811ms   ← a frame with a face

 id |     name     | outcome |  dist  | granted |              reason
----+--------------+---------+--------+---------+----------------------------------
  1 | ZZ Test Face | match   | 0.0000 | t       | Recognised ZZ Test Face (manual)
```

Trigger → snapshot burst → MQTT frame → frame tap → embedder → match → audit row
→ unlock. Enrolment from a photograph was verified separately, including the
refusal: a second person's photo posted to an existing profile returned
`409 different-person`.

All test profiles, samples, attempts and the door row were deleted afterwards.

---

## Where things live

| | |
|---|---|
| `platform/face/embed.py` | the model, the calibration, the warm-up |
| `platform/face/calibrate.py` | run by hand after changing the model |
| `platform/api/src/face/door.ts` | camera → frames → decision |
| `platform/api/src/face/service.ts` | `decideFace` / `addSample`, shared with the routes |
| `platform/api/src/face/match.ts` | pure arithmetic; thresholds live here |
| `platform/api/src/face/routes.ts` | the REST surface |
| `src/app/smarthome/DoorCameraPanel.tsx` | the console |
| `firmware/facedoor/facedoor.ino` | the lock |
