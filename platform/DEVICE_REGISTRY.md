# Device Registry — internal operations

The console page is **Admin → Operations → Device Registry**
(`/smarthome/admin/registry`). This is the reference for how it works and why.

---

## The one thing to know first

**A device key cannot be looked up. Not by support, not by engineering, not by an
administrator.**

`devices.key_hash` is bcrypt. There is no plaintext anywhere in the system, so
"can you tell the customer their device key" has no answer other than issuing a
new one. The registry says this in the interface rather than leaving somebody to
discover it during a call.

If a customer has lost their key, the options are:

| Situation | Action |
| --- | --- |
| Customer has the key, cannot finish the claim | **Add a device to a customer's account** — verifies the key, then links it |
| Customer has lost the key | **Reissue key** — new credential, device must be set up again |
| Wrong account, RMA, mis-shipped unit | **Transfer device** — moves it on our authority, no key needed |

Reissuing takes the unit offline under its old credential until it is re-claimed
or re-flashed. That is a real consequence for the customer, so the route requires
a written reason, records it permanently, and notifies the owner.

---

## Serial numbers

```
CV-PLG-4K7M-92XH
│  │   └──┴── 8 characters: 7 payload + 1 check
│  └───────── 3-letter product code
└──────────── fixed prefix
```

`devices.id` is derived from the ESP32 chip id (`smart-plug-a41c9e02`). Good
database key, poor label: long, lower-case, and painful to read aloud. The serial
is the customer-facing identifier.

**Alphabet.** 32 characters, with `I`, `L`, `O` and `U` removed. `I/1` and `O/0`
are the classic misreads on a moulded label; `U` is dropped because it is heard
as "you". Because those characters can never appear in a real serial, an
operator typing `O` for `0` is unambiguous and is corrected automatically rather
than guessed at.

**Product codes are explicit, not derived.** `productCode()` has a fallback that
takes the first three letters of the type, and it works — but a derived code
cannot be read back: `typeFromProductCode` only searches the explicit table, so
a serial from a fallback code resolves to no device type at all, and the
registry lookup silently loses the ability to say what the unit is. Every type
that ships needs a row in `PRODUCT_CODES`.

**Check character.** A position-weighted sum mod 32. Weighted, not a plain sum,
because an unweighted checksum cannot see a transposition, and swapping two
adjacent characters is the most common copying error. `CV-PLG-4K7M-92XH` and
`CV-PLG-K47M-92XH` do not both validate.

**Stability.** The payload is derived from the hardware id, so the same physical
board always produces the same serial. A factory reset cannot issue a second
number while the label on the case still shows the first.

**Lookup is forgiving about form and strict about content.** Case, spaces, dashes
and a missing `CV` prefix are all accepted. A failed check character returns
`bad_serial_checksum` with a "please re-read the label" message — not an empty
result, which would send the operator looking for a device that never existed.

Existing devices were backfilled on the boot that shipped this
(`backfillSerials` in `db.ts`), derived from the same hardware id, so the
operation is idempotent.

---

## The QR label

`labelQrPayload()` produces:

```
circuvent://setup?type=smart-plug&sn=CV-PLG-4K7M-92XH
```

**It carries nothing secret, and it cannot.** Every unit ships identical firmware
with no baked-in credential — the trust comes from the encrypted Wi-Fi handoff
and the TLS self-provision, not the label. A label that appeared to hold a secret
would invite somebody to treat a photo of a box as sensitive, or worse, to assume
scanning it was authentication.

The format is the one `mobile/src/qr.ts` already parses, so a printed label works
with the shipping app.

Print from the registry's **Print label** button. It renders into an isolated
iframe rather than calling `window.print()`, which would put the entire admin
console onto label stock.

---

## The report

`GET /admin/devices/:id/report` and `GET /devices/:id/report` are the same
assembler (`device-report.ts`) with different `audience` values. Writing two
would guarantee they drift, and the direction of drift is the dangerous one: a
field added to the operator report gets copied across without its redaction.

`audience` is a required argument with no default, because the safe value is not
obvious enough to be the fallback.

| Section | Owner | Admin |
| --- | --- | --- |
| Identity, firmware, serial | ✅ | ✅ |
| Hardware id, batch, internal notes | ❌ | ✅ |
| Owner email / account id | ❌ (only "claimed") | ✅ |
| Credential dates + reissue count | ✅ | ✅ |
| The credential itself | ❌ — none exists | ❌ — none exists |
| Live state, telemetry, events | ✅ | ✅ |
| Control log | ✅ (attributed "you") | ✅ (attributed by email) |
| Administrative audit trail | ❌ not even queried | ✅ |

Both audiences can export JSON and CSV. The CSV is produced by the API, not the
browser, so the file a customer attaches to a ticket is byte-for-byte the one
support generates.

`summary.truncated` says when the history lists are a window rather than the
whole record — otherwise a reader concludes a device only ever sent 100 samples.

---

## Audit trail

`device_audit` records ownership changes and credential reissues: who, what,
when, and the written reason.

It is deliberately **not** the customer's `events` feed. That feed answers "what
did my house do" and the customer can clear it. This answers "who inside the
company changed this unit, and why", and has to survive both the customer
clearing their feed and the operator leaving — `actor_id` is
`ON DELETE SET NULL` while `actor_email` is kept as text, because an audit entry
is most likely to be read precisely when the person who made it has gone.

Every path that changes ownership writes here, including the generic
`PATCH /admin/devices/:id`, so an ownership change cannot be made quietly through
the side door.

---

## Route ordering — a real trap

Literal paths (`/devices/lookup`, `/devices/claim-for-user`) **must stay above**
the parameterised `/devices/:id` handlers in `routes/admin.ts`. Express matches
in registration order, so a literal declared later is swallowed by `:id` and the
endpoint returns "no such device named lookup" for every query.

That failure looks like a data problem and gets debugged in the wrong place, so
`registry.test.ts` speaks HTTP to the real router and asserts the lookup returns
a list rather than a device record. A unit test cannot catch it.

---

## Testing

```bash
cd platform/api && npm test
```

- `serial.test.ts` — format, the excluded-character guarantee, stability across
  re-provisioning, and rejection of single typos and transpositions
- `device-report.test.ts` — the redaction boundary, in both directions
- `registry.test.ts` — route order, serial normalisation end to end, the
  checksum error path, and that reissue/transfer refuse to act without a reason
