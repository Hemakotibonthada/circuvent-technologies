# 03 — Control plane API

The self-hosted API that owns the device fleet. Express + TypeScript, source in
`platform/api/src`, running in Docker on the VM behind Caddy at
`https://api.circuvent.com`.

## Middleware stack

From `platform/api/src/index.ts`, in order:

| Order | Middleware | Configuration |
| --- | --- | --- |
| 1 | `helmet` | CSP disabled (this serves JSON, not HTML), CORP disabled |
| 2 | `cors` | `CORS_ORIGIN`; `*` means reflect any origin, otherwise a comma-separated allowlist |
| 3 | `express.json` | **256 kb limit** |
| 4 | `express.urlencoded` | extended |
| 5 | `pino-http` | Structured request logging |
| 6 | `apiLimiter` | Global rate limit |
| 7 | routers | See below; `/auth` additionally gets `authLimiter` |
| 8 | 404 handler | `{ "error": "Not found" }` |

Listens on `config.PORT` (8080 in Docker) and logs
`Control plane listening on :8080` — the line to grep for when checking a boot.

## Authentication

`platform/api/src/auth.ts`:

- **User tokens** are JWTs signed with `JWT_SECRET`, carrying `{ uid, email }`,
  expiring after `JWT_EXPIRES_IN` (default `30d`).
- **Provisioning tokens** are JWTs with `purpose: "provision"` and a hard-coded
  **15 minute** expiry — short-lived because they are handed to a device over a
  local link during setup.
- **User passwords** are bcrypt, cost **12**.
- **Device keys** are bcrypt, cost **10** (lower because they are long random
  strings, not human-chosen).
- `requireAuth` populates `req.user`; `requireAdmin` additionally requires the
  `is_admin` column.

Send the token as `Authorization: Bearer <jwt>`.

## Endpoints

`[auth]` = requires a valid user JWT. `[admin]` = requires `is_admin`.

### `/health`

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness plus database reachability. Returns `{ ok, db }`. |

### `/auth`

Rate-limited more tightly than the rest of the API.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/register` | Step 1 of sign-up. Stores a **pending** registration and emails a 6-digit OTP. No account exists yet. |
| POST | `/auth/verify-otp` | Step 2. Confirms the OTP and creates the account. Returns a JWT. |
| POST | `/auth/resend-otp` | Re-sends the code for a pending sign-up. |
| POST | `/auth/login` | Email + password. Returns a JWT. |
| POST | `/auth/federated` | **Server-to-server only.** Issues a console session for a customer the storefront has already authenticated. See [11 — Secrets](./11-secrets.md). |

### `/devices`

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/devices/provision` | [auth] | Mint a device id + one-time key, and create its broker client |
| POST | `/devices/claim` | [auth] | Claim an already-provisioned device into your account |
| GET | `/devices` | [auth] | List devices you own |
| GET | `/devices/:id` | [auth] | One device |
| PATCH | `/devices/:id` | [auth] | Rename, set room, favourite |
| POST | `/devices/:id/command` | [auth] | **The hot path.** Publishes the body to `cv/:id/cmd` |
| GET | `/devices/:id/telemetry` | [auth] | Recent telemetry rows |
| GET | `/devices/:id/energy` | [auth] | Energy series for this device |
| DELETE | `/devices/:id` | [auth] | Remove the device and delete its broker client |

### `/automations`

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/automations` | [auth] | List rules |
| POST | `/automations` | [auth] | Create a rule |
| PATCH | `/automations/:id` | [auth] | Update a rule |
| DELETE | `/automations/:id` | [auth] | Delete a rule |

The rule shape is documented in [06 — Devices and firmware](./06-devices-and-firmware.md#automations)
because it is device-facing. Note that `action` may be a **single object or an
ordered array of up to 12 steps**, each optionally carrying a `delayMs` pause.

### `/rooms`, `/scenes`

| Method | Path | Auth |
| --- | --- | --- |
| GET / POST | `/rooms` | [auth] |
| PATCH / DELETE | `/rooms/:id` | [auth] |
| GET / POST | `/scenes` | [auth] |
| PATCH / DELETE | `/scenes/:id` | [auth] |
| POST | `/scenes/:id/activate` | [auth] |

### `/events`

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/events` | [auth] | Event feed |
| GET | `/events/unread-count` | [auth] | Badge count |
| POST | `/events/read` | [auth] | Mark read |
| DELETE | `/events/:id` | [auth] | Delete one |
| DELETE | `/events` | [auth] | Clear all |

### `/energy`

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/energy/summary` | [auth] |

### `/account`

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/account/push-token` | [auth] | Register a push token for this device |
| DELETE | `/account/push-token` | [auth] | Unregister |

### `/gate`

