import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import SiteChrome from "@/components/SiteChrome";
import SiteBackground from "@/components/SiteBackground";
import { ThemeProvider } from "@/components/ThemeProvider";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import { CartProvider } from "@/components/shop/CartProvider";
import { AccountProvider } from "@/components/shop/AccountProvider";
import { WishlistProvider } from "@/components/shop/WishlistProvider";
import CartDrawer from "@/components/shop/CartDrawer";
import AnalyticsGate from "@/components/AnalyticsGate";
import { TelemetryCollector } from "@/components/TelemetryCollector";
import CookieConsent from "@/components/CookieConsent";
import VisitorTracker from "@/components/VisitorTracker";
import Assistant from "@/components/ai/Assistant";
import { SITE_URL, siteConfig, IS_PUBLIC_SITE } from "@/lib/config";
import { getOrganizationJsonLd, getWebsiteJsonLd } from "@/lib/seo";
import { jsonForScript } from "@/lib/json-script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Circuvent Technologies | Engineering What's Next",
    template: "%s | Circuvent Technologies",
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  keywords: [
    "AI", "IoT", "Smart Home", "Machine Learning", "Full Stack",
    "FinTech", "HealthTech", "React", "Next.js", "Flutter", "ESP32", "MQTT",
  ],
  authors: [{ name: siteConfig.name, url: SITE_URL }],
  creator: siteConfig.name,
  publisher: siteConfig.name,
  alternates: { canonical: "/" },
  openGraph: {
    title: "Circuvent Technologies",
    description: "Engineering What's Next — AI, IoT, Full-Stack",
    type: "website",
    url: SITE_URL,
    siteName: "Circuvent Technologies",
    images: [{ url: siteConfig.ogImage, width: 1200, height: 630, alt: siteConfig.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Circuvent Technologies",
    description: "Engineering What's Next — AI, IoT, Full-Stack",
    creator: siteConfig.twitterHandle,
  },
  // Mirrors robots.ts. Those two disagreeing is the kind of thing that only
  // surfaces once dev.circuvent.com is already in Google's index, which is very
  // hard to undo: robots.txt stops the crawl, but a page linked from anywhere
  // else can still be indexed on the strength of that link, and a meta tag
  // saying "index" is exactly the wrong thing for it to find if it ever looks.
  robots: IS_PUBLIC_SITE
    ? { index: true, follow: true }
    : { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#030712" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="alternate"
          type="application/rss+xml"
          title="Circuvent Technologies Blog"
          href="/feed.xml"
        />
        {/* Favicons & app icons are provided via src/app/{icon,apple-icon,favicon}.* */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonForScript(getOrganizationJsonLd()) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonForScript(getWebsiteJsonLd()) }}
        />
        {/* Inline script to prevent flash of wrong theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('circuvent-theme');
                  var theme = stored || 'system';
                  var resolved = theme;
                  if (theme === 'system') {
                    resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  }
                  document.documentElement.classList.add(resolved);
                } catch (e) {
                  document.documentElement.classList.add('dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
      >
        <ThemeProvider>
          <CartProvider>
            <AccountProvider>
            <WishlistProvider>
            <ServiceWorkerRegistration />
            <VisitorTracker />
            <a
              href="#main-content"
              /*
               * The first thing a keyboard user reaches, so it has to be the
               * most obviously correct control on the page. It used to be
               * near-white on the brand cyan at 3.56:1, 36px tall, with a cyan
               * focus ring on a cyan background -- an invisible ring around
               * unreadable text. Dark surface, white text, light ring.
               */
              className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:inline-flex focus:min-h-[44px] focus:items-center focus:px-5 focus:py-2 focus:rounded-lg focus:text-sm focus:font-semibold"
              style={{ background: "var(--skip-link-bg)", color: "#ffffff", ["--focus-ring" as string]: "#ffffff" }}
            >
              Skip to main content
            </a>
            <div className="noise-overlay" />
            <SiteBackground />
            <SiteChrome nav={<Navigation />} footer={<Footer />}>
              {children}
            </SiteChrome>
            <CartDrawer />
            <Assistant />
            </WishlistProvider>
            </AccountProvider>
          </CartProvider>
        </ThemeProvider>
        <CookieConsent />
        <AnalyticsGate />
        {/*
          Engineering telemetry: which routes are reached and what fails.
          Distinct from AnalyticsGate, which is marketing analytics and is
          gated on consent — this records no identity and honours Do Not
          Track server-side, in the beacon endpoint.
        */}
        <TelemetryCollector />
      </body>
    </html>
  );
}
