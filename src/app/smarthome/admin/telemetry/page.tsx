"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, Radio, Pause, Play, Database, GitBranch, Gauge, Plus, Download, Waypoints,
  ArrowDownUp, Filter,
} from "lucide-react";
import { LineChart, HBar, Donut } from "../../charts";
import { metricsStore, REGIONS, type MetricDef } from "../_lib/sim";
import { useStore, uid, walk } from "../_lib/store";
import { abbrNum, num } from "../_lib/format";
import {
  PageHeader, Panel, StatCard, Badge, Dot, Btn, Tabs, SearchInput, Select, Toggle,
  DataTable, Modal, Field, Input, SectionTitle, StaggerGrid, StaggerItem, Progress,
  type Column, type Tone,
} from "../_ui";

type Tab = "stream" | "metrics" | "ingestion" | "pipeline";
const PROTOCOLS = ["MQTT", "HTTP", "WebSocket", "CoAP", "UDP"] as const;
const PROTO_TONE: Record<string, Tone> = { MQTT: "brand", HTTP: "blue", WebSocket: "violet", CoAP: "amber", UDP: "green" };

interface Line { id: string; ts: number; device: string; metric: string; value: string; protocol: string; }

const METRIC_NAMES = ["temperature", "humidity", "power", "co2", "rssi", "motion", "battery", "water_level", "voltage", "current"];
const hex = () => Math.random().toString(16).slice(2, 8);
const genLine = (): Line => {
  const m = METRIC_NAMES[Math.floor(Math.random() * METRIC_NAMES.length)];
  const bool = m === "motion";
  return {
    id: uid("ln"), ts: Date.now(), device: `dev-${hex()}`, metric: m,
    value: bool ? (Math.random() > 0.5 ? "true" : "false") : (Math.random() * 100).toFixed(2),
    protocol: PROTOCOLS[Math.floor(Math.random() * PROTOCOLS.length)],
  };
};

export default function TelemetryPage() {
  const metrics = useStore(metricsStore);
  const [tab, setTab] = useState<Tab>("stream");
  const totalMsgPerMin = metrics.reduce((s, m) => s + m.msgPerMin, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Telemetry & ingestion" icon={<Activity className="h-5 w-5" />}
        subtitle="Multi-protocol ingestion, live stream inspection, time-series retention, downsampling and a visual transformation pipeline."
        actions={<Btn variant="ghost"><Download className="h-4 w-4" /> Export CSV</Btn>}
      />

      <StaggerGrid className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StaggerItem><StatCard label="Ingestion rate" value={`${abbrNum(Math.round(totalMsgPerMin / 60))}/s`} icon={<Activity className="h-4 w-4" />} tone="brand" delta={3} /></StaggerItem>
        <StaggerItem><StatCard label="Active metrics" value={num(metrics.length)} icon={<Gauge className="h-4 w-4" />} tone="violet" /></StaggerItem>
        <StaggerItem><StatCard label="Protocols" value={num(PROTOCOLS.length)} icon={<Waypoints className="h-4 w-4" />} tone="blue" sub="MQTT · HTTP · WS · CoAP · UDP" /></StaggerItem>
        <StaggerItem><StatCard label="Storage growth" value="2.4 GB/d" icon={<Database className="h-4 w-4" />} tone="amber" /></StaggerItem>
      </StaggerGrid>

      <Tabs<Tab>
        value={tab} onChange={setTab}
        tabs={[
          { value: "stream", label: "Live Stream", icon: <Radio className="h-4 w-4" /> },
          { value: "metrics", label: "Metrics", icon: <Gauge className="h-4 w-4" />, count: metrics.length },
          { value: "ingestion", label: "Ingestion", icon: <ArrowDownUp className="h-4 w-4" /> },
          { value: "pipeline", label: "Pipeline", icon: <GitBranch className="h-4 w-4" /> },
        ]}
      />

      {tab === "stream" && <StreamTab />}
      {tab === "metrics" && <MetricsTab metrics={metrics} />}
      {tab === "ingestion" && <IngestionTab />}
      {tab === "pipeline" && <PipelineTab metrics={metrics} />}
    </div>
  );
}

