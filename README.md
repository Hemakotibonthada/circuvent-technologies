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

**Only `main` is indexable.** Anything that is not `VERCEL_ENV=production`
serves `Disallow: /` plus an `X-Robots-Tag: noindex, nofollow` header — a dev
site that Google crawls competes with production for its own search terms and
exposes unreleased work. See `IS_PUBLIC_SITE` in `src/lib/config.ts`. Vercel
adds that header to `.vercel.app` URLs by itself but not to a custom domain
pointed at a branch, which is why the app sets it.

Note that deployment protection is set to `all_except_custom_domains`, so
dev.circuvent.com is reachable without a Vercel login. Turn on password
protection for the project if the dev site should not be public.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
