# Circuvent ANPR Camera — Datasheet

Reads vehicle number plates at a gate, driveway or parking entry, and tells the
Circuvent control plane which vehicle just arrived or left.

---

## 1. What it is, and what it is not

The camera watches one lane, decides when a vehicle is present, and sends the
few sharpest frames of it. **The number plate is read by the Circuvent control
plane, not on the camera.**

That is a design decision, not a limitation waiting to be lifted. Plate
localisation plus character recognition is a two-stage neural pipeline; the
smallest useful models want tens of megabytes of weights. This board has 8 MB of
PSRAM shared with the frame buffer and no neural accelerator. Anything on the
camera claiming to do it would be a pattern matcher that works on the plate it
was tuned against and quietly misreads the rest — and a misread plate opens a
gate for the wrong car.

Two consequences a buyer should know before ordering:

- A deployment with **no internet and no local control plane** gets vehicle
  detection, capture and local relay output, but no plate reading.
- It is built for a vehicle that **slows or stops** — a gate, a driveway, a
  parking entry. It is not an open-road traffic camera.

---

## 2. Specifications

| | |
| --- | --- |
| MCU | ESP32-S3 (dual-core 240 MHz, 8 MB PSRAM, native USB) |
| Sensor | OV2640 2 MP (OV5640 5 MP option) |
| Capture resolution | Up to UXGA 1600×1200; **SVGA 800×600 default** |
| Plate read range | 3–5 m with the stock 2.8 mm lens |
| Trigger | Inductive loop / IR beam input, or image motion in a defined region |
| Illuminator | PWM output for an 850 nm IR lamp, 0–100 % |
| Barrier output | 1 × dry-contact relay, 600 ms pulse |
| Network | 2.4 GHz Wi-Fi, MQTT over TLS |
| Supply | 5 V DC 2 A |
| Typical draw | 180 mA idle · 310 mA capturing · plus the IR lamp |
| Operating range | −10 °C to +50 °C |
| Enclosure | IP65 bullet housing with sun shield |
| Firmware | `firmware/anpr-cam`, OTA-updatable |

### Board options

| Build | Board | Use |
| --- | --- | --- |
| `anpr-cam` | ESP32-S3 WROOM CAM | **Recommended.** USB-C, 8 MB PSRAM, spare GPIO for loop, lamp and relay |
| `anpr-cam-xiao` | XIAO ESP32S3 Sense | Discreet parking-bay install, few exposed pads |
| `anpr-cam-aithinker` | AI-Thinker ESP32-CAM | Budget fallback — see the limits below |

**The AI-Thinker limits are real, and are stated rather than buried.** 4 MB
PSRAM caps sustained capture at SVGA, the OV2640 is noticeably noisier after
dark, and the board must be flashed with an FTDI adapter because it has no USB.
Expect it to read plates on a stopping vehicle at 3–4 m in daylight, and to need
the IR lamp and a slower approach at night. Its reset button is disabled in
firmware: the pin the other builds use is this board's camera clock, and wiring
a button there stops the sensor working while the device still reports itself
perfectly healthy.

---

## 3. Optics and siting

A plate needs roughly **100 pixels across its characters** to be readable. That
single number decides whether an install works.

| Stand-off | Resolution needed |
| --- | --- |
| 3 m | SVGA (800×600) |
| 4 m | SVGA, ideally XGA |
| 6 m | SXGA, or a longer lens |

| Angle | Effect |
| --- | --- |
| Under 30° horizontal | Fine |
| Over 30° horizontal | Characters shear; read rate falls sharply |
| Over 30° vertical | The plate foreshortens — mount low, not high |

Mount **1–1.5 m above the road surface**, roughly square to where the plate will
be. A camera on a 3 m pole looking down is the most common cause of an install
that captures every vehicle and reads none of them.

### Lighting

Plates are retro-reflective: they bounce light straight back at its source. That
makes them easy to light and easy to blow out.

- The firmware meters for the plate rather than the scene (`ae_level −1`, gain
  capped), so the background renders darker than a normal camera would show it.
  That is deliberate — nothing in the background needs reading.
- Use an **850 nm IR lamp mounted beside the lens, not on it**. A lamp on the
  lens axis at short range overexposes the plate it is meant to reveal.
- The AI-Thinker's on-board white LED is available but defaults to off. It sits
  millimetres from the lens and washes out a plate at gate distances.

---

## 4. Wiring

| Terminal | ESP32-S3 | Notes |
| --- | --- | --- |
| 5 V / GND | — | 2 A supply |
| LOOP | GPIO 40 | Inductive loop or IR beam, **active-low** dry contact |
| ILLUM | GPIO 41 | IR lamp driver, PWM |
| RELAY | GPIO 42 | Barrier dry contact, 600 ms pulse |

**The loop input is active-low on purpose.** Both an inductive loop detector and
an IR beam close a contact to ground, and that is also the safe failure
direction: a cut cable reads as open, so the lane stops triggering rather than
reporting a vehicle permanently present and holding the barrier up.

A loop detector is optional but strongly recommended. It cannot be fooled by a
shadow, a headlight sweep across the lane, or heavy rain, and it is the single
biggest improvement available to trigger reliability.

---

## 5. What it reports

Per capture, over MQTT to the control plane: a burst of JPEGs on
`cv/<id>/anpr`, plus a `vehicle` telemetry event the moment a vehicle is
detected — **published before the images**, so an arrival is recorded even when
every frame turns out unreadable. "A vehicle came and could not be read" and
"nothing happened" must never look the same.

The control plane adds the plate, a confidence figure, the allow / block / watch
decision, the direction of travel, and the visit the read belongs to.

---

## 6. Privacy and retention

Plate reads are personal data about people who never agreed to anything, and the
product is built accordingly:

- Live video is **never stored**, and never retained on the broker.
- Capture images expire **before** the plate metadata does — 30 days against 90
  by default. "This plate arrived at 19:42" is what an access review needs
  months later; the photograph of the street it was taken from is not.
- Nothing leaves the customer's own control plane unless a cloud recogniser is
  deliberately configured. The default configuration reads no plates at all.

---

## 7. Compliance

Reading number plates is regulated differently in different places. Operators
are responsible for signage, lawful basis and retention limits at their site.
The configurable retention periods exist so a deployment can be brought in line
with local rules; the defaults are a starting point, not legal advice.
