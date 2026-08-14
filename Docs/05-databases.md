# 05 — Databases

There are **two** Postgres databases and they are deliberately separate.

| | Shop database | Control-plane database |
| --- | --- | --- |
| Provider | Neon (serverless HTTP) | Postgres 16 container on the VM |
| Reached from | The Next.js app | The control-plane API |
| Access code | `src/lib/db.ts` | `platform/api/src/db.ts` |
| Driver | `@neondatabase/serverless` | `pg` connection pool (max 10) |
| Password hashing | `scrypt` | `bcrypt`, cost 12 |
| Holds | Customers, orders, wallets, inventory, CMS | Fleet users, devices, telemetry, automations |

Neither can see the other. That is the point: a compromise or an outage of the
shop cannot reach the device fleet, and vice versa.

## Shop database (Neon)

Configured with `DATABASE_URL`. When it is **unset**, `src/lib/store.ts` falls
back to a JSON file under `DATA_DIR`, and on a read-only filesystem degrades to
in-memory for the life of the instance. That is fine for local development and
wrong for production: on Vercel the filesystem is ephemeral, so without
`DATABASE_URL` accounts and orders vanish on every cold start.

Login-critical entities have dedicated typed tables (`accounts`, admin users,
pending registrations). The remaining collections are stored as JSONB blobs in
`store_kv`, one row per collection, so they can be promoted to typed tables later
without touching application logic. The full entity JSON is always the source of
truth on read; the typed columns exist for querying and indexing.

### The environment isolation guard

`src/lib/db.ts` refuses to open a production database from a non-production
deployment:

```ts
export function assertNotProductionData(url: string): void
```

`PROD_DATA_HOSTS` is a comma-separated list of database hosts that only
production may use. It is checked **on non-production deployments only**, so an
over-broad list can never take production down. Hosts are compared after
normalising Neon's pooled and direct endpoints (`ep-x-pooler.…` and `ep-x.…`) to
the same value, because they are the same database.

This exists because the production connection string was once scoped to "All
Environments" in Vercel, and the dev site served live customer accounts, orders
and wallet balances. Nothing in the code objected. Now it does. See
[15 — Troubleshooting](./15-troubleshooting.md).

Tests: `src/lib/db-isolation.test.ts`.

## Control-plane database (Postgres on the VM)

Created by `initDb()` in `platform/api/src/db.ts` on boot. Everything is
`CREATE TABLE IF NOT EXISTS`, so booting against an existing volume is safe.

### Tables

**`users`** — fleet accounts (separate from shop customers)

