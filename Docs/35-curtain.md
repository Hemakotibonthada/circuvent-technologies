# 35 — Smart Curtain

Drives a curtain or roller blind motor through a pair of relays, tracks its
position by time, and takes local buttons as well as the app.

---

## 1. Position is inferred, and that has consequences

There is no encoder and no limit switch. Position is worked out from how long
the motor has run — which is how almost every controller at this price works,
and it **drifts**. The motor is not identical run to run, the fabric binds on a
humid day, the mains sags when the kettle goes on. After a few dozen cycles
"0%" is no longer where closed is, and the app is confidently reporting a
curtain that is a hand's width open.

The fix is not better arithmetic. It is a **reference**.

> When told to go *fully* open or *fully* closed, the firmware drives for the
> whole travel time regardless of where it believes it is, so it always ends
> against the mechanical stop.

Every full open or close therefore re-homes the estimate. Partial positions
drift between those and are corrected by the next one. That is why Open and
Close are real buttons in both apps and the slider is for everything in
between — and why the panels say so, because the natural reaction to a slider
reading 40% on a curtain that is clearly at 30% is to decide the device is
broken.

**This assumes what curtain motors actually have**: an internal slip clutch or
end limits, so being driven into the stop for a second or two is what they are
designed for. A bare geared motor with no limits should not be wired to this.

---

## 2. Travel time

It used to be `#define TRAVEL_TIME_MS 20000UL`. Every curtain is a different
width, so on a 1.5 m track every reported position was out by half.

It is now a setting, persisted, bounded to 2–90 s, and it can be **measured**:

1. `{action:"learn"}` — the curtain closes fully, to get a known starting point,
   then starts opening and begins timing.
2. The user taps **"It is fully open now"** → `{action:"learnDone"}`.
3. The elapsed time becomes the travel time.

A measurement outside 2 s–90 s is refused rather than stored, and a learn run
nobody ends is stopped after `MAX_TRAVEL_MS` — a motor is never left running
because somebody closed the app.

---

## 3. Two things that were wrong

### Both motor relays were energised whenever the curtain was stopped

The relay boards are opto-isolated and negative-trigger: pulling the GPIO **low**
energises the coil. The sketch used bare `pinMode(OUTPUT)` — which leaves the
latch low — and treated `HIGH` as "on".

So `driveMotor(0)`, the **stopped** state, wrote LOW to both pins and held both
relays closed. Continuously. And it did it from the moment the device powered
on, before anything had been commanded. Every direction was inverted on top of
that.

`cvRelayInit`/`cvRelayWrite` exist for exactly this. This is the same fault the
RFID gate had, in the same shape.

### The stop button was on the reset pin, level-triggered

`BTN_STOP` is GPIO0, which is also what `setResetButton(0)` watches. The test
fired every 300 ms for as long as the pin was low, so holding BOOT to change the
Wi-Fi ran `stopCurtain()` about ten times — each one committing the position to
NVS — and it acted on a pin that was already low at boot.

Now a tap, via `CvTapButton`. The open and close buttons are edge-detected for
the same reason.

---

## 4. Other protections

| | |
| --- | --- |
| **Dead time** | 300 ms with both relays off before reversing |
| **Runtime ceiling** | no single command may run the motor past `MAX_TRAVEL_MS` |
| **Publish cadence** | 1 s while moving, 5 s at rest |

**Why the dead time.** Switching straight from one direction to the other asks
the contacts to break an inductive load and make the opposite one in the same
instant, while the motor is still turning and still generating. That arcs the
contacts and, on a shared-common relay pair, briefly shorts the supply.

**Why a cadence.** `position` changes on every pass while the motor runs, and
the library republishes whenever state is dirty and 80 ms have elapsed — about
**250 state messages, and 250 database rows, for one twenty-second movement**.
The same trap as the meter, and it cost more there.

---

## 5. Commands

```
{action:"open"}                 full travel, re-homes at 100
{action:"close"}                full travel, re-homes at 0
{action:"stop"}
{action:"set", position:N}      0..100
{action:"set", travelSec:N}     2..90
{action:"learn"}                close, then open while timing
{action:"learnDone"}            "it is fully open now"
```

`stop` deliberately **projects nothing** in the command map. Where the curtain
ends up is whatever the timed estimate says at the instant the motor cut, which
is precisely the number the console cannot compute — guessing would fight the
device's own answer a second later, and the visible result is a slider that
jumps. `moving` is never predicted either.

---

## 6. The apps

Before this the curtain had **no dedicated panel anywhere**: the console fell
through to a raw state dump and the phone did not recognise the device type at
all, despite both carrying an icon and a label for it.

Both now have a position readout, a slider, Open/Stop/Close, and the
calibration flow.
