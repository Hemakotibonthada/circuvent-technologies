# 28 — WaterTank Duo and the tank radio link

The WaterTank Duo is **two devices**, not one. This document explains why, what
travels between them, and what happens when that link fails — which is the part
that matters, because the failure is silent by nature.

---

## 1. The two units

| Unit | Where it lives | Power | Talks to |
| --- | --- | --- | --- |
| **Tank sensor** (`firmware/watertank-sensor`) | On the overhead tank | Battery | The starter, by LoRa |
| **Starter** (`firmware/watertank`) | At the pump | Mains | The tank sensor by LoRa, the platform by Wi-Fi/MQTT |

Only the starter appears in the apps. The sensor has no Wi-Fi, no MQTT and no
device id of its own — it is a peripheral of the starter, and its health is
reported through the starter's state.

```
   ┌──────────────────────────┐
   │  Tank sensor (roof)      │
   │  ultrasonic + LoRa       │   battery, deep sleep,
   │  reports every 30 s      │   wakes only to measure and send
   └───────────┬──────────────┘
               │  LoRa 433 MHz, signed, sequence-numbered
               ▼
   ┌──────────────────────────┐
   │  Starter (pump room)     │
   │  LoRa + Wi-Fi + relay    │──── MQTT ───▶ control plane ───▶ apps
   │  sump sensor wired       │
   └──────────────────────────┘
```

---

## 2. Why it was split

The original product wired an ultrasonic sensor from the roof tank down to the
controller. That cable was the least reliable part of the product:

- Ultrasonic distance is measured by timing an echo in **microseconds**. Carrying
  that signal tens of metres, usually cable-tied alongside mains, is asking for
  trouble.
- The run is a **lightning path** straight into the controller.
- It is a drilling job through several floors that most electricians would
  rather not quote for.

Moving the sensor onto the tank removes all three.

## 3. Why LoRa at 433 MHz

The obstacle is a reinforced concrete roof slab, sometimes several floors of it.

- **2.4 GHz** (nRF24, BLE, Wi-Fi) is heavily attenuated by wet concrete, and
  would be competing with the Wi-Fi the starter itself depends on.
- **433 MHz** penetrates far better, and LoRa's spreading gain adds tens of dB of
  link budget on top.

That margin is what turns "works on the bench" into "works from the roof of a
four-storey building".

The cost is bandwidth, which does not matter here at all: a tank level is a
couple of bytes and it changes over minutes.

---

## 4. The rule that matters

> **A reading that has stopped arriving must never look like a reading that is
> still arriving.**

If the radio goes quiet and the starter keeps acting on the last level it heard,
both directions cause damage:

| Last heard | What happens | For how long |
| --- | --- | --- |
| "tank low" | Pump runs into an already-full tank and overflows it | Until somebody notices the water |
| "tank full" | Pump never starts, tank runs dry | Until somebody has no water |

Neither raises an error anywhere. The controller behaves exactly as instructed
by data that stopped being true hours ago.

So freshness is enforced in one place — `cvTankReadingFresh()` in
`firmware/CircuventDevice/CvTankLink.h` — and **every** decision that could move
water goes through it.

### The three states

| Age of last reading | State | Pump | Apps show |
| --- | --- | --- | --- |
| under 6 reports | **live** | Auto-fill runs normally | The level |
| 6 reports to 10× that | **stale** | Auto-fill paused; a running pump is stopped | The level, marked "last known" |
| beyond that (min 30 min) | **lost** | Auto-fill paused | No level at all — "—" |

**Why six reports and not a fixed three minutes.** The report interval is
settable from the app, so the window is expressed as *a number of missed
reports*, not a duration. A hard-coded three minutes turns that setting into a
trap: pick a five-minute cadence to save battery and the link would be
permanently stale, the pump would never run, and the app would report a dead
sensor that is transmitting perfectly.

**Why six.** One lost packet is ordinary on any radio link — a passing vehicle,
a neighbour transmitting, a door closing on the line of sight — and treating a
single miss as a fault would have the pump refusing to run several times a day.

**Why the level disappears eventually:** there is a real difference between "a
few minutes old, probably still roughly true" and "from yesterday, tells you
nothing". A dashboard reading "12%" gives no hint the figure is stale, and the
obvious response to 12% is to start the pump. The abandon window scales too, but
never below thirty minutes — at a ten-second cadence six misses is one minute,
and blanking the display after a minute of ordinary interference is worse than
useless.

### Where this is enforced

| Layer | File | What it does |
| --- | --- | --- |
| Firmware | `firmware/CircuventDevice/CvTankLink.h` | `cvTankReadingFresh()` — the definition |
| Firmware | `firmware/watertank/watertank.ino` | `setPump()` refuses to start; a running pump is stopped; auto-fill is gated |
| Web | `src/lib/tank-link.ts` | `readTankLink()` — what the console may display |
| Mobile | `mobile/src/tank-link.ts` | Deliberate duplicate; the app is a separate project |

