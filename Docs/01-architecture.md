# 01 — Architecture

## The four systems

Circuvent is four deployables that talk over documented contracts. They can be
worked on, deployed and broken independently.

```
                         ┌────────────────────────────────────────────┐
                         │            Vercel (managed)                │
  Browser ──── https ───▶│  Next.js app                               │
                         │   • marketing site      • /shop            │
                         │   • /smarthome console  • /admin           │
                         │   • /api/* route handlers                  │
                         └───────┬──────────────────────┬─────────────┘
                                 │                      │
                    Neon Postgres│                      │ https / wss
                   (shop, orders,│                      │
                    accounts)    │                      ▼
                                 │        ┌─────────────────────────────────────┐
                                 │        │        one VM, Docker Compose        │
  Phone (Expo app) ─ https/wss ──┼───────▶│  Caddy :80/:443  (automatic TLS)     │
                                 │        │    └─▶ API (Node/TS) :8080           │
                                 │        │          • REST  • /ws  • MQTT bridge│
                                 │        │          └─▶ Postgres  (fleet data)  │
  ESP32 devices ─── mqtts:8883 ──┼───────▶│  Mosquitto  :8883 TLS / :1883 internal│
                                 │        └─────────────────────────────────────┘
                                 ▼
                         (separate database)
```

## What each system owns

| System | Runs on | Owns | Source |
| --- | --- | --- | --- |
| Web app | Vercel | Marketing, shop, orders, customer accounts, admin, console UI | `src/` |
| Control plane | One VM, Docker | Devices, telemetry, commands, automations, scenes, rooms, fleet users | `platform/` |
| Mobile app | Android / iOS | The console, on a phone | `mobile/` |
| Firmware | ESP32 devices | Sensing and actuation, local fallback behaviour | `firmware/` |

## The two databases

This surprises people, so it is worth stating plainly: **the shop and the control
plane do not share a database.**

- The **shop** stores customers, orders, wallets and the catalogue in a Neon
  Postgres reached from the Next.js app (`src/lib/db.ts`). Passwords are hashed
  with `scrypt`.
- The **control plane** stores users, devices, telemetry and automations in the
  Postgres container on the VM (`platform/api/src/db.ts`). Passwords are hashed
  with `bcrypt`.

They were built separately and grew separate user tables. Rather than migrate one
into the other, they are joined by a single-sign-on bridge that lets each side
vouch for a customer it has already authenticated — see
[05 — Databases](./05-databases.md) and `src/lib/sso.ts`.

## How a command reaches a device

This is the hot path; it is worth knowing by heart.

1. The console or app calls `POST /devices/:id/command` on the control-plane API.
2. The API checks the caller's JWT and that the caller **owns** that device.
3. The API publishes the JSON body to `cv/<deviceId>/cmd` on Mosquitto at QoS 1.
4. The device is subscribed to its own `cmd` topic, applies the change, and
   republishes its full state to `cv/<deviceId>/state` (retained).
5. The API receives that state, writes it to Postgres, and pushes it to every
   WebSocket client that owns the device.
6. The UI, which had already applied the change optimistically, reconciles.

Typical end-to-end latency is well under a second. There is **no polling** in
this path. See [04 — MQTT protocol](./04-mqtt-protocol.md).

## How a device reaches the apps

1. The device publishes `state` (retained), `telemetry` (append-only) or `status`.
2. The API persists it and fans it out over `/ws`.
3. Because `state` and `status` are **retained**, a newly connected client gets
   the current value immediately rather than waiting for the next change.

## Why frames are special

Camera video does **not** travel as telemetry. Every telemetry message is
persisted, and a 10 fps camera would write 36,000 rows an hour, each holding a
whole picture. Frames ride a dedicated `cv/<id>/frame` topic that is relayed
straight to watching WebSocket clients and **never stored**, and are not
retained — a retained frame would hand the last picture the camera took to
anything that subscribed later.

## Trust boundaries

| Boundary | Enforced by | Notes |
| --- | --- | --- |
| Browser → Next.js | Session tokens (HMAC), admin sessions | `src/lib/account.ts`, `src/lib/admin-auth.ts` |
| App → control plane | JWT bearer token | `platform/api/src/auth.ts` |
| Device → broker | Per-device username + secret over TLS | Broker ACL limits each device to `cv/<its own id>/#` |
| Control plane → broker | The `control-plane` user with `cv/#` | Only reachable on the internal Docker network |
| Shop ↔ console SSO | Shared `FEDERATION_SECRET`, HMAC + timestamp | Server-to-server only; never reaches a browser |

Device ownership is re-checked on **every frame**, not only when a client asks to
watch a camera, so unclaiming a device cuts its feed immediately.

## What is deliberately not in the hot path

- The shop database is never consulted to actuate a device.
- The Next.js app is not a proxy for device traffic; the apps talk to
  `api.circuvent.com` directly.
- Vercel has no access to the VM, and the VM has no access to Neon.

This is why an outage in one system does not take the other down: if Vercel is
down your devices keep working, and if the VM is down the shop keeps selling.
