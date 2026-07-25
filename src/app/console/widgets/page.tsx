"use client";

import { useMemo, useState } from "react";
import {
  Sparkline, LineChart, Gauge, Donut, MultiLineChart, BarChart, GroupedBar, StackedBar,
  HBar, ProgressRing, RadarChart, Heatmap, KpiCard, Pie, Legend, PALETTE, type Series,
} from "../charts";

const wave = (n: number, base: number, amp: number, phase = 0) =>
  Array.from({ length: n }, (_, i) => Math.max(0, Math.round(base + amp * Math.sin(i / 2 + phase) + amp * 0.25 * Math.cos(i / 1.3))));

function Panel({ title, subtitle, children, wide }: { title: string; subtitle?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`rounded-2xl cv-card p-5 ${wide ? "lg:col-span-2" : ""}`}>
      <h2 className="font-bold text-white">{title}</h2>
      {subtitle && <p className="text-xs text-slate-500 mt-0.5 mb-3">{subtitle}</p>}
      <div className={subtitle ? "" : "mt-3"}>{children}</div>
    </div>
  );
}

export default function WidgetsPage() {
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => `${i}:00`), []);
  const week = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const rooms: Series[] = useMemo(() => [
    { name: "Living", data: wave(24, 120, 60, 0), color: PALETTE[0] },
    { name: "Bedroom", data: wave(24, 80, 40, 1.5), color: PALETTE[1] },
    { name: "Kitchen", data: wave(24, 60, 50, 3), color: PALETTE[2] },
  ], []);
  const shown = rooms.filter((s) => !hidden[s.name]);
  const grouped: Series[] = [
    { name: "This week", data: [3.1, 4.4, 2.8, 5.1, 3.6, 4.9, 4.2], color: PALETTE[0] },
    { name: "Last week", data: [2.8, 3.9, 3.2, 4.4, 3.1, 5.2, 3.8], color: PALETTE[4] },
  ];
  const stacked: Series[] = [
    { name: "AC", data: [1.8, 2.1, 1.4, 2.6, 1.9, 2.4, 2.0], color: PALETTE[0] },
    { name: "Lights", data: [0.7, 0.9, 0.6, 0.8, 0.7, 1.0, 0.8], color: PALETTE[3] },
    { name: "Others", data: [0.6, 0.7, 0.5, 0.9, 0.6, 0.8, 0.7], color: PALETTE[1] },
  ];
  const radar: Series[] = [
    { name: "Home", data: [80, 65, 90, 70, 60, 85], color: PALETTE[1] },
    { name: "Away", data: [40, 30, 55, 35, 80, 45], color: PALETTE[2] },
  ];
  const heatGrid = useMemo(() => Array.from({ length: 7 }, (_, r) => Array.from({ length: 12 }, (_, c) => Math.round(Math.abs(Math.sin((r + 1) / 3 + c / 4)) * 9))), []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-white">Widgets & Charts</h1>
        <p className="text-sm text-slate-400 mt-1">The full Circuvent console chart suite — line, area, bar, radar, gauges and more.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
        <KpiCard label="Live Power" value={248} prefix="" spark={wave(16, 200, 60)} delta={4.2} color={PALETTE[0]} />
        <KpiCard label="Energy Today" value={"4.2 kWh"} spark={wave(16, 4, 1)} delta={-2.1} color={PALETTE[4]} />
        <KpiCard label="Devices Online" value={12} spark={wave(16, 10, 2)} delta={0} color={PALETTE[1]} />
        <KpiCard label="Est. Cost" value={"₹34"} spark={wave(16, 30, 8)} delta={1.4} color={PALETTE[3]} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Per-room load" subtitle="Multi-series area · hover to inspect · toggle rooms below" wide>
          <Legend items={rooms.map((s) => ({ name: hidden[s.name] ? `${s.name} (hidden)` : s.name, color: s.color! }))} />
          <div className="mt-2 mb-2 flex flex-wrap gap-2">
            {rooms.map((s) => (
              <button key={s.name} onClick={() => setHidden((h) => ({ ...h, [s.name]: !h[s.name] }))}
                className={`rounded-lg px-2.5 py-1 text-xs border ${hidden[s.name] ? "border-white/10 text-slate-500" : "border-white/20 text-white"}`}>
                {hidden[s.name] ? "Show" : "Hide"} {s.name}
              </button>
            ))}
          </div>
          <MultiLineChart labels={hours} series={shown} area unit=" W" height={240} />
        </Panel>

        <Panel title="Single-series area line" subtitle="Load over the last 30 samples"><LineChart data={wave(30, 150, 70)} /></Panel>
        <Panel title="Bar chart" subtitle="Hover a bar for its value"><BarChart labels={hours.filter((_, i) => i % 2 === 0)} data={wave(12, 60, 40)} unit=" W" /></Panel>

        <Panel title="Grouped bars" subtitle="This week vs last week (kWh)"><GroupedBar labels={week} series={grouped} /></Panel>
        <Panel title="Stacked bars" subtitle="Usage by category (kWh)"><StackedBar labels={week} series={stacked} /></Panel>

        <Panel title="Consumption split" subtitle="Donut"><Donut segments={[{ label: "AC", value: 48, color: PALETTE[0] }, { label: "Lights", value: 22, color: PALETTE[3] }, { label: "Appliances", value: 18, color: PALETTE[1] }, { label: "Others", value: 12, color: PALETTE[2] }]} /></Panel>
        <Panel title="Category share" subtitle="Pie"><Pie segments={[{ label: "Lighting", value: 34 }, { label: "Cooling", value: 41 }, { label: "Appliances", value: 25 }]} /></Panel>

        <Panel title="Top consumers" subtitle="Ranked horizontal bars"><HBar items={[{ name: "Air Conditioner", value: 480 }, { name: "Geyser", value: 320 }, { name: "Fridge", value: 180 }, { name: "Lights", value: 90 }]} unit=" W" /></Panel>
        <Panel title="Home vs Away profile" subtitle="Radar"><RadarChart axes={["Comfort", "Energy", "Security", "Air", "Water", "Lights"]} series={radar} /></Panel>

        <Panel title="Gauges & rings" subtitle="Live power + indices">
          <div className="flex flex-wrap items-center gap-8">
            <Gauge value={248} max={500} />
            <ProgressRing value={64} label="Comfort" color={PALETTE[1]} />
            <ProgressRing value={82} label="Uptime" color={PALETTE[4]} />
          </div>
        </Panel>
        <Panel title="Activity heatmap" subtitle="Events by day × hour block"><Heatmap grid={heatGrid} rows={week} cols={hours.filter((_, i) => i % 2 === 0)} /></Panel>

        <Panel title="Sparklines" subtitle="Compact inline trends" wide>
          <div className="flex flex-wrap items-center gap-8">
            <div><div className="text-xs text-slate-400 mb-1">Living room</div><Sparkline data={wave(24, 40, 20)} color={PALETTE[0]} width={160} /></div>
            <div><div className="text-xs text-slate-400 mb-1">Kitchen</div><Sparkline data={wave(24, 40, 30, 2)} color={PALETTE[2]} width={160} /></div>
            <div><div className="text-xs text-slate-400 mb-1">Bedroom</div><Sparkline data={wave(24, 40, 10, 4)} color={PALETTE[4]} width={160} /></div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
