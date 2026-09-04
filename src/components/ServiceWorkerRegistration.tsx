"use client";

import { useEffect } from "react";
import { mountPrefixFor } from "@/lib/host-mounts";

/**
 * Marketing pages get a service worker for offline shell + push.
 *
 * Product hostnames (icm, insights, attendance, developer) share this app but
 * are not the marketing site. Registering the same worker there made install
 * precache `/projects` and friends, which those hosts redirect to
 * circuvent.com — and CSP `connect-src 'self'` then blocked the follow.
 */
function wantsServiceWorker(hostname: string): boolean {
  const prefix = mountPrefixFor(hostname);
  if (!prefix) return true;
  if (prefix.startsWith("/admin/")) return false;
  if (prefix === "/smarthome/attendance") return false;
  if (prefix === "/developer") return false;
  return true;
}

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") {
      return;
    }

    const host = window.location.hostname;
    if (!wantsServiceWorker(host)) {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) void reg.unregister();
      });
      return;
    }

    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* Offline-capable shell is best-effort; a failed register must not
         surface as an app error on every page load. */
    });
  }, []);

  return null;
}
