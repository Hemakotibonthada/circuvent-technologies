# 30 · RFID attendance and access control

A school register, an office timesheet and a door log, from the same readers
and the same rows. Read `04-mqtt-protocol.md` first if the `cv/<id>/…` topics
are unfamiliar.

---

## One model for three products

A school has students in classes with guardians and a register. An office has
employees in departments with managers and a timesheet. A facility has card
holders who may enter certain rooms at certain hours.

They are the same shape — **a person, in a group, expected at certain times,
carrying a credential, passing a door** — and the differences are wording and
which report gets printed. Two parallel schemas would have meant two of
everything, and one of them permanently behind the other.

So `attend_sites.kind` is `school | office | facility`, it changes the nouns on
screen and which exports are offered, and it changes nothing that is recorded.

---

## The decision happens at the wall

This is the design decision everything else follows from.

Asking the control plane on every scan is what a first version usually does. It
is wrong here. A school gate at 08:25 has four hundred people through it in
fifteen minutes; a round trip to a VM in another country over a school's Wi-Fi
is somewhere between slow and not today. And the moment the line drops, every
door in the building stops working at once.

So the server pushes **who is allowed** and the terminal decides. The network
carries the *record*, which can be late without anybody being locked out.

```
   server                            terminal (firmware/rfid-attend)
   ──────                            ──────────────────────────────
   computeAcl()  ──── acl begin ───▶ stage[]
                 ──── acl chunk ───▶ stage[] += 100 cards
                 ──── acl commit ──▶ verify count, swap in, persist to NVS
                                     │
                            card ───▶│ binary search → open the door
                                     │
   ingestPunch() ◀─── punch ─────────┘
        │
        ├─ re-decide on the server (the list may be stale)
        ├─ write attend_punches (idempotent)
        ├─ greet ──────────────────▶ name on the OLED
        └─ recompute that person's day
```

### The allow-list is rebuilt every minute, not on change

A rule can be limited to a schedule — cleaners between 18:00 and 21:00, the
server room during office hours — and the terminal holds no schedules. If the
list were only rebuilt when somebody edited something, a card allowed until
19:00 would keep working at midnight.

So the list is "who is allowed **now**", recomputed every minute and **pushed
only when it actually changed**. A settled site costs one query a minute and no
MQTT traffic at all. The worst case is that a time-limited permission survives
up to sixty seconds past its window, which is stated here rather than
discovered.

Teaching the firmware about schedules was the alternative. It was rejected
because it puts the policy in two places, and the copy on the wall is the one
that is hardest to fix when it is wrong.

### Chunk, then commit

A thousand card numbers do not fit in an MQTT packet, so the list arrives in
chunks of 100 and is staged in RAM. If a chunk goes missing the commit never
matches its expected count, the staged copy is discarded, and **the terminal
keeps the list it already had**.

Applying chunks as they arrive would leave a door with a roster short by
whatever was dropped — and it would look like a perfectly working door to
anybody testing it with their own card. The terminal reports the failure and
the server pushes again.

---

## The offline queue

The terminal writes punches to NVS **only when the broker is unreachable**.
Online, the punch is published and that is the record; writing every scan to
flash would wear out the partition for nothing at 800 scans a day.

240 punches fit. When it is full the **oldest** is dropped, not the newest
refused: a terminal that stops recording once full quietly stops being an
attendance system for the rest of the outage, and the scans it refuses are the
ones nobody knows are missing.

### Two clocks, both recorded

`device_at` is what the terminal believed the time was. It is **null** when the
terminal had no clock — a site that lost power and came back before its
internet did — rather than 1970 or "now". A register can then say a time is
approximate instead of quietly inventing one.

`at` is when the server received it. After an outage the two differ by the
length of the outage. A register that used arrival-at-the-server time would
show a whole morning of people arriving at once when the line came back.

### Replays are free

```
dedupe_key = device | seq | card | device_clock
```

Device and sequence alone would be tidier and would break the first time a
terminal was factory reset: its sequence restarts at zero and several hundred
real punches would be discarded as duplicates of last month's.

---

## Why the server re-decides

