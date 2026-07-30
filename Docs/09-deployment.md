# 09 — Deployment

Two independent deployments: the website on Vercel, the control plane on a VM.
Neither depends on the other being up.

---

## Website — Vercel

### Project

| | |
| --- | --- |
| Project | `circuvent-technologies` |
| Team | `hema-koteswar-naidus-projects` |
| Repository | `Hemakotibonthada/circuvent-technologies` (GitHub) |
| Production branch | `main` |
| Node version | 24.x |

> The local `.vercel/project.json` in this working copy has, at times, pointed
> at a **different project** (`office-landing`). A manual `vercel deploy` from
> the repository root would then publish to the wrong project. Git pushes are
> unaffected. Check the link before deploying by hand.

### Branch → environment

| Branch | URL | `VERCEL_ENV` |
| --- | --- | --- |
| `main` | circuvent.com | `production` |
| `develop` | dev.circuvent.com | `preview` |
| anything else | generated `*.vercel.app` | `preview` |

Both deploy automatically on push. The normal flow is: land on `develop`, check
it on dev.circuvent.com, then merge to `main`.

```bash
git push hema HEAD:develop     # deploys dev.circuvent.com
git push hema HEAD:main        # deploys circuvent.com
```

### Build

`npm run build` → `next build`. Vercel runs it automatically. Run it locally
before pushing; the repository's lint baseline is noisy but the build must be
clean.

### Cron

`vercel.json` schedules two jobs:

```json
{ "path": "/api/admin/alerts/run",  "schedule": "0 8 * * *" }
{ "path": "/api/admin/reports/send","schedule": "0 4 * * *" }
```

### Rollback

Promote a previous deployment from the Vercel dashboard, or revert the commit and
push. Promotion is faster and does not rewrite history.

---

## Control plane — the VM

One VM running four containers via Docker Compose. See
[12 — VM runbook](./12-vm-runbook.md) for building a new one from scratch.

### What runs

| Service | Image | Exposed |
| --- | --- | --- |
| `caddy` | `caddy:2-alpine` | `:80`, `:443` |
| `api` | built from `platform/api` | internal only, via Caddy |
| `mosquitto` | `eclipse-mosquitto:2` | `:8883` (TLS) |
| `postgres` | `postgres:16-alpine` | internal only |

Named volumes: `pgdata`, `mosquitto_data`, `mosquitto_pw`, `caddy_data`,
`caddy_config`. **The data lives in the volumes, not the containers.**

### Deploying a change

```bash
ssh ubuntu@<vm-ip>
cd ~/<repo>/platform
git pull
docker compose up -d --build
docker compose logs -f api        # wait for: Control plane listening on :8080
```

`--build` is required for API changes; the image is built from source on the VM.

### Verify

```bash
curl https://api.circuvent.com/health     # { ok: true, db: "up" }
docker compose ps                          # all Up, postgres healthy
```

### Rollback

```bash
git checkout <previous-sha>
docker compose up -d --build
```

Because the schema is additive only (`CREATE TABLE IF NOT EXISTS`,
`ADD COLUMN IF NOT EXISTS`), rolling the API back does not corrupt the database.
A column added by the newer version simply goes unused.

### Zero-downtime is not configured

`docker compose up -d --build` restarts the API container, so there is a short
gap — a few seconds — during which REST calls fail and WebSockets drop. Clients
reconnect. Devices are unaffected: they are connected to the **broker**, not the
API, and MQTT retains their state.

Deploy when it is quiet, or add a second API replica behind Caddy if that gap
becomes unacceptable.

---

## Mobile

See [08 — Mobile application](./08-mobile-application.md). Summary: bump four
version fields, copy to a space-free path, `gradlew assembleRelease`, then verify
the APK's version and signing certificate before shipping.

---

## Order of operations for a full release

1. Merge to `develop`, verify on dev.circuvent.com.
2. Deploy the control plane if the API changed. **Do this before the web**, since
   the console may depend on a new endpoint.
3. Merge `develop` → `main` for the website.
4. Build and distribute the app if the mobile client changed.
5. Push firmware OTA last, if any.

Rationale: every layer above the control plane can tolerate the API being ahead
of it, but not behind it.
