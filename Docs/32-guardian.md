# 32 — Guardian personal safety beacon

A button sewn into a shoe, a GPS receiver and a SIM. Held for thirty seconds,
it tells the wearer's people and the nearest police station where they are — by
SMS and voice call over its own SIM, with no phone, no Wi-Fi and no internet
involved.

The phone matters exactly once: to set it up.

---

## 1. The three things it has to get right

Everything in the design follows from these, and each of them was wrong in the
firmware that existed before.

### It must not cry wolf

The button is in a shoe. It is stood on, walked on and flexed all day. The
previous firmware fired on **a single press with a one-second debounce**, so
every footfall a second apart sent a full SOS: buzzer, SMS, and a voice call to
the wearer's mother.

A safety device that does that comes off the foot within a day, and then it
protects nobody. That is the real failure — not the individual false alarm.

The trigger is a **thirty-second continuous hold**, because nothing a shoe does
on its own lasts thirty seconds unbroken. `tests/guardian-hold.test.ts` runs
twenty minutes of simulated walking — about 1,300 footfalls — through the
detector and asserts it never fires.

### It must work with no phone and no Wi-Fi

The wearer is, by assumption, somewhere bad, and the phone is the first thing
taken. So the contacts, the police number, the message and the modem are all on
the device, in NVS. Once provisioned, nothing in this document is required for
it to raise an alarm.

That is why the app is a setup tool and not a dependency.

### It must not lie about where somebody is

`0,0` is a real place — in the Gulf of Guinea — so a map pin drawn from it looks
exactly like a genuine one. The old firmware sent `Live location: 0.000000,
0.000000` from any device that had never seen a satellite.

If there is no fix, the message says so and asks the recipient to call. A stale
fix is sent with its age attached, never labelled live.

---

## 2. The pin the panic button must not be on

It used to be **GPIO0** — which is also what `setResetButton(0)` watches, where
a 3-second hold clears the Wi-Fi credentials and an 8-second hold factory
resets.

A thirty-second hold passes straight through both.

The gesture this product is built around would have wiped the device's identity
and every emergency contact on it, twenty-two seconds before it was due to call
for help — silently, and only on the day somebody actually needed it. It is not
a fault anybody finds in testing.

The button is now on GPIO13, and `guardian.ino` carries a compile-time guard:

```c
#if SOS_BTN == RESET_BTN
#error "SOS_BTN must not be the reset pin: a 30s hold would factory reset the device instead of raising an alarm."
#endif
```

---

## 3. The gesture

| | |
| --- | --- |
| Hold | 30 s continuous (configurable 10–120 s) |
| A release | resets progress to **zero**, not "reduces it" |
| A break under 120 ms | is contact noise, not a release |
| At boot | the button must be seen released before it will arm |

Two of those need explaining.

**Why a release resets completely.** Walking is a sequence of presses. Anything
that accumulated them would fire after a brisk walk to the bus stop.

**Why short breaks are forgiven.** A jolt, a stumble or the flex of a sole can
break the circuit for a few milliseconds while the wearer is very deliberately
pressing. Requiring thirty seconds without a single microsecond of bounce would
mean the button never works when it matters. A footfall releases for *hundreds*
of milliseconds, so the two are nowhere near each other.

**Why it arms on release.** A button compressed at power-up — a shoe with
something resting on it, or the wearer simply standing — is not somebody asking
for help. Without this rule, putting a boot on and switching the device on would
start the clock.

The rules live in three places and are held together by
`tests/guardian-hold-app-parity.test.ts`:

| Copy | Job |
| --- | --- |
| `firmware/CircuventDevice/CvHoldButton.h` | decides |
| `src/lib/guardian-hold.ts` | explains and validates, in the console |
| `mobile/src/guardian-hold.ts` | explains and validates, on the phone |

### The bounds are a safety limit, not a preference

Under **10 s**, ordinary walking performs the gesture. Over **120 s** is longer
than somebody being attacked can hold a button. Both apps refuse values outside
that range and the firmware clamps as a last line.

---

## 4. Who gets told

In order, from the device itself:

1. **Every contact**, by SMS. Up to four, stored in NVS.
2. **The nearest police station**, by SMS — or the national emergency number if
   no station has been resolved.
3. **The first contact**, by voice call. A ringing phone is noticed at 3am and
   a text is not, which is why the order of the contact list is a real decision
   and the setup screen says so.

Then, every two minutes while the incident runs, a fresh position to the first
contact — so somebody following on foot is not working from where the wearer
used to be.

### There is no cancel window

