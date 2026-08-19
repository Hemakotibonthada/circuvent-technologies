# 33 — Agri GSM Starter

Starts and stops a farm pump from a phone — a missed call or a text, from any
handset, with no app and no internet — and from the console when there is a
network.

---

## 1. Who this is for, and why that decides everything

The pump is at the bottom of a field, often kilometres from the house, on a
supply that comes and goes on the electricity board's schedule. The farmer's
alternative to this box is a motorbike ride at 2am to see whether the power is
back.

So three things follow, and everything in the design comes from them:

- **It must work with no internet**, because there is none.
- **It must say what actually happened**, because nobody can look.
- **It must never damage the pump**, which costs more than everything else here
  put together and cannot be replaced in a hurry.

---

## 2. The four things that were wrong

### Anyone could start the pump

`AT+CLIP=1` was switched on *specifically* to obtain the caller's number — and
the number was then never looked at. Any incoming call toggled the contactor.

A wrong number, a marketing robocall, or somebody cycling digits could start a
stranger's irrigation, or stop it halfway through a watering. The intent was
there in the code; the check was simply missing.

Now the caller is matched against a provisioned list, on the **last nine
digits** — the same number arrives as `+919876543210`, `919876543210` or
`09876543210` depending on the network, and a strict comparison would lock the
owner out of their own pump.

**An empty list means nobody, not everybody.** That is the whole fix, and it
means phone control is off until a number is added — which the apps now say
out loud rather than leaving somebody ringing a box that ignores them.

### The contactor chattered at mains frequency

An opto-isolated mains-present input conducts on **each half cycle**, so the pin
is a pulse train at 50 or 100 Hz — not a level.

The old loop read it with a bare `digitalRead()` and drove the relay from the
result on every pass. So while the supply was perfectly healthy, "mains
present" was true about half the time and the contactor was being asked to open
and close many times a second.

That welds contacts. A welded contactor is a pump that **cannot be switched
off**.

Mains presence is now a window: remember when the pin was last seen high, and
call the supply present if that was within 300 ms. A disconnected sensor floats
— GPIO34 has no internal pull-down — and the same window handles it, because a
pin that never goes high reads as no mains, which is the safe answer.

### SMS control did not exist, and the code pretending to was a hazard

The modem was never put into text mode (`AT+CMGF=1`) and never told to deliver
messages (`AT+CNMI`), so **no SMS body ever reached the sketch**.

What did reach it was ordinary modem chatter — and the test was:

```c
} else if (line.indexOf("ON") >= 0) {
    setPump(true);
```

`"CONNECT".indexOf("ON")` is `1`. The pump could be started by the modem
talking to itself.

### The header promised a dry-run guard that was not there

"Mains-availability sensing + dry-run guard" — there was no such code. Running a
submersible dry destroys its seals in minutes and then its windings.

---

## 3. Protections

| | |
| --- | --- |
| **Restart delay** | 20 s of steady supply before re-engaging |
| **Maximum runtime** | 3 h, then stop and say so |
| **Timed runs** | a missed call waters for 30 minutes, then stops itself |
| **Dry-run cutout** | optional sensor; latches until a person clears it |

**Why a restart delay.** Rural supply returns unstable — it dips, comes back and
dips again for a minute or two. Re-engaging a motor into that is how windings
are lost, and every starter in a village doing it at the same instant is what
makes the supply dip again.

**Why runs are timed by default.** The commonest way a pump is destroyed is
being started and forgotten. Even a deliberate "run until I say stop" hits the
maximum runtime eventually.

**Why the dry-run guard is off by default.** It needs a float or flow switch
fitted. Claiming protection that is not wired is worse than claiming none, so
the apps show "Dry-run sensor: not fitted" rather than implying safety that
does not exist. And it **latches** — the well does not refill because a sensor
flickered.

---

## 4. Phone control

From an authorised number:

| | |
| --- | --- |
| missed call | toggles the pump (starts a timed run) |
| `ON` / `START` | start |
| `OFF` / `STOP` | stop |
| `STATUS` | what it is doing and why |
| `RESET` | clear a dry-run cutout |

**Every command is answered**, with what really happened. This matters more
than it sounds: the single most useful sentence this product can send is

> Circuvent pump: STOPPED - no mains power. Mains OFF.

That is a motorbike ride saved, and the previous firmware could never say it.

The call is never answered — `ATH` immediately. A missed call is a signal, not a
conversation, and answering costs the farmer money.

---

## 5. Why the pump is not running

"Off" is the same information as no information. The firmware publishes a
`hold` reason and `src/lib/agri.ts` turns it into a sentence:

| Reason | What it means for the farmer |
| --- | --- |
| `no-mains` | the board has cut the supply — wait, nothing is wrong |
| `restart-delay` | supply just returned, motor not being thrown into it — wait |
| `dry-run` | **the water source has failed — go and look** |
| `idle` | nobody asked it to run |
| `running` | with minutes remaining, when it is a timed run |

Only `dry-run` is critical. A missing supply is the normal state of a rural
connection for hours a day, and dressing it up as a fault trains somebody to
ignore the banner — taking the dry-run alarm with it.

`readHold()` also works against **1.1.0 starters still in fields**, which
publish only `pump` and `power_available`. Showing "unknown" for all of them
would be a regression for the devices that actually exist.

---

## 6. Commands

```
{action:"set", pump:true|false}
{action:"runFor", minutes:N}          timed irrigation
{action:"resetDry"}                   clear the cutout
{action:"configure", callers:[...], ringMin, maxRunMin, restartSec, dryGuard}
```

Four numbers maximum, because that is what the firmware stores in NVS. A console
offering a fifth would show a number in the app that the box in the field
silently drops — and the box is the only copy that matters when somebody rings
it. `tests/agri-parity.test.ts` holds the two in step.
