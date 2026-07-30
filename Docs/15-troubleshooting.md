# 15 — Troubleshooting

Failure modes that have actually occurred, with the diagnosis that found them.
Every entry here was a real incident.

---

## Device shows "Ready" but sends no frames

**Symptom.** Camera reports `ready: true`, `psram: true`, excellent signal — and
`frames: 0`, `dropped` climbing. Serial log shows repeated
`SCCB_Write Failed addr:0x30 … ret:-1` in bursts about four seconds apart.

**Cause.** An auxiliary pin was assigned to a pin the camera needs. On the
AI-Thinker profile the factory-reset button was on GPIO 0, which is the camera's
**XCLK**. `CircuventDevice::begin()` runs `pinMode(pin, INPUT_PULLUP)`, which
rebinds the pad away from the LEDC clock output. The sensor loses its clock.

It fails in the worst possible way: `esp_camera_init()` runs *before*
`cv.begin()`, so it succeeds and the device reports a healthy sensor.

The SCCB errors are the same fault — an OV2640 clocks its own register logic from
XCLK, so with the clock gone every register write NACKs. The four-second spacing
is `esp_camera_fb_get()` blocking until timeout, starving the MQTT loop.

**Fix.** `CV_PIN_CLASH` in `firmware/camera/camera.ino` now fails the build if any
auxiliary pin collides with a camera pin.

**Generalise:** if a peripheral is silently dead, check what else claims its pins.

---

## Device crash-loops with garbage backtraces

**Symptom.** Guru Meditation panics with nonsense program counters, `CORRUPTED`
backtraces, and an ELF SHA256 that reads as a repeating byte pattern such as
`2000200020002000`.

**Cause.** An ELF hash that is a repeating pattern is not a software bug — the
flash read itself returned wrong data. That happens when the supply droops below
what the chip needs. Firmware that disables the brownout detector
(`WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0)`) makes this undiagnosable: below the
threshold the chip keeps executing corrupted instructions instead of resetting
cleanly.

**Fix.** Keep the brownout detector **on**, so an inadequate supply says so in one
line. Reduce draw: XCLK 20 MHz → 10 MHz, frame buffers 2 → 1. Verify PSRAM
actually stores data rather than trusting `psramFound()`.

**Generalise:** disabling a safety check does not add headroom, it removes the
diagnosis.

---

## Dev site shows production data

**Symptom.** dev.circuvent.com showed real customer accounts, orders and wallet
balances, and accepted production logins.

**Cause.** `DATABASE_URL` was scoped to "All Environments" in Vercel, so preview
builds got the production connection string. Eighteen other credentials —
Razorpay, Stripe, Twilio, SMTP, Resend, Mongo, OpenAI, Google OAuth — were scoped
the same way, so dev could also take real payments and email real customers.

**Fix.** All production credentials are production-only. Dev has its own Neon
project and its own signing secrets. `PROD_DATA_HOSTS` plus
`assertNotProductionData()` in `src/lib/db.ts` now make a non-production
deployment refuse to start if it is pointed at a production database host.

**Generalise:** config hygiene regresses. Put the invariant in code.

---

## `/api/account/login` returns 500 for an existing account

**Symptom.** Registering the email returns 409 (already exists), logging in
returns 500. A non-existent email correctly returns 401.

**Cause.** The account row had no usable password. `verifyPassword` called
`Buffer.from(undefined)`, which throws, and the route's bare `catch {}` turned it
into a 500 with no log.

**Fix.** `verifyPassword` returns `false` for missing or malformed credentials
instead of throwing. An account with no password now gets a 409 pointing at the
reset flow rather than being permanently locked out. The catch-all logs.

**Generalise:** a bare `catch {}` converts a data problem into an outage you
cannot diagnose.

---

## Production login fails with an opaque 400

**Cause.** `src/lib/secrets.ts` enforces a 32-character minimum for signing
secrets in production and throws below it. `next start` sets
`NODE_ENV=production`, so a short secret in a local production run does it too.

**Fix.** Generate with `openssl rand -base64 48`.

---

## A schedule silently reverts to running daily

**Symptom.** A weekdays-only timer runs every day after being edited.

**Cause.** Two separate instances of the same bug shape:

