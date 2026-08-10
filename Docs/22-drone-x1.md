# 22 — Drone X1

The Circuvent flight stack. Our attitude estimator, our control cascade, our
mixer, our ESC driver, our safety interlocks. This aircraft is not bridging
somebody else's autopilot — it is flying itself.

Device type id: `drone-x1`. Firmware: `firmware/drone-fc/`. Hardware:
`hardware/drone-x1/`. Console: `/smarthome/drone`, alongside `drone-link`.

---

## 0. Read this first

**This flight stack has never flown.**

The maths has been checked against the references it derives from, the mixer's
sign conventions are proved by `src/lib/drone-mixer.test.ts`, and all three
firmware targets compile. None of that is flight testing.

Every stabilisation loop ever written has been wrong on its first flight in
some way its author did not predict: a reversed axis, a scale factor, a filter
that resonates with one particular frame. The difference between a good
outcome and a destroyed aircraft is entirely whether the commissioning ladder
in §6 was followed in order.

Step 3 is the one people skip and the one that catches a reversed axis. A
reversed axis discovered at step 5 is an aircraft inverting into the ground at
full throttle in about 300 ms.

---

## 1. Why we wrote our own, having argued against it

`Docs/21-drone.md` makes the case that an ESP32 should not run a from-scratch
stabilisation loop, and that ArduPilot and PX4 represent millions of flight
hours of exactly that problem being got wrong and then fixed. That argument
has not changed and it is still correct **for the drone-link product**, whose
job is to bridge an aircraft somebody is already flying.

This is a different product with a different claim. It is sold as a
**development platform**, not as an aircraft to put a camera on and fly over a
site. The distinction is not marketing:

| | drone-link | drone-x1 |
| --- | --- | --- |
| Who stabilises | ArduPilot / PX4 | us |
| Flight hours behind the loop | millions | zero |
| Sold as | a product | a development platform |
| Pilot required | yes | yes, in line of sight, with a transmitter |
| Cloud can command flight | yes, whole intents | **no** |

That last row is the important one. The X1 accepts **no flight commands over
the network at all** — no arm, no takeoff, no stick input. Tuning and
configuration only, and even those are refused while armed. The safety case for
this aircraft rests entirely on a pilot with a transmitter in line of sight,
and an arm command arriving from a browser would dismantle it.

---

## 2. Architecture

```
   core 1                                    core 0
   ┌──────────────────────────────┐          ┌────────────────────────┐
   │ 1 kHz rate loop              │          │ Wi-Fi, MQTT            │
   │  IMU read (SPI)              │  shared  │ telemetry batching     │
   │  Mahony AHRS                 │◀───────▶│ battery sampling       │
   │  angle → rate → PID          │  state   │ LED, buzzer            │
   │  mixer → DShot               │  + mutex │ command handling       │
   └──────────────────────────────┘          └────────────────────────┘
```

**The core split is the most important structural decision in the firmware.**
The ESP32's Wi-Fi driver holds locks for milliseconds at a time. A control loop
sharing a core with it does not slow down evenly — it misses deadlines in
bursts, and a burst of missed deadlines during a correction is a crash. The
rate task is pinned to core 1 at a priority above the network stack, allocates
nothing, and never touches Wi-Fi.

The shared snapshot is guarded by a spinlock rather than left to luck: a float
is not atomic across cores on this part, and a torn read of an attitude
produces a plausible number that is a blend of two different moments.

### The cascade

```
stick ──▶ [angle P] ──▶ rate setpoint ──▶ [rate PID] ──▶ mixer ──▶ motors
           250 Hz                            1 kHz
```

The outer loop is **P-only, deliberately**. It converts "hold 10 degrees" into
"rotate at N deg/s", which is a kinematic relationship with no dynamics in it.
An integral term there fights the inner loop's integrator for authority over
the same error; every flight stack that has tried it has removed it again.

