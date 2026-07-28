// Request-latency metrics for the admin "Latency" dashboard.
// Records samples to the durable request_metrics table (or an in-memory ring in
// dev), runs live upstream probes, and aggregates percentiles / per-endpoint /
// time-series. Every number reported here is measured — when not enough real
// samples have accrued yet the report is returned with source: "warming" and
// the real (small) sample count, never synthesized data.
// SERVER ONLY.
import { dbEnabled } from "./db";

export interface LatencyProbe { name: string; label: string; ms: number; ok: boolean }
export interface LatencyBucket { label: string; p50: number; p95: number; p99: number; count: number; errPct: number }
export interface EndpointStat { endpoint: string; count: number; p50: number; p95: number; avg: number; errPct: number }
export interface LatencyReport {
  source: "live" | "warming";
  rangeHours: number;
  percentiles: { p50: number; p95: number; p99: number; avg: number };
  uptimePct: number;
  errorRatePct: number;
  throughput: number;
  series: LatencyBucket[];
  byEndpoint: EndpointStat[];
}

interface Sample { ts: number; endpoint: string; status: number | null; ms: number }

const ring: Sample[] = [];
const RING_MAX = 6000;

export async function recordLatency(samples: { endpoint: string; method?: string; status?: number; ms: number }[]): Promise<void> {
  if (!samples.length) return;
  try {
    if (dbEnabled()) {
      const { dbRecordLatency } = await import("./db");
      await dbRecordLatency(samples);
    } else {
      const now = Date.now();
      for (const s of samples) ring.push({ ts: now, endpoint: s.endpoint, status: s.status ?? null, ms: s.ms });
      if (ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);
    }
  } catch { /* ignore */ }
}

async function fetchSamples(hours: number): Promise<Sample[]> {
  try {
    if (dbEnabled()) {
      const { dbLatencySamples } = await import("./db");
      const rows = await dbLatencySamples(hours);
      return rows.map((r) => ({ ts: new Date(r.ts).getTime(), endpoint: r.endpoint, status: r.status, ms: r.ms }));
    }
  } catch { /* fall through */ }
  const cutoff = Date.now() - hours * 3600 * 1000;
  return ring.filter((r) => r.ts > cutoff);
}

function pct(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}
function timeout(ms: number): AbortSignal {
  try { return AbortSignal.timeout(ms); } catch { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; }
}

/** Live latency probes (DB, self API, weather upstream). Records the samples. */
export async function runProbes(origin: string): Promise<LatencyProbe[]> {
  const probes: LatencyProbe[] = [];
  const measure = async (name: string, label: string, fn: () => Promise<void>) => {
    const t0 = Date.now();
    let ok = true;
    try { await fn(); } catch { ok = false; }
    probes.push({ name, label, ms: Date.now() - t0, ok });
  };
  if (dbEnabled()) await measure("db.query", "Database round-trip", async () => { const { pingDb } = await import("./db"); await pingDb(); });
  if (origin) await measure("self.api", "API health", async () => { const r = await fetch(`${origin}/api/health`, { signal: timeout(5000) }); if (!r.ok) throw new Error("bad"); });
  await measure("upstream.weather", "Weather upstream", async () => { const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=12.97&longitude=77.59&current=temperature_2m", { signal: timeout(6000) }); if (!r.ok) throw new Error("bad"); });
  await recordLatency(probes.map((p) => ({ endpoint: p.name, status: p.ok ? 200 : 503, ms: p.ms })));
  return probes;
}

function bucketLabel(ts: number, hours: number): string {
  const d = new Date(ts);
  if (hours <= 48) return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export async function latencyReport(hours: number): Promise<LatencyReport> {
  const samples = await fetchSamples(hours);
  const source: "live" | "warming" = samples.length >= 40 ? "live" : "warming";

  const all = samples.map((s) => s.ms).sort((a, b) => a - b);
  const percentiles = {
    p50: Math.round(pct(all, 50)), p95: Math.round(pct(all, 95)), p99: Math.round(pct(all, 99)),
    avg: Math.round(all.reduce((a, b) => a + b, 0) / (all.length || 1)),
  };
  const errors = samples.filter((s) => (s.status ?? 200) >= 500).length;
  const errorRatePct = +((errors / (samples.length || 1)) * 100).toFixed(2);
  const uptimePct = +(100 - errorRatePct).toFixed(2);

  const buckets = 24;
  const now = Date.now(), span = hours * 3600 * 1000, start = now - span, bw = span / buckets;
  const series: LatencyBucket[] = [];
  for (let i = 0; i < buckets; i++) {
    const b0 = start + i * bw, b1 = b0 + bw;
    const inb = samples.filter((s) => s.ts >= b0 && s.ts < b1);
    const bms = inb.map((s) => s.ms).sort((a, b) => a - b);
    const berr = inb.filter((s) => (s.status ?? 200) >= 500).length;
    series.push({ label: bucketLabel(b0, hours), p50: Math.round(pct(bms, 50)), p95: Math.round(pct(bms, 95)), p99: Math.round(pct(bms, 99)), count: inb.length, errPct: +((berr / (inb.length || 1)) * 100).toFixed(1) });
  }

  const byMap = new Map<string, number[]>(), errMap = new Map<string, number>();
  for (const s of samples) {
    if (!byMap.has(s.endpoint)) byMap.set(s.endpoint, []);
    byMap.get(s.endpoint)!.push(s.ms);
    if ((s.status ?? 200) >= 500) errMap.set(s.endpoint, (errMap.get(s.endpoint) || 0) + 1);
  }
  const byEndpoint: EndpointStat[] = [...byMap.entries()].map(([endpoint, arr]) => {
    const sorted = [...arr].sort((a, b) => a - b);
    return { endpoint, count: arr.length, p50: Math.round(pct(sorted, 50)), p95: Math.round(pct(sorted, 95)), avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length), errPct: +(((errMap.get(endpoint) || 0) / arr.length) * 100).toFixed(1) };
  }).sort((a, b) => b.count - a.count).slice(0, 10);

  return { source, rangeHours: hours, percentiles, uptimePct, errorRatePct, throughput: samples.length, series, byEndpoint };
}
