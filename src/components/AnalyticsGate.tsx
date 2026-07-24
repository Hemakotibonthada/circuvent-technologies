"use client";

import { useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { getConsent } from "./CookieConsent";

/**
 * Renders Vercel Analytics + Speed Insights only after the visitor has granted
 * "all" cookie consent, so no non-essential tracking runs without opt-in.
 */
export default function AnalyticsGate() {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const update = () => setAllowed(getConsent() === "all");
    update();
    window.addEventListener("cookie-consent-changed", update);
    return () => window.removeEventListener("cookie-consent-changed", update);
  }, []);

  if (!allowed) return null;
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
