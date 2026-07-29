# Circuvent Technologies — Landing Page

Premium portfolio and services website for Circuvent Technologies, showcasing 53+ projects across 6 technology domains (AI, IoT, FinTech, Full-Stack, Enterprise, HealthTech).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4 |
| Animation | Framer Motion 12 |
| Language | TypeScript 5 (strict) |
| Email | Resend |
| Analytics | Vercel Analytics + Speed Insights |
| Icons | Lucide React |
| Fonts | Geist Sans / Mono (next/font) |

## Getting Started

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env.local
# Fill in: RESEND_API_KEY, GITHUB_TOKEN, BUTTONDOWN_API_KEY

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
├── app/                    # Next.js App Router pages (18 routes)
│   ├── page.tsx            # Homepage (hero, stats, domains, projects, pricing)
│   ├── layout.tsx          # Root layout (nav, footer, JSON-LD, skip link)
│   ├── api/                # API routes (contact, newsletter, blog, projects)
│   ├── projects/           # Project portfolio + detail pages
│   ├── blog/               # Engineering blog
│   ├── services/           # Service offerings
│   ├── contact/            # Contact form page
│   ├── careers/            # Job listings
│   └── ...                 # about, team, case-studies, architecture, etc.
├── components/             # 50+ React components
│   ├── Hero.tsx            # Kinetic typography hero with mouse tracking
│   ├── ScrollReveal.tsx    # Scroll-triggered animations
│   ├── AnimatedBackground  # Canvas particle system
│   ├── TiltCard.tsx        # 3D mouse-tracking tilt cards
│   ├── Marquee.tsx         # Infinite scrolling tech ticker
│   ├── ContactForm.tsx     # Validated contact form with ARIA
│   └── ui/                 # Base UI components (Button, Badge, etc.)
├── hooks/                  # Custom hooks (useMousePosition, useClickOutside)
└── lib/                    # Data, utilities, SEO config, rate limiting
```

## Key Features

- **12-section homepage** with parallax, 3D tilt cards, animated counters
- **prefers-reduced-motion** support across all animated components
- **Rate-limited API routes** (5 req/min per IP for contact & newsletter)
- **Dynamic SEO** — sitemap, robots.txt, Open Graph, JSON-LD, Twitter cards
- **PWA** — manifest, service worker, standalone mode
- **Accessibility** — skip link, ARIA labels, keyboard navigation (Ctrl+K)
- **Dark/light theme** with system detection

## Testing

```bash
# E2E tests (Playwright — Chromium, Firefox, WebKit)
npx playwright test

# Unit tests (Jest)
npm test
```

## Build & Deploy

```bash
npm run build    # Production build
npm run start    # Start production server
```

### Environments

| Branch    | URL                 | Vercel env   |
| --------- | ------------------- | ------------ |
| `main`    | circuvent.com       | `production` |
| `develop` | dev.circuvent.com   | `preview`    |
| any other | generated `.vercel.app` preview URL | `preview` |

Work lands on `develop` first, gets checked on dev.circuvent.com, then
merges to `main` to go live. Both deploy automatically on push.

`dev.circuvent.com` is bound to the `develop` branch in the project's domain
settings, and `NEXT_PUBLIC_SITE_URL` is overridden for that branch so the dev
site refers to itself rather than to production.

### Dev is a pre-production environment, not a copy of production

Dev runs the same code and the same features as production — real database,
working checkout, real email — but on **its own** infrastructure. Nothing
sensitive is shared. Each side has its own:

| Concern | Why it must not be shared |
| ------- | ------------------------- |
| `DATABASE_URL` | Sharing it puts real customer accounts, orders and wallet balances in a test environment |
| `ACCOUNT_SECRET`, `JWT_SECRET`, `SESSION_SECRET` | A session minted on dev would otherwise authenticate against production |
| Razorpay / Stripe keys | Dev must use **test-mode** keys so checkout works end to end without moving real money |
| Twilio, SMTP, Resend | Dev must not send SMS or email to real customers |
| `FRONTEND_URL`, `GOOGLE_CALLBACK_URL` | Callbacks and email links have to point back at dev |

Only non-sensitive tuning knobs (rate limits, ports, log level, upload paths)
are shared between the two.

This separation was not always true: the production connection string had been
scoped to "All Environments", so dev served live customer data and accepted
production logins. Config hygiene alone regresses, so the app now enforces it.
`PROD_DATA_HOSTS` lists the database hosts only production may use; a
non-production deployment that finds itself pointed at one of them refuses to
start instead of silently serving live data. Hosts are not credentials, so the
list is safe on every target, and it is checked on non-production deployments
only — an over-broad list can never take production down. See
`assertNotProductionData` in `src/lib/db.ts`.

Dev has its own Neon project (`dev.circuvent.com`), so it is a real, writable
database rather than a throwaway in-memory store.

**Only `main` is indexable.** Anything that is not `VERCEL_ENV=production`
serves `Disallow: /` plus an `X-Robots-Tag: noindex, nofollow` header — a dev
site that Google crawls competes with production for its own search terms and
exposes unreleased work. See `IS_PUBLIC_SITE` in `src/lib/config.ts`. Vercel
adds that header to `.vercel.app` URLs by itself but not to a custom domain
pointed at a branch, which is why the app sets it.

Access to dev is gated by Vercel Authentication: an unauthenticated request to
dev.circuvent.com is answered with `401 Protected deployment`, so only signed-in
team members can reach it. (The project setting reads
`all_except_custom_domains`, which suggests custom domains are exempt — they are
not, as an anonymous request to the domain shows. Verify with a real request
rather than trusting the setting.) The `noindex` behaviour above is still
required: protection can be turned off, and a dev site must not become
indexable the moment it is.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
