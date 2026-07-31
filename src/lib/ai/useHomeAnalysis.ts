"use client";

/**
 * Shared loader for the deterministic home analysis.
 *
 * Two surfaces render this data: the compact assistant-adjacent widget
 * (components/ai/InsightsPanel) and the full console tab
 * (app/smarthome/insights/AnalysisPanel). They present it very differently,
 * but they must never disagree about what the data *is* — so the fetching,
 * the auth handling and the error vocabulary live here once.
 */

import { useCallback, useEffect, useState } from "react";
import { getToken } from "../control-plane";
import type { HomeAnalysis } from "./analysis";

export interface HomeAnalysisState {
  analysis: HomeAnalysis | null;
  loading: boolean;
  /** Set when analysis could not be produced. Never populated alongside `analysis`. */
  error: string | null;
  /** True when the failure is "not signed in" rather than a real fault. */
  needsAuth: boolean;
  reload: () => void;
}

export function useHomeAnalysis(autoLoad = true): HomeAnalysisState {
  const [analysis, setAnalysis] = useState<HomeAnalysis | null>(null);
  const [loading, setLoading] = useState(autoLoad);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNeedsAuth(false);
    try {
      const consoleToken = getToken();
      if (!consoleToken) {
        setNeedsAuth(true);
        setError("Sign in to the console to see insights.");
        setAnalysis(null);
        return;
      }
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consoleToken }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        // A 401 here means the stored token expired, which is recoverable by
        // signing in again — distinct from the service being broken.
        if (res.status === 401) {
          setNeedsAuth(true);
          setError("Your console session expired. Sign in again.");
        } else {
          setError(data?.message ?? "Could not analyse your home.");
        }
        setAnalysis(null);
        return;
      }
      setAnalysis(data.analysis as HomeAnalysis);
    } catch {
      setError("Could not reach the analysis service.");
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoLoad) void reload();
  }, [autoLoad, reload]);

  return { analysis, loading, error, needsAuth, reload: () => void reload() };
}