Three copies of one rule, so all three are pinned:

- `tests/tank-link-parity.test.ts` parses the C header and asserts the
  thresholds match the TypeScript, and that the firmware still contains the
  gates.
- `tests/tank-link-app-parity.test.ts` runs both TypeScript copies over the same
  states and fails if they disagree.

If the app's threshold were longer than the firmware's, the app would show a
healthy level and an idle pump while the controller had silently stopped
filling. Nothing else would catch that.

---

## 5. The packet

Fixed 24-byte struct, defined once in `CvTankLink.h`:

| Field | Purpose |
| --- | --- |
| `magic`, `version` | Cheap filter before spending time on the MAC |
| `msgType` | Reading or pairing offer |
| `pairId` | Which sensor/starter pair, so neighbours do not cross |
| `levelMm` | Sensor-to-water distance. **Raw**, not a percentage |
| `batteryMv` | Sensor cell voltage |
| `flags` | Sensor fault, low battery, tamper |
| `seq` | Rolling counter — replay protection |
| `mac` | Truncated HMAC-SHA512 |

**Why raw millimetres, not a percentage:** tank geometry (empty distance, full
distance, capacity) is configured on the starter and can be changed from the
app. If the sensor sent a percentage, every recalibration would mean reaching a
battery unit on a roof.

### Authentication

An unauthenticated packet on an open band is an invitation: anyone in range
could assert "tank empty" and run a neighbour's pump dry, or "tank full" and
leave them without water.

Every packet carries an HMAC keyed by a secret shared at pairing, truncated to
8 bytes — 64 bits against forgery, which keeps the packet inside one short LoRa
frame. Airtime is what costs battery.

`crypto_auth` is not in the bundled tweetnacl build, so HMAC is constructed from
`crypto_hash` (SHA-512) in `CvTankLink.h` using the standard RFC 2104
construction. That was preferred over adding primitives to a library compiled
into **every device we sell**.

MACs are compared in constant time. `memcmp` returns as soon as it finds a
difference, which leaks how many leading bytes were right — enough to recover a
valid MAC one byte at a time, and a radio attacker can retry indefinitely.

### Replay protection

The receiver refuses any packet whose sequence is **at or below** the highest it
has accepted. Equal is refused as well as lower: LoRa receivers do hear the same
transmission twice, and counting a duplicate as a fresh reading would let a
recording of one packet hold the link "alive" forever while the real sensor is
flat or removed.

The last accepted sequence is persisted on the starter, so a power cut cannot
reopen the replay window. The sensor's counter survives deep sleep in RTC memory
and jumps forward by 1000 after a power cut, because the flash copy lags what
was actually transmitted.

---

## 5a. The downlink (starter → sensor)

The link started out one-way, which cost more than it saved. The sensor could
not be told anything, so changing how often it reports, asking it for a reading
now, or even confirming that pairing had worked all meant physically retrieving
a unit from a roof.

Pairing was the worst of it: the sensor transmitted for sixty seconds and then
declared itself paired **whether or not anything had heard it**. An installer
got a confident "done" indication, climbed down, found nothing worked, and
climbed back up.

### How a sleeping unit is reachable at all

The sensor listens for **400 ms immediately after it transmits**, and only then.
This is the LoRaWAN Class A shape, for the same reason: the one moment a battery
device can cheaply be reached is right after it has spoken, because the radio is
already powered and the far end knows to within milliseconds when to reply.

Receiving draws roughly a tenth of what transmitting does, so that window costs
a fraction of the transmission before it.

The starter therefore **queues** a downlink and fires it the instant it accepts
a reading. Sending at any other time transmits into a unit that is already
asleep — which looks identical to a broken radio from the app.

### What it can say

| Instruction | Effect |
| --- | --- |
| `PAIR_ACK` | "I have you." The sensor stops its pairing window and shows three slow blinks; without an ack it shows a rapid failure blink instead of claiming success |
| `MEASURE_NOW` | Take a reading and send it immediately, rather than at the next scheduled report |
| `IDENTIFY` | Blink, so an installer can tell one unit from another |
| `reportIntervalS` | Change the cadence, clamped to 10–900 s |

Downlinks are authenticated exactly like uplinks, with **their own sequence
counter** — a shared counter between two directions would have each side
rejecting the other's traffic as replays. The sensor refuses a replayed
downlink, because each replay costs it a transmission, and on a battery that is
the attack worth defending against rather than the instruction itself.

A queued downlink is **cleared once sent**, whether or not the sensor heard it.
Retrying forever would fire on every reading, and a repeated "measure now" would
flatten the battery of a unit nobody can reach. The app can ask again.

Bounds on the interval are not about an attacker — the downlink is
authenticated. They are about a bug or a fat-fingered value bricking a unit that
is physically hard to get to. Zero would mean "never report", which is
indistinguishable from a dead sensor and cannot be undone without a ladder.

