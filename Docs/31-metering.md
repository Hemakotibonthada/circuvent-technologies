# 31 — Energy metering

Two products measure electricity, and they do not measure the same thing. Most
of the trouble people report with either one comes from assuming they do.

---

## 1. The two products

| | **Energy Monitor** (`firmware/energy-monitor`) | **Energy Meter** cv-em1 / cv-em3 (`firmware/meter`) |
| --- | --- | --- |
| Sensor | A current transformer clamped round one conductor | A BL0937 or HLW8012 metering front end |
| Measures | Current, and only current | Voltage, current and true active power |
| Watts | `amps x assumed volts x assumed power factor` | Measured |
| Power factor | Assumed (0.95) | A reading |
| Isolation | The clamp is inherently isolated | Optocoupler outputs; the front end sits at mains potential |
| Fitting | Clips on, no wiring broken | Wired in |

The distinction is the whole point. A CT clamp cannot know the voltage, and it
cannot know the phase angle between voltage and current — so it cannot know the
power. It infers it.

> **The Smart Plug measures nothing.** It has no metering front end at all.
> Until firmware 1.2.0 it published a hard-coded 42.5 W whenever the socket was
> on, which the apps showed as "Live power draw" — so every plug in the fleet
> reported the same invented load. It now publishes no `watts` key, and the apps
> show a reading only when the device actually sends one.

That inference is fine on a resistive 230 V load: a heater, a kettle, an
incandescent lamp. It is wrong on exactly the loads people buy a meter to
investigate:

- **On a 110 V supply**, every reading is roughly double.
- **On a motor, fan, or LED driver**, the true power factor is nearer 0.5 than
  0.95, so the reading is high — sometimes by half.

Neither error announces itself. The device is online, the number is stable, and
it is wrong.

**So both apps now state the assumption next to the number** rather than
captioning it "Instantaneous load", and the console offers the calibration that
corrects it. If you need a figure you can put in front of a customer, use the
cv-em meter.

---

## 2. Calibration

Both accept `{ "action": "calibrate", ... }` with any of:

| Field | Meaning |
| --- | --- |
| `watts` | The true power of a load you are running now |
| `amps` | The true current |
| `volts` | On the meter, the true voltage; on the monitor, the supply voltage to assume |

`watts` and `amps` **trim** — the device scales its existing multiplier by
`true / measured`. Two consequences:

- **Calibrating at no load does nothing**, and is refused. There is no measured
  value to divide by, and doing it anyway would scale the multiplier into
  nonsense.
- Run a load whose draw you actually know. A resistive heater is ideal; an
  incandescent lamp is close enough.

On the monitor, `volts` is different: it is *stored as the assumption*, not
trimmed. That is the setting to change on a 110 V installation.

The console builds these through `buildFieldCommand`, so the refusals above are
enforced before anything is sent. Do not assemble the payload by hand.

---

## 3. Traps in the meter firmware

These are documented because each one produced a confident, plausible, wrong
number — and each took a while to find for that reason.

### The SEL line means two different things

A BL0937 has one pulse output, `CF1`, that carries **either** current **or**
voltage depending on the level of the `SEL` pin. The firmware multiplexes:
three current windows for each voltage window.

**The polarity is inverted between the two supported parts.** BL0937 reads
current when SEL is high; HLW8012 reads it when SEL is low. Get this backwards
and the meter reports the mains voltage where the current should be — around
230-ish, stable, and entirely fictitious.

`SEL_LEVEL_FOR_CURRENT` is therefore defined **once**, and an unrecognised
`METER_PART` is a compile error rather than a silent fall-through to HLW8012
polarity.

### A reading must never survive a change in meaning

When SEL switches, everything captured before that instant describes the *other*
quantity. The settle window is 1 s and the staleness timeout is 2 s, so for one
second after each switch a stale capture was still considered live — and was
read as the newly selected quantity.

The visible symptom: **a channel with nothing plugged into it reported about
0.9 A.** In current mode an unloaded channel produces no CF1 edges at all, so
what was being measured was the leftover voltage pulse rate.

`resetCf1Capture()` is called on every SEL switch and at boot.

### Zero is a reading; the last value is not

`volts` was only ever assigned inside the branch that runs when pulses arrive.
A front end whose voltage sense died left the last figure in place indefinitely
— the meter would go on saying 230 V for as long as it had power. Worse, the
published power factor is `watts / (volts x amps)`, so a stale voltage silently
corrupts that too.

The same rule applies to the sump reading on the water tank and to power here.
**When a sensor stops reporting, publish that — never the last thing it said.**

---

## 4. Publish cadence

Both sketches derive readings from the interval between pulses. At 2 kW that is
about 1350 Hz, so the value changes on **every loop**.

`CircuventDevice` republishes whenever state is dirty and `_minGap` (80 ms) has
elapsed. Left ungated that is ~12.5 messages a second, forever, per device —
over a million a day, each one a database write. Nothing appears broken. The
table and the bill simply grow.

Both now sample on a fixed cadence: 500 ms for the meter, 1 s for the monitor.

**This is a trap for any analog device**, not just these two. If a sketch
publishes a float derived from a continuously varying measurement, it needs a
cadence gate.

---

## 5. Building

`firmware/meter/platformio.ini` has three environments:

| Env | Product | Flags |
| --- | --- | --- |
| `meter` (default) | cv-em3 | `METER_CHANNELS=3`, `METER_PART=PART_BL0937` |
| `meter-1ch` | cv-em1 | `METER_CHANNELS=1`, `METER_PART=PART_BL0937` |
| `meter-hlw` | cv-em3 with the alternative front end | `METER_CHANNELS=3`, `METER_PART=PART_HLW8012` |

Only `meter` is in `default_envs`, deliberately. `scripts/publish-firmware.cjs`
picks the image matching `default_envs` and **refuses to guess** if it cannot
identify one — publishing the single-channel image as the three-channel product
would give every customer a meter whose other two channels read zero forever,
via an OTA that looks completely successful.

To build a variant: `pio run -e meter-1ch`.

---

## 6. Where this is enforced

`tests/firmware-metering.test.ts` pins all of the above, including a parity
check between `src/lib/smarthome-command-map.ts` and both sketches.

That parity check exists because of a real bug: the command map has always sent
`{ action: "calibrate", watts|volts|amps }`, and the energy-monitor's handler
understood only `ctCal` — an internal multiplier nothing in the product sends.
Calibration from the app was accepted, acknowledged, and did nothing. There is
no error path for that: the command is well formed, the device is online, the
request succeeds, and the reading is exactly as wrong afterwards.

It was a bug in the *seam* between firmware and console, which is why neither
side's tests found it. If you add a field to a device's command map, add the
matching parity assertion.
