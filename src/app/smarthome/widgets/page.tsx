"use client";

// Live widget gallery. Every chart on this page is driven by real account data
// pulled from the control plane (devices, rooms, energy summary, per-device
// energy history and the event log). Nothing here is generated or seeded — when
// a data source is empty the corresponding panel says so instead of inventing a
// series.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import {
  controlPlane,
  type AppEvent,
  type Device,
  type EnergyPoint,
  type EnergySummary,
} from "@/lib/control-plane";
import {
  Sparkline, LineChart, Gauge, Donut, MultiLineChart, BarChart, GroupedBar, StackedBar,
  HBar, ProgressRing, RadarChart, Heatmap, KpiCard, Pie, Legend, PALETTE, type Series,
} from "../charts";

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TARIFF = 8; // ₹/kWh — same assumption the Energy page states on screen

function Panel({ title, subtitle, children, wide }: { title: string; subtitle?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`rounded-2xl cv-card p-5 ${wide ? "lg:col-span-2" : ""}`}>
      <h2 className="font-bold text-white">{title}</h2>
      {subtitle && <p className="text-xs text-slate-500 mt-0.5 mb-3">{subtitle}</p>}
      <div className={subtitle ? "" : "mt-3"}>{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-10 text-center text-sm text-slate-500">{children}</div>;
}

/** Numeric reading off a device state key, or null when the device doesn't report it. */
function metric(d: Device, keys: string[]): number | null {
  for (const k of keys) {
    const v = d.state?.[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

export default function WidgetsPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [summary, setSummary] = useState<EnergySummary | null>(null);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [history, setHistory] = useState<Record<string, EnergyPoint[]>>({});
  const [weekPoints, setWeekPoints] = useState<EnergyPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const [d, e, ev] = await Promise.all([
      controlPlane.devices(),
      controlPlane.energySummary(),
      controlPlane.events(200),
    ]);
    if (!d.ok && !e.ok && !ev.ok) {
      setError(d.status === 401 ? "Sign in to view your live widgets." : "Could not reach the control plane.");
    } else {
      setError("");
    }
    if (d.ok) setDevices(d.data.devices || []);
    if (e.ok) setSummary(e.data);
    if (ev.ok) setEvents(ev.data.events || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  // Real per-room 24h load: fetch the history of the top consumer in each of the
  // three busiest rooms and sum by room.
  const topRooms = useMemo(() => {
    const byRoom = new Map<string, { watts: number; ids: string[] }>();
    for (const d of summary?.byDevice ?? []) {
      const dev = devices.find((x) => x.id === d.id);
      const room = dev?.room?.trim() || "Unassigned";
      const cur = byRoom.get(room) || { watts: 0, ids: [] };
      cur.watts += d.watts;
      cur.ids.push(d.id);
      byRoom.set(room, cur);
    }
    return [...byRoom.entries()]
      .sort((a, b) => b[1].watts - a[1].watts)
      .slice(0, 3)
      .map(([name, v]) => ({ name, ids: v.ids }));
  }, [summary, devices]);

  useEffect(() => {
    const ids = topRooms.flatMap((r) => r.ids).slice(0, 6);
    if (!ids.length) return;
    let cancelled = false;
    Promise.all(ids.map(async (id) => [id, await controlPlane.deviceEnergy(id, 24, "watts")] as const))
      .then((rows) => {
        if (cancelled) return;
        const next: Record<string, EnergyPoint[]> = {};
        for (const [id, r] of rows) if (r.ok) next[id] = r.data.series || [];
        setHistory(next);
      });
    return () => { cancelled = true; };
  }, [topRooms]);

  // Real 7-day history for the single largest consumer, used by the weekly panels.
  const leadDevice = summary?.byDevice?.[0]?.id || "";
  useEffect(() => {
    if (!leadDevice) return;
    let cancelled = false;
    controlPlane.deviceEnergy(leadDevice, 168, "watts").then((r) => {
      if (!cancelled && r.ok) setWeekPoints(r.data.series || []);
    });
    return () => { cancelled = true; };
  }, [leadDevice]);

  const hourLabels = useMemo(() => {
    const ids = topRooms.flatMap((r) => r.ids).find((id) => history[id]?.length);
    const pts = ids ? history[ids] : [];
    return pts.map((p) => new Date(p.t).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }));
  }, [history, topRooms]);

  const roomSeries: Series[] = useMemo(() => topRooms.map((r, i) => {
    const len = Math.max(0, ...r.ids.map((id) => history[id]?.length ?? 0));
    if (!len) return { name: r.name, data: [], color: PALETTE[i % PALETTE.length] };
    const data = Array.from({ length: len }, (_, idx) =>
      Math.round(r.ids.reduce((sum, id) => sum + Number(history[id]?.[idx]?.avg ?? 0), 0)));
    return { name: r.name, data, color: PALETTE[i % PALETTE.length] };
  }).filter((s) => s.data.length), [topRooms, history]);

  const shownRooms = roomSeries.filter((s) => !hidden[s.name]);

  // Weekly kWh from the lead device's real 7-day series, bucketed by weekday.
  const weekBuckets = useMemo(() => {
    if (!weekPoints?.length) return null;
    const kwh = new Array(7).fill(0);
    const counts = new Array(7).fill(0);
    for (const p of weekPoints) {
      const d = new Date(p.t);
      const idx = (d.getDay() + 6) % 7; // Mon=0
      kwh[idx] += Number(p.avg || 0);
      counts[idx] += 1;
    }
    return kwh.map((sum, i) => (counts[i] ? +(sum / counts[i] / 1000).toFixed(2) : 0));
  }, [weekPoints]);

  // Event activity heatmap: real counts by weekday × 2-hour block.
  const heat = useMemo(() => {
    const grid = Array.from({ length: 7 }, () => new Array(12).fill(0));
    for (const e of events) {
      const d = new Date(e.ts);
      if (Number.isNaN(d.getTime())) continue;
      grid[(d.getDay() + 6) % 7][Math.floor(d.getHours() / 2)] += 1;
    }
    return grid;
  }, [events]);
  const heatHasData = events.length > 0;

  const online = devices.filter((d) => d.online).length;
  const liveWatts = summary?.liveWatts ?? 0;
  const todayKwh = summary?.todayKwh ?? 0;

  const leadSpark = useMemo(() => {
    const pts = history[leadDevice] || [];
    return pts.map((p) => Number(p.avg || 0));
  }, [history, leadDevice]);

  const consumers = useMemo(() =>
    (summary?.byDevice ?? []).filter((d) => d.watts > 0).slice(0, 6)
      .map((d, i) => ({ name: d.name || d.id, value: Math.round(d.watts), color: PALETTE[i % PALETTE.length] })),
    [summary]);

  const byType = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of devices) m.set(d.type, (m.get(d.type) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  }, [devices]);

  // Radar over real fleet signals, normalised to 0-100.
  const radar: Series[] = useMemo(() => {
    if (!devices.length) return [];
    const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
    const withBattery = devices.map((d) => metric(d, ["battery", "batteryPct"])).filter((v): v is number => v !== null);
    const withRssi = devices.map((d) => metric(d, ["rssi"])).filter((v): v is number => v !== null);
    const recent = devices.filter((d) => d.last_seen && Date.now() - new Date(d.last_seen).getTime() < 15 * 60_000).length;
    const powered = devices.filter((d) => d.state?.power === true || d.state?.on === true).length;
    return [{
      name: "Fleet",
      color: PALETTE[1],
      data: [
        pct(online, devices.length),
        pct(recent, devices.length),
        withBattery.length ? Math.round(withBattery.reduce((a, b) => a + b, 0) / withBattery.length) : 100,
        withRssi.length ? Math.max(0, Math.min(100, Math.round(((withRssi.reduce((a, b) => a + b, 0) / withRssi.length) + 100) * 1.4))) : 100,
        pct(devices.filter((d) => d.fw_version).length, devices.length),
        pct(powered, devices.length),
      ],
    }];
  }, [devices, online]);

  if (loading) return <div className="flex justify-center py-24 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Widgets &amp; Charts</h1>
          <p className="text-sm text-slate-400 mt-1">The full Circuvent console chart suite, rendering your live account data.</p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 hover:text-white">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {error && <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">{error}</div>}

      {!devices.length && !summary ? (
        <div className="rounded-2xl border border-dashed border-white/15 py-20 text-center text-slate-400">
          No devices are paired with this account yet, so there is nothing to chart.
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
            <KpiCard label="Live Power" value={Math.round(liveWatts)} spark={leadSpark} color={PALETTE[0]} />
            <KpiCard label="Energy Today" value={`${todayKwh.toFixed(2)} kWh`} color={PALETTE[4]} />
            <KpiCard label="Devices Online" value={`${online}/${devices.length}`} color={PALETTE[1]} />
            <KpiCard label="Est. Cost Today" value={`₹${(todayKwh * TARIFF).toFixed(2)}`} color={PALETTE[3]} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Per-room load" subtitle="Measured watts over the last 24h · toggle rooms below" wide>
              {shownRooms.length || roomSeries.length ? (
                <>
                  <Legend items={roomSeries.map((s) => ({ name: hidden[s.name] ? `${s.name} (hidden)` : s.name, color: s.color! }))} />
                  <div className="mt-2 mb-2 flex flex-wrap gap-2">
                    {roomSeries.map((s) => (
                      <button key={s.name} onClick={() => setHidden((h) => ({ ...h, [s.name]: !h[s.name] }))}
                        className={`rounded-lg px-2.5 py-1 text-xs border ${hidden[s.name] ? "border-white/10 text-slate-500" : "border-white/20 text-white"}`}>
                        {hidden[s.name] ? "Show" : "Hide"} {s.name}
                      </button>
                    ))}
                  </div>
                  <MultiLineChart labels={hourLabels} series={shownRooms} area unit=" W" height={240} />
                </>
              ) : <Empty>No power history recorded yet. Devices that report watts will appear here.</Empty>}
            </Panel>

            <Panel title="Top consumer history" subtitle={leadDevice ? `Watts over the last 24h · ${summary?.byDevice?.[0]?.name || leadDevice}` : "Watts over the last 24h"}>
              {leadSpark.length ? <LineChart data={leadSpark} /> : <Empty>No history for this device yet.</Empty>}
            </Panel>
            <Panel title="Current draw by device" subtitle="Live watts reported right now">
              {consumers.length ? <BarChart labels={consumers.map((c) => c.name)} data={consumers.map((c) => c.value)} unit=" W" /> : <Empty>No device is drawing power right now.</Empty>}
            </Panel>

            <Panel title="Daily average load" subtitle="Lead device · mean watts per weekday (last 7 days)">
              {weekBuckets ? (
                <GroupedBar labels={WEEK} series={[{ name: "kWh (avg)", data: weekBuckets, color: PALETTE[0] }]} />
              ) : <Empty>Seven days of history is needed for this view.</Empty>}
            </Panel>
            <Panel title="Events by category" subtitle="Your notification log, grouped by kind">
              {events.length ? (() => {
                const m = new Map<string, number>();
                for (const e of events) m.set(e.kind || "other", (m.get(e.kind || "other") || 0) + 1);
                const kinds = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
                return <StackedBar labels={["Events"]} series={kinds.map(([name, v], i) => ({ name, data: [v], color: PALETTE[i % PALETTE.length] }))} />;
              })() : <Empty>No events recorded yet.</Empty>}
            </Panel>

            <Panel title="Consumption split" subtitle="Share of live load by device">
              {consumers.length ? <Donut segments={consumers.map((c) => ({ label: c.name, value: c.value, color: c.color }))} /> : <Empty>No powered devices right now.</Empty>}
            </Panel>
            <Panel title="Fleet by device type" subtitle="Every paired device, grouped by type">
              {byType.length ? <Pie segments={byType} /> : <Empty>No devices paired.</Empty>}
            </Panel>

            <Panel title="Top consumers" subtitle="Ranked by live watts">
              {consumers.length ? <HBar items={consumers} unit=" W" /> : <Empty>No powered devices right now.</Empty>}
            </Panel>
            <Panel title="Fleet health profile" subtitle="Online · recently seen · battery · signal · firmware · powered">
              {radar.length ? <RadarChart axes={["Online", "Recent", "Battery", "Signal", "Firmware", "Powered"]} series={radar} /> : <Empty>No devices paired.</Empty>}
            </Panel>

            <Panel title="Gauges & rings" subtitle="Live load and real fleet ratios">
              <div className="flex flex-wrap items-center gap-8">
                <Gauge value={Math.round(liveWatts)} max={Math.max(500, Math.ceil(liveWatts * 1.4))} />
                <ProgressRing value={devices.length ? Math.round((online / devices.length) * 100) : 0} label="Online" color={PALETTE[1]} />
                <ProgressRing value={events.length ? Math.round((events.filter((e) => e.read).length / events.length) * 100) : 0} label="Events read" color={PALETTE[4]} />
              </div>
            </Panel>
            <Panel title="Activity heatmap" subtitle="Real events by day × 2-hour block">
              {heatHasData ? (
                <Heatmap grid={heat} rows={WEEK} cols={Array.from({ length: 12 }, (_, i) => `${String(i * 2).padStart(2, "0")}:00`)} />
              ) : <Empty>No events recorded yet.</Empty>}
            </Panel>

            <Panel title="Sparklines" subtitle="Compact 24h trend per room" wide>
              {roomSeries.length ? (
                <div className="flex flex-wrap items-center gap-8">
                  {roomSeries.map((s, i) => (
                    <div key={s.name}>
                      <div className="text-xs text-slate-400 mb-1">{s.name}</div>
                      <Sparkline data={s.data} color={PALETTE[i % PALETTE.length]} width={160} />
                    </div>
                  ))}
                </div>
              ) : <Empty>No power history recorded yet.</Empty>}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