The obvious design is to wait ten seconds after the hold completes so a mistake
can be undone. It is rejected: the wearer has already held a button for thirty
uninterrupted seconds, which *is* the safeguard, and a delay costs exactly the
person who cannot afford it.

A false alarm is undone afterwards from the app, which sends a stand-down
message to everyone who was alerted. Somebody who received "I need help" and
then heard nothing is left in the worst position of all.

### It is silent by default

A device hidden in a shoe is hidden for a reason: the wearer does not want the
person they are afraid of to know they have called for help. A buzzer announces
it. `silent` can be turned off for a wearer who wants the deterrent instead — a
child who is lost rather than threatened, where being found is the point.

---

## 5. How "nearest police station" works offline

The device has GPS and a modem and nothing else — no map, no directory, often no
data. It can tell you where it is and it can text a number, but it cannot work
out *which* number.

So:

```
device reports position ──▶ platform resolves nearest station
                                      │
                            {action:"setPolice", number}
                                      │
                                      ▼
                         device caches it in NVS
                                      │
                  ... and uses it when it has only SMS
```

The cache is what makes an offline alarm reach the right station. A wearer who
has travelled two cities away carries the wrong number until the sweep runs,
which is every five minutes — well inside the distance anybody covers on foot,
and they always have *a* working number in the meantime.

`platform/api/src/guardian/nearest.ts` is pure and tested. Three things it
deliberately does:

- **Refuses `0,0`.** It passes every range check and means "no fix".
- **Refuses anything beyond 60 km.** The honest answer is then "we do not know a
  station near this person", which is what makes the device fall back to the
  national number. Silently texting a station 400 km away would look like the
  system had worked.
- **Will not cross a border** when a country is given, and skips stations with
  no phone number when it needs one to call.

Only pushes when the number actually *changes* — the device is on a metered
connection and each write wears NVS.

---

## 6. Setting one up

From the app or the console: add at least one contact in full international form
(`+919876543210`), set the national emergency number, save.

The number format is validated rather than trusted. A number stored as
`9876543210` is dialled by the modem as a local number from wherever the SIM
happens to be roaming — a contact that cannot be reached, silently, until the
day it matters.

`ready` is published by the device and both apps refuse to call it set up
without it. An unprovisioned Guardian is otherwise indistinguishable from a
working one: online, charged, a GPS fix.

### Prove it works

**Send test** messages the wearer's own contacts, saying it is a test. It
deliberately does *not* dial a police station — doing that to check the wiring is
how a product gets its emergency numbers blocked.

A safety device nobody has ever tested is a safety device nobody should trust,
and the only alternative to this button is staging an emergency.

---

## 7. Knowing it will work

`ready` originally meant only "somebody typed in a phone number". That is not
the same as being able to call for help, and the difference is invisible: a
beacon with no signal, no SIM, or a prepaid account that quietly expired is
online, charged and reporting a position, and the button does nothing useful.

So the device polls and publishes what the modem says about itself:

| Field | Meaning |
| --- | --- |
| `csq` | 0–31 signal, **99 = the modem does not know** |
| `reg` | 1 registered, 5 roaming; anything else cannot send |
| `sim` | whether there is a SIM it can use |

`99` is the trap: it passes every range check and would render as full bars on
a beacon with no coverage at all. `signalBars()` returns null for it.

`src/lib/guardian-health.ts` turns all of that into one banner and a set of
findings, ordered by what stops an alarm hardest — no recipients beats no
network beats a weak signal. Being **offline is not a fault**: a beacon out of
Wi-Fi range is the normal case and can still raise an alarm over its SIM, so it
is said out loud rather than shown as a dead device.

A low battery now texts a contact once, before it dies, with hysteresis so a
cell hovering at the threshold cannot message somebody's mother every ten
minutes.

---

## 8. Texting the beacon

A trusted contact can send it a text. This is the strongest form of working
without the app: a parent with an ancient handset, no data and no account can
find their child with nothing in between working at all — not our servers, not
their internet.

| Text | Reply |
| --- | --- |
| `WHERE` / `LOC` | a map link, live or last-known with its age |
| `STATUS` | armed state, battery, signal, contacts, GPS |
| `SOS` / `HELP` | raises the alarm |
| `STOP` / `CANCEL` | stands it down |
| `ARM` / `DISARM` | |

Three things make this safe rather than a hole:

- **Only contacts are obeyed**, matched on the last nine digits — the same
  person arrives as `+9198…`, `9198…` or `098…` depending on how the network
  delivered it, and a strict comparison would refuse a genuine parent.
