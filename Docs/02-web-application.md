# 02 — Web application

The Next.js app in `src/`. It is four products in one deployment: the marketing
site, the shop, the smart-home console, and the business admin.

- **Framework**: Next.js 16.2.11 (App Router), React 19.2.3, Tailwind CSS 4
- **Hosting**: Vercel, project `circuvent-technologies`
- **Database**: Neon Postgres via `@neondatabase/serverless` (HTTP, no pooled
  TCP connection — right for serverless)

## Scripts

```bash
npm run dev            # next dev
npm run build          # next build
npm start              # next start (sets NODE_ENV=production)
npm run lint           # eslint
npm test               # jest
npm run test:watch
npm run test:coverage
npm run test:db        # tsx scripts/test-db.ts
npm run test:e2e       # playwright test
npm run test:e2e:ui    # playwright test --ui
```

> The repository lint baseline is large (thousands of pre-existing warnings).
> Scope eslint to the files you changed rather than running it across `src/`.

## Route map

### Marketing site

`/`, `/about`, `/architecture`, `/blog`, `/blog/[slug]`, `/careers`,
`/careers/[id]`, `/case-studies`, `/contact`, `/docs`, `/domains`,
`/domains/[slug]`, `/faq`, `/open-source`, `/privacy`, `/projects`,
`/projects/[id]`, `/roadmap`, `/services`, `/stack`, `/team`, `/terms`,
`/weather`, `/smart-home` (the product landing page).

### Shop

| Route | Purpose |
| --- | --- |
| `/shop` | Catalogue grid, filtered by category |
| `/shop/[slug]` | Product detail. One page per product in `src/lib/shop-data.ts` |
| `/shop/account` | Customer sign-in, orders, wallet, profile |
| `/shop/devices` | The customer's own devices |
| `/shop/invoice/[orderNo]` | Invoice / packing slip |

Product pages are statically generated from `products` in `src/lib/shop-data.ts`,
so adding a product adds a page. See
[06 — Devices and firmware](./06-devices-and-firmware.md).

### Smart-home console — `/smarthome`

The console is large. The main surfaces:

**Core**: `/smarthome` (hub), `/devices`, `/device/[id]`, `/rooms`, `/spaces`,
`/groups`, `/scenes`, `/quick-actions`, `/widgets`, `/floorplan`, `/kiosk`.

**Automation**: `/automation` (rules, schedules, switch timers),
`/automations`, `/scene-scheduler`, `/recipes`, `/notification-rules`.

**Monitoring**: `/energy`, `/energy-budget`, `/solar`, `/insights`, `/reports`,
`/timeline`, `/notifications`, `/diagnostics`, `/benchmark`, `/weather`.

**Operations**: `/security`, `/cameras`, `/presence`, `/away-mode`,
`/firmware`, `/lifecycle`, `/maintenance`, `/backup`, `/properties`,
`/settings`, `/profile`, `/developer`, `/command-center`.

**Fleet admin** — `/smarthome/admin` plus `/access`, `/alerts`, `/dashboards`,
`/fleet`, `/latency`, `/ota`, `/platform`, `/provisioning`, `/rules`,
`/security`, `/telemetry`.

The console talks to the **control plane**, not to Next.js API routes. Its
client is `src/lib/control-plane.ts` (REST) and `src/lib/control-plane-live.ts`
(WebSocket). Session state lives in `src/app/smarthome/ConsoleProvider.tsx`.

### Business admin — `/admin`

`/admin` is the commerce control centre: orders, customers, inventory,
pricing, marketing, support, returns, CMS, analytics. It is backed by the
`/api/admin/*` route handlers and the Neon database — a different system from
`/smarthome/admin`, which manages devices.

## API route handlers

Roughly 113 handlers under `src/app/api`. Grouped by area:

| Area | Examples | Auth |
| --- | --- | --- |
| `/api/account/*` | `login`, `register`, `verify-otp`, `forgot-password`, `reset-password`, `change-password`, `profile`, `orders`, `addresses`, `notifications`, `sso/console` | Customer session (`verifyToken` + `tokenFromRequest`); the sign-in and reset routes are necessarily unauthenticated |
| `/api/shop/*` | `products`, `reviews`, `questions`, `quote` | Mostly public; writes require a customer session |
| `/api/admin/*` | ~70 handlers: orders, customers, inventory (batches, counts, locations, movements, purchase-orders, suppliers, transfers), coupons, bundles, giftcards, CMS, CRM, analytics, forecasting, fraud, flags, integrations, audit, alerts, 2FA | `src/lib/admin-auth.ts` |
| `/api/smarthome/*` | Console support endpoints | Varies |

Two auth systems are in play and should not be confused:

- **Customer sessions** — `src/lib/account.ts`. HMAC tokens carrying
  `email|issuedAt|tokenVersion`, signed with `ACCOUNT_SECRET`, 30-day TTL,
  revocable by bumping the account's `tokenVersion`.
- **Admin/staff sessions** — `src/lib/admin-auth.ts`, signed with `ADMIN_SECRET`
  (falling back to `ACCOUNT_SECRET`), with 2FA and a password policy
  (`src/lib/admin-password-policy.ts`: 12-character minimum, mixed classes,
  90-day rotation, last 5 hashes retained to block reuse).

## Notable libraries in `src/lib`

| File | Purpose |
| --- | --- |
| `config.ts` | `SITE_URL`, `DEPLOY_ENV`, `IS_PUBLIC_SITE`, environment validation |
| `db.ts` | Neon Postgres access, schema creation, and the environment-isolation guard |
| `store.ts` | The durable store: accounts, orders, inventory, CMS and more |
| `account.ts` | Customer password hashing (scrypt) and session tokens |
| `admin-auth.ts` | Staff sessions |
| `admin-password-policy.ts` | Password strength, expiry and reuse rules |
| `control-plane.ts` | Browser client for the control-plane REST API |
| `control-plane-live.ts` | WebSocket client: device updates and camera frames |
| `sso.ts` | Shop ↔ console single sign-on bridge |
| `shop-data.ts` | The product catalogue (design source of truth) |
| `shop-catalog.ts` | Merges the static catalogue with live stock/price/reviews |
| `smarthome-*.ts` | Console helpers: realtime, prefs, switches, recipes, backup, command map |
| `secrets.ts` | `requireSecret` / `lazySecret`, with a 32-character minimum in production |

## `next.config.ts`

- `poweredByHeader: false`, `compress: true`, `reactStrictMode: true`,
  `productionBrowserSourceMaps: false`
- `optimizePackageImports` for `lucide-react` and `framer-motion`
- Images: AVIF and WebP; remote patterns scoped to
  `res.cloudinary.com/djucuoojo/**` and `avatars.githubusercontent.com/**`
  (a `/**` pattern on Cloudinary would turn the image optimiser into an open
  proxy for every tenant on that host)
- Security headers on every route: HSTS with preload, CSP, `X-Content-Type-Options`,
  `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`
  (camera and microphone denied, geolocation self), `Cross-Origin-Opener-Policy`
- `X-Robots-Tag: noindex, nofollow` on **non-production deployments only** — see
  [10 — Environments and domains](./10-environments-and-domains.md)
- Long-lived immutable caching for `/_next/static/*`; `no-store` for `/api/*`

## Testing

- **Unit** — Jest. `src/lib/*.test.ts`. Current suites cover the customer
  password helpers, the admin password policy, the automation action helpers and
  the database isolation guard.
- **End-to-end** — Playwright, `e2e/` and `playwright.config.ts`.
