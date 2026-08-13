# 27 — First tasks

A ladder. Each rung teaches one thing and produces something real. Do them in
order — later ones assume you learned the earlier ones.

None of these need production access or hardware on your desk.

**Before starting any of them:** finish [00 — Start here](./00-start-here.md) and
confirm all four verification steps pass.

---

## How a task is done here

Every task below is finished when all of these are true:

- [ ] It behaves as described
- [ ] `npx tsc --noEmit` is clean
- [ ] `npm test` passes
- [ ] There is a **test that would fail if someone undid your change**
- [ ] Nothing else that needed to know about your change was left out (the
      parity question — [23 §1](./23-conventions.md))
- [ ] Any document your change makes wrong is fixed in the same commit

The fourth and fifth are the ones people skip, and they are the ones that matter.

---

## Level 1 — Find your way around

### 1.1 Trace a command end to end

No code. Follow one button press through all four systems and write down the
file and line for each step:

1. The console component the user clicks
2. The API route that receives it
3. The MQTT topic it publishes to
4. The firmware handler that acts on it
5. Where the device publishes its new state
6. Where the UI reconciles

Start at [01 — Architecture](./01-architecture.md), then search for real symbols.

**Done when** you can explain why the UI does not poll.

### 1.2 Count the tables that know a device type

Pick `smart-plug`. Run `git grep -n "smart-plug"` and list **every** file that
independently stores a fact about it.

**Done when** you can say how many places must be edited to add a type — and why
that number is the source of most bugs here.

---

## Level 2 — A small, real change

### 2.1 Add a product spec bullet

Pick a product in `src/lib/shop-data.ts` and add a true bullet to `specs`.

Learns: the catalogue is a TypeScript file; the shop needs no database to render.

**Done when** it shows on `/shop` and on that product's page.

### 2.2 Give a validation message a reason

Find a form error that says something like "Invalid input" and make it say what
is wrong and how to fix it.

**Done when** the message names the actual constraint, and a test asserts it.

### 2.3 Fix a contrast finding

```bash
npm run audit:contrast
```

Fix one finding using existing theme tokens — **not** a raw hex value.

**Done when** the audit no longer reports it and `tests/token-contrast.test.ts`
passes.

---

## Level 3 — Add behaviour with a test

### 3.1 Extend fuzzy search

`src/lib/fuzzy.ts` tolerates shop-search typos. Find a real miss — a plausible
misspelling of a product that returns nothing — and make it match.

Watch out: do not make it so loose that unrelated products match. `plug` matching
`plumbing` is a real bug this file already had.

**Done when** `fuzzy.test.ts` covers your case **and** a test asserts the
false-positive you avoided.

### 3.2 A telemetry helper

Add a function to `src/lib/telemetry-series.ts` — say, the peak in a window.
Handle the empty series, a single point, and all-equal values.

**Done when** the edge cases are tested. Empty input is where these break.

### 3.3 Close a device-capability gap

Run `cd mobile && npm run typecheck` and read `check-device-types.js` and
`check-command-map.js`. Pick a device type whose control set is thinner in one
app than the other, and close the gap.

**Done when** both apps offer the same controls, the control builds a real
command, and a parity test fails if either regresses.

---

## Level 4 — Cross-system

### 4.1 Add a field to an existing device type

Choose something real — a runtime counter, a last-triggered timestamp. Then:

1. Publish it from firmware (`firmware/<device>/`)
2. Confirm the API stores it (usually no change needed — types are free-form)
3. Show it in the web console
4. Show it in the mobile app
5. Test that all three agree

**Done when** it appears in both apps and a parity test covers it.

This is the first task where forgetting a surface produces a bug **with no error
message**. That is the lesson.

### 4.2 An automation trigger

Add a trigger type to the automation system. Check every place triggers are
enumerated — the editor, the description helper, the evaluator, the API — before
writing anything.

**Done when** it can be created in the UI, is described correctly in the list,
and actually fires. Verify the last one; a trigger that saves and never fires
looks identical to a working one.

---

## Level 5 — A whole device type

### 5.1 Ship a new device type end to end

Follow [07 — Adding a new device](./07-adding-a-new-device.md) exactly. Firmware,
control plane, both apps, automation support, the shop.

**Done when** it provisions, appears with real controls in both apps, can be put
in a scene, and every parity guard passes with no exemptions added.

If you find yourself adding an exception to a guard test, stop. The guard is
telling you a surface was missed.

---

## Things that are genuinely useful, if you want more

Real gaps, not exercises:

- **`mobile/src/screens/Home.tsx`** still reads capabilities directly instead of
  using the shared `useDeviceVisual` hook the other screens moved to. Migrating
  it removes a fourth copy of the same derivation.
- **Structured specs on product pages.** The catalogue's `specs` are marketing
  bullets; there is no "In the box" or dimensions table. Needs real product
  data — ask before inventing any.
- **Audit the remaining command surfaces.** Rule fields and voice-command mapping
  have not had the parity treatment that scenes just got. That audit has found a
  real bug every single time it has been run.

---

## When you are stuck

1. Re-read the error. In this codebase they usually name the two files that
   disagree.
2. `git grep` the symbol. Nearly everything is discoverable by name.
3. Check whether a test already covers it — the test is often the clearest
   specification available.
4. Ask, with: what you ran, what you expected, what happened.

Being stuck for an hour is normal. Being stuck for a day without asking is not.
