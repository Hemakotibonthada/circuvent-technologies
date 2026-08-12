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
  /** HTTP verb, for requests. A GET and a DELETE to one route are not one row. */
  method?: string;
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

    /*
     * Every API call the page makes, timed.
     *
     * This is the only honest place to measure them. The server routes here are
     * hand-written with raw NextResponse — the withApi wrapper that would have
     * been the natural seam is used by none of the 138 of them — and the edge
     * proxy sees a request begin but never its status or duration, because it
     * hands off with NextResponse.next(). The browser is the one place that
     * observes the whole round trip, which is also why Azure's own JS SDK
     * instruments fetch rather than relying on the server.
     *
     * What that means for the numbers is worth stating plainly: these are
     * client-observed durations. They include the network, so they are larger
     * than server time, and calls made by other clients — the mobile app, a
     * script, a webhook — are not here at all.
     */
    const nativeFetch = window.fetch;
    const instrumentedFetch: typeof window.fetch = async (input, init) => {
      const started = performance.now();

      let url: URL | null = null;
      try {
        const raw =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        url = new URL(raw, window.location.origin);
      } catch {
        url = null;
      }

      // Same-origin only. A third-party endpoint's path is not ours to record,
      // and its query string is even less so.
      const sameOrigin = url != null && url.origin === window.location.origin;

      /*
       * Never record the beacon. Recording the call that ships telemetry would
       * make every flush produce a new event to flush, and the page would spend
       * the rest of its life talking about itself.
       */
      const isBeacon = sameOrigin && url!.pathname === "/api/telemetry";

      const method = (
        init?.method ??
        (typeof input === "object" && "method" in input ? input.method : "GET") ??
        "GET"
      ).toUpperCase();

      try {
        const res = await nativeFetch(input as RequestInfo, init);
        if (sameOrigin && !isBeacon) {
          enqueue({
            kind: "request",
            // Path only. Query strings carry tokens and order numbers, which is
            // the same reason pageviews never send the raw URL.
            path: routeOf(url!.pathname),
            method,
            status: res.status,
            ok: res.ok,
            durationMs: Math.round(performance.now() - started),
          });
        }
        return res;
      } catch (err) {
        if (sameOrigin && !isBeacon) {
          /*
           * status 0 for a request that never got one. A failed call recorded
           * as a success with no status would be invisible in the failure rate,
           * and a dropped connection is exactly what somebody opens this page
           * to find.
           */
          enqueue({
            kind: "request",
            path: routeOf(url!.pathname),
            method,
            status: 0,
            ok: false,
            durationMs: Math.round(performance.now() - started),
            errorType: err instanceof Error ? err.name : "NetworkError",
          });
        }
        throw err;
      }
    };

    window.fetch = instrumentedFetch;

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      // Only restore if nothing else wrapped fetch after us; stomping a later
      // wrapper would silently disable whatever it was doing.
      if (window.fetch === instrumentedFetch) window.fetch = nativeFetch;
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      document.removeEventListener("visibilitychange", onHide);
      flush(true);
    };
  }, []);

  return null;
}
