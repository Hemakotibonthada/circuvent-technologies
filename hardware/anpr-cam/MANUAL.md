# ANPR Camera — Quick Start

Reads the number plates of vehicles arriving at your gate, so known cars are
recognised and unknown ones are logged with a photograph.

---

## 1. Choose the spot

This matters more than any setting, so do it before you drill anything.

- **3–5 metres** from where a vehicle stops.
- **1–1.5 metres** above the road — about waist height, not up on a pole.
  Looking down at a plate foreshortens it and is the most common reason a
  camera captures every car and reads none of them.
- Roughly **square on** to the plate. Past about 30° off to one side, the
  characters shear and reads start failing.

Point it at the road surface where the plate will be. Not the sky, not the
footpath, not the neighbour's gate.

## 2. Power and wire it

5 V 2 A into the barrel jack. If you have them, connect:

- **LOOP** — an inductive loop or IR beam across the lane. Optional, and the
  single best thing you can add: it cannot be fooled by a shadow, a headlight
  sweeping across the lane, or heavy rain.
- **ILLUM** — an 850 nm infrared lamp for night use. Mount it **beside** the
  camera, not on top of the lens.
- **RELAY** — your barrier's "open" input, if you want this camera to open it
  directly.

## 3. Connect to Wi-Fi

1. Power it up. It creates a network called **Circuvent-Setup-XXXX**.
2. Join that network from your phone. The setup page opens automatically; if
   not, visit `192.168.4.1`.
3. Pick your Wi-Fi and enter the password. It reboots and connects.

2.4 GHz only. A gate is usually at the far edge of house Wi-Fi — check the
signal there before mounting, not after.

## 4. Add it to your account

In the Circuvent app: **Add device → ANPR Camera**, and scan the QR code on the
unit.

## 5. Aim it

In the app or console, open the camera and press **Aim camera** (**Live view**
on the console). You will see what it sees.

Now drag the **watched lane** rectangle over the road surface only. Motion
inside this rectangle is what triggers a capture — if it covers a tree, a
footpath or the neighbour's driveway, you will get captures all day and night.

Finally set **Traffic direction**:

| Setting | Use it when |
| --- | --- |
| **Entry** | This camera only sees vehicles arriving |
| **Exit** | This camera only sees vehicles leaving |
| **Both ways** | One camera covers a shared lane |

Two cameras — one entry, one exit — give the most reliable in/out times. A
single "both ways" camera works by alternating: if a car is recorded as being
inside, the next time it is seen it must be leaving.

## 6. Use it

**Security → Vehicles** in the console, or **More → Vehicles** in the app:

- **Plate log** — every vehicle, with its photograph and whether it was
  arriving or leaving.
- **Vehicles** — each distinct vehicle, how often it comes, and who is on the
  property right now.
- **Site** — free spaces and anything that has overstayed.
- **Allow & block** — your own cars, blocked vehicles, and time-limited passes
  for a contractor or a delivery.

Add your household's plates to the **allow** list from the log rather than
typing them, so a mistyped character cannot end up on the list.

To open the gate automatically, create an automation: **When a number plate is
read → arriving → on the allow list → open the barrier.**

---

## Troubleshooting

**"No plate recogniser is configured"**
Not a fault with the camera. Plate reading happens on the Circuvent control
plane and has to be switched on there. Vehicles are still being detected,
photographed and logged.

**Vehicles are captured, but plates are never read**
Almost always the mounting. Too far away, too high, or too far off to one side.
Look at a few captures in the plate log — if you cannot read the plate yourself,
neither can the recogniser.

**Nothing is captured at all**
Check the camera is **Armed**, and that the watched lane rectangle actually
covers the road. If a loop detector is fitted, check its contact closes when a
vehicle is over it.

**Captures all night from nothing**
Something inside the watched lane is moving — a branch, a flag, headlights
sweeping in from the street. Shrink the rectangle to just the road, or lower the
motion sensitivity.

**"Dropped" is climbing**
The camera cannot get its images out. That is Wi-Fi at the gate, not the camera.

**One car appears twice**
Increase the **Re-trigger delay** so a vehicle sitting at the barrier is not
captured twice.

**A vehicle shows "Arrival only" or "Departure only"**
One of the two reads was missed — a car tailgated another through the barrier,
or a plate was obscured. Normal for a gate camera. No stay time is shown for
those, rather than a guessed one.