---

## 6. Pairing

1. In the app, open the starter and press **Pair sensor**. This opens a
   60-second window on the starter.
2. Press the button on the tank unit.
3. The starter beeps twice, and the **tank unit gives three slow blinks** to
   confirm it was acknowledged. Rapid blinking means nothing heard it — check
   range before climbing down.

**Be honest about the limitation.** The key is transmitted in the clear during
that window. It is bounded to 60 seconds, must be started by hand on the sensor,
and the starter only listens after its owner opened the window from an
authenticated app session — so an attacker would have to be in radio range
during those exact seconds. That is the standard trade for pairing without a
second channel, and it is written down in `CvTankLink.h` rather than left for
somebody to discover.

**Forget** clears the key and stops the starter accepting anything, which is what
you want when a sensor is replaced or a unit changes hands.

---

## 7. State published by the starter

New keys alongside the existing ones:

| Key | Meaning |
| --- | --- |
| `ohPct` | Overhead fill %. **`-1` means no current reading** |
| `ohLitres` | Litres, or `-1` |
| `rfLinkUp` / `ohLive` | Is the reading fresh enough to act on |
| `rfAgeS` | Seconds since the last accepted packet, `-1` if never |
| `rfRssi` | Signal strength, dBm |
| `rfRejected` | Failed-MAC or replayed packets. A rising count means someone is transmitting at you |
| `sensorPaired` | Has a sensor been paired |
| `pairing` | Is the pairing window open |
| `radioReady` | Did the LoRa module initialise |
| `tankBattPct` | Sensor battery %, `-1` if unknown |
| `tankBattLow` | Sensor says its cell is low |
| `sensorIntervalS` | How often the sensor reports |
| `downlinkPending` | An instruction is waiting for the sensor's next transmission |

**`-1` rather than omitting the key** is deliberate: a client holding a previous
value is actively told to drop it, instead of quietly leaving a stale number on
screen.

### Commands

| Command | Effect |
| --- | --- |
| `{"action":"pair"}` | Open the 60-second pairing window |
| `{"action":"unpair"}` | Forget the sensor |
| `{"action":"readNow"}` | Ask the sensor for a fresh reading. **Queued**, not immediate — it goes out on the back of the sensor's next report |
| `{"action":"identifySensor"}` | Blink the tank unit's light |
| `{"sensorIntervalS": 60}` | Change the report cadence, 10–900 s |

Pairing is deliberately **not** offered as a scene or automation action. A
schedule that opened a pairing window would be a standing invitation.

---

## 8. Installing

**Tank sensor:** mount on the tank lid, transducer pointing straight down at the
water, clear of the inlet stream — an echo off falling water reads as a full
tank. Keep it out of direct sun.

**Starter:** at the pump, as normal. Keep the LoRa antenna vertical and away
from the contactor.

**Check the link before leaving.** The app shows signal strength in dBm:

| RSSI | Meaning |
| --- | --- |
| better than −100 | Comfortable |
| −100 to −115 | Works, little margin — reposition the antenna |
| worse than −115 | Expect dropouts |

If the level does not appear, the app says which of the three things is wrong:
not paired, paired but nothing heard, or heard but out of range.

---

## 9. Battery

The sensor wakes on its report interval, measures, transmits, listens briefly
and sleeps. A LoRa transmission costs far more than the reading around it, which
is why reporting is deliberately infrequent — the tank does not change quickly,
and a pump filling 1000 litres takes many minutes.

The interval is settable from the app (10–900 s), so the battery-against-
responsiveness trade can be made per installation without getting the unit off
the roof. The freshness window scales with it automatically.

`tankBattLow` is raised at 3.45 V so the app can warn before the link dies
rather than after. A low battery is the only tank finding that arrives **before**
the outage — see `src/lib/tank-health.ts`.

---

## 10. Compiling

```bash
cd firmware/watertank-sensor && python -m platformio run
cd firmware/watertank        && python -m platformio run
```

Both pull `sandeepmistry/LoRa`. The sensor also pulls `CircuventDevice`, but
only for `CvTankLink.h` and tweetnacl — it has no use for Wi-Fi or MQTT, which
is why it builds to about a quarter of the flash the starter needs.

`CvTankLink.h` wraps its tweetnacl include in `extern "C"` itself, so the sensor
can use it without pulling in the whole device library.

---

## 11. If you change the protocol

1. Bump `CV_TANK_PROTO_VERSION`. Receivers reject anything else, so a
   half-upgraded pair fails loudly instead of misreading each other's fields.
2. Update both firmwares.
3. Run `npx jest tests/tank-link-parity tests/tank-link-app-parity`.
4. Remember the fleet updates over the air and **the two units update
   separately**. A sensor on a roof may be a version behind its starter for a
   while — which is exactly what the version check is for.
