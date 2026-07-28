"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Radar, Wifi, WifiOff, TriangleAlert, ShieldAlert, Map as MapIcon, Table2, Grid3x3,
  Download, Terminal, DownloadCloud, Layers, Trash2, Cpu, ChevronRight, Filter,
} from "lucide-react";
import { controlPlane } from "@/lib/control-plane";
import FleetMap from "./FleetMap";
import DeviceDrawer from "./DeviceDrawer";
import {
  fleetStore, REGIONS, DEVICE_TYPES, HW_MODELS, FW_VERSIONS, CONNECTIVITY, HEALTH,
  type FleetDevice, type Health,
} from "../_lib/sim";
import { useStore, rng, int, pick } from "../_lib/store";
import { relativeTime, num } from "../_lib/format";
import {
  PageHeader, Panel, StatCard, Badge, Dot, Btn, IconBtn, SearchInput, Select, Segmented,
  DataTable, Progress, StaggerGrid, StaggerItem, EmptyState, type Column, type Tone,
} from "../_ui";

const healthTone = (h: Health): Tone => (h === "healthy" ? "green" : h === "warning" ? "amber" : h === "critical" ? "red" : "slate");

export default function FleetPage() {
  const sim = useStore(fleetStore);
  const [real, setReal] = useState<FleetDevice[] | null>(null);
  const [view, setView] = useState<"map" | "table" | "grid">("table");
  const [q, setQ] = useState("");
  const [region, setRegion] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [model, setModel] = useState<string>("all");
  const [fw, setFw] = useState<string>("all");
  const [conn, setConn] = useState<string>("all");
  const [health, setHealth] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<FleetDevice | null>(null);

  // Best-effort: pull the live control plane; fall back to simulation.
  useEffect(() => {
    let alive = true;
    controlPlane.adminDevices().then((r) => {
      if (!alive || !r.ok || !r.data?.devices?.length) return;
      const rnd = rng("realmap");
      setReal(
        r.data.devices.map((d) => ({
          id: d.id, name: d.name || d.id, type: d.type, model: pick(rnd, HW_MODELS),
          tenant: d.owner_email || "—", region: pick(rnd, REGIONS), city: "—",
          lat: int(rnd, -50, 60), lng: int(rnd, -120, 140),
          health: (d.online ? "healthy" : "offline") as Health, healthScore: d.online ? 90 : 20,
          lifecycle: "active", online: d.online, fw: d.fw_version || "—",
          connectivity: pick(rnd, CONNECTIVITY), rssi: -int(rnd, 40, 85), battery: null,
          powerSource: "grid", cpu: int(rnd, 5, 80), mem: int(rnd, 20, 90),
          uptimeSec: int(rnd, 1000, 8e5), lastSeen: d.last_seen || new Date().toISOString(),
          tags: ["prod"], gateway: null,
        }))
      );
    });
    return () => { alive = false; };
  }, []);

  const devices = real ?? sim;

  const matrix = useMemo(() => ({
    total: devices.length,
    online: devices.filter((d) => d.online).length,
    offline: devices.filter((d) => !d.online).length,
    warning: devices.filter((d) => d.health === "warning").length,
    critical: devices.filter((d) => d.health === "critical").length,
    staging: devices.filter((d) => d.lifecycle === "provisioned" || d.lifecycle === "draft").length,
  }), [devices]);

  const filtered = useMemo(() => devices.filter((d) => {
    if (region !== "all" && d.region !== region) return false;
    if (type !== "all" && d.type !== type) return false;
    if (model !== "all" && d.model !== model) return false;
    if (fw !== "all" && d.fw !== fw) return false;
    if (conn !== "all" && d.connectivity !== conn) return false;
    if (health !== "all" && d.health !== health) return false;
    if (q && !`${d.name} ${d.id} ${d.type} ${d.tenant} ${d.city} ${d.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [devices, region, type, model, fw, conn, health, q]);

  const allChecked = filtered.length > 0 && filtered.every((d) => selected.has(d.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(filtered.map((d) => d.id)));

  const exportCsv = () => {
    const header = ["id", "name", "type", "model", "tenant", "region", "health", "score", "online", "fw", "connectivity", "lastSeen"];
    const lines = filtered.map((d) => [d.id, d.name, d.type, d.model, d.tenant, d.region, d.health, d.healthScore, d.online, d.fw, d.connectivity, d.lastSeen].join(","));
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "fleet-export.csv"; a.click();
  };

  const cols: Column<FleetDevice>[] = [
    {
      key: "check", header: "", className: "w-8",
      render: (d) => <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} onClick={(e) => e.stopPropagation()} className="h-4 w-4 accent-cyan-500" />,
    },
    {
      key: "name", header: "Device", sort: (a, b) => a.name.localeCompare(b.name),
      render: (d) => (
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: "rgba(6,182,212,.1)", color: "#22d3ee" }}><Cpu className="h-4 w-4" /></span>
          <div className="min-w-0"><div className="truncate font-medium text-white">{d.name}</div><div className="font-mono text-[11px] ad-muted">{d.id}</div></div>
        </div>
      ),
    },
    { key: "type", header: "Type", sort: (a, b) => a.type.localeCompare(b.type), render: (d) => <span className="text-slate-300">{d.type}</span> },
    { key: "tenant", header: "Tenant", render: (d) => <span className="truncate text-slate-400">{d.tenant}</span> },
    { key: "region", header: "Region", sort: (a, b) => a.region.localeCompare(b.region), render: (d) => <Badge tone="slate">{d.region}</Badge> },
    {
      key: "health", header: "Health", sort: (a, b) => a.healthScore - b.healthScore,
      render: (d) => (
        <div className="flex items-center gap-2">
          <div className="w-14"><Progress value={d.healthScore} tone={healthTone(d.health)} height={6} /></div>
          <span className="w-7 text-xs tabular-nums ad-muted">{d.healthScore}</span>
        </div>
      ),
    },
    { key: "fw", header: "Firmware", sort: (a, b) => a.fw.localeCompare(b.fw), render: (d) => <span className="font-mono text-xs text-slate-300">{d.fw}</span> },
    {
      key: "status", header: "Status", align: "right", sort: (a, b) => Number(b.online) - Number(a.online),
      render: (d) => <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: d.online ? "#4ade80" : "#64748b" }}><Dot tone={d.online ? "green" : "slate"} pulse={d.online} /> {d.online ? "Online" : relativeTime(d.lastSeen)}</span>,
    },
    { key: "chev", header: "", align: "right", render: () => <ChevronRight className="h-4 w-4 text-slate-600" /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fleet management" icon={<Radar className="h-5 w-5" />}
        subtitle="Monitor, filter and operate every device across the platform. Health scores blend uptime, latency, CPU, memory and error rate."
        actions={<><Btn variant="ghost" onClick={exportCsv}><Download className="h-4 w-4" /> Export</Btn><Btn variant="primary"><DownloadCloud className="h-4 w-4" /> New OTA campaign</Btn></>}
      />

      {/* Status matrix */}
      <StaggerGrid className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StaggerItem><button onClick={() => setHealth("all")} className="w-full text-left"><StatCard label="Total" value={num(matrix.total)} icon={<Cpu className="h-4 w-4" />} tone="brand" /></button></StaggerItem>
        <StaggerItem><button onClick={() => setHealth("all")} className="w-full text-left"><StatCard label="Online" value={num(matrix.online)} icon={<Wifi className="h-4 w-4" />} tone="green" /></button></StaggerItem>
        <StaggerItem><button onClick={() => setHealth("offline")} className="w-full text-left"><StatCard label="Offline" value={num(matrix.offline)} icon={<WifiOff className="h-4 w-4" />} tone="slate" /></button></StaggerItem>
        <StaggerItem><button onClick={() => setHealth("warning")} className="w-full text-left"><StatCard label="Warning" value={num(matrix.warning)} icon={<TriangleAlert className="h-4 w-4" />} tone="amber" /></button></StaggerItem>
        <StaggerItem><button onClick={() => setHealth("critical")} className="w-full text-left"><StatCard label="Critical" value={num(matrix.critical)} icon={<ShieldAlert className="h-4 w-4" />} tone="red" /></button></StaggerItem>
        <StaggerItem><StatCard label="Staging" value={num(matrix.staging)} icon={<Layers className="h-4 w-4" />} tone="violet" /></StaggerItem>
      </StaggerGrid>

      {/* Toolbar */}
      <Panel pad={false} className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="Search devices, tags, tenants…" className="min-w-[220px] flex-1" />
          <IconBtn active={showFilters} onClick={() => setShowFilters((v) => !v)} title="Filters"><Filter className="h-4 w-4" /></IconBtn>
          <Segmented<"map" | "table" | "grid">
            value={view} onChange={setView}
            options={[{ value: "table", label: <Table2 className="h-4 w-4" /> }, { value: "grid", label: <Grid3x3 className="h-4 w-4" /> }, { value: "map", label: <MapIcon className="h-4 w-4" /> }]}
          />
        </div>
        {showFilters && (
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 sm:grid-cols-3 lg:grid-cols-6">
            <Select value={region} onChange={setRegion} options={[{ value: "all", label: "All regions" }, ...REGIONS.map((r) => ({ value: r, label: r }))]} />
            <Select value={type} onChange={setType} options={[{ value: "all", label: "All types" }, ...DEVICE_TYPES.map((t) => ({ value: t, label: t }))]} />
            <Select value={model} onChange={setModel} options={[{ value: "all", label: "All models" }, ...HW_MODELS.map((m) => ({ value: m, label: m }))]} />
            <Select value={fw} onChange={setFw} options={[{ value: "all", label: "All firmware" }, ...FW_VERSIONS.map((f) => ({ value: f, label: `v${f}` }))]} />
            <Select value={conn} onChange={setConn} options={[{ value: "all", label: "All connectivity" }, ...CONNECTIVITY.map((c) => ({ value: c, label: c }))]} />
            <Select value={health} onChange={setHealth} options={[{ value: "all", label: "All health" }, ...HEALTH.map((h) => ({ value: h, label: h }))]} />
          </div>
        )}
      </Panel>

      {/* Batch action bar */}
      {selected.size > 0 && (
        <div className="sticky top-16 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2.5 backdrop-blur">
          <span className="text-sm font-semibold text-white">{selected.size} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Btn size="sm" variant="subtle"><Terminal className="h-3.5 w-3.5" /> Command</Btn>
            <Btn size="sm" variant="subtle"><DownloadCloud className="h-3.5 w-3.5" /> Update</Btn>
            <Btn size="sm" variant="subtle"><Layers className="h-3.5 w-3.5" /> Group</Btn>
            <Btn size="sm" variant="danger"><Trash2 className="h-3.5 w-3.5" /> Decommission</Btn>
            <Btn size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Btn>
          </div>
        </div>
      )}

      {/* Views */}
      {view === "map" && (
        <Panel>
          <FleetMap devices={filtered} selectedRegion={region === "all" ? null : region} onSelectRegion={(r) => setRegion(r ?? "all")} />
        </Panel>
      )}

      {view === "table" && (
        <div>
          <div className="mb-2 flex items-center justify-between px-1 text-xs ad-muted">
            <button onClick={toggleAll} className="flex items-center gap-2 hover:text-white"><input type="checkbox" readOnly checked={allChecked} className="h-3.5 w-3.5 accent-cyan-500" /> Select all {filtered.length}</button>
            <span>{num(filtered.length)} of {num(devices.length)} devices</span>
          </div>
          <DataTable rows={filtered} columns={cols} rowKey={(d) => d.id} onRowClick={(d) => setDrawer(d)} empty={<EmptyState icon={<Radar className="h-6 w-6" />} title="No devices match" hint="Adjust filters or search." />} />
        </div>
      )}

      {view === "grid" && (
        <StaggerGrid className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.slice(0, 60).map((d) => (
            <StaggerItem key={d.id}>
              <button onClick={() => setDrawer(d)} className="ad-card w-full rounded-2xl p-4 text-left transition hover:border-cyan-500/30">
                <div className="flex items-start justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "rgba(6,182,212,.1)", color: "#22d3ee" }}><Cpu className="h-5 w-5" /></span>
                  <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: d.online ? "#4ade80" : "#64748b" }}><Dot tone={d.online ? "green" : "slate"} pulse={d.online} /> {d.online ? "Online" : "Offline"}</span>
                </div>
                <div className="mt-3 truncate font-semibold text-white">{d.name}</div>
                <div className="truncate text-xs ad-muted">{d.type} · {d.region}</div>
                <div className="mt-3 flex items-center gap-2"><div className="flex-1"><Progress value={d.healthScore} tone={healthTone(d.health)} height={6} /></div><span className="text-xs tabular-nums ad-muted">{d.healthScore}</span></div>
              </button>
            </StaggerItem>
          ))}
        </StaggerGrid>
      )}

      <DeviceDrawer device={drawer} onClose={() => setDrawer(null)} onCommand={(id, cmd) => console.log("cmd", id, cmd)} />
    </div>
  );
}
