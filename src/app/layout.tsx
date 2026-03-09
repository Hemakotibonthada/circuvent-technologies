import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { ThemeProvider } from "@/components/ThemeProvider";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

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
          <ServiceWorkerRegistration />
          <div className="noise-overlay" />
          <Navigation />
          <main className="relative z-[1]">{children}</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
