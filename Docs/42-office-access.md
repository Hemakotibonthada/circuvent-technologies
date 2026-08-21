# Office access requests

How somebody gets from "holds a card" to "the door opens", and what happens in
between.

## Why this exists

Holding a card and being allowed into the building are different facts. A card
says a credential was issued; it does not say anybody agreed this person should
be in the office today. Most of the time nobody needs to agree explicitly — an
employee on the roll, inside their validity dates, obviously belongs — and
making somebody click **Approve** for that produces a queue nobody reads and an
approval that means nothing.

So the rule approves that case on the spot, and records that a *rule* did it.
What is left pending is the interesting part: a visitor, a contractor, somebody
inactive or expired. Those are exactly the people worth a human decision, and
exactly the ones an approve-everything implementation would have waved through
while looking identical on a good day.

## The flow

```
  card presented at the reader
            │
            ▼
   reader publishes the number, shows nothing yet
            │
            ▼
   control plane: decideAccess()
            │
            ├─ card unknown / inactive / expired ─────► refuse
            ├─ site requires a request, and there is
            │  no approved one covering today ────────► refuse (no-access-request)
            └─ otherwise ────────────────────────────► admit
            │
            ▼
   publishCommand(deviceId, { action: "greet", status })
            │
            ▼
   reader shows green (granted / late) or red (denied)
```

The reader shows **nothing** between the swipe and the verdict. That gap is the
moment somebody decides whether to push the door, and a green light during it
would be a guess displayed as a decision. If no verdict arrives within two
seconds the reader shows **red**: a door has to fail closed, and a reader left
dark leaves somebody pushing a door that never unlocks with nothing telling them
why.

## Who is approved automatically

`autoDecide()` in `platform/api/src/attend/access-requests.ts`. It is pure, so
the rule that decides whether somebody gets into a building can be read and
tested without standing up Postgres.

| Person | Result | Recorded as |
|---|---|---|
| Active employee / staff / student, inside valid dates | approved | `auto` |
| Not active on the roll | pending | — |
| Outside their valid dates | pending | — |
| Visitor, contractor, any other role | pending | — |

`decided_by` is either `auto` or the email of whoever answered. Keeping those
apart is the whole point of recording it: after an incident, "a rule let them
in" and "a person let them in" are very different answers, and a tick would
collapse them into the same one.

## Dates are the grant; status only says it was agreed

`coversDay()` exists because a contractor approved for last Tuesday keeps an
approved row for ever. Reading the status alone would let them back in a month
later. The door checks the dates every time.

## Turning it on

Off by default, per site. Under **Attendance → Office access** there is a
checkbox:

> Require an access request to open the door.

Defaulting this to on would have stopped every card at every existing site the
moment it shipped — the same failure the empty-rule-table comment in `decide.ts`
warns about. Turning it on has to be a deliberate act.

With it off, requests are still recorded and still visible; they simply are not
a condition of entry.

## The API

| Method | Path | Notes |
|---|---|---|
| `GET` | `/attendance/access-requests?siteId=&status=` | Also returns `pending`, counted unfiltered so a console badge is right while a filter is applied |
| `POST` | `/attendance/access-requests` | Runs `autoDecide` immediately. Raising twice returns the existing request rather than making a second one |
| `PATCH` | `/attendance/access-requests/:id` | `approved` / `rejected` / `revoked`. Records the caller's email, never `auto` |

## `stored` is not the verdict

`ingestPunch` returns `{ stored, reason }`. `stored` says a row was written;
`reason` says what was decided. **A refusal is stored too**, deliberately — a
log of who was turned away is worth more than a log of who got in.

`reason === "ok"` is the only value that means somebody was admitted.

This was misread once: the Windows desk app treated `stored` as the verdict and
showed a refused visitor a green "Clocked in" on the reception screen while the
door stayed shut. `PunchResult.Admitted` now carries the question so the check
reads as what it means.

## Testing it without hardware

The physical reader has to be working to swipe a real card, but the decision
path can be exercised entirely over the API:

```powershell
# raise a request — an employee comes back approved by 'auto'
POST /attendance/access-requests  { siteId, personId, reason }

# a punch, as if from the terminal
POST /attendance/punches          { siteId, deviceId, cardNumber }
#   -> { stored: true, reason: "ok" }                 admitted
#   -> { stored: true, reason: "no-access-request" }  refused, still logged
```

Mind the site's `dedupeSeconds` (60 by default) when repeating a swipe — a
second scan inside the window returns `duplicate` and tells you nothing about
the access decision.

## Known limitation

The reader on `rfid-attend-7bcc` currently reports `reader: false` — the MFRC522
fails its self-test, so no card can be read at all. The unit is online and looks
healthy in every other respect, which is why the console renders an explicit red
"Card reader not responding" panel rather than letting an empty last-card field
imply nobody has swiped. Usually the reader's own supply or its wiring rather
than the board.
