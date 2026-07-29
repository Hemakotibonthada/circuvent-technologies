"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

// The background is purely decorative, so it never needs to reach the
// server-rendered HTML. Loading it client-side keeps the canvas work and
// framer-motion out of the document payload and off the critical path — the
// homepage already did this individually, and centralising it extends the
// same win to every other route.
const AnimatedBackground = dynamic(() => import("@/components/AnimatedBackground"), {
  ssr: false,
});

/**
 * Renders the site background exactly once, for the whole app.
 *
 * This used to be hand-imported into each page, which meant a page could only
 * get a background if someone remembered to add it — /shop, /cart, /checkout,
 * /track and /weather had all been missed. Mounting it here makes coverage the
 * default and removes the chance of drift.
 *
 * Skipped on the device console (/smarthome*) and the admin dashboard
 * (/admin*): those are dense application surfaces with their own chrome and
 * theming, where a drifting particle field costs frames and hurts legibility.
 * This mirrors the same two exclusions SiteChrome already makes for nav/footer.
 */
export default function SiteBackground() {
  const pathname = usePathname();
  const isConsole = pathname?.startsWith("/smarthome") ?? false;
  const isAdmin = pathname?.startsWith("/admin") ?? false;

  if (isConsole || isAdmin) return null;

  return <AnimatedBackground />;
}
