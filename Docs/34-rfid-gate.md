# 34 — RFID Gate

A long-range UHF reader on the driveway scans windshield tags over Wiegand and
drives a motorised barrier. The device decides locally from a list in NVS; the
platform keeps that list current, records who came through, and issues
time-boxed guest passes.

---

## 1. Where the decision is made, and why

**On the device.** A driveway box on the end of a long cable run is offline
often enough that "ask the server" is not an access-control strategy. It holds a
flat list of tag numbers and opens the barrier for anything on it.

**Everything that gives the list meaning is on the platform** — whose car it is,
until when, on which days. The gate has no clock it can trust (no RTC, NTP only
while the network is up), so a rule it cannot evaluate is a rule it would
silently ignore.

So the platform pushes **the set of tags that may pass right now**, and pushes
it again as rules come in and out of force — once a minute, and immediately when
anything is edited.

The consequence worth stating: a contractor's tag valid until 17:00 stops
working at 17:01 *because it is no longer in the list*, not because the gate
checked the time. That is what makes it hold when the network is down.

**The whole list is replaced, never patched.** A device that missed a single
removal — offline for a minute, a dropped message — would go on admitting a
revoked vehicle, and nothing would notice, because the platform believes it sent
the removal.

---

## 2. Four things that were wrong

### Both relays were energised from power-up

The relay boards are opto-isolated and negative-trigger: pulling the GPIO **low**
energises the coil. The sketch used bare `pinMode(OUTPUT)` — which leaves the
latch low — and treated `HIGH` as "on".

So from the instant it powered on, the gate controller was handed a continuous
**OPEN *and* CLOSE**, and every "pulse" released a relay for 600 ms rather than
closing it. Every polarity and every edge was inverted.

`cvRelayInit`/`cvRelayWrite` exist for exactly this and were not used. They are
now — which also means the barrier is not commanded at all during the first
moments of boot.

### A noisy frame could open the barrier

Wiegand runs tens of metres up a driveway on a pair of open-drain lines, past a
gate motor that is a large inductive load. The format carries two parity bits
precisely because of that run.

Nothing checked them. Worse, anything from 24 to 37 bits was accepted and masked
down to its low 24 — so a corrupted read did not *fail*, it silently became a
**different card number**. Usually that number is in nobody's list and a valid
tag appears to be rejected; occasionally it is in somebody's.

Now: 26-bit parity is verified, 34-bit is decoded properly, and anything else is
counted in `badFrames` and discarded. A rising `badFrames` is the only way
anybody would ever discover a cable sharing a duct with the gate motor.

The parity rule cannot be tested on hardware here, so it is proved in
`platform/api/src/gate/access.test.ts` against frames built from known facility
and card numbers — and against **every one of the 26 single-bit corruptions**.

### A parked car flooded the platform

A UHF reader sees a windshield tag continuously while it is in range, many times
a second. Every read published state, wrote a telemetry row, and re-armed the
auto-close timer.

One car idling near the gate produced thousands of database rows and a barrier
that would not close. Same-tag reads are now ignored for five seconds, and
`openGate()` no longer re-arms the timer for a gate that is already open — the
loop detector holds a gate open, because it is the thing that knows a vehicle is
underneath it.

### The barrier's position was a belief

`OPEN_LIMIT` was wired, configured as an input, and **never read**.

A barrier whose motor has jammed or lost power reported `open` with total
confidence, and the app, the automations and the guest-pass flow all believed
it. `barrier` now reports `closed`, `opening`, `open` or **`jammed`** — the last
meaning the device commanded a move and the limit switch disagrees for longer
than the gate takes to travel.

---

## 3. Tags

| Field | |
| --- | --- |
| `tag` | the number the reader reports, after parity and format decoding |
| `label`, `vehicle` | who it is, and the registration |
| `validFrom` / `validTo` | a window |
| `days` | 0 = Sunday; empty means every day |
| `fromMinute` / `toMinute` | minutes from local midnight |

A window whose end is **before** its start spans midnight — 22:00 to 06:00 is a
night shift, not a mistake, and treating it as one would lock out exactly the
people most likely to be arriving in the dark.

Enrolment accepts either the decoded number or the **facility/card pair printed
on the tag**, because both are how somebody actually has the number in front of
them. `POST {facility: 42, card: 1234}` stores `2753746`, which is what the
reader will report.

Re-enrolling the same physical tag **updates** the row rather than adding a
second. Two rows for one tag is how a revocation stops working: the old
permissive rule is still there, and the pushed list is the union.

---

## 4. The access log

A reader that admits the right cars and cannot say which ones is a keypad with
extra steps. "Who came in last night" is the question that gets asked, and it is
the reason anybody fits one.

Every scan is recorded with a reason:

```
—              tag=999999   allowed=false  reason=unknown-tag
Old delivery   tag=555002   allowed=false  reason=expired
Resident car   tag=2753746  allowed=true   reason=allowed
```

The device only knows "not in my list". The platform re-runs the decision to say
**why**, and can name the tag — "Old delivery expired" rather than an
unexplained refusal.

Where the two disagree, **the device's outcome is what is recorded**. If the
barrier opened, it opened. A log that quietly rewrote history to match the rules
would be worse than useless the one time it mattered — and a mismatch is itself
worth seeing, because it means the pushed list is stale.

Only **denials** reach the activity feed. A gate admitting forty cars a day would
bury everything else a household is told; a refusal is rare and is the one
somebody wants to know about.

Opening from the app goes through `/gate/devices/:id/open` so it appears in the
log too — otherwise the record shows four cars on an evening when six came in,
and the log quietly stops being something anybody trusts.

---

## 5. The API

```
GET    /gate/devices/:id/tags
POST   /gate/devices/:id/tags        {tag | facility+card, label, vehicle, days, ...}
DELETE /gate/devices/:id/tags/:tagId revokes, and pushes immediately
GET    /gate/devices/:id/events      ?limit=&denied=1
POST   /gate/devices/:id/sync        push now
POST   /gate/devices/:id/open        open, and record it
```

Guest passes remain in `routes/gate.ts` and are unchanged. A pass is a one-off
code for somebody without a tag; a tag is a standing permission. They look
similar and answer different questions.

---

## 6. Commands the device accepts

```
{action:"open"}      {action:"grantOpen"}     {action:"close"}
{action:"setTags", tags:"100,200,300"}        whole list, replaces
{action:"set", mode:"auto"|"manual", autoCloseSec:N}
{action:"set", addTag:N}  {action:"set", removeTag:N}
```

`auto` defaults to **on** after a power cut. It is a mode, not a load — it only
decides whether a *scanned* tag opens the barrier — and a gate that came back
with it off leaves residents sitting outside their own gate wondering why their
card stopped working. `tests/firmware-power-restore.test.ts` records that
exception explicitly.
