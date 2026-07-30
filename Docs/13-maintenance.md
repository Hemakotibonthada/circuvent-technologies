# 13 — Maintenance

## Routine

| Cadence | Task |
| --- | --- |
| Weekly | Mosquitto certificate reload (cron, already scheduled) |
| Weekly | Check `df -h` on the VM |
| Monthly | `docker compose pull && docker compose up -d` for base image patches |
| Monthly | Review telemetry table size |
| Quarterly | Rotate admin passwords (the policy forces this at 90 days) |
| Quarterly | Verify a backup actually restores |

## Backups

### Shop database (Neon)

Neon provides point-in-time restore. Check the retention window on your plan;
free tiers are short. If the shop data matters, take periodic logical dumps too.

### Control-plane database — **not backed up by default**

Nothing on the VM backs itself up. Set this up:

```bash
# /home/ubuntu/backup-db.sh
set -euo pipefail
cd /home/ubuntu/<repo>/platform
STAMP=$(date +%F)
docker compose exec -T postgres pg_dump -U circuvent circuvent \
  | gzip > "/home/ubuntu/backups/circuvent-$STAMP.sql.gz"
find /home/ubuntu/backups -name 'circuvent-*.sql.gz' -mtime +30 -delete
```

```bash
mkdir -p /home/ubuntu/backups && chmod +x /home/ubuntu/backup-db.sh
# crontab -e
30 3 * * *  /home/ubuntu/backup-db.sh
```

Copy them **off the VM** — a backup on the machine you are protecting against is
not a backup.

Restore:

```bash
gunzip -c circuvent-2026-07-29.sql.gz | \
  docker compose exec -T postgres psql -U circuvent -d circuvent
```

### Things that are not in git and must be backed up separately

- `platform/.env`
- `platform/mosquitto/certs/` (the CA — losing it means reflashing every device)
- The `mosquitto_data` volume (`dynamic-security.json` = every device credential)
- `mobile/credentials/circuvent-upload.jks` (losing it means you can never update
  the app again)

## Telemetry retention

`telemetry` is append-only and **grows without bound**. Every state and telemetry
message from every device becomes a row. Nothing prunes it today.

Check the size:

```sql
SELECT pg_size_pretty(pg_total_relation_size('telemetry')) AS telemetry,
       pg_size_pretty(pg_database_size('circuvent'))       AS total;

SELECT device_id, count(*), min(ts), max(ts)
FROM telemetry GROUP BY device_id ORDER BY count DESC LIMIT 20;
```

Prune when it gets large:

```sql
DELETE FROM telemetry WHERE ts < now() - interval '90 days';
```

Then reclaim space — a plain `DELETE` does not return disk to the OS:

```sql
VACUUM (ANALYZE, VERBOSE) telemetry;
-- or, with an exclusive lock and enough free disk:
VACUUM FULL telemetry;
```

If retention becomes routine, partition `telemetry` by month and drop old
partitions instead — dropping a partition is instant and needs no vacuum.

`commands` grows too, more slowly, and is an audit trail. Keep it longer.

## Monitoring

There is no monitoring stack. The endpoints exist:

| Check | Endpoint |
| --- | --- |
| API + database | `GET https://api.circuvent.com/health` → `{ ok, db }` |
| Deeper fleet health | `GET /admin/health` (admin token) — MQTT, DB, uptime |
| Website | `GET https://circuvent.com/` |

Point any uptime service at `/health` and the website root. If `/health` returns
`db: "down"`, the API is up but Postgres is not — usually the disk.

Logs:

```bash
docker compose logs --tail=500 api | grep -i error
```

The API logs structured JSON via pino. Useful greps: `automation action failed`,
`dynsec command error`, `federated sign-in`.

## Certificate expiry

- Vercel and Caddy renew automatically.
- The **broker CA** from `gen-certs.sh` has a fixed lifetime. Check it:

```bash
openssl x509 -in platform/mosquitto/certs/ca.crt -noout -enddate
```

Plan the rollover well in advance: devices embed this CA, so replacing it needs a
firmware update pushed **before** the old CA expires. This is the single
maintenance task with the longest lead time.

## Dependency updates

Website and mobile:

```bash
npm outdated
npm audit
```

Control plane: rebuild picks up patch versions of the base image.

```bash
docker compose pull && docker compose up -d --build
```

Test on `develop` first; the website deploys there automatically.

## Admin password rotation

`src/lib/admin-password-policy.ts` enforces:

- 12 characters minimum, with upper, lower, digit and symbol
- rejects the account's own email/name, sequential runs, repeats, common
  passwords
- expires after **90 days**, warning from day 76
- the last **5** bcrypt hashes are kept and a candidate is compared against all
  of them, so passwords cannot be recycled

Nothing to do routinely — the policy prompts at login.

## Health checklist after any deploy

```bash
curl -s https://api.circuvent.com/health          # { ok: true, db: "up" }
curl -sI https://circuvent.com | head -1          # 200
curl -sI https://circuvent.com/robots.txt | grep -i x-robots-tag   # nothing
docker compose ps                                   # all Up
```

Then open the console, confirm a device shows **online**, and toggle something.
The round trip through MQTT is the only real end-to-end test.