1 kHz for the inner loop is not a round number chosen for looks. A 5" quad's
motor-and-prop time constant is 25–40 ms, useful rate-loop gain needs the
controller an order of magnitude faster than the plant, and the D-term filter
cutoff is designed around it.

---

## 3. The estimator

Mahony complementary filter on a quaternion, not an EKF.

An EKF estimates gyro bias properly and is what a survey aircraft wants. It
also needs a 6×6 covariance propagation every cycle and goes unstable in ways
that are hard to see coming when the covariance loses positive-definiteness
after a long run. Mahony's proportional-integral correction **is** a gyro bias
estimator — it just converges more slowly and cannot express uncertainty. For
an aircraft whose whole job is to stay near level, that trade is right.

Two defences that matter more than the filter choice:

- **The accelerometer is only a hint.** It measures specific force, not
  gravity, so in accelerated flight it reads gravity plus whatever the airframe
  is doing. Kp is 0.6 — it pulls the estimate back over seconds, not
  milliseconds.
- **Samples far from 1 g are discarded outright.** During a punch-out or a hard
  landing the accelerometer is measuring thrust or impact and carries no
  attitude information at all. Feeding it in would tilt the estimate toward
  whatever direction the aircraft was accelerating.

The gyro flies the aircraft. The filter exists to stop it drifting.

---

## 4. Safety

### Arming interlocks

Every one is checked in `armBlocker()`, and the **first** blocker is reported
rather than a list — an operator needs one instruction, not a scoreboard.

| Blocker | Why |
| --- | --- |
| Arm switch was on at power-up | Powering up with the switch forward would arm the aircraft the moment the receiver connects, while somebody is holding it. This is the most common way people are cut by their own quad. |
| IMU not responding | No attitude estimate means no controller. |
| Still calibrating | A bias measured while the aircraft moved is wrong permanently. |
| No radio link | Nothing to fly it with. |
| Throttle not at idle | Arming at throttle is an aircraft that leaves immediately. |
| Not level (>20°) | Almost always means it is being held. |
| Battery below warn | A pack that starts low does not finish the flight. |

### In-flight cutoffs

| Condition | Response | Why not something else |
| --- | --- | --- |
| Radio lost | Level, descend at 35% throttle | **Not** a power cut. Cutting drops the aircraft wherever it is, which may be over someone. Every certified failsafe descends. |
| Tilt > 75° | Cut motors | Past this an angle controller cannot recover, and an inverted quad under a level controller drives itself into the ground at full power. |
| IMU fault | Cut motors | Continuing would fly on a stale attitude. |
| Arm switch off | Disarm | The pilot's decision, always honoured. |

### The SBUS flags byte

A receiver that has lost its transmitter **keeps sending frames**, holding the
last values or its configured failsafe positions. A flight controller that only
checks "am I receiving bytes" concludes the link is healthy while the pilot has
no control at all.

So `rc.h` reads the failsafe and frame-lost flags, and a frame carrying the
failsafe flag is decoded but does **not** refresh the liveness timestamp.
Silence is easy to detect; a receiver cheerfully repeating a stale throttle is
not.

---

## 5. Tuning

Defaults are conservative — deliberately under-tuned, because an
under-tuned quad wallows and an over-tuned one oscillates itself apart.

| Gain | Default | Raise until | Symptom of too much |
| --- | --- | --- | --- |
| `kpRoll` | 0.0016 | it holds attitude crisply | fast oscillation, hot motors |
| `kiRoll` | 0.0040 | it stops drifting in wind | slow wallow, overshoot after input |
| `kdRoll` | 0.000022 | overshoot stops | high-frequency buzz, very hot motors |
| `angleKp` | 6.0 | level mode feels direct | bounce when returning to centre |

Gains are refused while armed. Changing a D term on a hovering aircraft steps
the controller's output discontinuously; Betaflight allows it in a dedicated
mode with a pilot ready to catch it, and over an internet link with no such
context it is a way to drop an aircraft from a web page.

