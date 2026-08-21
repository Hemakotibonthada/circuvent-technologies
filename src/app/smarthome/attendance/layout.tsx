import type { Metadata } from "next";

/**
 * Metadata for attendance.circuvent.com.
 *
 * This subtree is mounted at the root of its own hostname (see
 * lib/host-mounts.ts), and until now it inherited the corporate defaults
 * wholesale. Pasting the address into a chat produced a card titled "Circuvent
 * Technologies — Engineering What's Next — AI, IoT, Full-Stack", with
 * og:url and the canonical both pointing at the company homepage. Somebody
 * sharing "here is the attendance console" was sending a link that unfurled as
 * a page about IoT consultancy.
 *
 * It lives in a layout rather than in page.tsx because that page is a client
 * component, and Next only reads a `metadata` export from a server one.
 *
 * The canonical deliberately names the subdomain rather than the path this
 * renders from. Both addresses serve the same screen, and before this both
 * declared circuvent.com/ as canonical — so neither consolidated onto the
 * other and the console's own address was disclaimed on every hostname.
 * Naming the subdomain points the duplicate at the address the product is
 * actually reached on.
 *
 * `robots` stays noindex. This is a private console behind a sign-in; the card
 * is for the people who already have an account and are sharing a link with a
 * colleague, not for search.
 */
export const metadata: Metadata = {
  title: "Attendance",
  description:
    "Register, roll, cards, door readers and reports for a Circuvent site — the attendance section of the device console.",
  alternates: { canonical: "https://attendance.circuvent.com/" },
  openGraph: {
    type: "website",
    siteName: "Circuvent",
    title: "Attendance · Circuvent",
    description:
      "Register, roll, cards, door readers and reports for a Circuvent site.",
    url: "https://attendance.circuvent.com/",
  },
  twitter: {
    // Stated explicitly. Left unset it falls back to `summary`, which crops the
    // card to a thumbnail and wastes the artwork.
    card: "summary_large_image",
    title: "Attendance · Circuvent",
    description:
      "Register, roll, cards, door readers and reports for a Circuvent site.",
  },
  robots: { index: false, follow: false },
};

export default function AttendanceSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
