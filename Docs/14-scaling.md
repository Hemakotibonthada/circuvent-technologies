# 14 — Scaling

Where this system breaks as it grows, in the order it will actually break, with
the cheapest fix for each.

## What scales for free

The website is on Vercel and scales itself. Static pages are on a CDN; route
handlers are serverless. Neon scales its compute independently of storage. None
of this needs attention until the bill does.

The rest of this document is about the control plane, which is one VM.

## Order of failure

Based on how the system is built, not on speculation:

| # | Bottleneck | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | **`telemetry` table growth** | Disk fills; `/health` reports `db: "down"` | Retention + partitioning ([13](./13-maintenance.md#telemetry-retention)) |
| 2 | **Camera streaming** | Broker and API CPU spike when cameras are watched | Move broker to its own host; cap concurrent viewers |
| 3 | **API CPU** | Slow REST, WebSocket lag | Multiple API replicas behind Caddy |
| 4 | **Postgres write throughput** | Telemetry inserts back up | Managed Postgres, or batch inserts |
| 5 | **Broker connections** | Devices fail to connect | Bigger VM, then a broker cluster |

Number 1 will happen long before the others. Set retention up before you need it.

## Why the design holds up

Several decisions already remove the obvious scaling problems:

- **No polling.** Devices push; the API fans out over WebSocket. Adding a device
  adds its own message rate, not a multiplier on everyone else's.
- **Retained `state`.** A newly connected app gets current values from the broker
  instead of querying the database.
- **Frames are never persisted.** The one high-volume payload never touches
  Postgres.
- **Frames are opt-in.** An app not showing a camera is off the video path
  entirely — no cost for idle phones.
- **Ownership checked per frame** with a set lookup before any base64 work, so an
  unwatched camera costs almost nothing.

## Sizing

Rough numbers for planning, from the shape of the traffic rather than a load
test — measure before committing.

A typical device publishes state on change plus telemetry every few seconds: a
few hundred bytes, a few times a minute. Thousands of such devices are a small
message rate for Mosquitto, and the API's work per message is a JSON parse, one
insert and a fan-out.

Cameras are different by orders of magnitude. One camera at 8 fps and ~20 KB per
frame is ~160 KB/s **per viewer**, and the API base64-encodes each frame per
socket. Ten simultaneous viewers is a different machine from a thousand idle
sensors.

Plan capacity on **concurrent camera viewers**, not device count.

## Scaling steps

### 1. Telemetry retention (do this first)

Partition by month and drop old partitions. Dropping a partition is instant;
`DELETE` + `VACUUM FULL` needs an exclusive lock and free disk equal to the
table.

### 2. Separate the database

Move Postgres to a managed service or its own host. It is a `DATABASE_URL`
change plus removing the service from compose. See
[12 — VM runbook](./12-vm-runbook.md#adding-a-second-vm).

Take a `pg_dump`, restore, repoint, redeploy.

### 3. Separate the broker

Move Mosquitto to its own host, keeping the **same certificates** — devices trust
that CA — and copying the `mosquitto_data` volume so `dynamic-security.json`
(every device credential) travels with it. Repoint `mqtt.circuvent.com`. Devices
reconnect on their own.

### 4. Multiple API replicas

```bash
docker compose up -d --scale api=3
```

Caddy load-balances. Things to know before you do this:

- **WebSockets are pinned.** A client's socket lives on one replica. That is
  fine: every replica subscribes to MQTT and fans out to its own sockets.
- **Every replica receives every message**, so MQTT-side work multiplies by the
  replica count. This scales HTTP and fan-out, not ingestion.
- **The automation scheduler runs in every replica.** It polls every 20 s and
  de-duplicates by minute *in memory*, so N replicas will fire a time-based
  automation up to N times. **Fix this before scaling out** — either elect a
  single scheduler, or move de-duplication into the database with a unique
  constraint on `(automation_id, minute)`.

That last point is a real constraint in today's code, not a hypothetical.

### 5. Beyond one region

The stack is single-region. Multi-region needs a broker cluster (Mosquitto does
not cluster natively — EMQX or VerneMQ do), a replicated database, and
region-aware DNS. That is a rebuild of the transport layer, not a config change.
Do not go there before the previous four steps are exhausted.

## Cost

Today: one free-tier VM, one Neon free/low tier, Vercel. Effectively zero.

First real costs, in the order they arrive:

1. Neon compute, as shop traffic grows.
2. A paid VM once the free tier's RAM or disk is exceeded.
3. Vercel bandwidth, if marketing traffic grows sharply.
4. A second VM when the broker or the database needs its own host.

## What to measure

Before scaling anything, know:

| Metric | How |
| --- | --- |
| Telemetry rows and table size | The SQL in [13](./13-maintenance.md#telemetry-retention) |
| Device count and online ratio | `GET /admin/stats` |
| Container CPU and memory | `docker stats --no-stream` |
| Disk | `df -h` |
| Concurrent camera viewers | Count `watch` messages in the API log |

Scaling without these is guessing.
