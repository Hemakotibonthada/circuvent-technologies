# 40 — The control-plane VM: operations manual

Everything about `circuvent-cp`: how to reach it, what runs on it, how to deploy
to it, how to migrate its database, and what to do when it misbehaves.

This is the **operational** document — the machine as it actually is today, with
values read off the running host rather than from memory. Two companions cover
different ground and are not repeated here:

- [12 — VM runbook](./12-vm-runbook.md) — how to *build* a VM from scratch, when
  to split onto a second one, and disaster recovery.
- [09 — Deployment](./09-deployment.md) — the release process across all three
  targets (Vercel, VM, mobile).

---

## 1. Identity and access

| | |
| --- | --- |
| Hostname | `circuvent-cp` |
| Public IP | **140.245.238.154** |
| Provider | Oracle Cloud (KVM virtual machine, x86_64) |
| OS | Ubuntu |
| Login user | `ubuntu` (passwordless `sudo`) |
| Private key | `Creds/circuvent-cp.key` in this repository |
| Deploy root | `/home/ubuntu/circuvent-platform` |
| Public name | `api.circuvent.com` → this IP |

```bash
ssh -i Creds/circuvent-cp.key ubuntu@140.245.238.154
```

On Windows, `Creds\circuvent-cp.key`. If SSH refuses the key as "too open",
that is the file's ACL, not the key:

```powershell
icacls Creds\circuvent-cp.key /inheritance:r /grant:r "$($env:USERNAME):(R)"
```

> **The key in `Creds/` is the only way in.** There is no password login and no
> console access configured. Losing it means rebuilding the VM from
> [12 — VM runbook](./12-vm-runbook.md). Keep a copy somewhere that is not this
> laptop.

Almost every command below assumes you are in the deploy root:

```bash
cd ~/circuvent-platform
```

---

## 2. What the machine is

Read from the host on 2026-08-20:

| Resource | Value | Comment |
| --- | --- | --- |
| vCPU | 2 | |
| RAM | **956 MiB** | This is a 1 GB shape |
| Swap | 3 GiB, **~518 MiB in use** | Not decorative — see below |
| Disk | 45 GB, 13 GB used (28 %) | |
| Docker | 29.6.2 | |
| Compose | v5.3.1 | |

**The swap figure is the one to pay attention to.** Half a gigabyte of swap is
in use on a machine with under a gigabyte of RAM, which means the working set
already exceeds physical memory. It works — the API is I/O-bound and mostly
idle — but it explains why `docker compose up --build` is slow, and it is why
the swapfile must never be removed. Building the API image with no swap gets the
compiler OOM-killed partway through `npm ci`, and the failure looks like a
corrupt download rather than exhausted memory.

---

## 3. What runs on it

```
                    ┌──────────────────────────────────────────────┐
  Internet          │  circuvent-cp   140.245.238.154              │
      │             │                                              │
      │  :80/:443   │   ┌────────┐        ┌───────────┐            │
      ├────────────▶│──▶│ caddy  │───────▶│    api    │──┐         │
      │             │   │  TLS   │  :8080 │  Node 20  │  │         │
      │             │   └────────┘        └───────────┘  │         │
      │             │                           │        │         │
      │             │                           │  :8000 │  :5432  │
      │  :8883      │   ┌───────────┐           ▼        ▼         │
      └────────────▶│──▶│ mosquitto │◀────  ┌──────┐ ┌──────────┐  │
        (devices)   │   │   MQTT    │ :1883 │ face │ │ postgres │  │
                    │   └───────────┘       └──────┘ └──────────┘  │
                    └──────────────────────────────────────────────┘
                          published          internal only
```

| Service | Image | Ports | Restart | Purpose |
| --- | --- | --- | --- | --- |
| `caddy` | `caddy:2-alpine` | **80, 443 published** | `unless-stopped` | TLS termination, reverse proxy for `api.circuvent.com` |
| `api` | built from `platform/api` | 8080 *internal* | `unless-stopped` | The control plane: REST, WebSocket, MQTT client, schedulers |
| `face` | built from `platform/face` | 8000 *internal* | `unless-stopped` | Face-embedding service used by door/attendance recognition |
| `mosquitto` | `eclipse-mosquitto:2` | **8883 published**, 1883 internal | `unless-stopped` | Device MQTT broker over TLS |
| `postgres` | `postgres:16-alpine` (16.14) | 5432 *internal* | `unless-stopped` | Control-plane database |

