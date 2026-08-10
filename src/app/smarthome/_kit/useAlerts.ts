"use client";

/**
 * Live anomaly alerts for the console.
 *
 * The sweep endpoint keeps the state; this decides when to ask it. Two rules
 * matter and both are about not making things worse:
 *
 * Polling pauses when the tab is hidden. A console left open on a second
 * monitor for a week would otherwise sweep thousands of times, each one a
 * round trip to the control plane, for nobody.
 *
 * A failed sweep never clears what is on screen. The endpoint deliberately
 * returns the last known alerts when it cannot reach the control plane, and
 * the panel keeps showing them, because "we cannot see your devices right now"
 * and "your devices are fine" must not look the same.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getToken } from "@/lib/control-plane";
import type { Alert, AlertSummary } from "@/lib/anomaly-monitor";

export interface AlertsState {
  alerts: Alert[];
  summary: AlertSummary | null;
  /** True while a sweep is in flight and nothing has been shown yet. */
  loading: boolean;
  /** Set when the last sweep could not run. Alerts may still be present and stale. */
  error: string | null;
  /** ISO time of the last sweep that actually reached the control plane. */
  lastSweepAt: string | null;
  /** True when what is shown could not be refreshed. */
  stale: boolean;
  refresh: () => void;
  acknowledge: (fingerprint: string) => void;
}

const DEFAULT_INTERVAL_MS = 2 * 60 * 1000;

export function useAlerts(opts: { intervalMs?: number; enabled?: boolean } = {}): AlertsState {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const enabled = opts.enabled ?? true;

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSweepAt, setLastSweepAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const call = useCallback(
    async (body: Record<string, unknown>) => {
      const consoleToken = getToken();
      if (!consoleToken) {
        if (mounted.current) {
          setLoading(false);
          setError("Sign in to the smart-home console to see alerts.");
        }
        return;
      }
      // One sweep at a time. A slow control plane plus a 2-minute timer would
      // otherwise stack requests that all write the same state.
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const res = await fetch("/api/smarthome/alerts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ consoleToken, ...body }),
        });
        const data = await res.json().catch(() => null);
        if (!mounted.current) return;

        if (data && Array.isArray(data.alerts)) {
          setAlerts(data.alerts);
          setSummary(data.summary ?? null);
          if (data.lastSweepAt) setLastSweepAt(data.lastSweepAt);
        }
        if (data?.success) {
          setError(null);
          setStale(false);
        } else {
          // Keep whatever is on screen: the endpoint returns the last known
          // alerts on a control-plane failure precisely so the panel does not
          // have to choose between showing nothing and lying.
          setError(data?.message || "Could not evaluate alerts.");
          setStale(true);
        }
      } catch {
        if (mounted.current) {
          setError("Could not reach the alert service.");
          setStale(true);
        }
      } finally {
        inFlight.current = false;
        if (mounted.current) setLoading(false);
      }
    },
    []
  );

  const refresh = useCallback(() => {
    void call({});
  }, [call]);

  const acknowledge = useCallback(
    (fingerprint: string) => {
      // Optimistic: acknowledging is the user's own action and the server
      // cannot refuse it, so waiting a round trip to grey out a row is only a
      // delay the user has to sit through.
      setAlerts((prev) =>
        prev.map((a) =>
          a.fingerprint === fingerprint && a.state === "open" ? { ...a, state: "acknowledged" as const } : a
        )
      );
      void call({ action: "acknowledge", fingerprint });
    },
    [call]
  );

  useEffect(() => {
    if (!enabled) return;
    void call({});
  }, [enabled, call]);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => void call({}), intervalMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        // Catch up immediately rather than waiting a full interval — the tab
        // was probably hidden for longer than one.
        void call({});
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, intervalMs, call]);

  return { alerts, summary, loading, error, lastSweepAt, stale, refresh, acknowledge };
}
