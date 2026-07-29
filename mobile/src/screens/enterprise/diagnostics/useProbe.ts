import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../api";
import { createStore } from "../../../enterprise";
import { useAppActive } from "../../../ui";
import { latencyStats, timeCall } from "./parts";
import { logDiagnostic } from "./log";

export interface ProbeSample { ts: string; ms: number; ok: boolean; status: number }
interface ProbeState { samples: ProbeSample[] }
const MAX = 96;
const store = createStore<ProbeState>("diagnostics-health-probes-v1", { samples: [] });
export function useHealthProbe(intervalMs = 15000) {
  const active = useAppActive(); const [samples, setSamples] = useState<ProbeSample[]>([]); const [loaded, setLoaded] = useState(false); const running = useRef(false);
  useEffect(() => { store.load().then((s) => setSamples(s.samples)).finally(() => setLoaded(true)); }, []);
  const append = useCallback(async (sample: ProbeSample) => { setSamples((cur) => { const next = [...cur, sample].slice(-MAX); store.save({ samples: next }).catch(() => undefined); return next; }); }, []);
  const probe = useCallback(async () => { if (running.current) return; running.current = true; const r = await timeCall(() => api.health()); const sample = { ts: new Date().toISOString(), ms: r.ms, ok: r.ok, status: r.status }; await append(sample); await logDiagnostic({ severity: r.ok ? "info" : "warning", kind: "probe", title: r.ok ? "HTTP health probe completed" : "HTTP health probe failed", detail: `${Math.round(r.ms)} ms · status ${r.status}`, data: sample }); running.current = false; }, [append]);
  useEffect(() => { if (!active || !loaded) return; probe(); const id = setInterval(probe, intervalMs); return () => clearInterval(id); }, [active, loaded, intervalMs, probe]);
  const key = samples.map((s) => `${s.ts}:${s.ms}`).join("|");
  const stats = useMemo(() => latencyStats(samples.filter((s) => s.ok).map((s) => s.ms)), [key]);
  return { samples, stats, active, probe, loaded };
}
