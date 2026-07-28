"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Activity, Server, Cloud, Database } from "lucide-react";
import { LineChart, BarChart, HBar, KpiCard, GaugeChart, PALETTE } from "./charts";

function tok() { try { return sessionStorage.getItem("admin-token") || ""; } catch { return ""; } }
const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };
const RANGES = [{ label: "1h", h: 1 }, { label: "24h", h: 24 }, { label: "7d", h: 168 }, { label: "30d", h: 720 }];

interface Probe { name: string; label: string; ms: number; ok: boolean }
interface Bucket { label: string; p50: number; p95: number; p99: number; count: number; errPct: number }
interface EndpointStat { endpoint: string; count: number; p50: number; p95: number; avg: number; errPct: number }
interface Report { source: "live" | "warming"; rangeHours: number; percentiles: { p50: number; p95: number; p99: number; avg: number }; uptimePct: number; errorRatePct: number; throughput: number; series: Bucket[]; byEndpoint: EndpointStat[] }

export default function LatencyPanel() {
  const [range, setRange] = useState(24);
  const [probes, setProbes] = useState<Probe[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [at, setAt] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/latency?range=${range}`, { headers: { "x-admin-token": tok() } });
      const d = await r.json();
      if (d.ok) { setProbes(d.probes || []); setReport(d.report); setAt(d.generatedAt); }
    } catch { /* ignore */ }
    setLoading(false);
  }, [range]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  if (loading && !report) return <div className="py-16 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>Loading latency…</div>;
  if (!report) return null;

  const labels = report.series.map((s) => s.label);
  const probeIcon = (n: string) => (n.startsWith("db") ? <Database className="h-4 w-4" /> : n.startsWith("upstream") ? <Cloud className="h-4 w-4" /> : <Server className="h-4 w-4" />);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold" style={{ color: "var(--text-primary)" }}><Activity className="h-5 w-5" style={{ color: "var(--accent-cyan)" }} /> Latency &amp; performance</h3>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-tertiary)" }}>API + upstream response times, percentiles and error rates. Source: <span style={{ color: report.source === "live" ? "#10b981" : "#f59e0b" }}>{report.source === "live" ? "live telemetry" : `warming up · ${report.throughput.toLocaleString("en-IN")} sample${report.throughput === 1 ? "" : "s"} recorded`}</span>{at ? ` · updated ${new Date(at).toLocaleTimeString("en-IN")}` : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg p-0.5" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
            {RANGES.map((r) => (<button key={r.h} onClick={() => setRange(r.h)} className="rounded-md px-2.5 py-1 text-xs font-medium" style={range === r.h ? { background: "linear-gradient(135deg,#06b6d4,#8b5cf6)", color: "#fff" } : { color: "var(--text-tertiary)" }}>{r.label}</button>))}
          </div>
          <button onClick={load} className="rounded-lg border p-2" style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}><RefreshCw className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {probes.map((p) => (
          <div key={p.name} className="rounded-2xl p-4" style={card}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-tertiary)" }}>{probeIcon(p.name)} {p.label}</span>
              <span className="h-2 w-2 rounded-full" style={{ background: p.ok ? "#10b981" : "#ef4444" }} />
            </div>
            <div className="mt-1 text-2xl font-bold" style={{ color: p.ms < 150 ? "#10b981" : p.ms < 500 ? "#f59e0b" : "#ef4444" }}>{p.ms}<span className="text-sm" style={{ color: "var(--text-tertiary)" }}> ms</span></div>
          </div>
        ))}
      </div>

      {report.throughput === 0 ? (
        <div className="rounded-2xl p-10 text-center" style={card}>
          <Activity className="mx-auto h-8 w-8" style={{ color: "var(--text-tertiary)" }} />
          <p className="mt-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>No requests recorded in the last {report.rangeHours < 24 ? `${report.rangeHours}h` : `${Math.round(report.rangeHours / 24)}d`}</p>
          <p className="mx-auto mt-1 max-w-md text-xs" style={{ color: "var(--text-tertiary)" }}>
            Percentiles, throughput and per-endpoint stats are computed from real request telemetry. The probe cards above are live measurements taken just now — the rest of this view fills in as traffic accrues.
          </p>
        </div>
      ) : (
      <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="p50 (ms)" value={report.percentiles.p50} color={PALETTE[0]} />
        <KpiCard label="p95 (ms)" value={report.percentiles.p95} color={PALETTE[3]} />
        <KpiCard label="p99 (ms)" value={report.percentiles.p99} color={PALETTE[6]} />
        <KpiCard label="Avg (ms)" value={report.percentiles.avg} color={PALETTE[1]} />
        <KpiCard label="Uptime %" value={report.uptimePct} color={PALETTE[4]} />
        <KpiCard label="Requests" value={report.throughput} color={PALETTE[5]} />
      </div>

      <div className="rounded-2xl p-5" style={card}>
        <h4 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Response-time percentiles (ms)</h4>
        <LineChart area labels={labels} yFmt={(n) => String(Math.round(n))} series={[
          { name: "p50", data: report.series.map((s) => s.p50), color: PALETTE[0] },
          { name: "p95", data: report.series.map((s) => s.p95), color: PALETTE[3] },
          { name: "p99", data: report.series.map((s) => s.p99), color: PALETTE[6] },
        ]} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl p-5" style={card}>
          <h4 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Throughput (requests / bucket)</h4>
          <BarChart labels={labels} data={report.series.map((s) => s.count)} color={PALETTE[1]} />
        </div>
        <div className="rounded-2xl p-5" style={card}>
          <h4 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Error rate (%)</h4>
          <LineChart labels={labels} yFmt={(n) => n.toFixed(0)} series={[{ name: "errors", data: report.series.map((s) => s.errPct), color: "#ef4444" }]} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl p-5" style={card}>
          <h4 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Slowest endpoints (p95 ms)</h4>
          <HBar items={report.byEndpoint.map((e, i) => ({ name: e.endpoint, value: e.p95, color: PALETTE[i % PALETTE.length] }))} />
        </div>
        <div className="flex items-center justify-around gap-4 rounded-2xl p-5" style={card}>
          <GaugeChart value={report.percentiles.p95} max={800} label="p95 vs 800ms SLA" color={report.percentiles.p95 < 500 ? "#10b981" : "#f59e0b"} suffix="ms" />
          <div>
            <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>Error rate</div>
            <div className="text-3xl font-extrabold" style={{ color: report.errorRatePct < 1 ? "#10b981" : "#ef4444" }}>{report.errorRatePct}%</div>
            <div className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>Uptime {report.uptimePct}%</div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl p-5" style={card}>
        <h4 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Per-endpoint breakdown</h4>
        <table className="w-full text-sm">
          <thead><tr style={{ color: "var(--text-tertiary)" }}>
            <th className="px-2 py-1 text-left font-medium">Endpoint</th>
            <th className="px-2 py-1 text-right font-medium">Reqs</th>
            <th className="px-2 py-1 text-right font-medium">p50</th>
            <th className="px-2 py-1 text-right font-medium">p95</th>
            <th className="px-2 py-1 text-right font-medium">Avg</th>
            <th className="px-2 py-1 text-right font-medium">Err %</th>
          </tr></thead>
          <tbody>
            {report.byEndpoint.map((e) => (
              <tr key={e.endpoint} className="border-t" style={{ borderColor: "var(--border-primary)" }}>
                <td className="px-2 py-1.5 font-mono" style={{ color: "var(--text-primary)" }}>{e.endpoint}</td>
                <td className="px-2 py-1.5 text-right" style={{ color: "var(--text-secondary)" }}>{e.count.toLocaleString("en-IN")}</td>
                <td className="px-2 py-1.5 text-right" style={{ color: "var(--text-secondary)" }}>{e.p50}</td>
                <td className="px-2 py-1.5 text-right" style={{ color: e.p95 < 300 ? "#10b981" : e.p95 < 600 ? "#f59e0b" : "#ef4444" }}>{e.p95}</td>
                <td className="px-2 py-1.5 text-right" style={{ color: "var(--text-secondary)" }}>{e.avg}</td>
                <td className="px-2 py-1.5 text-right" style={{ color: e.errPct < 1 ? "var(--text-secondary)" : "#ef4444" }}>{e.errPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>
      )}
    </div>
  );
}