Only **80, 443 and 8883** are reachable from outside, plus 22 for SSH. The API,
the face service and the database have no published port at all — they are only
addressable on the compose network.

> `face` is a fifth container that older documentation omits. If you are
> reconciling this against [12 — VM runbook](./12-vm-runbook.md), that table is
> missing it.

### Named volumes — the part that matters

```
circuvent-platform_pgdata           the entire control-plane database
circuvent-platform_mosquitto_data   dynamic-security.json — every device credential
circuvent-platform_mosquitto_pw     broker password file
circuvent-platform_caddy_data       issued TLS certificates
circuvent-platform_caddy_config     Caddy's autosave config
```

**Deleting a container is safe. Deleting a volume is not.** `docker compose down
-v` destroys all five. There is no automated database backup (see §8), so on
this machine that flag is unrecoverable data loss.

---

## 4. Deploying a change

The VM has **no git checkout**. It is deployed to by upload: you build a tarball
locally, copy it up, and run the deploy script. That script takes the backup,
unpacks, rebuilds, and refuses to claim success until the container reports
healthy.

### The whole procedure

```powershell
# 1. From the repo root, on your machine.
cd platform
tar --exclude=node_modules --exclude=dist --exclude=.env `
    -czf $env:TEMP\cv-deploy.tar.gz api docker-compose.yml scripts

# 2. Verify before uploading: the archive must NOT contain .env.
tar -tzf $env:TEMP\cv-deploy.tar.gz | Select-String "\.env$"    # expect no output

# 3. Upload.
cd ..
scp -i Creds\circuvent-cp.key $env:TEMP\cv-deploy.tar.gz `
    ubuntu@140.245.238.154:~/cv-deploy.tar.gz

# 4. Deploy. BUILD_COMMIT stamps /health so a stale container identifies itself.
ssh -i Creds\circuvent-cp.key ubuntu@140.245.238.154 `
  "cd ~/circuvent-platform && BUILD_COMMIT=$(git rev-parse --short HEAD) bash scripts/deploy.sh ~/cv-deploy.tar.gz"
```

Three details in there are not optional:

**Exclude `.env`.** The live secrets are at `~/circuvent-platform/.env` on the
VM and are deliberately absent from the repository. `tar -xzf` only overwrites
paths present in the archive, so an archive without `.env` leaves the real one
alone — and an archive *with* one silently replaces every production secret with
whatever was on your laptop. The check in step 2 costs nothing.

**Pass the tarball as an argument.** `deploy.sh ~/cv-deploy.tar.gz` backs up the
currently-running code *before* unpacking. Extracting the tarball yourself and
then running `deploy.sh` with no argument archives the **new** code and calls it
a rollback — a safety net that hands you back exactly the build you were trying
to escape.

**Invoke it with `bash`.** A tar created on Windows drops the execute bit, so
`./scripts/deploy.sh` dies with "Permission denied" after the upload and before
the build.

### What the script does

1. Computes `BUILD_COMMIT` and `BUILD_TIME` and stamps them into the image, so
   `/health` can report which build is running.
2. Archives `api/`, `docker-compose.yml` and `scripts/` to
   `~/backup-api-<timestamp>.tar.gz`, keeping the five most recent.
3. `docker compose up -d --build`.
4. Polls the container's own healthcheck for up to 80 seconds. On `unhealthy`
   it prints the last 40 log lines and exits non-zero; it never reports success
   while the API is failing.

### Verifying

```bash
curl -s https://api.circuvent.com/health
```

```json
{"ok":true,"service":"circuvent-control-plane","db":"up","version":"1.0.0",
 "commit":"4c44600","builtAt":"2026-08-20T10:03:32Z","capabilities":[...]}
```

`"commit":"unknown"` means somebody deployed without the stamp — the build is
running but you cannot tell which one it is. That is the exact failure
`deploy.sh` exists to prevent, so it also means the script was bypassed.

### Rolling back

```bash
cd ~/circuvent-platform
ls -t ~/backup-api-*.tar.gz | head        # pick the one from before the bad deploy
tar -xzf ~/backup-api-<timestamp>.tar.gz
docker compose up -d --build
```

These archives contain **code only**. A rollback does not undo a schema change,
which is why §5 insists migrations stay additive.

### There is no zero-downtime deploy

`docker compose up -d --build` stops the old container before starting the new
one. The API is unavailable for roughly the length of the build. Devices
reconnect on their own — MQTT clients retry, and the mobile app retries — so the
practical effect is a gap in telemetry, not a broken fleet. Deploy when a
minute of unavailability is acceptable.

---

## 5. Migrations

**There is no migration tool, no `migrations/` directory and no version table.**
The schema is declared in code, in `platform/api/src/db.ts`, and applied by
`initDb()` — the first thing `main()` awaits, before the HTTP server listens.

Today that file holds:

| Statement | Count |
| --- | --- |
| `CREATE TABLE IF NOT EXISTS` | 57 |
| `CREATE INDEX IF NOT EXISTS` | 75 |
| `ALTER TABLE … ADD COLUMN IF NOT EXISTS` | ~20 |

Every statement is idempotent, so the whole file re-runs safely on every boot.
That is the entire mechanism: **the schema converges to whatever `db.ts` says,
each time the API starts.**

### Adding a column or table — the normal case

1. Edit `platform/api/src/db.ts`. Append to the relevant section:

   ```sql
   ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '';
   ```

2. Deploy (§4). `initDb()` applies it during startup.
3. Confirm:

   ```bash
   docker compose exec -T postgres psql -U circuvent -d circuvent -c "\d users"
   ```

No separate migration step, no downtime beyond the deploy itself. A new
`NOT NULL` column **must** have a `DEFAULT`, or the statement fails against a
table that already has rows.

### What this mechanism cannot do

`IF NOT EXISTS` expresses "make sure this exists". It cannot express *change* or
*removal*, so these are **not** supported and must be done by hand:

| Change | Why it needs manual work |
| --- | --- |
| Rename a column | `db.ts` would just add the new name and leave the old one |
| Drop a column or table | Nothing in `db.ts` ever drops anything |
| Change a column's type | `ADD COLUMN IF NOT EXISTS` sees the column exists and does nothing |
| Add a constraint to existing data | Fails if any existing row violates it |
| Backfill values | Not a schema operation at all |

For any of those, run the SQL directly, then update `db.ts` so a rebuilt VM
arrives at the same shape:

```bash
cd ~/circuvent-platform
# Take a dump first — see §8. This is the one moment it is not optional.
docker compose exec -T postgres psql -U circuvent -d circuvent
```

Do the destructive step and the `db.ts` edit in the **same** change. A rename
applied only on the VM leaves a rebuilt machine with the old name, and nothing
will tell you until the rebuild.

### If a migration fails

`initDb()` runs before `listen()`, so a failing statement means **the API never
starts** and the healthcheck never passes. `deploy.sh` catches this and prints
the logs. This is the good failure mode: loud, immediate, and it stops a broken
schema from being served. Fix the statement and redeploy; the previous container
is already gone, so the fastest recovery is usually forward.

```bash
docker compose logs --tail=60 api
```

### Reaching the database directly

```bash
cd ~/circuvent-platform
docker compose exec -T postgres psql -U circuvent -d circuvent -c "\dt"       # tables
docker compose exec -T postgres psql -U circuvent -d circuvent -c "\d users"  # one table
```

Database `circuvent`, user `circuvent`, Postgres **16.14**. Currently **17 MB
across 57 tables**. The largest are telemetry-shaped and will keep growing:

| Table | Size | Rows |
| --- | --- | --- |
| `telemetry` | 2792 kB | 8 755 |
| `commands` | 1136 kB | 4 172 |
| `plate_reads` | 904 kB | 1 465 |
| `scheduler_ticks` | 616 kB | 2 902 |

At 13 GB used of 45 GB there is a lot of headroom, but these four grow
monotonically and nothing prunes them automatically.

---

## 6. Configuration and secrets

Two env files, both on the VM only, both absent from git:

**`~/circuvent-platform/.env`** — read by `docker compose`. 23 keys:

```
ADMIN_EMAILS           FACE_BASE_URL              S3_ACCESS_KEY_ID
ANPR_PROVIDER          FACE_EMBEDDER              S3_BUCKET
AUTH_ISSUER            FEDERATION_SECRET          S3_FORCE_PATH_STYLE
CORS_ORIGIN            JWT_SECRET                 S3_PRESIGN_GET
EMAIL_FROM             MQTT_CONTROL_PLANE_PASSWORD S3_REGION
OTP_DEBUG              POSTGRES_PASSWORD          S3_SECRET_ACCESS_KEY
RESEND_API_KEY         R2_ACCOUNT_ID              SMARTHOME_CLIENT_ID
SSO_CLIENT_ID          SMARTHOME_CLIENT_SECRET
```

**`~/circuvent-platform/.env.logs`** — read by the nightly log archiver:
`LOG_BUCKET`, `R2_ACCOUNT_ID`, `S3_ACCESS_KEY_ID`, `S3_REGION`,
`S3_SECRET_ACCESS_KEY`.

Changing a value takes effect on container recreate:

```bash
cd ~/circuvent-platform
nano .env
docker compose up -d          # recreates only what changed
```

Write secrets in via stdin or an editor, never as a shell argument — arguments
land in `~/.bash_history` and in the process table where any user can read them.

> `FEDERATION_SECRET` has bitten this system before. It was set on Vercel and
> never on the VM, so `POST /auth/federated` returned `404 Federation is not
> enabled` and every storefront sign-in hand-off failed silently for weeks. If
> shop and console accounts stop linking, check that this value is present here
> **and** identical on Vercel.

---

## 7. Scheduled work

Two user cron jobs, both sourcing `.env.logs` for their R2 credentials:

```
17 0 * * *  … python3 scripts/archive-logs.py --commit  >> ~/archive-logs.out
37 0 * * *  … python3 scripts/backup-db.py    --commit  >> ~/backup-db.out
```

**00:17 UTC** — gzips the previous day's container logs, uploads them to R2
under `logs/<service>/<yyyy>/<mm>/<dd>.log.gz`, removes the local copy.

**00:37 UTC** — dumps the database to R2 under `db/<yyyy>/<mm>/<stamp>.dump`
and keeps 14 local copies. See §8.

Check either:

```bash
tail -20 ~/archive-logs.out
tail -20 ~/backup-db.out
```

There is **no root crontab**. In particular the broker-certificate reload cron
described in step 9 of [12 — VM runbook](./12-vm-runbook.md) is *not* installed
on this machine (see §9).

---

## 8. Backups — read this one

The deploy script keeps five rotated `~/backup-api-*.tar.gz` archives. **Those
contain code, not data.**

> ### The database had no backup at all until 2026-08-20.
>
> An audit that day found no `pg_dump` on disk, no backup script, no cron entry
> and nothing in R2 but logs. The `circuvent-platform_pgdata` volume was the
> **only** copy of every user, device registration, telemetry row and ANPR plate
> read. One `docker compose down -v`, or one lost VM, and all of it was gone.
>
> `scripts/backup-db.py` now closes this. Read the rest of this section anyway —
> knowing how to take and restore one by hand is the point of having them.

### Automatic

```
37 0 * * *  cd ~/circuvent-platform && set -a && . ./.env.logs && set +a \
            && /usr/bin/python3 scripts/backup-db.py --commit \
            >> ~/backup-db.out 2>&1