function StreamTab() {
  const [lines, setLines] = useState<Line[]>(() => Array.from({ length: 30 }, genLine));
  const [paused, setPaused] = useState(false);
  const [q, setQ] = useState("");
  const [proto, setProto] = useState("all");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      setLines((prev) => [...Array.from({ length: 1 + Math.floor(Math.random() * 3) }, genLine), ...prev].slice(0, 200));
    }, 900);
    return () => clearInterval(t);
  }, [paused]);

  const filtered = lines.filter((l) => (proto === "all" || l.protocol === proto) && (!q || `${l.device} ${l.metric} ${l.value}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="space-y-3">
      <Panel pad={false} className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Btn variant={paused ? "primary" : "subtle"} onClick={() => setPaused((p) => !p)}>{paused ? <><Play className="h-4 w-4" /> Resume</> : <><Pause className="h-4 w-4" /> Pause</>}</Btn>
          <span className="flex items-center gap-1.5 text-xs ad-muted"><Dot tone={paused ? "amber" : "green"} pulse={!paused} /> {paused ? "paused" : "streaming"}</span>
          <SearchInput value={q} onChange={setQ} placeholder="Filter messages…" className="ml-auto min-w-[200px]" />
          <Select value={proto} onChange={setProto} options={[{ value: "all", label: "All protocols" }, ...PROTOCOLS.map((p) => ({ value: p, label: p }))]} />
        </div>
      </Panel>
      <div ref={boxRef} className="ad-card max-h-[540px] overflow-y-auto rounded-2xl p-3 font-mono text-xs">
        {filtered.map((l) => (
          <div key={l.id} className="flex items-center gap-3 border-b border-white/[0.04] py-1.5 last:border-0">
            <span className="w-20 shrink-0 text-slate-600">{new Date(l.ts).toLocaleTimeString(undefined, { hour12: false })}</span>
            <Badge tone={PROTO_TONE[l.protocol]}>{l.protocol}</Badge>
            <span className="w-28 shrink-0 truncate text-cyan-300">{l.device}</span>
            <span className="w-28 shrink-0 truncate text-slate-400">{l.metric}</span>
            <span className="font-semibold text-white">{l.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricsTab({ metrics }: { metrics: MetricDef[] }) {
  const [create, setCreate] = useState(false);
  const typeTone: Record<string, Tone> = { gauge: "brand", counter: "violet", boolean: "amber", string: "slate" };
  const add = (name: string, unit: string) => metricsStore.set((prev) => [{ id: uid("met"), name, unit, type: "gauge", retentionDays: 30, downsample: "1m avg", msgPerMin: 100 }, ...prev]);
  const cols: Column<MetricDef>[] = [
    { key: "name", header: "Metric", sort: (a, b) => a.name.localeCompare(b.name), render: (m) => <span className="font-mono font-medium text-white">{m.name}{m.unit && <span className="ml-1 text-slate-500">({m.unit})</span>}</span> },
    { key: "type", header: "Type", render: (m) => <Badge tone={typeTone[m.type]}>{m.type}</Badge> },
    { key: "retention", header: "Retention", align: "right", sort: (a, b) => a.retentionDays - b.retentionDays, render: (m) => <span className="text-slate-300">{m.retentionDays}d</span> },
    { key: "downsample", header: "Downsampling", render: (m) => <span className="text-slate-400">{m.downsample}</span> },
    { key: "rate", header: "Msg/min", align: "right", sort: (a, b) => a.msgPerMin - b.msgPerMin, render: (m) => <span className="font-semibold text-white tabular-nums">{num(m.msgPerMin)}</span> },
  ];
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Btn variant="primary" onClick={() => setCreate(true)}><Plus className="h-4 w-4" /> New metric</Btn></div>
      <DataTable rows={metrics} columns={cols} rowKey={(m) => m.id} />
      <MetricModal open={create} onClose={() => setCreate(false)} onCreate={add} />
    </div>
  );
}

function MetricModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (n: string, u: string) => void }) {
  const [name, setName] = useState(""); const [unit, setUnit] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="Define a custom metric">
      <div className="space-y-3">
        <Field label="Metric name" hint="Combine raw values, e.g. power = voltage * current"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="power" className="font-mono" /></Field>
        <Field label="Unit"><Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="W" /></Field>
        <Btn variant="primary" className="w-full" onClick={() => { if (name) { onCreate(name, unit); onClose(); setName(""); setUnit(""); } }}><Plus className="h-4 w-4" /> Create metric</Btn>
      </div>
    </Modal>
  );
}

function IngestionTab() {
  const throughput = useMemo(() => walk("ing-th", 48, 14, 3, 4).map((v) => Math.round(v * 1000)), []);
  const byProto = PROTOCOLS.map((p, i) => ({ label: p, value: [62, 20, 10, 5, 3][i], color: ["#06b6d4", "#3b82f6", "#8b5cf6", "#f59e0b", "#22c55e"][i] }));
  const byRegion = REGIONS.map((r, i) => ({ name: r, value: [4200, 3100, 2600, 1800, 1200, 700][i], color: ["#06b6d4", "#8b5cf6", "#22c55e", "#f59e0b", "#3b82f6", "#ec4899"][i] }));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <SectionTitle right={<span className="text-xs ad-muted tabular-nums">{abbrNum(throughput[throughput.length - 1])}/s</span>}>Ingestion throughput · 24h</SectionTitle>
          <LineChart data={throughput} color="#22d3ee" height={220} />
        </Panel>
        <Panel>
          <SectionTitle>By protocol</SectionTitle>
          <div className="flex justify-center py-2"><Donut size={160} segments={byProto} /></div>
        </Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel><SectionTitle>Messages by region</SectionTitle><HBar items={byRegion} unit="/s" /></Panel>
        <Panel>
          <SectionTitle>Health checks</SectionTitle>
          <div className="space-y-3">
            {[["Payload validation", 99.4, "green"], ["Deduplication (QoS1)", 100, "green"], ["Schema conformance", 97.1, "amber"], ["Missing-data detection", 99.9, "green"]].map(([l, v, t]) => (
              <div key={l as string}>
                <div className="mb-1 flex justify-between text-sm"><span className="text-slate-300">{l}</span><span className="font-semibold text-white tabular-nums">{v}%</span></div>
                <Progress value={v as number} tone={t as Tone} height={6} />
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function PipelineTab({ metrics }: { metrics: MetricDef[] }) {
  const stages = [
    { icon: Radio, title: "Ingest", desc: "MQTT · HTTP · CoAP · UDP", tone: "brand" as Tone },
    { icon: Filter, title: "Validate", desc: "Schema + payload rules", tone: "blue" as Tone },
    { icon: GitBranch, title: "Transform", desc: "Map, enrich, unit-convert", tone: "violet" as Tone },
    { icon: ArrowDownUp, title: "Downsample", desc: "1m / 5m / 1h rollups", tone: "amber" as Tone },
    { icon: Database, title: "Store", desc: "Time-series + cold archive", tone: "green" as Tone },
  ];
  const [retention, setRetention] = useState(metrics.slice(0, 6).map((m) => ({ id: m.id, name: m.name, days: m.retentionDays })));
  return (
    <div className="space-y-4">
      <Panel>
        <SectionTitle>Transformation pipeline</SectionTitle>
        <div className="flex flex-wrap items-stretch gap-2">
          {stages.map((s, i) => (
            <div key={s.title} className="flex items-center gap-2">
              <div className="ad-card min-w-[150px] rounded-xl p-3 text-center">
                <span className="mx-auto mb-2 grid h-9 w-9 place-items-center rounded-lg" style={{ background: "rgba(6,182,212,.1)", color: "#22d3ee" }}><s.icon className="h-4 w-4" /></span>
                <div className="text-sm font-semibold text-white">{s.title}</div>
                <div className="text-[11px] ad-muted">{s.desc}</div>
              </div>
              {i < stages.length - 1 && <span className="text-slate-600">→</span>}
            </div>
          ))}
        </div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionTitle>Retention policies</SectionTitle>
          <div className="space-y-3">
            {retention.map((r, i) => (
              <div key={r.id}>
                <div className="mb-1 flex justify-between text-sm"><span className="font-mono text-slate-300">{r.name}</span><span className="font-semibold text-white">{r.days} days</span></div>
                <input type="range" min={1} max={365} value={r.days} onChange={(e) => setRetention((prev) => prev.map((x, j) => j === i ? { ...x, days: +e.target.value } : x))} className="w-full accent-cyan-500" />
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <SectionTitle>Schema mapping</SectionTitle>
          <div className="space-y-2 font-mono text-xs">
            {[["t", "temperature", "°C"], ["h", "humidity", "%"], ["p", "power", "W"], ["lvl", "water_level", "%"]].map(([raw, norm, unit]) => (
              <div key={raw} className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                <span className="text-amber-300">{raw}</span><span className="text-slate-600">→</span>
                <span className="text-cyan-300">{norm}</span><span className="ml-auto text-slate-500">{unit}</span>
              </div>
            ))}
          </div>
          <Btn variant="subtle" className="mt-3 w-full"><Plus className="h-4 w-4" /> Add mapping</Btn>
        </Panel>
      </div>
    </div>
  );
}