The terminal has already opened or refused by the time `ingestPunch` runs. Its
list can be stale, and **the gap between what the door did and what it should
have done is the most useful thing an access log can record.**

A leaver whose card still works appears as `granted: false, reason: expired`
against a punch the door honoured. That is a sentence rather than a mystery,
and it is how somebody finds out that a card was never collected.

---

## Classifying a day

`attend/schedule.ts` is pure arithmetic and holds the whole policy. The one
timezone-aware step is turning an instant into a local date and a minute of
that day; everything after it is integers.

**Attendance is a wall-clock question.** Late means after 08:45 in the
building, and it stays 08:45 through a daylight-saving change. Storing an
offset is right for half the year in most of the world, and the day it breaks
is a Monday in spring with every arrival marked late.

The order of the checks is the policy:

1. a closure outranks a personal absence,
2. authorised leave outranks lateness,
3. **"we do not know yet" outranks "absent"** until `absent_after_minutes` have
   passed.

That last one has a consequence outside the system: an absence notification is
a message to a parent, and sending it a minute after the bell is worse than not
having the feature.

Other decisions worth knowing:

| Case | Behaviour | Why |
|---|---|---|
| Arrived inside the grace period | present, `lateMinutes = 0` | grace that still counts minutes is not grace |
| Arrived 3 h late | `half`, not `late` | a half day is a different fact |
| Two "in" scans, no "out" | measured from the first | not counted twice |
| "Out" with no "in" | ignored | otherwise eight hours are credited for leaving |
| Never scanned out | closed at the window's end, `assumed_out` flagged | a timesheet must show which hours were inferred |
| Night shift ending 02:00 | filed under the day it **started** | otherwise Monday looks like nobody went home |
| Came in on a holiday | status `holiday`, hours still counted | the hours are real |
| Working from home | `present`, zero hours | present for payroll, absent from the building |

### The register is stored, not computed

Recomputing on read is tempting — the punches are the truth. Two things make it
wrong. A monthly report for 800 people would re-scan millions of rows. And more
importantly, **a register is a document**: somebody prints it, signs it and
files it, and payroll pays against it. One that silently changes when a
schedule is edited three weeks later is a query, not a register.

Manual corrections are marked `source = 'manual'` and **the recompute never
overwrites them**. An override that reverted itself would last until the next
scan arrived, and whoever made it would have no reason to check.

---

## Access rules

```
zone? + group? + person? + schedule? → allow | deny, with a priority
```

Nulls widen: no group and no person means everybody. Resolution order:

1. **priority** descending — a site lockdown beats an individual permission,
2. **specificity** — a rule naming a person beats one naming their class beats
   one for everybody,
3. **deny wins a tie.** Somebody will eventually write two contradictory rules,
   and the safe reading of "allowed and also not allowed" is not allowed. It
   also produces a complaint rather than a silent hole.

**An empty rule set allows everybody.** That is the state every new
installation is in, and the alternative is a building where nobody's card works
until somebody discovers that an empty table means deny. Access is narrowed by
writing rules; the roster says who has a card at all.

A rule pointing at a deleted schedule does not apply — treating it as "always"
would turn a time-limited permission permanent, and as "never" would lock
people out with nothing on screen to explain it.

Refusals are worded for the person standing there: `out-of-hours` says come
back later, `not-allowed` says argue with security. They are different problems.

---

## The hardware

`firmware/rfid-attend`, ESP32, v1.0.0.

| | |
|---|---|
| MFRC522 | SPI — SS 5, RST 27, SCK 18, MISO 19, MOSI 23 |
| Wiegand | D0 16, D1 17 — retrofits an existing reader |
| OLED | SSD1306 128×64, I²C on 21/22 |
| Door | relay 26, REX 34, door contact 35 |
| Feedback | buzzer 25, green 32, red 33 |

Both readers are supported because a retrofit is common: the panel already
screwed to the wall speaks Wiegand, and replacing it is most of the cost of the
job.

**A missing reader is reported, not assumed.** `VersionReg` reading 0x00 or
0xFF means nothing answered on SPI — a loose ribbon, the single most common
fault on these installs. Without the check the terminal boots looking perfectly
healthy and never sees a card, and whoever is standing at it blames the cards.

