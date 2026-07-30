# 12 — VM runbook

Everything about the machine that runs the control plane: what it is, what runs
on it, how to rebuild it, and when you need a second one.

## The current VM

A single small VM running Docker Compose. The stack is deliberately portable —
it is only Docker — so it runs equally well on Oracle Cloud "Always Free", a €4
VPS, a mini-PC or a Raspberry Pi.

`platform/ORACLE_SETUP.md` has the click-by-click Oracle walkthrough. This
document is the operational view.

| Requirement | Minimum | Comfortable |
| --- | --- | --- |
| vCPU | 1 | 2–4 |
| RAM | 1 GB **plus swap** | 4 GB+ |
| Disk | 20 GB | 50 GB+ (telemetry grows) |
| OS | Ubuntu 22.04 | same |

On a 1 GB shape you **must** add swap or the API container will be OOM-killed
during `npm ci`.

## What runs on it

```
Internet ──▶ :80/:443  caddy   ──internal──▶  api:8080  ──▶ postgres:5432
         └─▶ :8883     mosquitto ◀──internal──┘
```

| Container | Image | Port | Notes |
| --- | --- | --- | --- |
| `caddy` | `caddy:2-alpine` | 80, 443 | Automatic TLS for `api.circuvent.com` |
| `api` | built from `platform/api` | — | Only reachable through Caddy |
| `mosquitto` | `eclipse-mosquitto:2` | 8883 | TLS listener for devices; 1883 internal only |
| `postgres` | `postgres:16-alpine` | — | Never exposed |

Data lives in named volumes: `pgdata`, `mosquitto_data`, `mosquitto_pw`,
`caddy_data`, `caddy_config`. **Deleting a container is safe. Deleting a volume
is not.**

## Building a VM from scratch

### 1. Launch and open ports

Ubuntu 22.04. Open **80, 443 and 8883/tcp** in *both* firewalls:

- the cloud firewall (on Oracle, the VCN Security List / NSG), and
- the OS firewall — Oracle's Ubuntu image blocks everything except 22.

Missing the second one is the single most common failure. On Oracle:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80   -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443  -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 8883 -j ACCEPT
sudo netfilter-persistent save
```

### 2. Swap, if the VM has 1 GB

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 3. Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker
```

### 4. DNS

Point `api.circuvent.com` and `mqtt.circuvent.com` at the VM's public IP
**before** first boot — Caddy needs to answer an ACME challenge on port 80 to
issue a certificate.

### 5. Code and secrets

```bash
git clone <repo> && cd <repo>/platform
cp .env.example .env
# fill in every value; openssl rand -base64 24
```

See [11 — Secrets](./11-secrets.md).

### 6. Broker certificates

```bash
./scripts/gen-certs.sh
```

This generates Circuvent's own CA and the broker's server certificate into
`platform/mosquitto/certs`. Device firmware embeds `ca.crt` to trust it, so
**regenerating the CA invalidates every deployed device** — do not do it casually.

### 7. Boot

```bash
docker compose up -d --build
docker compose logs -f api      # wait for: Control plane listening on :8080
```

First boot takes ~30 s longer while Caddy obtains certificates.

### 8. Verify

```bash
curl https://api.circuvent.com/health          # { ok: true, db: "up" }
docker compose ps                               # all Up; postgres healthy
```

There is **no manual broker user step**. The API bootstraps the dynsec roles and
creates the control-plane client itself. Ignore `README.md` steps 6 and 7.2 — see
[04 — MQTT protocol](./04-mqtt-protocol.md).

### 9. Certificate reload cron

```bash
# crontab -e
0 4 * * 0  cd /home/ubuntu/<repo>/platform && docker compose kill -s HUP mosquitto
```

Caddy renews automatically; Mosquitto reads its certificate only at start.

## Day-to-day operations

```bash
cd ~/<repo>/platform

docker compose ps                    # what is running
docker compose logs -f api           # follow API logs
docker compose logs --tail=200 mosquitto
docker compose restart api           # restart one service
docker compose up -d --build         # deploy new code
docker stats --no-stream             # CPU / memory per container
df -h                                # disk
```

Open a database shell:

```bash
docker compose exec postgres psql -U circuvent -d circuvent
```

Watch the whole bus:

```bash
docker compose exec mosquitto mosquitto_sub -h localhost -p 1883 \
  -u control-plane -P "$MQTT_CONTROL_PLANE_PASSWORD" -t 'cv/#' -v
```

## Do you need a second VM?

Not for a long time. One small VM comfortably handles thousands of devices,
because the traffic is small JSON messages and the API is I/O-bound.

Split when one of these is true:

| Symptom | What to move first |
| --- | --- |
| Postgres CPU or disk I/O saturated | **Database** to its own host or a managed Postgres |
| Sustained camera streaming | **Broker** to its own host — frames are the only large payload |
| API CPU pinned | Run **multiple API replicas** behind Caddy |
| You need real availability | All of the above, plus two of everything |

### Adding a second VM

The stack is already split into services, so moving one is a config change.

**Move the database off:**
1. Provision Postgres (managed, or `postgres:16-alpine` on the new VM with only
   the private network exposed).
2. `pg_dump` from the old, restore into the new (see below).
3. Point `DATABASE_URL` in `platform/.env` at the new host.
4. Remove the `postgres` service and its `depends_on` from `docker-compose.yml`.
5. `docker compose up -d`.

**Move the broker off:**
1. Stand up `eclipse-mosquitto:2` on the new VM with the same `mosquitto.conf`
   and the **same certificates** — devices trust that CA.
2. Copy the `mosquitto_data` volume so `dynamic-security.json` (every device
   credential) comes with it.
3. Repoint `mqtt.circuvent.com` at the new VM.
4. Set `MQTT_URL` on the API to the new host, over the private network.

Devices reconnect on their own; they only know a hostname.

**Add an API replica:**
1. `docker compose up -d --scale api=3`.
2. Caddy load-balances across them automatically when given multiple upstreams.
3. The API holds WebSocket state in memory, so a client's socket is pinned to one
   replica. Device updates are fanned out from MQTT, which every replica
   subscribes to, so this works — but each replica receives every message.

## Disaster recovery

What you need to rebuild everything:

1. The repository (public code).
2. `platform/.env` — **not** in the repository. Keep a copy in a password
   manager.
3. `platform/mosquitto/certs/` — the CA. Without it, every deployed device must
   be reflashed.
4. A `pg_dump` of the control-plane database.
5. Neon handles its own backups for the shop database.

Rebuild: launch a VM, follow the steps above, restore the dump, restore the
certs, `docker compose up -d --build`.

Backup commands are in [13 — Maintenance](./13-maintenance.md#backups).
