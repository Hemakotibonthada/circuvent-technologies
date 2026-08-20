# 38 — The RC platform

Three radios and a phone. A model car, a handset that drives it, and a dongle
on the end of a USB-C cable that lets a phone drive it too.

---

## 1. The decision everything follows from

**Control and video are separate links.** This is not an optimisation; it is
the reason the system is shaped the way it is.

A camera feed is bulk traffic — large, bursty, and losing a frame costs
nothing. Steering is twenty bytes that have to arrive on time. Put them on one
link and the bulk wins: video fills the queue and the packet that says "turn
left" waits behind a JPEG. The car drives straight on while the picture is
still moving, which is the worst possible way to lose a vehicle, because from
the driver's seat it looks like it is still working.

| | Link | Why |
| --- | --- | --- |
| Control | ESP-NOW, 50 Hz, 20-byte frames | Connectionless. A lost packet costs 20 ms and the next one just arrives. |
| Video | Ordinary Wi-Fi | Allowed to degrade and drop on its own without touching steering. |

Control range is deliberately **longer** than video range. The car should
always be steerable further away than it is visible, never the other way round.

### Why not Wi-Fi for both

Association. A Wi-Fi client that drops has to re-associate, re-DHCP and
reconnect, which is seconds. For a moving vehicle that is the whole argument.

---

## 2. What Zigbee can and cannot do

Zigbee is supported, and it is worth being precise about what that means,
because "it has Zigbee" invites an assumption the radio cannot meet.

802.15.4 gives 250 kbit/s shared across a mesh, with per-hop latency in the
tens of milliseconds:

- **Driving: no.** A steering command 80 ms late at 20 km/h is half a metre of
  error, and a mesh that reroutes mid-corner is worse.
- **Video: not remotely.** One 320×240 JPEG is about half a second of the
  entire band.
- **Everything else: yes.** Telemetry, battery, lights, lock and immobilise,
  and integration with a hub that already speaks Zigbee.

So Zigbee is the *parked* channel. `rcLinkAllowsDrive()` in `rc-protocol.h` is
what stops that being a comment somebody later ignores — it returns true for
ESP-NOW and false for everything else.

---

## 3. The pieces

```
   handset ──ESP-NOW──┐
                      ├──▶ car ──Wi-Fi──▶ camera stream
   phone ──USB──dongle┘
```

| | Firmware | Board |
| --- | --- | --- |
| Vehicle | `firmware/rccar/` | ESP32-S3 with PSRAM (the camera shares the board) |
| Phone dongle | `firmware/rc-link/` | ESP32-S3 (native USB) |
| Handset | `firmware/rc-remote/` | ESP32-S3 |

Both controllers send the *same* frame at the same rate. The car cannot tell
which one is driving it, and that is intentional — there is one control path to
reason about, not two.

### Why the phone needs a dongle

A phone cannot speak ESP-NOW. It has a Wi-Fi radio, but no way to send raw
802.11 action frames and no way to avoid association. Driving over an
associating link means every roam, background scan and power-save decision the
phone makes arrives as a steering delay.

### Why the dongle is a network adapter, not a serial port

CDC-ACM is the obvious choice, and it is the one that needs a native Android
module — React Native cannot open a USB serial device — plus a config plugin, a
development build, and a permission dialog on every reconnect.

CDC-NCM instead. The phone sees a USB Ethernet adapter, and the app speaks
ordinary HTTP and WebSocket to a fixed address. The same client code that would
talk to the car over Wi-Fi talks to the dongle over USB; only the address
changes.

---

## 4. Safety

None of this is an aircraft, so the failure modes are cheap. Three of them are
still worth stating, because each was a decision rather than an accident.

### The failsafe brakes

On link loss the car **brakes** rather than coasting, **holds** its steering
rather than centring, and puts the **hazards** on.

- Coasting keeps the car's momentum and direction, and the reason the link
  failed may be that it has gone somewhere it should not be.
- Centring mid-corner is itself a swerve — a car that straightens up under
  braking leaves the corner rather than stopping in it.
- The hazards are the only outward sign that a car stopped because something
  went wrong rather than because somebody stopped it.

### The limit lives on the vehicle

Mode is on the wire; the **ceiling is applied by the car**. A limit enforced by
the thing holding the joystick is a suggestion — it is on the wrong side of the
link, and the vehicle is the part with the motor. A handset with a
miscalibrated stick, or a modified phone app, cannot exceed what the car has
been told to allow.

| Mode | Ceiling | Reverse |
| --- | --- | --- |
| Immobilised | 0 | — |
| Beginner | 30% | locked |
| Normal | 70% | yes |
| Sport | 100% | yes |

### It will not drive away on its own

The throttle has to pass through neutral before the car will move, and that
re-arms after **every** link loss. Without it, a handset switched on with the
trigger already pulled drives the car away the moment its battery goes in.

### And two smaller ones

Sequence numbers reject stale *and* replayed frames — a recorded "full
throttle" sent back later carries a sequence the car has already passed. And
both H-bridge legs are written low before the pins become outputs, because a
floating input on a driver with an internal pull-up is a motor that runs before
`setup()` has decided anything.

---

## 5. Two things the firmware refuses to invent

Worth calling out, because in both cases producing a plausible number would
have been easier than not.

**Link quality, not RSSI.** This core's ESP-NOW callback hands over the
sender's address and the payload and nothing else — there is no per-packet
signal strength to read. Rather than report a number the board cannot measure,
quality is counted from sequence gaps: how much of what was sent actually
arrived. That is arguably the better metric anyway. RSSI says how loud the
transmitter is; this says how much of it was heard.

**Speed reads zero without a wheel sensor.** It is not derived from throttle.
A number derived from the command is not a measurement — it is the command
wearing a different label, and it would read full speed with the wheels off the
ground.

---

## 6. Where the car appears

The console and the app both show the car and neither offers a throttle. Both
reach it through the cloud, where a command can be seconds old; a slider there
would be a throttle with no failsafe behind it and nobody watching the vehicle.

What they do offer is the thing a screen is better at when it is not driving:
the state of the car, and the **immobiliser** — taking it away from whoever
currently has it.

---

## 7. Status

| Piece | State |
| --- | --- |
| `rc-protocol.h` | Complete. 26 tests in `tests/rc-link-protocol.test.ts`. |
| `firmware/rccar/` | Complete, compiles at 15.3% RAM / 32.0% flash. |
| `firmware/rc-remote/` | Complete, compiles at 13.4% / 21.1%. |
| `firmware/rc-link/` | Radio half complete (13.2% / 20.2%). **USB half not implemented.** |
| Console + app | Status and immobiliser. |
| Camera stream | Not implemented. |

**None of it has run on hardware.** Everything above is compiled and unit
tested; nothing has been driven.

The dongle's CDC-NCM interface and its HTTP server need TinyUSB's NCM class
brought up against the ESP32-S3 and verified with a phone on the other end of a
cable. `rcLinkOnPhoneCommand()` is the seam it plugs into. It was left as a
stated gap rather than a stub, because a stub would compile, enumerate as
nothing, and be indistinguishable from a dongle that is simply not plugged in.
