"use client";

/**
 * Fleet management.
 *
 * The whole page is driven by `useAdminDevices()` (live control-plane fleet) and
 * `useFleetInsights()` (real groupings derived from it). Filters, KPIs, the table,
 * the card grid and the room/site view all read real fields only. Health is
 * derived by `deviceHealth()` from each device's online flag, last-seen age and
 * reported fault flags — never randomised. The overview deep-links here with
 * `?device=<id>`; we read that with `useSearchParams()` and open the drawer.
 */

import { Suspense, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Radar, Wifi, WifiOff, TriangleAlert, ServerCog, Cpu, Table2, Grid3x3, Building2,
  Download, DownloadCloud, Filter, ChevronRight,
} from "lucide-react";
import FleetSites from "./FleetMap";
import DeviceDrawer from "./DeviceDrawer";
import { useAdminDevices, useFleetInsights, deviceHealth, type DeviceHealth } from "../_lib/api";
import { relativeTime, num } from "../_lib/format";
import type { AdminDevice } from "@/lib/control-plane";
import {
  PageHeader, Panel, StatCard, Badge, Dot, Btn, IconBtn, SearchInput, Select, Segmented,
  DataTable, StaggerGrid, StaggerItem, EmptyState, ErrorState, LoadingState,
  TONE, type Column, type Tone,
} from "../_ui";

const HEALTH_TONE: Record<DeviceHealth, Tone> = { healthy: "green", warning: "amber", critical: "red", offline: "slate" };
const HEALTH_OPTIONS: DeviceHealth[] = ["healthy", "warning", "critical", "offline"];

const roomLabel = (d: AdminDevice) => (d.room && d.room.trim()) || "Unassigned";

function rank(h: DeviceHealth): number {
  return h === "critical" ? 0 : h === "offline" ? 1 : h === "warning" ? 2 : 3;
}

export default function FleetPage() {
  return (
    <Suspense fallback={<LoadingState rows={4} label="Loading fleet…" />}>
      <FleetInner />
    </Suspense>
  );
}

function FleetInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const devicesRes = useAdminDevices();
  const devices = useMemo(() => devicesRes.data ?? [], [devicesRes.data]);
  const insights = useFleetInsights(devicesRes.data);

  const [view, setView] = useState<"table" | "grid" | "sites">("table");
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [room, setRoom] = useState("all");
  const [fw, setFw] = useState("all");
  const [health, setHealth] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  const openId = searchParams.get("device");
  const setOpenDevice = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set("device", id);
      else params.delete("device");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  const matchesBase = useCallback(
    (d: AdminDevice) => {
      if (type !== "all" && d.type !== type) return false;
      if (fw !== "all" && (d.fw_version || "unknown") !== fw) return false;
      if (health !== "all" && deviceHealth(d) !== health) return false;
      if (q) {
        const hay = `${d.name} ${d.id} ${d.owner_email ?? ""} ${d.room ?? ""} ${d.type}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    },
    [type, fw, health, q]
  );

  const baseFiltered = useMemo(() => devices.filter(matchesBase), [devices, matchesBase]);
  const filtered = useMemo(
    () => baseFiltered.filter((d) => room === "all" || roomLabel(d) === room),
    [baseFiltered, room]
  );

  const exportCsv = useCallback(() => {
    const header = ["id", "name", "type", "room", "owner_email", "fw_version", "health", "online", "last_seen"];
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = filtered.map((d) =>
      [d.id, d.name, d.type, roomLabel(d), d.owner_email ?? "", d.fw_version || "", deviceHealth(d), d.online, d.last_seen ?? ""]
        .map(esc)
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "fleet-export.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }, [filtered]);

  const cols: Column<AdminDevice>[] = [
    {
      key: "name", header: "Device", sort: (a, b) => (a.name || a.id).localeCompare(b.name || b.id),
      render: (d) => (
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: TONE.brand.bg, color: TONE.brand.fg }}><Cpu className="h-4 w-4" /></span>
          <div className="min-w-0">
            <div className="truncate font-medium text-white">{d.name || d.id}</div>
            <div className="font-mono text-[11px] ad-muted">{d.id}</div>
          </div>
        </div>
      ),
    },
    { key: "type", header: "Type", sort: (a, b) => a.type.localeCompare(b.type), render: (d) => <span className="text-slate-300">{d.type}</span> },
    { key: "room", header: "Room", sort: (a, b) => roomLabel(a).localeCompare(roomLabel(b)), render: (d) => <span className="text-slate-400">{roomLabel(d)}</span> },
    { key: "owner", header: "Owner", render: (d) => <span className="truncate text-slate-400">{d.owner_email || "unclaimed"}</span> },
    { key: "fw", header: "Firmware", sort: (a, b) => (a.fw_version || "").localeCompare(b.fw_version || ""), render: (d) => <span className="font-mono text-xs text-slate-300">{d.fw_version || "—"}</span> },
    {
      key: "health", header: "Health", sort: (a, b) => rank(deviceHealth(a)) - rank(deviceHealth(b)),
      render: (d) => { const h = deviceHealth(d); return <Badge tone={HEALTH_TONE[h]}>{h}</Badge>; },
    },
    {
      key: "status", header: "Last seen", align: "right", sort: (a, b) => Number(b.online) - Number(a.online),
      render: (d) => (
        <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: d.online ? "#4ade80" : "#64748b" }}>
          <Dot tone={d.online ? "green" : "slate"} pulse={d.online} /> {d.online ? "Online" : relativeTime(d.last_seen)}
        </span>
      ),
    },
    { key: "chev", header: "", align: "right", render: () => <ChevronRight className="h-4 w-4 text-slate-600" /> },
  ];

  const header = (
    <PageHeader
      title="Fleet management" icon={<Radar className="h-5 w-5" />}
      subtitle="Monitor, filter and operate every device registered on the control plane. Health is derived from each device's online flag, last-seen age and reported fault flags."
      actions={
        <>
          <Btn variant="ghost" onClick={exportCsv} disabled={filtered.length === 0}><Download className="h-4 w-4" /> Export</Btn>
          <Link href="/smarthome/admin/ota"><Btn variant="primary"><DownloadCloud className="h-4 w-4" /> OTA campaigns</Btn></Link>
        </>
      }
    />
  );

  if (devicesRes.loading && devices.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <LoadingState rows={2} label="Loading fleet from the control plane…" />
        <LoadingState rows={5} />
      </div>
    );
  }

  if (devicesRes.error && devices.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState message={devicesRes.error} unauthorized={devicesRes.unauthorized} onRetry={devicesRes.reload} />
      </div>
    );
  }

  const offline = insights.total - insights.online;
  const needsAttention = insights.health.warning + insights.health.critical + insights.health.offline;
  const emptyHint = devices.length === 0
    ? "Provision a device to populate the fleet."
    : "Adjust the filters or search.";
  const emptyTitle = devices.length === 0 ? "No devices provisioned" : "No devices match";

  return (
    <div className="space-y-6">
      {header}

      {devicesRes.error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-2.5 text-sm text-amber-200">
          <TriangleAlert className="h-4 w-4 shrink-0" /> {devicesRes.error}
        </div>
      )}

      <StaggerGrid className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StaggerItem><button onClick={() => setHealth("all")} className="w-full text-left"><StatCard label="Total" value={num(insights.total)} icon={<Cpu className="h-4 w-4" />} tone="brand" sub="registered" /></button></StaggerItem>
        <StaggerItem>
          <button onClick={() => setHealth("all")} className="w-full text-left">
            <StatCard label="Online" value={num(insights.online)} icon={<Wifi className="h-4 w-4" />} tone="green" sub={insights.total ? `${((insights.online / insights.total) * 100).toFixed(0)}% of fleet` : "no devices yet"} />
          </button>
        </StaggerItem>
        <StaggerItem><button onClick={() => setHealth("offline")} className="w-full text-left"><StatCard label="Offline" value={num(offline)} icon={<WifiOff className="h-4 w-4" />} tone="slate" sub="not reporting" /></button></StaggerItem>
        <StaggerItem>
          <button onClick={() => setHealth("critical")} className="w-full text-left">
            <StatCard
              label="Needs attention" value={num(needsAttention)} icon={<TriangleAlert className="h-4 w-4" />}
              tone={insights.health.critical > 0 ? "red" : needsAttention > 0 ? "amber" : "green"}
              sub={insights.health.critical ? `${insights.health.critical} critical` : "warning + offline"}
            />
          </button>
        </StaggerItem>
        <StaggerItem><StatCard label="Firmware versions" value={num(insights.byFirmware.length)} icon={<ServerCog className="h-4 w-4" />} tone="violet" sub="distinct in field" /></StaggerItem>
      </StaggerGrid>

      <Panel pad={false} className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="Search name, id, owner…" className="min-w-[220px] flex-1" />
          <IconBtn active={showFilters} onClick={() => setShowFilters((v) => !v)} title="Filters"><Filter className="h-4 w-4" /></IconBtn>
          <Segmented<"table" | "grid" | "sites">
            value={view} onChange={setView}
            options={[
              { value: "table", label: <Table2 className="h-4 w-4" /> },
              { value: "grid", label: <Grid3x3 className="h-4 w-4" /> },
              { value: "sites", label: <Building2 className="h-4 w-4" /> },
            ]}
          />
        </div>
        {showFilters && (
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 sm:grid-cols-4">
            <Select value={type} onChange={setType} options={[{ value: "all", label: "All types" }, ...insights.byType.map((t) => ({ value: t.name, label: `${t.name} (${t.value})` }))]} />
            <Select value={room} onChange={setRoom} options={[{ value: "all", label: "All rooms" }, ...insights.byRoom.map((r) => ({ value: r.name, label: `${r.name} (${r.value})` }))]} />
            <Select value={fw} onChange={setFw} options={[{ value: "all", label: "All firmware" }, ...insights.byFirmware.map((f) => ({ value: f.name, label: `${f.name} (${f.value})` }))]} />
            <Select value={health} onChange={setHealth} options={[{ value: "all", label: "All health" }, ...HEALTH_OPTIONS.map((h) => ({ value: h, label: h }))]} />
          </div>
        )}
      </Panel>

      {view === "table" && (
        <div>
          <div className="mb-2 flex items-center justify-end px-1 text-xs ad-muted">
            <span>{num(filtered.length)} of {num(devices.length)} devices</span>
          </div>
          <DataTable
            rows={filtered} columns={cols} rowKey={(d) => d.id} onRowClick={(d) => setOpenDevice(d.id)}
            empty={<EmptyState icon={<Radar className="h-6 w-6" />} title={emptyTitle} hint={emptyHint} />}
          />
        </div>
      )}

      {view === "grid" &&
        (filtered.length === 0 ? (
          <EmptyState icon={<Radar className="h-6 w-6" />} title={emptyTitle} hint={emptyHint} />
        ) : (
          <StaggerGrid className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((d) => {
              const h = deviceHealth(d);
              return (
                <StaggerItem key={d.id}>
                  <button onClick={() => setOpenDevice(d.id)} className="ad-card w-full rounded-2xl p-4 text-left transition hover:border-cyan-500/30">
                    <div className="flex items-start justify-between">
                      <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: TONE.brand.bg, color: TONE.brand.fg }}><Cpu className="h-5 w-5" /></span>
                      <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: d.online ? "#4ade80" : "#64748b" }}><Dot tone={d.online ? "green" : "slate"} pulse={d.online} /> {d.online ? "Online" : "Offline"}</span>
                    </div>
                    <div className="mt-3 truncate font-semibold text-white">{d.name || d.id}</div>
                    <div className="truncate text-xs ad-muted">{d.type} · {roomLabel(d)}</div>
                    <div className="mt-3 flex items-center justify-between">
                      <Badge tone={HEALTH_TONE[h]}>{h}</Badge>
                      <span className="font-mono text-[11px] ad-muted">{d.fw_version || "—"}</span>
                    </div>
                  </button>
                </StaggerItem>
              );
            })}
          </StaggerGrid>
        ))}

      {view === "sites" && (
        <Panel>
          <FleetSites devices={baseFiltered} selectedRoom={room === "all" ? null : room} onSelectRoom={(r) => setRoom(r ?? "all")} />
        </Panel>
      )}

      <DeviceDrawer deviceId={openId} onClose={() => setOpenDevice(null)} onChanged={devicesRes.reload} />
    </div>
  );
}
