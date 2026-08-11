"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * The browser end of App Insights.
 *
 * Records what the user reached, what failed, and how long it took, and posts
 * it in batches. Mounted once in the root layout.
 *
 * Three things it deliberately does not do:
 *
 *   - It never sends an identity. The session is derived server-side from a
 *     salted, daily-rotating hash; nothing here knows or claims who anybody is.
 *   - It never sends the raw URL. Query strings carry tokens, order numbers and
 *     email addresses, so only the pathname is reported, with the obvious id
 *     segments collapsed — /smarthome/device/abc123 becomes
 *     /smarthome/device/[id], which is also the only way the path table groups
 *     usefully.
 *   - It never retries. A failed beacon is dropped, because the moment
 *     telemetry is most likely to fail is during an outage, and a retrying
 *     collector turns a partial failure into a self-inflicted flood.
 */

interface Pending {
  kind: "pageview" | "request" | "exception";
  path: string;
  durationMs?: number;
  status?: number;
  ok?: boolean;
  errorType?: string;
  errorMessage?: string;
  stack?: string;
}

let queue: Pending[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Collapses id-shaped segments so a path is a route, not an instance.
 *
 * Without this the busiest "page" in the table is whichever device happens to
 * be looked at most, and the actual route — the thing you would fix — is spread
 * across a thousand rows of one view each.
 */
export function routeOf(pathname: string): string {
  return (
    pathname
      .split("/")
      .map((seg) => {
        if (!seg) return seg;
        if (/^[0-9]+$/.test(seg)) return "[id]";
        if (/^[0-9a-fA-F]{8,}$/.test(seg)) return "[id]";
        if (/^[0-9a-fA-F-]{20,}$/.test(seg)) return "[id]";
        /* Mixed letters and digits of any length is almost always a key. */
        if (seg.length > 12 && /[0-9]/.test(seg) && /[a-zA-Z]/.test(seg)) return "[id]";
        return seg;
      })
      .join("/") || "/"
  );
}

function flush(useBeacon: boolean) {
  if (!queue.length) return;
  const events = queue;
  queue = [];
  const body = JSON.stringify({ events, source: "web" });

  try {
    /*
     * sendBeacon on the way out: a normal fetch is cancelled when the page
     * unloads, which is precisely when the last and most interesting events —
     * the ones just before somebody gave up and closed the tab — are queued.
     */
    if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/telemetry", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/telemetry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* Dropped on purpose; see the note about retry storms above. */
  }
}

function enqueue(e: Pending) {
  queue.push(e);
  /* Cap the queue so a tight error loop cannot eat the tab's memory. */
  if (queue.length > 40) queue.splice(0, queue.length - 40);
  if (!timer) {
    timer = setTimeout(() => {
      timer = null;
      flush(false);
    }, 5000);
  }
}

/** Report a handled failure from application code. */
export function reportError(error: unknown, context?: string) {
  const err = error instanceof Error ? error : new Error(String(error));
  enqueue({
    kind: "exception",
    path: typeof window === "undefined" ? "-" : routeOf(window.location.pathname),
    ok: false,
    errorType: err.name || "Error",
    errorMessage: `${context ? `${context}: ` : ""}${err.message}`,
    stack: err.stack,
  });
}

export function TelemetryCollector() {
  const pathname = usePathname();

  /* Page views. */
  useEffect(() => {
    if (!pathname) return;
    const start =
      typeof performance !== "undefined" && performance.now ? performance.now() : 0;
    enqueue({ kind: "pageview", path: routeOf(pathname), ok: true, durationMs: Math.round(start) });
  }, [pathname]);

  /* Unhandled failures. */
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      enqueue({
        kind: "exception",
        path: routeOf(window.location.pathname),
        ok: false,
        errorType: e.error?.name || "Error",
        errorMessage: e.message,
        stack: e.error?.stack,
      });
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      enqueue({
        kind: "exception",
        path: routeOf(window.location.pathname),
        ok: false,
        errorType: r instanceof Error ? r.name : "UnhandledRejection",
        errorMessage: r instanceof Error ? r.message : String(r),
        stack: r instanceof Error ? r.stack : undefined,
      });
    };

    /*
     * Flush on hide rather than on unload. `beforeunload` does not fire
     * reliably on mobile — a backgrounded tab is often killed outright — and
     * visibilitychange is the event that does.
     */
    const onHide = () => {
      if (document.visibilityState === "hidden") flush(true);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      document.removeEventListener("visibilitychange", onHide);
      flush(true);
    };
  }, []);

  return null;
}
