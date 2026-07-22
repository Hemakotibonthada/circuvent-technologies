import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { ThemeProvider } from "@/components/ThemeProvider";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import { CartProvider } from "@/components/shop/CartProvider";
import CartDrawer from "@/components/shop/CartDrawer";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import VisitorTracker from "@/components/VisitorTracker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Circuvent Technologies | Engineering What's Next",
  description:
    "Circuvent Technologies crafts intelligent systems at the intersection of AI, IoT, and Full-Stack Engineering. 53+ projects. 200K+ lines of code. Zero limits.",
  keywords: [
    "AI", "IoT", "Smart Home", "Machine Learning", "Full Stack",
    "FinTech", "HealthTech", "React", "Next.js", "Flutter", "ESP32", "MQTT",
  ],
  openGraph: {
    title: "Circuvent Technologies",
    description: "Engineering What's Next — AI, IoT, Full-Stack",
    type: "website",
    siteName: "Circuvent Technologies",
  },
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
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
        <link rel="icon" type="image/svg+xml" href="/logo.svg" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon.ico" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Circuvent Technologies",
              url: "https://circuvent.tech",
              logo: "https://circuvent.tech/logo.svg",
              description: "Engineering intelligent systems at the intersection of AI, IoT, and Full-Stack Engineering.",
              sameAs: [
                "https://github.com/Hemakotibonthada",
                "https://linkedin.com/company/circuvent",
              ],
              contactPoint: {
                "@type": "ContactPoint",
                contactType: "customer service",
                url: "https://circuvent.tech/contact",
              },
            }),
          }}
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
            <ServiceWorkerRegistration />
            <VisitorTracker />
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-semibold"
              style={{ background: "var(--accent-cyan)", color: "var(--text-inverted)" }}
            >
              Skip to main content
            </a>
            <div className="noise-overlay" />
            <Navigation />
            <main id="main-content" className="relative z-[1]">{children}</main>
            <Footer />
            <CartDrawer />
          </CartProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