**The door contact earns its place.** A door that opened while nothing granted
it has been forced or propped; one standing open long after its release has
been wedged. Both are invisible to a system that only records scans.

**`offlineFailOpen` defaults to false.** Letting anybody in when the line is
down turns every network outage into an open building, and an outage is not
rare on the Wi-Fi these are installed on. Sites that would rather fail open — a
fire route, a shop floor — set it deliberately.

---

## The API

```
/attendance/sites          the building and its policy
/attendance/groups         classes, departments, teams
/attendance/people         the roll  (+ /import for CSV)
/attendance/credentials    cards and fobs  (+ /:id/revoke)
/attendance/zones          doors
/attendance/terminals      readers  (+ /sync, /open)
/attendance/schedules      when people are expected
/attendance/rules          who may pass which door, when
/attendance/leaves         authorised absence and closures
/attendance/punches        the raw scans  (POST records one by hand)
/attendance/register       one day, everybody  (+ /recompute, PATCH to correct)
/attendance/summary        a range, per person
/attendance/person/:id     one person's own record
/attendance/live           on site now, latest scans, reader health
/attendance/export         register | summary | punches, as CSV
```

Every handler starts with `ownsSite`, repeated rather than inferred from a
parent route: a nested router that resolved the site once would make the check
invisible where it matters, and the next endpoint added would be the one that
forgot.

Reads are open to the household; every mutation needs `manage-devices`.

### Import matches on `code`

Every school and office already has this list somewhere, and typing 800 names
into a form is not a feature anybody uses. Matching on the roll number or
employee id makes a re-import an **update**, which is what turns "we exported
it again with the new starters" into a workflow rather than 800 duplicates.
Group names are resolved and created by name, because a spreadsheet has "5A" in
it and not a database id.

### CSV carries a BOM and local times

The BOM because these files are opened in Excel by people who did not ask for a
CSV, and without it Excel mangles every accented name. Local times because a
register saying `Tue Aug 18 2026 02:55:00 GMT+0000` in a column headed "First
in" is the right instant in the wrong timezone on a document somebody signs.

---

## What runs on a timer, and why

Three things, each because what it does is **not** caused by an event:

| | Every | Because |
|---|---|---|
| allow-list sweep | 60 s | nobody scans to make a time-limited rule expire |
| register sweep | 5 min | nobody scans to become absent, and a day does not close itself |
| first pass | 20 s after boot | the broker is still connecting; a roster pushed too early goes nowhere while the database records it as sent |

---

## Verified end to end

On the live control plane, against a real device registered as a terminal:

```
punch card=1001 → stored, ok, person 1
punch card=1002 → stored, ok, person 2
punch card=9999 → stored, unknown-card, no person

register 2026-08-18   present 1 · late 1 · absent 1
  Asha Rao     present  in 08:25  late 0m   assumedOut
  Ben Kumar    late     in 09:10  late 30m  assumedOut
  Chitra Iyer  absent

revoke card 1001 → terminal list 3 → 2 immediately
correct Chitra by hand → survives a recompute, flagged "by hand"
```

08:30 bell + 10 minutes grace, so 09:10 is 30 minutes late. Everything was
deleted afterwards.

---

## Where things live

| | |
|---|---|
| `firmware/rfid-attend/` | the terminal |
| `platform/api/src/attend/schedule.ts` | timezones, windows, day classification — pure |
| `platform/api/src/attend/decide.ts` | access rules, direction, duplicates — pure |
| `platform/api/src/attend/acl.ts` | who is on each terminal's list |
| `platform/api/src/attend/ingest.ts` | punch → record → greet → rollup |
| `platform/api/src/attend/rollup.ts` | the register |
| `platform/api/src/attend/routes.ts` | the REST surface |
| `platform/api/src/attend/index.ts` | the timers |
| `src/app/smarthome/attendance/` | the console portal |
| `db.ts` | 11 `attend_*` tables, commented in place |

100 tests across `schedule.test.ts`, `decide.test.ts` and `ingest.test.ts`.
