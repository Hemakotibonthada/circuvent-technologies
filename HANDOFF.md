# WebSite on Platform VM — handoff

**Updated:** 2026-09-23 21:35 IST (Asia/Calcutta)

## Shipped
- Next.js marketing/shop from `WebSite` (`circuvent-technologies`) as `circuvent-website` on **port 3022**.
- Network `platform_platform-net`; app DB **`circuvent_website`** / role **`circuvent_website_app`** (Neon *Circuvent Shopping* `tiny-pine-85067325` / `ep-bitter-king` dump restored; **Neon not dropped**).
- SSO OIDC: `ADMIN_SSO_CLIENT_ID=website-admin`, issuer `https://myaccount.circuvent.com` (PKCE).
- Shop → CV-365 CRM sync uses Platform URLs: `CV365_URL=https://work.circuvent.com`.
- Coolify Traefik: `/data/coolify/proxy/dynamic/circuvent.com.yaml` → `host.docker.internal:3022` (LE ready; DNS not cut).
- **Public DNS for apex / consoles NOT changed** (still Vercel). GoDaddy unchanged.
- Runtime DB: `pg` Pool when `DATABASE_DRIVER=pg` / non-Neon URL (Neon HTTP only on Vercel).


## Smoke (2026-09-23 21:53 IST)
| Check | Result |
|-------|--------|
| Container | `circuvent-website` healthy on `:3022` |
| `GET /api/health` | 200 `status:healthy`, `database.configured:true` |
| Traefik `--resolve circuvent.com:443:127.0.0.1` | 200 health |
| `GET /api/admin/auth/sso/start` via Traefik | 307 → `myaccount.circuvent.com/authorize?client_id=website-admin&redirect_uri=https://circuvent.com/...` |
| DB counts (app role) | accounts=7, admin_users=10, store_kv=35, page_views=3890, email_history=3730 |
| Public apex A | still `216.150.1.1` (Vercel) — **unchanged** |
| Auth/HRMS/ATS/Assets/Devices/Mail/IoT/CV-365/MySpace/Paystub | still healthy |
| Neon *Circuvent Shopping* | **kept** (not dropped) |

## Hostnames (for later cutover — DNS unchanged today)
| Host | Current public DNS | Traefik prepared? | Notes |
|------|--------------------|-------------------|-------|
| `circuvent.com` (apex) | A `216.150.1.1` (Vercel) | Yes | **High risk** — marketing + shop apex |
| `www.circuvent.com` | *(no record)* | Yes | Add only if desired at cutover |
| `app.circuvent.com` | Vercel CNAME | Yes | Same Vercel project |
| `icm.circuvent.com` | Vercel CNAME | Yes | Console routes in this app |
| `insights.circuvent.com` | Vercel CNAME | Yes | Console routes in this app |
| `attendance.circuvent.com` | Vercel CNAME | Yes | Console routes in this app |
| `iot.circuvent.com` | Vercel alias | Yes | Same Vercel project |
| `home.circuvent.com` | Vercel alias | Yes | Same Vercel project |
| `developer.circuvent.com` | Vercel alias | Yes | Same Vercel project |
| `myspace.circuvent.com` | Vercel CNAME | **No** — separate `circuvent-myspace` :3020 | Do not steal |
| `dev.circuvent.com` | Vercel preview | No | Leave on Vercel |

## DB decision
| Item | Choice |
|------|--------|
| Runtime `DATABASE_URL` | Platform Postgres `circuvent_website` via `postgres:5432` |
| Source | Neon *Circuvent Shopping* dump → restore (10 tables; page_views≈3890, email_history≈3730, accounts=7, store_kv=35) |
| Neon | **Kept live** (Vercel still uses it until DNS cutover) |
| Role | `circuvent_website_app` (Phase 0); **NOBYPASSRLS** |
| Note | Neon `neondb_owner` password was rotated 2026-09-23 to obtain dump URI; Vercel `DATABASE_URL` updated + production redeployed |

## Explicitly NOT done
- No GoDaddy / DNS cutover (especially apex)
- No Neon delete
- No MX / MQTT changes
- myspace remains its own Platform service

## Paths on VM
- App: `/opt/circuvent/website/`
- Secrets: `.env.production` mode 600; `/opt/circuvent/secrets/pg-circuvent_website_app`
- Traefik: `/data/coolify/proxy/dynamic/circuvent.com.yaml`
- Dump: `/opt/circuvent/backups/website/`

## Rebuild
```bash
cd /opt/circuvent/website
# rsync from Mac WebSite
docker compose build && docker compose up -d
```

## DNS cutover checklist (explicit approval — do not execute)
1. Confirm Platform `/api/health` + SSO start + suite still green.
2. Confirm OAuth client `website-admin` redirect URIs include `https://circuvent.com/api/admin/auth/sso/callback` (+ other console hosts if cut).
3. **Apex risk:** lower TTL; cut `circuvent.com` A → **140.245.203.193** only after soak on Traefik `--resolve`.
4. Optionally cut `app` / `icm` / `insights` / `attendance` CNAMEs → Platform.
5. **Do not** change `myspace` (already separate), MX, or MQTT.
6. Wait for Let’s Encrypt on Traefik for each host.
7. Keep Neon + Vercel until soak; decommission separately later.
8. Rollback: restore GoDaddy apex/CNAMEs to Vercel.