```

Nightly at **00:37 UTC** — twenty minutes after the log archiver, so the two
never overlap — it takes a custom-format `pg_dump`, uploads it to R2 under
`db/<yyyy>/<mm>/<stamp>.dump`, and keeps the last 14 locally in `~/db-backups`
as a fallback for when R2 itself is unreachable.

It refuses to upload anything that does not begin with `PGDMP` or that comes in
under 20 KB. `docker compose exec` can exit 0 while producing an empty or
truncated stream — a container that went away mid-write, a disk that filled —
and a bucket full of files that list fine and restore into nothing is a problem
you discover during a recovery, which is the worst moment available.

Check on it:

```bash
tail -20 ~/backup-db.out
ls -lh ~/db-backups/
```

### By hand

Take one before any manual migration:

```bash
cd ~/circuvent-platform
set -a && . ./.env.logs && set +a
python3 scripts/backup-db.py            # dry run — dumps and reports, uploads nothing
python3 scripts/backup-db.py --commit   # dump, upload, rotate
```

Or the raw command, with no R2 involved:

```bash
docker compose exec -T postgres pg_dump -U circuvent -Fc circuvent \
  > ~/cv-db-$(date -u +%Y%m%d-%H%M%S).dump
```

### Verifying one

A backup nobody has read is a hypothesis. `pg_restore -l` lists the archive's
contents without touching the database:

```bash
docker compose exec -T postgres pg_restore -l < ~/db-backups/<stamp>.dump | head -20
```

A healthy dump of this system lists ~198 objects and includes
`TABLE DATA public users`.

### Restoring

```bash
docker compose exec -T postgres pg_restore -U circuvent -d circuvent --clean \
  < cv-db-<timestamp>.dump