| Column | Type |
| --- | --- |
| `id` | `BIGSERIAL PRIMARY KEY` |
| `email` | `TEXT UNIQUE NOT NULL` |
| `name` | `TEXT NOT NULL DEFAULT ''` |
| `password` | `TEXT NOT NULL` (bcrypt) |
| `is_admin` | `BOOLEAN NOT NULL DEFAULT false` (added by migration) |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` |

**`devices`**

| Column | Type |
| --- | --- |
| `id` | `TEXT PRIMARY KEY` (e.g. `hub-a1b2c3`) |
| `key_hash` | `TEXT NOT NULL` (bcrypt of the device key, cost 10) |
| `owner_id` | `BIGINT REFERENCES users(id) ON DELETE SET NULL` |
| `name`, `type`, `room` | `TEXT`, defaults `''` / `'generic'` / `''` |
| `online` | `BOOLEAN NOT NULL DEFAULT false` |
| `last_seen` | `TIMESTAMPTZ` |
| `state` | `JSONB NOT NULL DEFAULT '{}'` — the last retained state |
| `fw_version` | `TEXT NOT NULL DEFAULT ''` |
| `favorite` | `BOOLEAN NOT NULL DEFAULT false` (migration) |
| `created_at` | `TIMESTAMPTZ` |

Index: `idx_devices_owner (owner_id)`.

**`telemetry`** — append-only readings

`id`, `device_id` (cascade delete), `ts`, `payload JSONB`.
Index: `idx_telemetry_device_ts (device_id, ts DESC)`.

**This is the table that grows without bound.** See
[13 — Maintenance](./13-maintenance.md#telemetry-retention).

**`commands`** — every command sent, for audit

`id`, `device_id` (cascade), `user_id` (set null), `payload JSONB`, `ts`.
Index: `idx_commands_device_ts (device_id, ts DESC)`.

**`automations`**

`id`, `owner_id` (cascade), `name`, `enabled`, `trigger JSONB`, `action JSONB`,
`created_at`. Index: `idx_automations_owner`.

`action` is either a single object **or an ordered array of up to 12 steps**.

**`rooms`** — `id`, `owner_id`, `name`, `icon`, `sort`, unique on
`(owner_id, name)`.

**`scenes`** — `id`, `owner_id`, `name`, `icon`, `actions JSONB`, `favorite`.

**`events`** — `id`, `owner_id`, `device_id`, `kind`, `title`, `body`, `read`,
`ts`. Index: `idx_events_owner_ts (owner_id, ts DESC)`.

**`push_tokens`** — `token PRIMARY KEY`, `user_id` (cascade), `platform`.

**`pending_registrations`** — `email PRIMARY KEY`, `name`, `password`,
`otp_hash`, `attempts`, `expires_at`. An account does not exist until the OTP is
verified.

**`gate_passes`** — guest access for the RFID gate: `code UNIQUE`, `valid_from`,
`valid_to`, `max_uses`, `uses`, `revoked`, `last_used`. Indexed on owner and on
code.

### Migrations

There is no migration framework. Schema changes are `CREATE TABLE IF NOT EXISTS`
and `ALTER TABLE … ADD COLUMN IF NOT EXISTS` statements executed on every boot.
Two exist today:

```sql
ALTER TABLE devices ADD COLUMN IF NOT EXISTS favorite BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users   ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
```

To add a column, append another idempotent statement. Never write a destructive
migration into this path — it runs on every container start.

## Single sign-on between them

Because the two systems hash passwords differently and hold different user
tables, credentials cannot be shared. Instead each side vouches for a customer it
has already authenticated, using email as the join key:

- **Shop → console**: `POST /api/account/sso/console` verifies the shop session
  server-side, then calls `POST /auth/federated` on the control plane, which
  returns a console JWT. The console attempts this automatically on mount.
- **Console → shop**: a shop sign-in that fails locally is retried against
  `POST /auth/login` on the control plane and adopted locally on success, so
  someone who only ever used the app keeps their password at the storefront.

Accounts created by federation get a password column filled from random bytes
nobody keeps, so they cannot be signed into directly.

The bridge is authenticated with `FEDERATION_SECRET` — an HMAC over
`<timestamp>.<email>`, compared in constant time, rejected outside a five-minute
window. It is a **server-to-server credential and must never reach a browser**.
An unset secret disables the endpoint entirely. See
[11 — Secrets](./11-secrets.md).

### The identity isolation guard

There is exactly **one** control plane, so the bridge above is the one place
where a non-production deployment can reach production identity — and for a
while it did.

`assertNotProductionData` stops dev opening the production *database*, and it
works. It never fired here, because this path makes an outbound HTTPS call and
touches no database at all. So on dev a sign-in that missed locally fell through
to `api.circuvent.com/auth/login`, the live fleet vouched for a real customer,
and `/api/account/login` then created that customer in the **dev** database with
a scrypt hash of their real password. Production users could sign in to dev, and
dev accumulated live credentials while doing it.

Note which half of it was gated: `mintConsoleSession` requires
`FEDERATION_SECRET`, but `verifyAgainstControlPlane` posts to the *public*
`/auth/login` and needed no secret at all — so it worked from dev, from any
preview URL, and from a laptop running `npm run dev`.

`PROD_IDENTITY_HOSTS` lists the control-plane hosts only production may
authenticate against. `federationAllowedHere()` in `src/lib/sso.ts` refuses both
directions when a non-production deployment is pointed at one. It copies the
database guard's safety properties exactly — checked on non-production only, an
empty list is a no-op, and hosts are not credentials — with one deliberate
difference: it **returns false rather than throwing**. A refused federation has
to be indistinguishable from a password that did not match, or a 500 that only
happens for real addresses becomes an account-enumeration oracle. It is loud in
the log and silent to the browser.

**Consequence to know about:** with the guard on, an app-only customer cannot
sign in at the dev storefront, because only the live fleet knows them. That is
the intended trade. A dev deployment that needs a working federated login needs
its own control plane, and `CONTROL_PLANE_URL` pointed at it.

Tests: `tests/sso-environment-isolation.test.ts`.

## Backups

See [13 — Maintenance](./13-maintenance.md#backups). In short: Neon has its own
point-in-time restore; the VM Postgres does not back itself up and needs a
`pg_dump` schedule.
