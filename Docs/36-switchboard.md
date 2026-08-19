# 36 — Configurable Switchboard

One firmware for every board we build. How many gangs, which pin drives which
relay, whether each channel has a capacitive pad, a retrofitted rocker switch or
no local control at all — none of it is compiled in. An engineer commissions it
on site, at the open wall box, from the console.

---

## 1. Why this replaces a sketch per shape

`touchboard` (3-gang) and `touchboard-8` are the same firmware written twice,
because the gang count and pin map were `#define`s. Every new shape a customer
asked for — five gangs, three pads and two rockers, a relay in a ceiling void
with no switch near it — meant another file to keep in step with the others, and
the fleet ended up with builds that had drifted apart.

The channel fields are unchanged: `g1`..`g8`, exactly as on the fixed boards, so
every scene, automation and voice trait that already understands a gang keeps
working. What differs is that only the first `state.gangs` of them exist, and
which ones those are was decided by a person on a ladder.

**The apps read the count off the device.** A UI that assumes a size is how a
gang ends up either missing from the app or present-but-dead.

---

## 2. What it costs, and the code that pays for it

A fixed sketch has its pin map checked by the compiler — `touchboard-8` refuses
to *build* if a pad lands on GPIO12. Here the pin map arrives as data, from a
person, over an app.

So the same rules are enforced at runtime, in three places, because each one can
be absent:

| | |
| --- | --- |
| `src/lib/switchboard.ts` | refuses it while the engineer is still standing there |
| the control plane | because a client is not to be trusted |
| `firmware/switchboard` | the only copy certainly present |

`tests/switchboard-firmware-parity.test.ts` holds them together. If they
disagree, the app blesses a layout the board will reject — or worse, the board
accepts one the app would have caught.

### The pins that are refused outright

| Pin | Why |
| --- | --- |
| **6–11** | wired to the SPI flash the firmware executes from |
| **12** | MTDI. Its level at reset picks the flash regulator voltage |
| **0** | the BOOT strap, and this project's reset button |
| **34–39** as a relay | input-only: `pinMode(OUTPUT)` is accepted and does nothing |

**GPIO12 is the one that matters most.** A board commissioned onto it works
perfectly on the bench, goes into the plaster, and never boots again after the
first power cut — with nothing in any log and no way to reach it. A capacitive
pad is a plate of copper behind glass, and a resting palm, a wet cloth or damp
plaster is enough to hold it high through an outage.

**Input-only as a relay is the quietest.** The app switches, the device agrees,
and the light does not move. Nothing reports an error at any layer.

### The pins that are allowed with a word

GPIO5 must read high at reset — which an active-low relay satisfies for free,
because "off" *is* high. That is why `touchboard-8` deliberately puts a relay
there. GPIO2 and GPIO15 are straps only sampled to choose download mode, which
also needs GPIO0 held low, and GPIO0 is the reset button. GPIO1/3 are the serial
console.

These **warn rather than refuse**. An engineer looking at real hardware knows
things the tool cannot, and a tool that refuses a legal choice gets worked
around — usually by someone disabling the checking entirely.

---

## 3. A refused layout drives nothing

Half a switchboard is worse than none, because the gangs that do work make it
look commissioned.

- The layout is parsed into a **scratch array** and only committed once the
  whole thing is safe.
- An uncommissioned or refused board **claims no pins at all**.
- The reason is published (`layoutOk`, `layoutError`) so the engineer sees it on
  the spot rather than discovering a dead gang after the covers are back on.
- Accepting a new layout **restarts** the board, so every pin starts from a
  known state instead of being re-purposed underneath a running sketch.

---

## 4. The engineer's tools

**Blink this one.** The most useful button on the screen. An engineer at the
board cannot tell which relay is the porch light without switching it and
walking outside; this flashes the load a few times so somebody can call up the
stairs. It is non-blocking — a board that stops answering while it demonstrates
itself is a board you cannot then command — and it puts the channel back exactly
as it found it.

**Templates.** 1/2/3/4/8-gang starting points, plus a retrofit layout for a box
with existing rocker switches, where pads would mean replacing them. Every one is
edited on site; the point is checking eight pin numbers that are already right
rather than typing eight on a ladder.

**All problems at once.** `validateLayout` returns a list rather than throwing on
the first fault, because somebody up a ladder wants to fix it in one pass.

---

## 5. Peer to peer

Each channel can be bound to a gang on another board — `{action:"bind", gang:3,
target:"<peer-id>:g2"}` — over the encrypted ESP-NOW bus in `CvHomeLink`.

The hall switch that kills the bedroom lights therefore keeps working with the
broadband down, which is exactly when somebody is standing at a switch wondering
why it stopped. Scenes (`all-off`, `away`, `night`, `all-on`) are applied
locally for the same reason; a scene the board does not understand is ignored
rather than guessed at.

Without a provisioned home key there is **no local bus at all**. A missing key
must not mean an unauthenticated bus anybody in the stairwell can drive.

---

## 6. Restore policy

Per channel: **off**, or **last**.

There is deliberately no "always on". Everything in this codebase that restores
an output restores what the owner left — a board that came back with channels on
because a setting said so is the "every light in the house came on by itself at
3am" failure, and it would be commissioned once and blamed on the hardware
forever. A load that must always be live does not belong on a switched channel.

Restoring is staggered, for the same reason a bulk change is: eight coils
energising on one edge is roughly half an amp arriving at once, before the
contacts even close on their loads. That sags the rail the ESP32 runs on, and
the reboot lands on the "all on" press — making that button look like the broken
thing.

---

## 7. Commands

```
{action:"commission", layout:"<encoded>", backlight:N}
{action:"identify", gang:N}
{action:"bind", gang:N, target:"<peer>:<field>"}
{action:"recalibrateTouch"}
{action:"homekey", key:"<64 hex>"}
{action:"set", g1..gN:bool, all:bool, backlight:N, scene:"..."}
```

The layout string is `relay:input:kind:restore:type:name` per channel, joined by
`;`. `encodeLayout()` in `src/lib/switchboard.ts` produces it and strips `;`,
`:` and `|` out of names — a channel called "Hall; Porch" would otherwise split
into a second channel.

`commission` projects **nothing** in the command map. The board validates the
layout itself and reboots into it, so the only honest answer is what it reports
afterwards — a console optimistically showing eight gangs for a layout the
device threw out is exactly the wrong thing at the moment an engineer needs the
truth.