```

`--clean` drops each object before recreating it, so this overwrites the live
database. Take a fresh dump first even when restoring — especially when
restoring.

Copy backups off the machine periodically; R2 covers this automatically, but for
a manual dump:

```powershell
scp -i Creds\circuvent-cp.key ubuntu@140.245.238.154:~/db-backups/*.dump .
```

Also keep off-machine copies of `~/circuvent-platform/.env` and
`platform/mosquitto/certs/` — without the CA, every deployed device must be
reflashed.

---

## 9. Certificates

| Certificate | Managed by | Expires |
| --- | --- | --- |
| `api.circuvent.com` (HTTPS) | Caddy, automatic | renews itself |
| Device CA (`Circuvent Device CA`) | `scripts/gen-certs.sh` | **2036-07-21** |
| Broker server cert (`mqtt.circuvent.com`) | `scripts/renew-server-cert.sh` | **2028-10-26** |

Caddy needs port 80 reachable to renew; if it is ever firewalled off, HTTPS
keeps working until the certificate lapses and then fails all at once.

The broker's server certificate is the one with a human deadline. Renew with
`scripts/renew-server-cert.sh` well before **October 2028** — when it expires,
every device fails TLS to the broker simultaneously and the entire fleet goes
offline at the same moment. The runbook's step 9 suggests a cron to reload it;
that cron is **not installed here**, so today this is a diary entry, not
automation.

The device CA is good until 2036. Replacing it means reflashing every device,
so it is effectively permanent — guard `mosquitto/certs/` accordingly.

---

## 10. Troubleshooting

Start here, always:

```bash
curl -s https://api.circuvent.com/health          # from anywhere
cd ~/circuvent-platform && docker compose ps      # on the VM
docker compose logs --tail=80 api
```

### The site is up but the API is unreachable

`/health` times out, or the app shows a network error.

```bash
docker compose ps                    # is api Up (healthy)?
docker compose logs --tail=80 api
docker compose restart api
```

If `api` is restarting in a loop, it is almost always a bad `.env` value or a
failing migration — both surface in the first 20 log lines.

### `/health` reports `"db":"down"`

```bash
docker compose ps postgres
docker compose logs --tail=40 postgres
df -h /                              # a full disk stops Postgres accepting writes
```

Postgres has a healthcheck (`pg_isready`, 10 s interval, 5 retries) and the API
waits for it, so "db down" with Postgres healthy points at `POSTGRES_PASSWORD`
or `DATABASE_URL` disagreeing after an `.env` edit.

### Devices are offline / not publishing

The broker is the only publicly-exposed service besides HTTPS.

```bash
docker compose ps mosquitto
docker compose logs --tail=60 mosquitto
sudo ss -lntp | grep 8883                       # is the port actually listening?
openssl s_client -connect 140.245.238.154:8883 -showcerts </dev/null | head -20
```

Watch live traffic:

```bash
docker compose exec mosquitto mosquitto_sub -h localhost -p 1883 \
  -u control-plane -P "$MQTT_CONTROL_PLANE_PASSWORD" -t 'cv/#' -v
```

Silence on `cv/#` while the container is healthy means the devices cannot reach
port 8883 — check both firewalls (§11), not the broker.

### TLS errors on `api.circuvent.com`

```bash
docker compose logs --tail=60 caddy
sudo ss -lntp | grep ':80'
```

Caddy renews over port 80. If port 80 was closed at the cloud firewall, renewal
fails quietly for weeks and then HTTPS breaks with no deploy having happened.

### The VM feels slow, or a build fails midway

With 956 MiB of RAM, memory is the usual answer.

```bash
free -h
swapon --show                        # the 3 GiB swapfile MUST be present
docker system df
```

If the swapfile is missing, restore it before doing anything else:

```bash
sudo fallocate -l 3G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### The disk is filling up

```bash
df -h /
docker system df
sudo du -sh ~/circuvent-platform ~/backup-api-*.tar.gz 2>/dev/null
docker system prune -f               # safe: images and stopped containers only
```

`docker system prune -f` never touches named volumes. **Do not** add `--volumes`.

### A deploy "succeeded" but nothing changed

```bash
curl -s https://api.circuvent.com/health | grep -o '"commit":"[^"]*"'
```

If that is not the commit you deployed, the browser or an intermediary is not
the problem — the build did not replace the container. Redeploy with
`BUILD_COMMIT` set (§4).

### Getting a shell inside a container

```bash
docker compose exec api sh
docker compose exec -T postgres psql -U circuvent -d circuvent
```

### Full restart, in order of escalation

```bash
docker compose restart api           # one service
docker compose up -d                 # recreate what drifted from the config
docker compose down && docker compose up -d --build   # everything; keeps volumes
```

Never `docker compose down -v`. That deletes the volumes, and §8 explains why
that is currently unrecoverable.

---

## 11. Networking and firewall

Two firewalls must agree, and forgetting the second is the most common
networking failure on Oracle images.

**OS firewall** — current `iptables` INPUT policy on this host:

```
ACCEPT  RELATED,ESTABLISHED
ACCEPT  icmp
ACCEPT  lo
ACCEPT  tcp dport 22      (SSH)
ACCEPT  tcp dport 8883    (MQTT over TLS)
ACCEPT  tcp dport 443     (HTTPS)
ACCEPT  tcp dport 80      (HTTP — needed for certificate renewal)
REJECT  everything else   (icmp-host-prohibited)
```

Adding a port:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport <PORT> -j ACCEPT
sudo netfilter-persistent save
```

**Cloud firewall** — the Oracle VCN Security List / NSG must open the same
ports. A rule present in only one of the two produces a connection that hangs
rather than refuses, which is why it is often misread as an application fault.

---

## 12. Quick reference

```bash
# Connect
ssh -i Creds/circuvent-cp.key ubuntu@140.245.238.154
cd ~/circuvent-platform

# Status
curl -s https://api.circuvent.com/health
docker compose ps
docker compose logs --tail=80 api

# Deploy  (build the tarball locally first — §4)
BUILD_COMMIT=$(git rev-parse --short HEAD) bash scripts/deploy.sh ~/cv-deploy.tar.gz

# Database
docker compose exec -T postgres psql -U circuvent -d circuvent
docker compose exec -T postgres pg_dump -U circuvent -Fc circuvent > ~/cv-db-$(date -u +%Y%m%d).dump

# Restart
docker compose restart api
docker compose up -d

# Rollback code
tar -xzf ~/backup-api-<timestamp>.tar.gz && docker compose up -d --build
```

| Fact | Value |
| --- | --- |
| IP | 140.245.238.154 |
| SSH | `ubuntu` + `Creds/circuvent-cp.key` |
| Root | `~/circuvent-platform` |
| Public endpoint | `https://api.circuvent.com` |
| Broker | `mqtt.circuvent.com:8883` |
| Database | `circuvent` / `circuvent`, Postgres 16.14 |
| Deploy | `scripts/deploy.sh <tarball>` |
| Migrations | automatic, `db.ts` → `initDb()` at boot |
| DB backups | nightly 00:37 UTC → R2 `db/`, 14 local in `~/db-backups` |
