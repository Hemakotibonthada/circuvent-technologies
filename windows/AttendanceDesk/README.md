# Circuvent Attendance Desk

A native Windows application for the RFID attendance system — the front desk
counterpart to the web console at `home.circuvent.com/smarthome/attendance`.

```
┌──────────────────────────────────────────────────────────────────┐
│  Attendance Desk        [Circuvent HQ ▾]   Wed 20 Aug · 14:52:07 │
├───────────────────────────────────┬──────────────────────────────┤
│  Scan a card                      │  Readers                     │
│   ○ Clock in/out  ○ Assign        │   Entrance      online       │
│  ┌─────────────────────────────┐  │   1 card · last scan 09:12   │
│  │        Vema Naidu           │  │  [Push card list to readers] │
│  │        Clocked in           │  ├──────────────────────────────┤
│  └─────────────────────────────┘  │  Recent scans                │
│                                   │   Vema Naidu    09:12  in    │
│  On site · 1                      │   Card 4471983  09:03  unknown│
│   Vema Naidu   CV-001   09:12     ├──────────────────────────────┤
│                                   │  HRMS  [Sync today into HRMS]│
└───────────────────────────────────┴──────────────────────────────┘
```

## Why a desktop app

The web console administers the system; this runs the door. It exists for three
things the browser is a poor fit for:

**A USB card reader works here.** Readers in this class are keyboard wedges —
they present as a keyboard and "type" the card number. The desk captures that
at the window level, so a card scans wherever the caret happens to be, with no
field to click into first.

**It survives the reader being down.** When a door reader fails, attendance
stops. A desk with a USB reader keeps taking punches at reception until the
hardware is fixed, and they land in the same register.

**It is the enrolment tool.** Issuing a card means holding it on a reader and
reading back the number it emits. That is a physical act at a desk.

## Build and run

```powershell
cd windows\AttendanceDesk
dotnet build
dotnet run
```

.NET 9 SDK, nothing else. WPF rather than WinUI 3 deliberately: WinUI needs the
Windows App SDK workload installed on every machine that builds it, and this has
to build from a clean checkout on a reception PC. No NuGet packages either —
`HttpClient` and `System.Text.Json` cover the API, and a terminal that pulls a
dependency tree is one more thing to break on a machine nobody administers.

## How it fits the rest of the system

```
   card ──▶ USB reader ──▶ Attendance Desk ──▶ control plane ──▶ HRMS
              (wedge)         (this app)      api.circuvent.com   device-sync
                                   │
                                   └──▶ door readers (ACL push)
```

The desk **does not** write attendance into HRMS itself. HRMS already pulls the
day's register from the control plane and reconciles it, applying its own grace
periods, half-day thresholds and regularisation rules on the way in. A second
writer bypassing that would produce two sets of attendance that agree until the
day somebody edits one — and payroll is downstream. So the desk asks HRMS to run
the sync it already owns, and HRMS stays the only thing that decides what a
punch means.

## Telling a scan from typing

The one piece of real logic here. A wedge reader emits digits 5–15 ms apart
because it is replaying a buffer; a person cannot sustain that, and fast human
typing is still above 80 ms per character and far more irregular. So a run of
digits arriving faster than 35 ms each and ending in Enter is a card.

Getting this wrong leniently is the expensive direction — a receptionist typing
a name into a search box would silently punch somebody in — so the check is
strict, non-digits abandon the buffer rather than being filtered out, and a
rejected burst does nothing rather than guessing. See `Services/CardReader.cs`.

## Credentials

The session token is encrypted with DPAPI at `CurrentUser` scope, so the
settings file is only readable by the Windows account that wrote it. A reception
PC is shared and physically accessible; a bearer token in a plaintext file there
is one anybody who sits down can copy.

The password is never stored. When the token expires, somebody signs in again —
keeping a reusable credential on a machine like this to save one login a week is
not a trade worth making.

The HRMS token is entered separately and deliberately not persisted: it is a
different system with a different lifetime, and reusing one for the other is how
a token ends up somewhere it was never scoped for.

## Known limits

- **One site at a time.** The site picker switches; it does not aggregate.
- **No offline queue yet.** If the control plane is unreachable the punch is
  refused and says so, rather than being stored locally. The door readers
  themselves do queue, so this only affects scans taken at the desk during an
  outage. Worth adding.
- **HRMS sync is manual.** HRMS also runs it daily from `/api/cron`; the button
  is for after fixing a terminal or badge problem without waiting.