Guest access passes for the RFID gate.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/gate/passes` | [auth] | Issue a guest pass |
| GET | `/gate/passes` | [auth] | List passes |
| POST | `/gate/passes/:id/revoke` | [auth] | Revoke a pass |
| POST | `/gate/redeem` | — | **Unauthenticated by design**: redeeming a pass is the guest's action, and the pass code is the credential |

### `/provisioning`

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/provisioning/token` | [auth] | Mint a 15-minute provisioning token for the app to hand to a device |
| POST | `/provisioning/self` | — | The **device** redeems that token over TLS and self-provisions its id and key |

This is why the permanent device secret never travels over the local setup link.

### `/oauth` and `/smarthome`

Account linking and voice-assistant fulfilment.

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/oauth/authorize` | The account-linking login page and its submission |
| POST | `/oauth/token` | OAuth token exchange |
| POST | `/smarthome/google` | Google Home fulfilment |
| POST | `/smarthome/alexa` | Alexa Smart Home fulfilment |

See `platform/SMART_HOME.md` for the publishing process on each platform.

### `/admin`

Every route requires an admin user (`users.is_admin`).

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/admin/me` | Confirm admin status |
| GET | `/admin/stats` | Fleet-wide counters |
| GET | `/admin/health` | Deeper health than `/health` |
| GET | `/admin/users` | List users |
| PATCH | `/admin/users/:id` | Update a user (including `is_admin`) |
| DELETE | `/admin/users/:id` | Delete a user |
| GET | `/admin/devices` | Every device, any owner |
| GET | `/admin/devices/:id` | One device |
| GET | `/admin/devices/:id/telemetry` | Telemetry for any device |
| PATCH | `/admin/devices/:id` | Edit any device |
| POST | `/admin/devices/provision` | Provision on a user's behalf |
| POST | `/admin/devices/:id/command` | Command any device |
| POST | `/admin/devices/:id/ota` | Push a firmware update to one device |
| DELETE | `/admin/devices/:id` | Delete any device |
| GET | `/admin/events` | Global event feed |
| POST | `/admin/broadcast` | Send a notification to all users |
| POST | `/admin/ota-broadcast` | Push firmware to a whole device type |

## The WebSocket

`wss://api.circuvent.com/ws?token=<JWT>` — see
[04 — MQTT protocol](./04-mqtt-protocol.md#the-app-real-time-channel) for the
message contract and the limits the server enforces.

## Environment variables

Defined and validated by a Zod schema in `platform/api/src/config.ts`. The
process **exits** on a failed validation, so a misconfigured container will not
start half-working.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | no | `8080` | Listen port |
| `DATABASE_URL` | **yes** | — | Postgres connection string |
| `MQTT_URL` | no | `mqtt://mosquitto:1883` | Broker, internal listener |
| `MQTT_USERNAME` | no | `control-plane` | Broker user |
| `MQTT_PASSWORD` | **yes** | — | Broker password |
| `JWT_SECRET` | **yes** (min 16) | — | Signs user and provisioning tokens |
| `JWT_EXPIRES_IN` | no | `30d` | User token lifetime |
| `CORS_ORIGIN` | no | `*` | Allowed origins |
| `NODE_ENV` | no | `production` | |
| `SMARTHOME_CLIENT_ID` | no | `circuvent-smarthome` | Account-linking OAuth client |
| `SMARTHOME_CLIENT_SECRET` | no | `""` | Account-linking secret |
| `SMARTHOME_REDIRECT_URIS` | no | `""` | Extra allowed redirect URIs, comma-separated |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_SECURE` | no | `""` / `587` / `""` / `""` / `false` | Preferred OTP transport |
| `RESEND_API_KEY` | no | `""` | Fallback OTP transport |
| `EMAIL_FROM` | no | `Circuvent <onboarding@resend.dev>` | Sender |
| `OTP_TTL_MIN` | no | `10` | OTP lifetime in minutes |
| `OTP_DEBUG` | no | `false` | Log OTP codes when email is unconfigured |
| `ADMIN_EMAILS` | no | `""` | Comma-separated emails auto-granted admin on login |
| `FEDERATION_SECRET` | no | `""` | Shop ↔ console SSO. **Empty disables the endpoint entirely.** |

If neither SMTP nor Resend is configured, OTP codes are logged in development
(or when `OTP_DEBUG=true`) so sign-up still works while email is being set up.

## Local development

```bash
cd platform/api
npm install
# Needs a reachable Postgres and MQTT broker; easiest is to run the
# compose stack and point at it, or run the whole stack locally.
npm run dev
```

The simplest local setup is `docker compose up -d` in `platform/` and then
talking to `http://localhost` through Caddy, or exposing the API port
temporarily.
