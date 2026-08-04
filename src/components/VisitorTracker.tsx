"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Reports page views to /api/visitors.
 *
 * WHAT THIS NO LONGER DOES
 *
 * It used to mint a visitor id with crypto.randomUUID() and keep it in
 * sessionStorage. That was wrong twice over: sessionStorage is per-tab, so one
 * person with three tabs open counted as three visitors, and the id was
 * client-supplied, so the server had no reason to believe any of it. Identity
 * is now derived server-side from a daily-rotating salted hash, which needs no
 * client storage at all — so this component writes nothing to the browser and
 * the report is more accurate for it.
 *
 * The heartbeat is what keeps someone reading a long page counted as present
 * without counting a second view; the server de-duplicates repeat views of the
 * same path anyway, so a double-fired effect cannot inflate anything.
 */

/** Comfortably inside the server's five-minute presence window. */
const HEARTBEAT_MS = 60_000;

function send(body: Record<string, unknown>): void {
  void fetch("/api/visitors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // Analytics must never delay or fail a navigation.
    keepalive: true,
  }).catch(() => {});
}

export default function VisitorTracker() {
  const pathname = usePathname();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!pathname) return;
    // Staff traffic is not audience traffic.
    if (pathname.startsWith("/admin") || pathname.startsWith("/smarthome/admin")) return;

    // Global Privacy Control is a machine-readable opt-out. The server honours
    // it too; checking here as well saves a pointless request.
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean; doNotTrack?: string };
    if (nav.globalPrivacyControl === true || nav.doNotTrack === "1") return;

    send({ action: "view", page: pathname, referrer: document.referrer });

    timer.current = setInterval(() => {
      // Only while the tab is actually being looked at: a backgrounded tab is
      // not a visitor on the site, and counting it inflates "active now" for
      // as long as the tab exists.
      if (document.visibilityState === "visible") {
        send({ action: "heartbeat", page: pathname });
      }
    }, HEARTBEAT_MS);

    const onHide = () => {
      if (document.visibilityState === "hidden") {
        // sendBeacon survives the page being torn down, which a fetch may not.
        try {
          navigator.sendBeacon(
            "/api/visitors",
            new Blob([JSON.stringify({ action: "disconnect", page: pathname })], {
              type: "application/json",
            })
          );
        } catch {
          /* beacons are best-effort by design */
        }
      }
    };
    // visibilitychange rather than beforeunload: beforeunload does not fire
    // reliably on mobile Safari, where the tab is frozen instead of unloaded.
    document.addEventListener("visibilitychange", onHide);

    return () => {
      if (timer.current) clearInterval(timer.current);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [pathname]);

  return null;
}
