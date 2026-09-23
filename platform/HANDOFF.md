# IoT HTTP API on Platform VM — handoff (Option D / Phase D1)

**Updated:** 2026-09-23 ~19:50 IST (Asia/Calcutta)

## Shipped
- Control-plane REST/WS API from `WebSite/platform/api` as `circuvent-iot-api` on **port 3018**.
- Face embedder as `circuvent-iot-face` (internal only, mem_limit 512m). ONNX models pre-fetched into `face/models/` (in-build GitHub LFS curl stalls on this VM).
- Network `platform_platform-net`; app DB **`circuvent_iot`** / role **`circuvent_iot_app`** (dump from IoT VM `circuvent`; **IoT Postgres not dropped**). Tables owned by app role for `initDb` migrations.
- MQTT broker remains **`mqtt.circuvent.com:8883` → 140.245.238.154**. API uses `mqtts://` + Circuvent Device CA (`certs/ca.crt`). **No Mosquitto on Platform. Port 8883 not opened on Platform.**
- Coolify Traefik: `/data/coolify/proxy/dynamic/api.circuvent.yaml` → `host.docker.internal:3018` (LE ready; DNS not cut).
- **Public DNS for `api` / `mqtt` NOT changed** (both A still 140.245.238.154).

## DB decision
| Item | Choice |
|------|--------|
| Runtime `DATABASE_URL` | Platform Postgres `circuvent_iot` via `postgres:5432` |
| Source | IoT VM `circuvent` dump (~59 tables; telemetry≈8.7k) → restore |
| IoT Postgres | **Kept live** (production API on 238.154 until DNS cutover) |
| Role | `circuvent_iot_app` owns tables/sequences; secret `/opt/circuvent/secrets/pg-circuvent_iot_app` |

## Explicitly NOT done
- No GoDaddy changes
- No Mosquitto move / no port 8883 on Platform
- No stop of IoT stack on 238.154
- No Mail MX changes

## Smoke (2026-09-23 ~19:50 IST)
| Check | Result |
|-------|--------|
| `GET :3018/health` | 200 ok, db up, commit `d1-20260923` |
| MQTT log | `MQTT connected` to mqtts://mqtt.circuvent.com:8883 |
| Face | `circuvent-iot-face` healthy; API → `http://iot-face:8000/health` |
| Traefik `--resolve api.circuvent.com:443:127.0.0.1` | 200 health |
| Mosquitto on 238.154 | running since 2026-08-09; :8883 open (verified earlier same day) |
| Public dig `api`/`mqtt` | still 140.245.238.154 |
| Suite Auth/HRMS/ATS/Assets/Devices/Mail | still healthy |

## Paths on VM
- App: `/opt/circuvent/iot-api/` (`docker compose up -d`)
- Secrets: `.env.production` mode 600; `/opt/circuvent/secrets/pg-circuvent_iot_app`
- Traefik: `/data/coolify/proxy/dynamic/api.circuvent.yaml`
- Broker CA only: `/opt/circuvent/iot-api/certs/ca.crt`

## DNS cutover checklist (explicit approval — do not execute)
1. Confirm Platform `/health` + MQTT still only on 238.154:8883.
2. Point `api` A → **140.245.203.193**. Keep `mqtt` A → 238.154.
3. Wait for Let’s Encrypt on Traefik for `api.circuvent.com`.
4. Soak; then optionally stop API(+face) on 238.154 (leave mosquitto+postgres).
5. Rollback: restore `api` A → 238.154.

## Notes
- Parallel MQTT: Platform API uses same dynsec user `control-plane` with unique clientId; live IoT API remains healthy.
- R2/S3 ANPR cleanup may log 401 if keys rotated — non-fatal for health.
- Face Dockerfile on Platform uses COPY of `face/models/` (not remote curl).
