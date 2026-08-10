# Circuvent Drone X1 — hardware

A 5-inch quadcopter built around the Circuvent flight controller
(`firmware/drone-fc/`). This document is the bill of materials, the sizing
arithmetic behind it, and the wiring.

> **This airframe carries a new flight stack.** Do not fit propellers before
> reading the commissioning ladder in `Docs/22-drone-x1.md`. Steps 1–3 happen
> with the props off or the aircraft strapped down.

---

## Sizing, and why these parts

The whole design follows from one number: **thrust-to-weight at hover**.

A multirotor that can only just lift itself has no authority left to correct
with — every gust uses thrust it needed for attitude, and it descends while
fighting. The rule of thumb the industry settled on is **2:1 minimum**, and 3:1
or better for anything expected to fly in wind.

| | |
| --- | --- |
| All-up weight (with 4S 1500 mAh) | ~610 g |
| Static thrust, 4× 2207 1750 kV on 5×4.3×3 | ~4 × 1150 g = 4600 g |
| Thrust-to-weight | **~7.5 : 1** |
| Hover throttle | ~28% |

7.5:1 is deliberately generous for a first airframe. Hovering at 28% throttle
means the controller has almost the entire range available for corrections,
which is what makes a new and unproven tune survivable — a marginal aircraft
punishes a mediocre tune by falling, a strong one just wobbles.

The cost is efficiency: an over-motored quad hovers off the bottom of the
throttle curve where props are least efficient. Flight time suffers, and that
is the right trade for a development platform.

### Flight time

```
Hover current ≈ 4 motors × 4.5 A = 18 A
Usable capacity = 1500 mAh × 0.80 = 1200 mAh    (80%, so the pack is not
                                                 discharged below 3.5 V/cell)
Flight time = 1200 mAh / 18000 mA × 60 ≈ 4 minutes
```

Four minutes is short, and it is honest. A 5-inch quad on a 1500 mAh 4S is a
four-to-six minute aircraft; anything claiming double that is either quoting
bench numbers or flying a much lighter build.

---

## Bill of materials

| Part | Spec | Qty | Notes |
| --- | --- | --- | --- |
| Frame | 5" true-X, 5 mm arms, carbon | 1 | True-X, not stretched: the mixer assumes symmetric arms |
| Flight controller | Circuvent FC (ESP32-S3-WROOM-1, 8 MB flash) | 1 | `firmware/drone-fc/` |
| IMU | ICM-42688-P on SPI | 1 | Soft-mounted — see below |
| ESC | 4-in-1, 45 A, BLHeli_32 or AM32, DShot300+ | 1 | Must support DShot; PWM is not implemented |
| Motors | 2207, 1750 kV | 4 | Two CW, two CCW |
| Props | 5 × 4.3 × 3 | 4 | Two CW, two CCW — match the motor directions |
| Battery | 4S 1500 mAh, 75C+ | 1 | 75C so voltage sag under a punch does not trip the low-battery cut |
| Receiver | SBUS, 2.4 GHz | 1 | Inverted UART; the FC does the inversion in hardware |
| Buzzer | 5 V active | 1 | Audible arm state from across a field |
| Battery lead | XT60 | 1 | |

### Why the IMU is soft-mounted

The gyro is the only sensor the rate loop reads, and it reads it a thousand
times a second. Motor and prop vibration lands squarely in the band the D term
amplifies, so a hard-mounted IMU turns the derivative into a vibration
amplifier: the motors heat, the ESCs can desync, and the aircraft develops an
oscillation that no gain change fixes because the noise scales with the gain.

Four M3 grommets between the FC and the frame plate is the standard answer and
costs nothing.

---

## Wiring

```
                    ┌─────────────────┐
   4S pack ──XT60──▶│  4-in-1 ESC     │──▶ M1  front-right  CCW
                    │  45 A, DShot300 │──▶ M2  rear-right   CW
                    │                 │──▶ M3  rear-left    CCW
                    │                 │──▶ M4  front-left   CW
                    └────────┬────────┘
                             │ 5 V BEC + 4 signal
                    ┌────────▼────────┐
                    │  Circuvent FC   │
                    │  ESP32-S3       │◀── SBUS  (GPIO 18)
                    │                 │◀── VBAT divider (GPIO 1)
                    │  ICM-42688 SPI  │──▶ buzzer (GPIO 15)
                    └─────────────────┘
```

| FC pin | Signal | Default GPIO |
| --- | --- | --- |
| M1..M4 | ESC signal | 4, 5, 6, 7 |
| IMU | SCK / MISO / MOSI / CS | 12 / 13 / 11 / 10 |
| RC | SBUS in | 18 |
| VBAT | 1:10 divider | 1 |
| Buzzer | active high | 15 |
| LED | status | 48 |

A compile-time guard in `fc-config.h` fails the build if any two of these
collide. That matters because a motor output sharing a pin with the IMU chip
select does not fail at boot — it fails when the loop starts driving that pin
at 300 kHz while selecting the gyro, so the attitude estimate dissolves with
the props already spinning.

### The battery divider must be calibrated

`readBatteryVolts()` assumes 1:10. Resistor tolerance alone moves the reading
by a few percent, which at the bottom of a LiPo's curve is the difference
between landing and destroying the pack. Measure the pack with a meter, compare
against the reported `battV`, and adjust the constant.

---

## Motor order and direction

This is the step that catches people, and it is why props go on last.

```
        front
   M4(CW)   M1(CCW)
       \    /
        \  /
        /  \
       /    \
   M3(CW)   M2(CCW)
        rear
```

The mixer in `control.h` assumes exactly this. Two consequences:

1. **Motor order wrong** → roll and pitch corrections go to the wrong arms. The
   aircraft flips on the first correction.
2. **Prop direction wrong** → yaw becomes positive feedback. The aircraft spins
   up faster the harder the controller tries to stop it.

Both are caught on the bench in a minute, with the props off, by pushing each
stick and watching which motors spin up. Neither is survivable in the air.

---

## Assembly order

1. Solder motors to the ESC, observing the arm map above.
2. Mount the ESC, then the FC on grommets. Arrow forward.
3. Wire SBUS, battery divider and buzzer.
4. **No props.** Power on a bench supply, confirm the FC boots, calibrates and
   reports `ready` in the console.
5. **No props.** Confirm motor order and direction with the transmitter.
6. Fit props, matching direction to the map.
7. Continue with the commissioning ladder in `Docs/22-drone-x1.md`.
