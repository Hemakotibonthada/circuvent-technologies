"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BatteryCharging, Loader2 } from "lucide-react";
import { controlPlane, type EnergySeries, type EnergySummary } from "@/lib/control-plane";
import { Donut, Gauge, LineChart, Sparkline } from "../charts";

const ranges = [
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
  { label: "30d", hours: 720 },
];

export default function EnergyPage() {
  const [summary, setSummary] = useState<EnergySummary | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [hours, setHours] = useState(24);
  const [series, setSeries] = useState<EnergySeries | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const r = await controlPlane.energySummary();
    if (r.ok) {
      setSummary(r.data);
      setDeviceId((id) => id || r.data.byDevice?.[0]?.id || "");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  useEffect(() => {
    if (!deviceId) return;
    controlPlane.deviceEnergy(deviceId, hours, "watts").then((r) => {
      if (r.ok) setSeries(r.data);
    });
  }, [deviceId, hours]);

  const line = useMemo(() => series?.series.map((p) => Number(p.avg || p.max || 0)) ?? [], [series]);
  const segments = useMemo(() => {
    const palette = ["#06b6d4", "#8b5cf6", "#22c55e", "#f59e0b", "#ef4444", "#14b8a6"];
    return (summary?.byDevice ?? []).slice(0, 6).map((d, i) => ({ label: d.name || d.id, value: Math.max(0.1, d.watts), color: palette[i % palette.length] }));
  }, [summary]);

  if (loading) return <div className="flex justify-center py-24 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-white">Energy</h1>
        <p className="text-sm text-slate-400 mt-1">Live load, daily consumption and device trends.</p>
      </div>

      {!summary ? (
        <div className="rounded-2xl border border-dashed border-white/15 py-16 text-center text-slate-400">Energy data is not available yet.</div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
            <div className="rounded-2xl cv-card p-5 flex items-center justify-around gap-4">
              <Gauge value={summary.liveWatts} max={Math.max(2000, summary.liveWatts * 1.4)} />
              <div>
                <div className="text-sm text-slate-400">Today</div>
                <div className="text-4xl font-extrabold text-white">{summary.todayKwh.toFixed(2)} <span className="text-lg text-slate-400">kWh</span></div>
                <div className="text-sm text-slate-500 mt-1">Estimated cost ₹{(summary.todayKwh * 8).toFixed(2)} at ₹8/kWh</div>
              </div>
            </div>
            <div className="rounded-2xl cv-card p-5">
              <h2 className="font-bold text-white mb-4">Consumption split</h2>
              {segments.length ? <Donut segments={segments} /> : <div className="text-sm text-slate-500">No powered devices yet.</div>}
            </div>
          </div>

          <div className="rounded-2xl cv-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="font-bold text-white">Device history</h2>
              <div className="flex gap-2">
                <select className="cv-input py-2" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
                  {summary.byDevice.map((d) => <option key={d.id} value={d.id}>{d.name || d.id}</option>)}
                </select>
                <div className="inline-flex rounded-xl border border-white/10 bg-black/20 p-1">
                  {ranges.map((r) => (
                    <button key={r.hours} onClick={() => setHours(r.hours)} className={`rounded-lg px-3 py-1.5 text-sm ${hours === r.hours ? "text-white cv-gradient" : "text-slate-400"}`}>{r.label}</button>
                  ))}
                </div>
              </div>
            </div>
            <LineChart data={line} />
            <div className="mt-2 text-sm text-slate-500">Total in range: {series?.kwh?.toFixed(2) ?? "0.00"} kWh</div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {summary.byDevice.map((d) => (
              <div key={d.id} className="rounded-2xl cv-card p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-300 flex items-center justify-center"><BatteryCharging className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-white truncate">{d.name || d.id}</div>
                  <div className="text-xs text-slate-500">{d.online ? "Online" : "Offline"} · {d.type}</div>
                </div>
                <div className="text-right">
                  <div className="font-extrabold text-white">{d.watts.toFixed(0)} W</div>
                  <Sparkline data={[0, d.watts * 0.4, d.watts * 0.7, d.watts]} width={70} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
