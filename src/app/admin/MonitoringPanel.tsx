"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Server, Database, Wifi, WifiOff, RefreshCw, HeartPulse, Cpu, Clock } from "lucide-react";
import { ProgressRing, Sparkline, PALETTE } from "./charts";
import { openVisitorStream } from "./visitorStream";

function tok() { try { return sessionStorage.getItem("admin-token") || ""; } catch { return ""; } }
const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };

interface Stats {
  visitors: { totalActive: number; totalViewsAllTime: number; peakConcurrent: number; pageStats: { page: string; activeVisitors: number; totalViews: number }[] };
  cache: { totalEntries: number; totalHits: number; totalMisses: number; hitRate: string; memoryUsage: string };
  server: { uptime: string; memory: { heapUsed: string; heapTotal: string; rss: string }; nodeVersion: string; platform: string };
}
interface Health { name: string; url: string; ok: boolean; ms: number }

export default function MonitoringPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [audit, setAudit] = useState<{ at: string; action: string; detail: string }[]>([]);
  const [live, setLive] = useState<number | null>(null);
  const [sse, setSse] = useState(false);
  const [health, setHealth] = useState<Health[]>([]);
  const [rpsHist, setRpsHist] = useState<number[]>([]);
  const lastViews = useRef<number | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/stats", { headers: { "x-admin-token": tok() } });
      if (r.ok) {
        const d = await r.json();
        setStats(d);
        const views = d.visitors?.totalViewsAllTime ?? 0;
        if (lastViews.current !== null) setRpsHist((h) => [...h.slice(-29), Math.max(0, views - lastViews.current!)]);
        lastViews.current = views;
      }
      const a = await fetch("/api/admin/analytics", { headers: { "x-admin-token": tok() } });
      if (a.ok) setAudit((await a.json()).audit || []);
    } catch { /* ignore */ }
  }, []);

  const runHealth = useCallback(async () => {
    const checks = [
      { name: "Health", url: "/api/health" },
      { name: "Shop products", url: "/api/shop/products" },
      { name: "Analytics", url: "/api/admin/insights?range=7" },
      { name: "Orders API", url: "/api/admin/orders" },
    ];
    const out: Health[] = [];
    for (const c of checks) {
      const t0 = performance.now();
      try {
        const r = await fetch(c.url, { headers: { "x-admin-token": tok() } });
        out.push({ name: c.name, url: c.url, ok: r.ok, ms: Math.round(performance.now() - t0) });
      } catch {
        out.push({ name: c.name, url: c.url, ok: false, ms: Math.round(performance.now() - t0) });
      }
    }
    setHealth(out);
  }, []);

  useEffect(() => {
    fetchStats(); runHealth();
    const i = setInterval(fetchStats, 5000);
    const h = setInterval(runHealth, 15000);
    return () => { clearInterval(i); clearInterval(h); };
  }, [fetchStats, runHealth]);

  useEffect(() => {
    const stream = openVisitorStream({
      onOpen: () => setSse(true),
      onClosed: () => setSse(false),
      onData: (p) => setLive((p as { totalActive?: number })?.totalActive ?? 0),
    });
    return () => stream.close();
  }, []);

  const memPct = stats ? pctOf(stats.server.memory.heapUsed, stats.server.memory.heapTotal) : 0;
  const hitRate = stats ? parseFloat(stats.cache.hitRate) || 0 : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-bold" style={{ color: "var(--text-primary)" }}>
          <Activity className="h-5 w-5" style={{ color: "var(--accent-cyan)" }} /> System monitoring
        </h3>
        <div className="flex items-center gap-2 text-sm">
          {sse ? <span className="flex items-center gap-1 text-emerald-500"><Wifi className="h-4 w-4" /> Live</span>
               : <span className="flex items-center gap-1 text-red-400"><WifiOff className="h-4 w-4" /> Offline</span>}
          <button onClick={() => { fetchStats(); runHealth(); }} className="rounded-lg border p-2" style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}><RefreshCw className="h-4 w-4" /></button>
        </div>
      </div>

      {/* live tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile icon={<Activity className="h-4 w-4" />} label="Active now" value={live ?? stats?.visitors.totalActive ?? 0} color="#10b981" />
        <Tile icon={<HeartPulse className="h-4 w-4" />} label="Peak concurrent" value={stats?.visitors.peakConcurrent ?? 0} color="#8b5cf6" />
        <Tile icon={<Server className="h-4 w-4" />} label="Uptime" value={stats?.server.uptime ?? "-"} color="#06b6d4" />
        <Tile icon={<Database className="h-4 w-4" />} label="Total views" value={(stats?.visitors.totalViewsAllTime ?? 0).toLocaleString("en-IN")} color="#f59e0b" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* server health rings */}
        <div className="rounded-2xl p-5" style={card}>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}><Cpu className="h-4 w-4" /> Server</h4>
          <div className="flex items-center justify-around">
            <div className="text-center"><ProgressRing value={memPct} label="Heap" color={PALETTE[2]} /><p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{stats?.server.memory.heapUsed} / {stats?.server.memory.heapTotal}</p></div>
            <div className="text-center"><ProgressRing value={hitRate} label="Cache hit" color={PALETTE[4]} /><p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{stats?.cache.totalEntries} keys</p></div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
            <span>Node {stats?.server.nodeVersion}</span><span className="text-right">{stats?.server.platform}</span>
            <span>RSS {stats?.server.memory.rss}</span><span className="text-right">Cache {stats?.cache.memoryUsage}</span>
          </div>
        </div>

        {/* request activity */}
        <div className="rounded-2xl p-5" style={card}>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}><Activity className="h-4 w-4" /> Page views / 5s</h4>
          {rpsHist.length > 1 ? <Sparkline data={rpsHist} width={260} height={70} color={PALETTE[0]} /> : <p className="py-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>Collecting…</p>}
          <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>Cache hits {stats?.cache.totalHits} · misses {stats?.cache.totalMisses}</p>
        </div>

        {/* API health */}
        <div className="rounded-2xl p-5" style={card}>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}><HeartPulse className="h-4 w-4" /> API health</h4>
          <div className="space-y-2">
            {health.map((h) => (
              <div key={h.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 8, background: h.ok ? "#10b981" : "#ef4444", display: "inline-block" }} /> {h.name}
                </span>
                <span className="text-xs" style={{ color: h.ms > 500 ? "#f59e0b" : "var(--text-muted)" }}>{h.ms} ms</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* top live pages */}
      <div className="rounded-2xl p-5" style={card}>
        <h4 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Live pages</h4>
        {stats?.visitors.pageStats?.length ? (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {stats.visitors.pageStats.slice(0, 10).map((p) => (
              <div key={p.page} className="flex items-center justify-between rounded-lg px-3 py-1.5 text-sm" style={{ background: "var(--bg-glass)" }}>
                <span className="truncate" style={{ color: "var(--text-secondary)" }}>{p.page}</span>
                <span className="ml-2 flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  <span style={{ color: "#10b981" }}>{p.activeVisitors} live</span> · {p.totalViews} views
                </span>
              </div>
            ))}
          </div>
        ) : <p className="py-4 text-center text-xs" style={{ color: "var(--text-muted)" }}>No active visitors.</p>}
      </div>

      {/* audit log */}
      <div className="rounded-2xl p-5" style={card}>
        <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}><Clock className="h-4 w-4" /> Recent activity (audit log)</h4>
        {audit.length ? (
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {audit.map((a, i) => (
              <div key={i} className="flex items-center justify-between border-b py-1.5 text-xs" style={{ borderColor: "var(--border-primary)" }}>
                <span><b style={{ color: "var(--text-secondary)" }}>{a.action}</b> <span style={{ color: "var(--text-muted)" }}>{a.detail}</span></span>
                <span style={{ color: "var(--text-muted)" }}>{fmt(a.at)}</span>
              </div>
            ))}
          </div>
        ) : <p className="py-4 text-center text-xs" style={{ color: "var(--text-muted)" }}>No audit events yet.</p>}
      </div>
    </div>
  );
}

function Tile({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-2xl p-4" style={card}>
      <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
        <span style={{ color }}>{icon}</span> {label}
      </span>
      <p className="mt-1 text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{value}</p>
    </div>
  );
}
function pctOf(a?: string, b?: string): number {
  const x = parseFloat(a || "0"), y = parseFloat(b || "0");
  return y ? Math.round((x / y) * 100) : 0;
}
function fmt(iso: string) { try { return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } }
