# 37 — The two device registries

## The symptom

A customer signed in at `circuvent.com/shop/devices` and saw:

> No devices linked yet. Add one using the ID and key printed on your device.

They had bought hardware from us, set it up in the app, and it was running in
their house. Both units were online at that moment. The page they were reading
describes itself as "powered end-to-end by the Circuvent cloud".

## Why it happened

There are two device registries, and both are legitimate.

| | Shop table (`src/lib/store.ts`) | Control plane (`api.circuvent.com`) |
|---|---|---|
| How a device gets in | Owner claims it with the ID and key printed on the enclosure | Commissioned through the app or console |
| How it reports | `POST /api/devices/sync` to circuvent.com | MQTT, held open |
| Who reads it | `/shop/devices` | Console, mobile app |

Nothing was broken in either one. `GET /api/devices` simply read the first,
and every device this customer owned was in the second.

The shop's own table is not dead code — devices claimed with a printed key are
still in it, and that path still works. The bug was treating one of two
registries as if it were all of them.

## How the identities are joined

The shop and the control plane keep separate user tables with different
password schemes (scrypt vs bcrypt), so there is no shared session to reuse.
The join already existed: `POST /auth/federated`. The shop's backend, having
just authenticated the customer itself, asks the control plane for a session on
their behalf and signs the request with `FEDERATION_SECRET`.

That is a server-to-server credential. Anything holding it can mint a session
for any address, so it must never reach a browser — which is why
`src/lib/shop-fleet.ts` is server-only and the browser still talks to
`/api/devices` exactly as it did before.

## The second fault, underneath the first

`FEDERATION_SECRET` was set in Vercel and **not set on the control plane**, so
`/auth/federated` answered:

```
404 {"error":"Federation is not enabled."}
```

Every federated sign-in and every "open the console" hand-off had been failing
silently. `mintConsoleSession` returns `null` rather than throwing — correct
behaviour, since a shop that cannot reach the smart-home service should still
let people shop — and nothing surfaced it.

Note the comment already sitting in `docker-compose.yml` above that key:

> compose passes through exactly what is named below, which is how
> `FEDERATION_SECRET` stayed silently unset and SSO kept returning 501.

The pass-through had been fixed once. The value itself was never filled in, so
the same fault came back one layer down. Setting a secret in one of two places
looks exactly like setting it.

## What changed

- `FEDERATION_SECRET` set on the control plane to match the storefront, and the
  API container recreated so the process actually sees it.
- `src/lib/shop-fleet.ts` — mints and caches a console session per customer,
  lists their devices, forwards commands.
- `GET /api/devices` merges both registries, control plane first.
- `POST /api/devices/command` tries the local table, then the control plane.
  Without the second attempt every button on a control-plane device would have
  failed while the card sat there showing it online.
- The shop's icon map went from 8 types to all 27. It was harmless while the
  page could only list locally-claimed devices; once it lists what a customer
  owns, a missing entry renders somebody's camera as an unlabelled square.

## Things that are easy to get wrong here

**`null` is not `[]`.** `listFleetDevices` returns `null` when the control plane
cannot be asked, and an empty array when the customer genuinely owns nothing. If
an outage returned `[]`, a brief blip would blank out devices the shop's own
table still knows about, and the page would tell the customer they own nothing.

**The session cache needs a retry.** The devices page polls every five seconds,
so sessions are cached for five minutes. A cached token that expires mid-window
produces a 401, and a 401 that is not retried looks identical to owning no
devices — the exact bug being fixed. `withSession` drops the entry and re-mints
once.

**The control plane wins a tie.** Where both registries hold the same id, its
copy is the live one; the shop's row only advances when the device happens to
POST to `/sync`. Preferring the shop's copy would report an online device as
offline.

## Verification

```
POST /api/account/sso/console        → 200, console session for the customer
GET  /api/devices   (storefront)     → 2 devices, both online
POST /api/devices/command  refresh   → success
```

Pinned by `tests/shop-fleet.test.ts` and `tests/shop-device-icons.test.ts`.
