"use client";

import { useState } from "react";
import {
  LayoutGrid, Plus, X, Calendar, RefreshCw, Gauge as GaugeIcon, LineChart as LineIcon,
  BarChart3, PieChart, ToggleLeft, SlidersHorizontal, Grid2x2, Tv, Building, Video,
  Thermometer, DoorOpen, Maximize2, Activity,
} from "lucide-react";
import { LineChart, BarChart, Gauge, Donut, ProgressRing, Heatmap, KpiCard, HBar } from "../../charts";
import { useStore, walk, rng, int } from "../_lib/store";
import { flagsStore } from "../_lib/sim";
import {
  PageHeader, Panel, Btn, Badge, Dot, Toggle, Tabs, Segmented, SectionTitle,
  StaggerGrid, StaggerItem, type Tone,
} from "../_ui";

type Tab = "builder" | "floorplan" | "templates" | "kiosk";
type WidgetType = "kpi" | "line" | "bar" | "gauge" | "donut" | "ring" | "toggle" | "slider" | "heatmap" | "hbar";

interface Widget { id: string; type: WidgetType; title: string; span: 1 | 2; }

const DEFAULT_WIDGETS: Widget[] = [
  { id: "w1", type: "kpi", title: "Live power", span: 1 },
  { id: "w2", type: "kpi", title: "Devices online", span: 1 },
  { id: "w3", type: "gauge", title: "Load", span: 1 },
  { id: "w4", type: "ring", title: "Uptime SLA", span: 1 },
  { id: "w5", type: "line", title: "Throughput · 24h", span: 2 },
  { id: "w6", type: "donut", title: "Health mix", span: 1 },
  { id: "w7", type: "bar", title: "Energy by room", span: 1 },
  { id: "w8", type: "heatmap", title: "Activity heatmap", span: 2 },
  { id: "w9", type: "toggle", title: "All lights", span: 1 },
  { id: "w10", type: "slider", title: "Target temp", span: 1 },
];

const PALETTE: { type: WidgetType; label: string; icon: typeof GaugeIcon }[] = [
  { type: "kpi", label: "KPI", icon: Activity }, { type: "line", label: "Line chart", icon: LineIcon },
  { type: "bar", label: "Bar chart", icon: BarChart3 }, { type: "gauge", label: "Gauge", icon: GaugeIcon },
  { type: "donut", label: "Donut", icon: PieChart }, { type: "ring", label: "Progress ring", icon: Grid2x2 },
  { type: "toggle", label: "Switch", icon: ToggleLeft }, { type: "slider", label: "Slider", icon: SlidersHorizontal },
  { type: "heatmap", label: "Heatmap", icon: Grid2x2 }, { type: "hbar", label: "Ranking", icon: BarChart3 },
];

export default function DashboardsPage() {
  const [tab, setTab] = useState<Tab>("builder");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Visual dashboards" icon={<LayoutGrid className="h-5 w-5" />}
        subtitle="Drag-and-drop dashboard builder with a rich widget library, floor-plan overlays, heatmaps, kiosk mode and shareable templates."
      />
      <Tabs<Tab>
        value={tab} onChange={setTab}
        tabs={[
          { value: "builder", label: "Builder", icon: <LayoutGrid className="h-4 w-4" /> },
          { value: "floorplan", label: "Floor Plan", icon: <Building className="h-4 w-4" /> },
          { value: "templates", label: "Templates", icon: <Grid2x2 className="h-4 w-4" /> },
          { value: "kiosk", label: "Kiosk", icon: <Tv className="h-4 w-4" /> },
        ]}
      />
      {tab === "builder" && <BuilderTab />}
      {tab === "floorplan" && <FloorPlanTab />}
      {tab === "templates" && <TemplatesTab />}
      {tab === "kiosk" && <KioskTab />}
    </div>
  );
}

