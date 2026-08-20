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
- Inside `/admin`, `users.admin_role` (`'observer'` | `'operator'`, default
  `'operator'`) is a second, finer-grained tier that does **not** replace
  `is_admin` — it only subdivides what an admin may do once inside. `observer`
  can call every `GET` route; `operator` can also call anything that mutates
  state. The `requireOperator` middleware in `routes/admin.ts` enforces this
  and fails closed: any value other than exactly `'operator'` (missing,
  unrecognised, wrong case) is treated as `observer`.

Send the token as `Authorization: Bearer <jwt>`.

## Endpoints

`[auth]` = requires a valid user JWT. `[admin]` = requires `is_admin`; mutating
`/admin` routes additionally require `admin_role = 'operator'` (see below).

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

### `/anpr`

Number-plate reads and the allow / deny / watch list. See
[20 — ANPR](./20-anpr.md).

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/anpr/reads` | [auth] | The plate log, filterable by device, plate, decision and status |
| GET | `/anpr/reads/:id/image` | [auth] | The capture the plate was read from, as `image/jpeg` |
| GET | `/anpr/summary` | [auth] | Counts, busiest hours and frequent vehicles |
| GET | `/anpr/vehicles` | [auth] | The vehicle register: passes, entries, exits, who is inside now |
| GET | `/anpr/vehicles/:plate` | [auth] | One vehicle: visit history with in/out times, dwell, and every capture |
| GET | `/anpr/occupancy` | [auth] | Live count, free spaces and the overdue list |
| GET / PATCH | `/anpr/settings` | [auth] | Capacity, overstay limit, alert policy and the daily-report recipient |
| POST | `/anpr/report/test` | [auth] | Send today's report now, through the real delivery path |
| GET | `/anpr/rules` | [auth] | The allow / deny / watch list |
| POST | `/anpr/rules` | [auth] | Add a plate to a list |
| PATCH | `/anpr/rules/:id` | [auth] | Change or disable a rule |
| DELETE | `/anpr/rules/:id` | [auth] | Remove a rule |
| POST | `/anpr/rules/from-read/:id` | [auth] | Add the plate of an existing read — never re-typed from a photograph |
| POST | `/anpr/devices/:id/capture` | [auth] | Take a burst now (the installer's tool) |

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

Every route requires an admin user (`users.is_admin`). Rows marked
**operator** additionally require `admin_role = 'operator'` — an `observer`
gets a `403` naming the required role. Unmarked rows (all `GET`s) are open to
either role.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/admin/me` | Confirm admin status (response includes `role`) |
| GET | `/admin/stats` | Fleet-wide counters |
| GET | `/admin/health` | Deeper health than `/health` |
| GET | `/admin/users` | List users |
| PATCH | `/admin/users/:id` | **operator** — update a user (including `is_admin`) |
| DELETE | `/admin/users/:id` | **operator** — delete a user |
| GET | `/admin/devices` | Every device, any owner |
| GET | `/admin/devices/:id` | One device |
| GET | `/admin/devices/:id/telemetry` | Telemetry for any device |
| PATCH | `/admin/devices/:id` | **operator** — edit any device |
| POST | `/admin/devices/provision` | **operator** — provision on a user's behalf |
| POST | `/admin/devices/:id/command` | **operator** — command any device |
| POST | `/admin/devices/:id/ota` | **operator** — push a firmware update to one device |
| DELETE | `/admin/devices/:id` | **operator** — delete any device |
| GET | `/admin/events` | Global event feed |
| POST | `/admin/broadcast` | **operator** — send a notification to all users |
| POST | `/admin/ota-broadcast` | **operator** — push firmware to a whole device type |

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
| `ANPR_PROVIDER` | no | `none` | `none` \| `platerecognizer` \| `openai` \| `http`. **`none` still captures and logs vehicles — it only skips reading the plate.** See [20 — ANPR](./20-anpr.md) |
| `ANPR_BASE_URL` / `ANPR_API_KEY` / `ANPR_MODEL` | no | `""` | Recogniser endpoint and credentials |
| `ANPR_REGION` | no | `in` | Region hint passed to the recogniser |
| `ANPR_TIMEOUT_MS` | no | `12000` | Per-frame recogniser timeout |
| `ANPR_MIN_CONFIDENCE` | no | `70` | Below this a read is stored but never resolves to `allow` |
| `ANPR_RETENTION_DAYS` | no | `90` | Plate history retention |
| `ANPR_IMAGE_RETENTION_DAYS` | no | `30` | Capture images are cleared **before** the metadata is deleted |
| `ANPR_THUMBNAIL_MAX_KB` | no | `96` | Captures above this are recorded without an image |
| `REPORT_FROM` | no | `Circuvent <info@circuvent.com>` | Sender for the daily gate report. Separate from `EMAIL_FROM` on purpose, and must stay on a DKIM-signed domain |

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
