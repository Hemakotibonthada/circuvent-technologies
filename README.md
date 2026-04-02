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

Deploys to Vercel via Git push. Firebase Hosting also supported.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
