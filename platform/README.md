# Circuvent Control Plane — self-hosted IoT platform

Everything is **ours**: our own MQTT broker (Mosquitto), our own API + real-time
bridge (Node/TypeScript), our own database (Postgres), fronted by Caddy with
automatic HTTPS. It all runs from a single `docker compose up` on **one small VM**
for **₹0/month** on a free tier.

```
                    ┌──────────────────────── your VM (Docker) ────────────────────────┐
  ESP32 devices ──mqtts:8883──▶  Mosquitto ◀──mqtt:1883──▶  API (Node)  ◀──▶  Postgres
                                    (broker)                 REST + /ws            │
  Mobile / Web app ─── https / wss ──────────────▶  Caddy  ──▶  API                │
                    (api.circuvent.com)          (auto-TLS)                        │
                    └───────────────────────────────────────────────────────────────┘
```

## 0. Cheapest host — Oracle Cloud "Always Free" (recommended)
- Create a free Oracle Cloud account → launch an **Always Free Ampere (ARM) VM**
  (up to 4 vCPU / 24 GB RAM, free forever). Ubuntu 22.04.
- Alternatives that also work: any €4–5 VPS (Hetzner/Contabo), a spare mini-PC, or
  a Raspberry Pi at home. The stack is portable — it's just Docker.

## 1. DNS
Point two A-records at the VM's public IP:
```
api.circuvent.com   → <VM_IP>
mqtt.circuvent.com  → <VM_IP>
```

## 2. Open firewall ports
On the VM **and** in the Oracle console "Security List / NSG":
```
80/tcp    (Caddy: ACME HTTP challenge + redirect)
443/tcp   (Caddy: HTTPS API + WSS)
8883/tcp  (Mosquitto: device MQTT over TLS)
```

## 3. Install Docker
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker
```

## 4. Get the code + configure secrets
```bash
git clone <your-repo> && cd <repo>/platform
cp .env.example .env
# edit .env — generate strong secrets, e.g.:
#   openssl rand -base64 24
```

## 5. Boot the stack
```bash
docker compose up -d --build
docker compose logs -f api      # watch for "Control plane listening on :8080"
```
Caddy will obtain TLS certs for `api.` and `mqtt.` automatically (ports 80/443
must be reachable). First boot can take ~30s for certificates.

## 6. Create the broker users (one-time)
The control-plane user + each device authenticate against Mosquitto's password
file. Create the control-plane user (password must equal `MQTT_CONTROL_PLANE_PASSWORD`
in `.env`):
```bash
docker compose exec mosquitto mosquitto_passwd -b /mosquitto/pw/passwordfile control-plane '<MQTT_CONTROL_PLANE_PASSWORD>'
docker compose restart mosquitto
```

## 7. Provision a device
1. Register an app account, then mint a device (returns the one-time key):
   ```bash
   TOKEN=$(curl -s https://api.circuvent.com/auth/register \
     -H 'content-type: application/json' \
     -d '{"email":"you@circuvent.com","password":"a-strong-pass"}' | jq -r .token)

   curl -s https://api.circuvent.com/devices/provision \
     -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
     -d '{"id":"hub-a1b2c3","type":"home-hub","name":"Living Room Hub"}'
   # → { "id":"hub-a1b2c3", "key":"<ONE-TIME-KEY>", "mqttUsername":"hub-a1b2c3", ... }
   ```
2. Add the device's MQTT credential to the broker:
   ```bash
   docker compose exec mosquitto mosquitto_passwd -b /mosquitto/pw/passwordfile 'hub-a1b2c3' '<ONE-TIME-KEY>'
   docker compose kill -s HUP mosquitto
   ```
3. Flash the firmware with `deviceId=hub-a1b2c3`, `key=<ONE-TIME-KEY>`,
   broker `mqtt.circuvent.com:8883`. (See `../firmware/`.)

## 8. Verify
```bash
curl https://api.circuvent.com/health           # { ok: true, db: "up" }
# Subscribe to a device's state from your laptop:
mosquitto_sub -h mqtt.circuvent.com -p 8883 --capath /etc/ssl/certs \
  -u control-plane -P '<pw>' -t 'cv/#' -v
```

## Cert renewal note
Caddy auto-renews certs. Mosquitto loads the cert at start, so schedule a weekly
reload so it picks up renewed certs:
```bash
# crontab -e
0 4 * * 0  cd /home/ubuntu/<repo>/platform && docker compose kill -s HUP mosquitto
```

## What runs where
| Service | Purpose | Exposed |
| --- | --- | --- |
| `mosquitto` | MQTT broker (device transport) | `:8883` (TLS) |
| `api` | REST + live WebSocket + MQTT↔DB bridge | via Caddy only |
| `postgres` | users, devices, telemetry, commands, automations | internal |
| `caddy` | automatic HTTPS reverse proxy | `:80`, `:443` |

See `PROTOCOL.md` for the device/app message contract, and `api/` for the code.
