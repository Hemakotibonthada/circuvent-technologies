// SEO and link-preview configuration for attendance.circuvent.com.
//
// Shaped like the equivalent module in ATS, HRMS, Career and Paystub — one
// place holding the host, the card and the base metadata, imported by the
// layout and by both image routes — so the suite has one pattern rather than
// six. The difference is only where it lives: attendance is not a separate
// application but a subtree of this one, mounted at the root of its own
// hostname by lib/host-mounts.ts, so this sits in lib/ beside the site's own
// seo.ts instead of being an app-level file.
//
// Organization and WebSite JSON-LD are already emitted once by the root layout
// and inherited here, so unlike the standalone apps this module does not
// restate them. Repeating an entity that already has an @id would describe the
// company twice on one page.

import type { Metadata } from "next";
import type { OgCardOptions } from "@/lib/og";

/** Canonical origin for this subtree. */
export const SITE_URL = "https://attendance.circuvent.com";

export const siteConfig = {
  name: "Attendance",
  company: "Circuvent Technologies",
  url: SITE_URL,
  tagline: "Every arrival, on the record",
  description:
    "Register, roll, cards, door readers and reports for a Circuvent site — the attendance section of the device console.",
  locale: "en_IN",
} as const;

/** Artwork shown when the attendance console is pasted into a chat. */
export const OG_CARD: OgCardOptions = {
  product: "Attendance",
  domain: "attendance.circuvent.com",
  headline: "Every arrival, on the record",
  description:
    "Register, roll, cards, door readers and reports — from the terminals on your own site.",
  accent: "#04303a",
};

/**
 * Base metadata for the mounted hostname.
 *
 * The canonical names the subdomain rather than the path this actually renders
 * from. Both addresses serve the same screen, and before this both declared
 * circuvent.com/ as canonical — so neither consolidated onto the other and the
 * console disclaimed itself on every hostname.
 *
 * `robots` stays noindex. This is a console behind a sign-in; the card exists
 * for someone sending a colleague a link, not for search. That matches Paystub
 * and the other gated apps, which are noindex for the same reason.
 */
export const baseMetadata: Metadata = {
  title: siteConfig.name,
  description: siteConfig.description,
  applicationName: siteConfig.name,
  keywords: [
    "attendance",
    "RFID attendance",
    "access control",
    "door readers",
    "register",
    "roll call",
    "Circuvent",
  ],
  authors: [{ name: siteConfig.company, url: "https://circuvent.com" }],
  creator: siteConfig.company,
  publisher: siteConfig.company,
  category: "business",
  alternates: { canonical: `${SITE_URL}/` },
  openGraph: {
    type: "website",
    siteName: `${siteConfig.name} · ${siteConfig.company}`,
    title: `${siteConfig.name} · Circuvent`,
    description: siteConfig.description,
    url: `${SITE_URL}/`,
    locale: siteConfig.locale,
  },
  twitter: {
    // Stated explicitly. Left unset it falls back to `summary`, which crops the
    // card to a thumbnail and wastes the artwork.
    card: "summary_large_image",
    title: `${siteConfig.name} · Circuvent`,
    description: siteConfig.description,
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
  formatDetection: { telephone: false, address: false, email: false },
  appleWebApp: {
    capable: true,
    title: siteConfig.name,
    statusBarStyle: "black-translucent",
  },
  other: {
    // Next emits the standardised `mobile-web-app-capable`, which only Safari
    // 17.4+ understands. Older iOS still checks the Apple-prefixed name.
    "apple-mobile-web-app-capable": "yes",
  },
};