1. `RuleEditor.handleSubmit` built its time trigger as `{ type: "time", at }` —
   dropping `days` — even though the day picker, its validation and the preview
   were all correct.
2. **Zod strips unknown keys.** A field not declared in `triggerSchema` /
   `actionSchema` in `platform/api/src/routes/automations.ts` is dropped on write
   with no error.

**Generalise:** when adding a field to an automation, check *both* the client
build path and the server schema.

---

## Editing a rule deletes its other steps

**Cause.** `action` may be a single object or an array of up to 12. An editor
that reads `action.type` sees `undefined` for an array, and saving writes back a
single action — destroying the sequence.

**Fix.** `actionList()` normalises both shapes. Editors that cannot display a
sequence preserve it: the admin screen keeps the stored array, and the mobile
builder re-attaches steps it did not show.

---

## Camera visible in the list but renders raw JSON

**Cause.** The device type has no `case` in the renderer, so it falls through to
the debug fallback. On web that is `DeviceControls.tsx`; on mobile it is the
`KNOWN` array in `screens/Control.tsx`.

**Fix.** See [07 — Adding a new device](./07-adding-a-new-device.md#the-three-silent-failures).

---

## Build fails on `expo-modules-core` / ninja

**Cause.** The repository path contains spaces (`…\Office Apps\…`). A directory
junction does not help — CMake canonicalises through it.

**Fix.** Build from a real copy at a space-free path (`C:\cvapp`). See
[08 — Mobile application](./08-mobile-application.md#the-path-with-spaces-problem).

---

## The APK "built" but contains the old code

**Cause.** A failed Gradle run leaves the previous APK in place. It is easy to
verify a stale binary and believe the build worked.

**Fix.** Check the APK's timestamp, then `aapt2 dump badging` for the version and
`apksigner verify --print-certs` for the certificate — every time.

**Related trap.** The JS bundle is **Hermes bytecode**. Searching it for a UTF-8
string misses anything containing a non-ASCII character, because those live in a
UTF-16 table. A file starting with `C6 1F BC 03` is Hermes.

---

## SVG renders nothing but validates fine

**Cause.** A straight line stroked with an `objectBoundingBox` gradient has a
zero-width or zero-height bounding box, so the gradient never paints.

**Fix.** Use a solid stroke on straight lines. Render artwork and **look at it**:
`node scripts/preview-product-art.js`.

---

## Devices cannot connect after a certificate change

**Cause.** Devices embed the broker's CA. Regenerating it with `gen-certs.sh`
invalidates every deployed device.

**Fix.** Do not regenerate the CA casually. Rolling it over needs a firmware
update pushed **before** the old CA expires. Check the expiry date now:

```bash
openssl x509 -in platform/mosquitto/certs/ca.crt -noout -enddate
```

---

## Devices connect but the app sees nothing

Work down the path:

```bash
# 1. Is the broker receiving?
docker compose exec mosquitto mosquitto_sub -h localhost -p 1883 \
  -u control-plane -P "$MQTT_CONTROL_PLANE_PASSWORD" -t 'cv/#' -v

# 2. Is the API connected to the broker and the database?
curl https://api.circuvent.com/health
docker compose logs --tail=200 api | grep -i -E 'mqtt|error'

# 3. Is the row updating?
docker compose exec postgres psql -U circuvent -d circuvent \
  -c "SELECT id, online, last_seen FROM devices ORDER BY last_seen DESC LIMIT 10;"
```

If (1) shows traffic and (3) does not update, the API's MQTT client is the
problem. If (3) updates and the app is blank, it is the WebSocket or ownership —
`owner_id` must match the signed-in user.

---

## A deploy did not pick up a new environment variable

**Cause.** Vercel environment changes apply to the **next build**, not to running
deployments.

**Fix.** Redeploy after changing a variable.

---

## General diagnostic order

1. **Reproduce it**, and note exactly what differs from the working case.
2. **Find the layer.** Device → broker → API → database → socket → UI. Test each
   boundary; do not guess.
3. **Distrust status flags.** `ready: true` meant "init succeeded once", not
   "working now". Prefer counters that move.
4. **Read the numbers.** `frames: 0` with `dropped: 16` says the capture path
   fails, not the network.
5. **Change one thing at a time**, and verify the fix in both directions — that
   it fires when it should, and does not when it should not.
