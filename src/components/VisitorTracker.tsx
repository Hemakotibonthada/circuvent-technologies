"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

function generateVisitorId(): string {
  // Persistent per-browser session
  const key = "cv-visitor-id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

export default function VisitorTracker() {
  const pathname = usePathname();
  const visitorIdRef = useRef<string | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Skip tracking on admin page to avoid counting ourselves
    if (pathname === "/admin") return;

    const visitorId = generateVisitorId();
    visitorIdRef.current = visitorId;

    // Connect
    fetch("/api/visitors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "connect",
        visitorId,
        page: pathname,
        referrer: document.referrer,
      }),
    }).catch(() => {});

    // Heartbeat every 30s
    heartbeatRef.current = setInterval(() => {
      fetch("/api/visitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "heartbeat",
          visitorId,
          page: pathname,
        }),
      }).catch(() => {});
    }, 30_000);

    // Disconnect on page unload
    const handleUnload = () => {
      navigator.sendBeacon(
        "/api/visitors",
        new Blob(
          [JSON.stringify({ action: "disconnect", visitorId })],
          { type: "application/json" }
        )
      );
    };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      window.removeEventListener("beforeunload", handleUnload);
      // On client-side navigation, send heartbeat with new page (handled by re-mount)
    };
  }, [pathname]);

  return null;
}