- **No command can change the contacts.** An SMS sender is trivially spoofed,
  and a beacon that could be re-pointed at a stranger's phone by a text would be
  worse than no beacon.
- **Read messages are deleted.** SIM storage is often ten slots; full, the modem
  silently stops accepting new messages and the device looks healthy while
  hearing nobody.

---

## 9. Journey mode — "walk me home"

Say how long it should take. If nobody confirms arrival, the alarm is raised.

This covers what the button cannot: being *unable* to press it. Holding
something for thirty seconds is not always possible.

| | |
| --- | --- |
| 1 minute late | quiet nudge to the wearer |
| 5 minutes late | alarm raised |

The nudge exists because almost every overdue journey is somebody who forgot to
press "I'm home". It turns those into a tap and costs the genuine cases nothing
— a person who cannot answer a nudge is exactly the person the alarm is for.

The deadline is armed **on the device as well as the platform**, so a wearer who
walks out of coverage is still covered. Its one limitation: `millis()` restarts
at a reboot, so a journey does not survive a power cycle. The platform keeps
counting and re-arms the device when it reconnects.

---

## 10. Safe zones

"Tell me when they leave school." Not tracking — the position is already being
reported for the sake of an emergency; a zone turns it into one sentence.

The hard part is the boundary, not the geometry. A wearer standing at a gate
with the fix wandering thirty metres crosses in and out repeatedly, and a naive
implementation sends "left school" and "arrived at school" every ninety seconds
until somebody mutes the feature — taking the useful alerts with it.

Three rules prevent that:

1. **Hysteresis.** Leaving requires being 50 m further out than arriving
   required being in. One jittering fix does not cross two lines.
2. **State.** A transition is reported only when it differs from what was last
   reported, and that presence is persisted so a restart does not re-announce.
3. **The first sighting is silent.** Creating a zone must not fire "arrived at
   school" at whatever hour it happened to be created.

And one refusal: **no fix produces no transition.** A device that goes indoors
and loses GPS has not gone anywhere. Telling a parent their child left school
because the sky went away is the fastest way to make this untrustworthy.

Minimum radius is 100 m, because consumer GPS beside a building — which is
exactly where a school gate is — is not better than that.

---

## 11. When nobody answers

An SOS delivered to four phones, all in pockets, is not an SOS anybody is
dealing with. Assuming somebody saw it is what makes the whole thing theatre.

| Unacknowledged for | What happens |
| --- | --- |
| 3 minutes | widen — everyone told again |
| 8 minutes | the emergency number is messaged |

An **acknowledgement stops the ladder dead**. Somebody saying "I have this" is
the only signal that matters, and continuing past it is how a neighbour ends up
with three police cars.

Each step is recorded on the incident, because the sweep runs on a timer:
without that, an alarm ten minutes old re-notifies everybody every thirty
seconds, to people who are already on their way.

---

## 12. The API

```
GET    /guardian/devices/:id/contacts
PUT    /guardian/devices/:id/contacts     replaces the list, then provisions
POST   /guardian/devices/:id/provision    writes everything into NVS
POST   /guardian/devices/:id/test         rehearsal, contacts only
POST   /guardian/devices/:id/panic        raise from the app
GET    /guardian/devices/:id/zones
POST   /guardian/devices/:id/zones
DELETE /guardian/devices/:id/zones/:zoneId
GET    /guardian/devices/:id/journey
POST   /guardian/devices/:id/journey      {minutes, destination?}
POST   /guardian/devices/:id/arrived
GET    /guardian/incidents
GET    /guardian/incidents/:id            with track and notification log
POST   /guardian/incidents/:id/ack
POST   /guardian/incidents/:id/close      {falseAlarm?: boolean}
GET    /guardian/stations?lat=&lng=
POST   /guardian/stations
```

`false_alarm` is kept distinct from `resolved`. One means "this happened and is
over", the other "this did not happen" — and collapsing them makes the device's
false-positive rate, the number that decides whether the trigger threshold is
right, impossible to measure.

At most one incident and one journey per device are open at a time, enforced by
partial unique indexes. Without them, a reconnect or a retained message turns
one emergency into three, and the contacts are told three times at the worst
possible moment.

---

## 13. What the platform being down costs

Nothing on the critical path. The device raises the alarm on its own, answers
texts on its own, and runs its own journey deadline.

What is lost: the incident record, the track, safe-zone alerts, the escalation
ladder, and the nearest-station resolution — so the device goes on using
whichever number it was last given, or the national fallback. The `guardian`
capability is advertised so a client can say the control plane needs upgrading
rather than present the beacon as unmonitored.