function BuilderTab() {
  const [widgets, setWidgets] = useState<Widget[]>(DEFAULT_WIDGETS);
  const [range, setRange] = useState<"15m" | "24h" | "7d">("24h");
  const [refresh, setRefresh] = useState<"live" | "5s" | "1m">("live");
  const add = (type: WidgetType) => setWidgets((w) => [...w, { id: `w${Date.now()}`, type, title: PALETTE.find((p) => p.type === type)?.label ?? "Widget", span: type === "line" || type === "heatmap" ? 2 : 1 }]);
  const remove = (id: string) => setWidgets((w) => w.filter((x) => x.id !== id));

  return (
    <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
      <div className="space-y-3">
        <Panel>
          <SectionTitle>Widgets</SectionTitle>
          <div className="space-y-1.5">
            {PALETTE.map((p) => (
              <button key={p.type} onClick={() => add(p.type)} draggable className="flex w-full cursor-grab items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-sm text-slate-200 transition hover:bg-white/[0.07]">
                <span className="grid h-7 w-7 place-items-center rounded-md" style={{ background: "rgba(6,182,212,.1)", color: "#22d3ee" }}><p.icon className="h-3.5 w-3.5" /></span>
                {p.label}<Plus className="ml-auto h-3.5 w-3.5 text-slate-500" />
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <div className="space-y-3">
        <Panel pad={false} className="flex flex-wrap items-center gap-2 p-3">
          <span className="flex items-center gap-1.5 text-sm text-white"><Calendar className="h-4 w-4 text-cyan-400" /> Range</span>
          <Segmented<"15m" | "24h" | "7d"> value={range} onChange={setRange} options={[{ value: "15m", label: "15m" }, { value: "24h", label: "24h" }, { value: "7d", label: "7d" }]} />
          <span className="ml-auto flex items-center gap-1.5 text-sm text-white"><RefreshCw className="h-4 w-4 text-cyan-400" /> Refresh</span>
          <Segmented<"live" | "5s" | "1m"> value={refresh} onChange={setRefresh} options={[{ value: "live", label: "Live" }, { value: "5s", label: "5s" }, { value: "1m", label: "1m" }]} />
        </Panel>

        <StaggerGrid className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {widgets.map((w) => (
            <StaggerItem key={w.id} className={w.span === 2 ? "sm:col-span-2" : ""}>
              <WidgetCard widget={w} onRemove={() => remove(w.id)} />
            </StaggerItem>
          ))}
        </StaggerGrid>
      </div>
    </div>
  );
}

function WidgetCard({ widget, onRemove }: { widget: Widget; onRemove: () => void }) {
  return (
    <div className="group relative ad-card rounded-2xl p-4">
      <button onClick={onRemove} className="absolute right-2 top-2 z-10 rounded-md p-1 text-slate-600 opacity-0 transition hover:text-red-300 group-hover:opacity-100"><X className="h-4 w-4" /></button>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider ad-muted">{widget.title}</span>
      </div>
      <WidgetBody widget={widget} />
    </div>
  );
}

function WidgetBody({ widget }: { widget: Widget }) {
  const seed = widget.id;
  switch (widget.type) {
    case "kpi": return <KpiCard label="" value={int(rng(seed), 40, 990)} delta={int(rng(seed + "d"), -8, 12)} spark={walk(seed, 20, 50, 8)} color="#22d3ee" />;
    case "line": return <LineChart data={walk(seed, 40, 40, 6)} color="#22d3ee" height={150} />;
    case "bar": return <BarChart labels={["A", "B", "C", "D", "E"]} data={[42, 68, 31, 79, 54]} color="#8b5cf6" height={150} />;
    case "gauge": return <div className="flex justify-center"><Gauge value={int(rng(seed), 800, 2600)} max={3000} label="Load" unit="W" size={150} /></div>;
    case "donut": return <div className="flex justify-center"><Donut size={140} segments={[{ label: "OK", value: 82, color: "#22c55e" }, { label: "Warn", value: 12, color: "#f59e0b" }, { label: "Crit", value: 6, color: "#ef4444" }]} /></div>;
    case "ring": return <div className="flex justify-center"><ProgressRing value={99.4} max={100} size={120} label="99.4%" color="#22c55e" /></div>;
    case "toggle": return <ToggleWidget />;
    case "slider": return <SliderWidget />;
    case "heatmap": return <Heatmap grid={Array.from({ length: 5 }, (_, i) => Array.from({ length: 12 }, (_, j) => int(rng(seed + i + j), 0, 100)))} rows={["Mon", "Tue", "Wed", "Thu", "Fri"]} cols={Array.from({ length: 12 }, (_, i) => `${i * 2}`)} color="#06b6d4" />;
    case "hbar": return <HBar items={[{ name: "Kitchen", value: 82, color: "#06b6d4" }, { name: "Office", value: 61, color: "#8b5cf6" }, { name: "Garage", value: 44, color: "#22c55e" }, { name: "Bedroom", value: 28, color: "#f59e0b" }]} />;
  }
}

function ToggleWidget() {
  const [on, setOn] = useState(true);
  return (
    <div className="flex flex-col items-center py-4">
      <Toggle checked={on} onChange={setOn} />
      <span className="mt-2 text-sm font-semibold" style={{ color: on ? "#4ade80" : "#64748b" }}>{on ? "ON" : "OFF"}</span>
    </div>
  );
}

function SliderWidget() {
  const [v, setV] = useState(22);
  const tone: Tone = v > 25 ? "red" : v > 22 ? "amber" : "brand";
  return (
    <div className="py-2">
      <div className="mb-1 text-center text-2xl font-extrabold" style={{ color: tone === "red" ? "#f87171" : tone === "amber" ? "#fbbf24" : "#22d3ee" }}>{v}°C</div>
      <input type="range" min={16} max={30} value={v} onChange={(e) => setV(+e.target.value)} className="w-full accent-cyan-500" />
    </div>
  );
}

// ---------------------------------------------------------------- floorplan ---

function FloorPlanTab() {
  const rooms = [
    { name: "Living", x: 20, y: 20, w: 240, h: 160 }, { name: "Kitchen", x: 270, y: 20, w: 160, h: 160 },
    { name: "Bedroom", x: 20, y: 190, w: 180, h: 150 }, { name: "Office", x: 210, y: 190, w: 120, h: 150 },
    { name: "Garage", x: 340, y: 190, w: 90, h: 150 },
  ];
  const sensors = [
    { room: "Living", x: 120, y: 90, kind: "temp", val: 22, tone: "green" }, { room: "Living", x: 210, y: 140, kind: "motion", val: 1, tone: "brand" },
    { room: "Kitchen", x: 350, y: 100, kind: "temp", val: 27, tone: "amber" }, { room: "Bedroom", x: 100, y: 260, kind: "temp", val: 20, tone: "green" },
    { room: "Office", x: 270, y: 260, kind: "co2", val: 780, tone: "red" }, { room: "Garage", x: 385, y: 260, kind: "door", val: 0, tone: "green" },
  ] as const;
  const toneColor: Record<string, string> = { green: "#22c55e", amber: "#f59e0b", red: "#ef4444", brand: "#06b6d4" };
  return (
    <Panel>
      <SectionTitle right={<Badge tone="brand">CAD overlay · live</Badge>}>Floor plan sensor overlay</SectionTitle>
      <div className="overflow-x-auto">
        <svg viewBox="0 0 460 360" className="w-full" style={{ maxHeight: 460 }}>
          {rooms.map((r) => (
            <g key={r.name}>
              <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={8} fill="rgba(148,163,184,.04)" stroke="rgba(148,163,184,.25)" strokeWidth={1.5} />
              <text x={r.x + 10} y={r.y + 20} fontSize={12} fill="#7c8aa5">{r.name}</text>
            </g>
          ))}
          {sensors.map((s, i) => (
            <g key={i}>
              <circle cx={s.x} cy={s.y} r={16} fill={`${toneColor[s.tone]}22`} stroke={toneColor[s.tone]} strokeWidth={1.5}>
                <animate attributeName="r" from="16" to="22" dur="2.2s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.7" to="0.1" dur="2.2s" repeatCount="indefinite" />
              </circle>
              <circle cx={s.x} cy={s.y} r={13} fill="rgba(7,11,20,.9)" stroke={toneColor[s.tone]} strokeWidth={1.5} />
              <text x={s.x} y={s.y + 4} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff">{s.kind === "motion" ? "•" : s.kind === "door" ? "▢" : s.val}</text>
            </g>
          ))}
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs ad-muted">
        <span className="flex items-center gap-1.5"><Thermometer className="h-3.5 w-3.5" /> temperature</span>
        <span className="flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" /> motion</span>
        <span className="flex items-center gap-1.5"><DoorOpen className="h-3.5 w-3.5" /> door</span>
        <span className="ml-auto">colors reflect live threshold state</span>
      </div>
    </Panel>
  );
}

function TemplatesTab() {
  const templates = [
    { name: "HVAC operations", desc: "Zone temps, setpoints, energy and comfort index", widgets: 12, icon: Thermometer },
    { name: "Energy analytics", desc: "Consumption, cost, solar offset and demand", widgets: 9, icon: Activity },
    { name: "Asset tracking", desc: "Map, geofences, battery and movement", widgets: 8, icon: Building },
    { name: "Security wall", desc: "Cameras, motion, door state and alerts", widgets: 10, icon: Video },
    { name: "Fleet NOC", desc: "Status matrix, latency, incidents, throughput", widgets: 14, icon: LayoutGrid },
    { name: "Water systems", desc: "Levels, flow, leaks and pump status", widgets: 7, icon: GaugeIcon },
  ];
  return (
    <StaggerGrid className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {templates.map((t) => (
        <StaggerItem key={t.name}>
          <Panel className="flex h-full flex-col">
            <div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: "rgba(6,182,212,.1)", color: "#22d3ee" }}><t.icon className="h-4 w-4" /></span><span className="font-semibold text-white">{t.name}</span></div>
            <p className="mt-2 flex-1 text-sm ad-muted">{t.desc}</p>
            <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3"><span className="text-xs ad-muted">{t.widgets} widgets</span><Btn size="sm" variant="subtle"><Plus className="h-3.5 w-3.5" /> Clone</Btn></div>
          </Panel>
        </StaggerItem>
      ))}
    </StaggerGrid>
  );
}

function KioskTab() {
  const flags = useStore(flagsStore);
  return (
    <div className="space-y-4">
      <Panel>
        <SectionTitle right={<Btn size="sm" variant="primary"><Maximize2 className="h-3.5 w-3.5" /> Enter kiosk</Btn>}>Kiosk / control-room mode</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3 text-sm">
            <p className="ad-muted">Fullscreen, distraction-free, auto-rotating dashboards optimized for wall displays and NOC screens. Read-only and password-protected.</p>
            {[["Auto-rotate dashboards", true], ["Hide navigation chrome", true], ["Password protect", true], ["Wake-lock display", false]].map(([l, on]) => (
              <div key={l as string} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-3"><span className="text-white">{l}</span><span className="flex items-center gap-1.5 text-xs" style={{ color: on ? "#4ade80" : "#64748b" }}><Dot tone={on ? "green" : "slate"} /> {on ? "on" : "off"}</span></div>
            ))}
          </div>
          <div className="rounded-xl border border-white/10 bg-gradient-to-br from-slate-900 to-black p-4">
            <div className="mb-2 flex items-center justify-between text-xs ad-muted"><span>NOC · Fleet overview</span><span className="flex items-center gap-1 text-green-400"><Dot tone="green" pulse /> live</span></div>
            <div className="grid grid-cols-3 gap-2">
              {[["Online", "98.2%"], ["Alerts", "3"], ["Throughput", "14.2k/s"]].map(([l, v]) => (
                <div key={l} className="rounded-lg bg-white/[0.04] p-2 text-center"><div className="text-lg font-bold text-white">{v}</div><div className="text-[10px] ad-muted">{l}</div></div>
              ))}
            </div>
            <div className="mt-2"><LineChart data={walk("kiosk", 30, 40, 6)} color="#22d3ee" height={80} /></div>
          </div>
        </div>
      </Panel>
      <Panel>
        <SectionTitle>Feature flags</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-2">
          {flags.slice(0, 6).map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-2.5">
              <span className="min-w-0"><span className="block truncate font-mono text-sm text-white">{f.key}</span><span className="block truncate text-[11px] ad-muted">{f.description}</span></span>
              <Badge tone={f.enabled ? "green" : "slate"}>{f.enabled ? `${f.rollout}%` : "off"}</Badge>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