---

## 6. Commissioning ladder

**Do not skip a step. Do not reorder them.**

### 1 — Props OFF, bench

Power on. Confirm in the console: `calibrated: true`, `ready: true`, a plausible
`battV`, `overruns: 0`. If `overruns` climbs, the loop is not meeting its
deadline and nothing below this line is safe.

### 2 — Props OFF, motor map

Arm. Confirm each motor spins at idle. Push each stick and confirm:

- roll right → **M1, M2** slow down
- pitch back (nose up) → **M2, M3** speed up
- yaw right → **M1, M3** speed up

That third one is the line to check first on a new build. Get it backwards and
yaw is positive feedback.

### 3 — Props ON, strapped down

**The step people skip.** Strap the aircraft firmly to something heavy, with
the props clear. Arm at low throttle and tilt the whole rig by hand: the
motors must fight the disturbance, not follow it. If a correction amplifies
the movement, an axis is reversed — stop, and go back to step 2.

### 4 — Tethered hover

Outdoors, on a tether shorter than the distance to anything that matters.
Nobody inside the tether radius. Hover for thirty seconds. Watch for
oscillation and listen for the buzz of too much D.

### 5 — Free flight

Open space, no people, low and slow first.

---

## 7. Telemetry

The X1 publishes on `cv/<id>/track` — the **same** binary protocol as
`drone-link`, documented in `Docs/21-drone.md` §4. So the log book, the flight
detail view, the CSV export and the daily report all work against this
aircraft with no change, and both airframes appear in the same fleet.

Inventing a second format would have meant a second parser, a second set of
tests, and two places for the flight-lifecycle rules to drift — and those rules
(a flight is arm to disarm; a flight that ends in silence is never called a
landing) are exactly the part that must not drift.

**No GPS.** This airframe has none, so lat/lon stay zero. The parser's
`hasFix()` already treats (0,0) as "no fix" rather than as the Gulf of Guinea,
which is why that check exists. Altitude, attitude, battery, mode and timing
all populate. Claiming a position we do not have would be worse than admitting
we have none.

---

## 8. What is not implemented

Stated plainly, because a gap somebody discovers in the air is worse than one
they read about:

- **No GPS, so no position hold, no return-to-home, no waypoints.** In level
  mode the aircraft holds *attitude*, not position — it will drift with wind.
- **No barometer, so no altitude hold.** Throttle is manual.
- **No current sensor.** Battery percentage is derived from voltage alone,
  which under-reports under load.
- **No blackbox logging.** The 10 Hz cloud track is the flight record; it is
  far too slow for gain tuning.
- **No compass**, so yaw is relative to power-up heading and drifts slowly.

Adding GPS and a barometer is the natural next step, and would make
return-to-home possible. Until then this is a line-of-sight aircraft flown by a
pilot, which is what the safety case in §1 assumes.

---

## 9. Building

```bash
cd firmware/drone-fc
pio run
```

ESP32-S3 only, and not for convenience: the control loop is pinned to core 1
with the radio on core 0, and a single-core part cannot make that separation.

`lib_ignore = drone-fc` in `platformio.ini` is load-bearing — `lib_extra_dirs =
..` makes every folder under `firmware/` a candidate library, so a project with
headers of its own gets compiled outside the src build and loses `lib_deps`.
The failure surfaces as a missing `ArduinoJson.h` inside the shared library,
pointing nowhere near the cause. See `Docs/07`.

## 10. Testing

```bash
npx jest src/lib/drone-mixer.test.ts   # mixer signs, saturation, stick shaping
cd firmware/drone-fc && pio run        # compiles, and the pin-clash guard fires
```

The mixer test lives outside the firmware on purpose. It is four lines of
arithmetic that decide whether the aircraft flies or flips, a sign error in it
compiles perfectly, and `pio run` cannot catch it — only the airframe can, by
inverting itself.
