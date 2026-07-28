"use client";

/**
 * Dashboard builder.
 *
 * Operators compose their own dashboards here and they are persisted on the
 * server via /api/smarthome/admin/config ("dashboards" collection), so a layout
 * survives a reload. There are no preset/sample dashboards, no fake floor plan
 * and no invented kiosk metrics: every widget renders from a live control-plane
 * source (fleet, energy, events, platform health or a device's real telemetry),
 * and "Present" is a real fullscreen view over those same widgets.
 */

import { useEffect, useMemo, useState } from "react";
import {
  LayoutGrid, Plus, X, Trash2, Pencil, Maximize2, Tv, Wifi, Zap, Activity,
  ServerCog, Cpu, Inbox, RefreshCw, ArrowLeft, ArrowRight, Check, BarChart3,
  PieChart, LineChart as LineIcon, type LucideIcon,
} from "lucide-react";
import { LineChart, Donut, HBar, PALETTE } from "../../charts";
import {
  useAdminConfig, useAdminStats, useAdminDevices, useAdminEvents, useAdminHealth,
  useEnergySummary, useDeviceTelemetry, useFleetInsights, availableMetrics,
  telemetrySeries, timeSeries, type Resource, type ConfigRecord,
} from "../_lib/api";
import { num, relativeTime, uptime } from "../_lib/format";
import {
  PageHeader, Panel, Btn, Dot, SectionTitle, StaggerGrid, StaggerItem,
  Select, Field, Input, Modal, EmptyState, ErrorState, LoadingState, Skeleton,
  TONE, type Tone,
} from "../_ui";
import type {
  AdminDevice, AdminEvent, AdminHealth, AdminStats, EnergySummary,
} from "@/lib/control-plane";

type WidgetType =
  | "fleet-online" | "live-power" | "type-donut" | "room-bar" | "health-donut"
  | "event-rate" | "recent-events" | "platform-health" | "device-metric";

interface Widget {
  id: string;
  type: WidgetType;
  span: 1 | 2;
  deviceId?: string;
  deviceName?: string;
  metric?: string;
}

interface DashboardRecord extends ConfigRecord {
  name: string;
  widgets: Widget[];
}

interface Ctx {
  stats: Resource<AdminStats>;
  devices: Resource<AdminDevice[]>;
  events: Resource<AdminEvent[]>;
  health: Resource<AdminHealth>;
  energy: Resource<EnergySummary>;
  fleet: ReturnType<typeof useFleetInsights>;
}

const CATALOGUE: { type: WidgetType; label: string; icon: LucideIcon; span: 1 | 2; config?: boolean }[] = [
  { type: "fleet-online", label: "Devices online", icon: Wifi, span: 1 },
  { type: "live-power", label: "Live power", icon: Zap, span: 1 },
  { type: "type-donut", label: "Devices by type", icon: PieChart, span: 1 },
  { type: "room-bar", label: "Devices by room", icon: BarChart3, span: 1 },
  { type: "health-donut", label: "Fleet health", icon: Activity, span: 1 },
  { type: "platform-health", label: "Platform health", icon: ServerCog, span: 1 },
  { type: "event-rate", label: "Event rate · 24h", icon: LineIcon, span: 2 },
  { type: "recent-events", label: "Recent events", icon: Inbox, span: 2 },
  { type: "device-metric", label: "Device metric", icon: Cpu, span: 2, config: true },
];

export default function DashboardsPage() {
  const cfg = useAdminConfig<DashboardRecord>("dashboards");
  const statsRes = useAdminStats();
  const devicesRes = useAdminDevices();
  const eventsRes = useAdminEvents(300);
  const healthRes = useAdminHealth();
  const energyRes = useEnergySummary();
  const fleet = useFleetInsights(devicesRes.data);
  const ctx: Ctx = { stats: statsRes, devices: devicesRes, events: eventsRes, health: healthRes, energy: energyRes, fleet };

  const dashboards = cfg.rows;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [kiosk, setKiosk] = useState(false);
  const [dialog, setDialog] = useState<null | { mode: "create" | "rename" }>(null);
  const [addDevice, setAddDevice] = useState(false);

  useEffect(() => {
    if (!dashboards.length) { if (activeId !== null) setActiveId(null); return; }
    if (!activeId || !dashboards.some((d) => d.id === activeId)) setActiveId(dashboards[0].id);
  }, [dashboards, activeId]);

  const active = dashboards.find((d) => d.id === activeId) ?? null;
  const widgets = useMemo(() => (active && Array.isArray(active.widgets) ? active.widgets : []), [active]);

  const saveWidgets = (next: Widget[]) => { if (active) cfg.update(active.id, { widgets: next }); };
  const addWidget = (w: Omit<Widget, "id">) => { if (active) saveWidgets([...widgets, { ...w, id: crypto.randomUUID() }]); };
  const removeWidget = (id: string) => saveWidgets(widgets.filter((w) => w.id !== id));
  const moveWidget = (id: string, dir: -1 | 1) => {
    const i = widgets.findIndex((w) => w.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= widgets.length) return;
    const next = [...widgets];
    [next[i], next[j]] = [next[j], next[i]];
    saveWidgets(next);
  };

  const submitDialog = async (name: string) => {
    const n = name.trim();
    const mode = dialog?.mode;
    setDialog(null);
    if (!n) return;
    if (mode === "create") {
      const rec = await cfg.create({ name: n, widgets: [] });
      if (rec) setActiveId(rec.id);
    } else if (active) {
      await cfg.update(active.id, { name: n });
    }
  };

  const deleteActive = async () => {
    if (!active) return;
    if (typeof window !== "undefined" && !window.confirm(`Delete “${active.name}”? This cannot be undone.`)) return;
    await cfg.remove(active.id);
    setActiveId(null);
  };

  if (cfg.loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Visual dashboards" icon={<LayoutGrid className="h-5 w-5" />} subtitle="Operator-defined dashboards, persisted on the server. Every widget renders from a live control-plane source." />
        <LoadingState rows={4} label="Loading your dashboards…" />
      </div>
    );
  }
  if (cfg.error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Visual dashboards" icon={<LayoutGrid className="h-5 w-5" />} />
        <ErrorState message={cfg.error} unauthorized={cfg.unauthorized} onRetry={cfg.reload} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visual dashboards" icon={<LayoutGrid className="h-5 w-5" />}
        subtitle="Operator-defined dashboards, persisted on the server. Every widget renders from a live control-plane source."
        actions={<Btn variant="primary" onClick={() => setDialog({ mode: "create" })}><Plus className="h-4 w-4" /> New dashboard</Btn>}
      />

      {dashboards.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid className="h-6 w-6" />}
          title="No dashboards yet"
          hint="Create your first dashboard, then add widgets that read live fleet, energy, event and telemetry data."
          action={<Btn variant="primary" onClick={() => setDialog({ mode: "create" })}><Plus className="h-4 w-4" /> Create dashboard</Btn>}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <div className="space-y-3">
            <Panel>
              <SectionTitle>Dashboards</SectionTitle>
              <div className="space-y-1.5">
                {dashboards.map((d) => {
                  const on = d.id === activeId;
                  const count = Array.isArray(d.widgets) ? d.widgets.length : 0;
                  return (
                    <button
                      key={d.id}
                      onClick={() => setActiveId(d.id)}
                      className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition ${
                        on ? "border-cyan-500/40 bg-cyan-500/10 text-white" : "border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.07]"
                      }`}
                    >
                      <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                      <span className="min-w-0 flex-1 truncate">{d.name}</span>
                      <span className="shrink-0 text-[10px] ad-muted tabular-nums">{count}</span>
                    </button>
                  );
                })}
              </div>
            </Panel>
            <Panel>
              <SectionTitle>Add widget</SectionTitle>
              <div className="space-y-1.5">
                {CATALOGUE.map((c) => (
                  <button
                    key={c.type}
                    onClick={() => (c.config ? setAddDevice(true) : addWidget({ type: c.type, span: c.span }))}
                    disabled={!active}
                    className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-sm text-slate-200 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-md" style={{ background: "rgba(6,182,212,.1)", color: "#22d3ee" }}><c.icon className="h-3.5 w-3.5" /></span>
                    {c.label}<Plus className="ml-auto h-3.5 w-3.5 text-slate-500" />
                  </button>
                ))}
              </div>
            </Panel>
          </div>

          <div className="space-y-3">
            <Panel pad={false} className="flex flex-wrap items-center gap-2 p-3">
              <span className="text-sm font-semibold text-white">{active?.name ?? "—"}</span>
              {cfg.saving && <span className="flex items-center gap-1 text-xs ad-muted"><RefreshCw className="h-3 w-3 animate-spin" /> saving…</span>}
              <span className="text-xs ad-muted">{widgets.length} widget{widgets.length === 1 ? "" : "s"}</span>
              <div className="ml-auto flex items-center gap-2">
                <Btn size="sm" variant="subtle" onClick={() => setDialog({ mode: "rename" })} disabled={!active}><Pencil className="h-3.5 w-3.5" /> Rename</Btn>
                <Btn size="sm" variant="subtle" onClick={() => setKiosk(true)} disabled={!active || widgets.length === 0}><Maximize2 className="h-3.5 w-3.5" /> Present</Btn>
                <Btn size="sm" variant="danger" onClick={deleteActive} disabled={!active}><Trash2 className="h-3.5 w-3.5" /> Delete</Btn>
              </div>
            </Panel>

            {widgets.length === 0 ? (
              <EmptyState icon={<Plus className="h-6 w-6" />} title="This dashboard is empty" hint="Add widgets from the catalogue on the left. Each one renders live data from the control plane." />
            ) : (
              <StaggerGrid className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {widgets.map((w) => (
                  <StaggerItem key={w.id} className={w.span === 2 ? "sm:col-span-2" : ""}>
                    <WidgetCard widget={w} ctx={ctx} onRemove={() => removeWidget(w.id)} onMove={(dir) => moveWidget(w.id, dir)} />
                  </StaggerItem>
                ))}
              </StaggerGrid>
            )}
          </div>
        </div>
      )}

      <NameDialog
        open={dialog !== null}
        title={dialog?.mode === "rename" ? "Rename dashboard" : "New dashboard"}
        initial={dialog?.mode === "rename" ? active?.name ?? "" : ""}
        onClose={() => setDialog(null)}
        onSubmit={submitDialog}
      />
      <AddDeviceMetricModal
        open={addDevice}
        devices={devicesRes.data ?? []}
        onClose={() => setAddDevice(false)}
        onAdd={(deviceId, deviceName, metric) => { addWidget({ type: "device-metric", span: 2, deviceId, deviceName, metric }); setAddDevice(false); }}
      />
      {kiosk && active && <KioskOverlay dashboard={active} ctx={ctx} onExit={() => setKiosk(false)} />}
    </div>
  );
}

// ------------------------------------------------------------------ widgets --

function WidgetCard({ widget, ctx, onRemove, onMove }: { widget: Widget; ctx: Ctx; onRemove: () => void; onMove: (dir: -1 | 1) => void }) {
  return (
    <div className="group relative ad-card h-full rounded-2xl p-4">
      <div className="absolute right-2 top-2 z-10 flex gap-0.5 opacity-0 transition group-hover:opacity-100">
        <button onClick={() => onMove(-1)} title="Move earlier" className="rounded-md p-1 text-slate-500 hover:text-cyan-300"><ArrowLeft className="h-3.5 w-3.5" /></button>
        <button onClick={() => onMove(1)} title="Move later" className="rounded-md p-1 text-slate-500 hover:text-cyan-300"><ArrowRight className="h-3.5 w-3.5" /></button>
        <button onClick={onRemove} title="Remove" className="rounded-md p-1 text-slate-500 hover:text-red-300"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="mb-2 truncate pr-16 text-[11px] font-semibold uppercase tracking-wider ad-muted">{titleFor(widget)}</div>
      <WidgetView widget={widget} ctx={ctx} />
    </div>
  );
}

function titleFor(w: Widget): string {
  if (w.type === "device-metric") return `${w.deviceName || w.deviceId || "device"} · ${w.metric || "metric"}`;
  return CATALOGUE.find((c) => c.type === w.type)?.label ?? "Widget";
}

function WBusy() { return <Skeleton className="h-28 w-full" />; }
function WErr({ msg }: { msg: string }) { return <p className="py-8 text-center text-xs text-red-300">{msg}</p>; }
function WEmpty({ msg }: { msg: string }) { return <p className="py-8 text-center text-sm ad-muted">{msg}</p>; }

function BigStat({ value, sub, color = "#fff" }: { value: string; sub?: string; color?: string }) {
  return (
    <div className="py-3 text-center">
      <div className="text-3xl font-extrabold tabular-nums" style={{ color }}>{value}</div>
      {sub && <div className="mt-1 text-xs ad-muted">{sub}</div>}
    </div>
  );
}

function HRow({ name, ok, detail }: { name: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center gap-2">
      <Dot tone={ok ? "green" : "red"} />
      <span className="flex-1 truncate text-slate-200">{name}</span>
      <span className="text-xs ad-muted tabular-nums">{detail}</span>
    </div>
  );
}

function WidgetView({ widget, ctx }: { widget: Widget; ctx: Ctx }) {
  const { stats, devices, events, health, energy, fleet } = ctx;
  switch (widget.type) {
    case "fleet-online": {
      if (stats.loading && !stats.data) return <WBusy />;
      if (stats.error && !stats.data) return <WErr msg={stats.error} />;
      const total = stats.data?.devices ?? fleet.total;
      const online = stats.data?.online ?? fleet.online;
      const rate = total ? (online / total) * 100 : 0;
      return <BigStat value={`${num(online)} / ${num(total)}`} sub={total ? `${rate.toFixed(0)}% online` : "no devices"} color={rate >= 80 ? TONE.green.fg : rate >= 50 ? TONE.amber.fg : TONE.red.fg} />;
    }
    case "live-power": {
      if (energy.loading && !energy.data) return <WBusy />;
      if (energy.error && !energy.data) return <WErr msg={energy.error} />;
      return <BigStat value={`${num(energy.data?.liveWatts ?? 0)} W`} sub={`${num(energy.data?.todayKwh ?? 0, 1)} kWh today`} color={TONE.amber.fg} />;
    }
    case "type-donut": {
      if (devices.loading && !devices.data) return <WBusy />;
      if (devices.error && !devices.data) return <WErr msg={devices.error} />;
      if (!fleet.byType.length) return <WEmpty msg="No devices" />;
      return <div className="flex justify-center"><Donut size={140} segments={fleet.byType.slice(0, 6).map((t, i) => ({ label: t.name, value: t.value, color: PALETTE[i % PALETTE.length] }))} /></div>;
    }
    case "room-bar": {
      if (devices.loading && !devices.data) return <WBusy />;
      if (devices.error && !devices.data) return <WErr msg={devices.error} />;
      if (!fleet.byRoom.length) return <WEmpty msg="No rooms assigned" />;
      return <HBar items={fleet.byRoom.slice(0, 6).map((r, i) => ({ name: r.name, value: r.value, color: PALETTE[i % PALETTE.length] }))} />;
    }
    case "health-donut": {
      if (devices.loading && !devices.data) return <WBusy />;
      if (devices.error && !devices.data) return <WErr msg={devices.error} />;
      if (!fleet.total) return <WEmpty msg="No devices" />;
      const h = fleet.health;
      const segs = [
        { label: "healthy", value: h.healthy, color: TONE.green.fg },
        { label: "warning", value: h.warning, color: TONE.amber.fg },
        { label: "critical", value: h.critical, color: TONE.red.fg },
        { label: "offline", value: h.offline, color: TONE.slate.fg },
      ].filter((s) => s.value > 0);
      return <div className="flex justify-center"><Donut size={140} segments={segs} /></div>;
    }
    case "event-rate": {
      if (events.loading && !events.data) return <WBusy />;
      if (events.error && !events.data) return <WErr msg={events.error} />;
      const rows = events.data ?? [];
      if (!rows.length) return <WEmpty msg="No events in range" />;
      const s = timeSeries(rows, (e) => e.ts, 24, 3600000);
      return <LineChart data={s.data} color="#22d3ee" height={150} />;
    }
    case "recent-events": {
      if (events.loading && !events.data) return <WBusy />;
      if (events.error && !events.data) return <WErr msg={events.error} />;
      const rows = (events.data ?? []).slice(0, 6);
      if (!rows.length) return <WEmpty msg="No recent events" />;
      return (
        <div className="divide-y divide-white/5">
          {rows.map((e) => (
            <div key={e.id} className="flex items-center gap-2 py-2 text-sm">
              <Dot tone={kindTone(e.kind)} />
              <span className="min-w-0 flex-1 truncate text-slate-200"><span className="font-medium text-white">{e.title}</span></span>
              <span className="shrink-0 text-[11px] ad-muted">{relativeTime(e.ts)}</span>
            </div>
          ))}
        </div>
      );
    }
    case "platform-health": {
      if (health.loading && !health.data) return <WBusy />;
      if (health.error && !health.data) return <WErr msg={health.error} />;
      const h = health.data;
      return (
        <div className="space-y-1.5 text-sm">
          <HRow name="MQTT broker" ok={h?.mqtt === true} detail={h ? (h.mqtt ? "connected" : "down") : "—"} />
          <HRow name="Database" ok={h?.db === true} detail={h ? (h.db ? "up" : "down") : "—"} />
          <HRow name="API uptime" ok detail={h ? uptime(h.uptimeSec) : "—"} />
          <HRow name="Runtime" ok detail={h?.node ?? "—"} />
        </div>
      );
    }
    case "device-metric":
      return <DeviceMetricWidget widget={widget} />;
    default:
      return null;
  }
}

function DeviceMetricWidget({ widget }: { widget: Widget }) {
  const tele = useDeviceTelemetry(widget.deviceId ?? null, 200, 20000);
  const frames = useMemo(() => tele.data ?? [], [tele.data]);
  const series = useMemo(() => telemetrySeries(frames, widget.metric ?? ""), [frames, widget.metric]);
  if (tele.loading && !tele.data) return <WBusy />;
  if (tele.error && !tele.data) return <WErr msg={tele.error} />;
  if (!series.data.length) return <WEmpty msg="No telemetry for this metric" />;
  return (
    <div>
      <LineChart data={series.data} color={PALETTE[4]} height={150} />
      <div className="mt-1 text-xs ad-muted">latest <b className="text-white tabular-nums">{num(series.data[series.data.length - 1])}</b> · {series.data.length} pts</div>
    </div>
  );
}

function kindTone(kind: string): Tone {
  const k = kind.toLowerCase();
  if (k.includes("alert") || k.includes("sos") || k.includes("fault") || k.includes("error")) return "red";
  if (k.includes("warn") || k.includes("offline")) return "amber";
  if (k.includes("secur") || k.includes("auth")) return "violet";
  return "brand";
}

// ------------------------------------------------------------------ dialogs --

function NameDialog({ open, title, initial, onClose, onSubmit }: { open: boolean; title: string; initial: string; onClose: () => void; onSubmit: (name: string) => void }) {
  const [name, setName] = useState(initial);
  useEffect(() => { if (open) setName(initial); }, [open, initial]);
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. NOC overview" onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onSubmit(name); }} />
        </Field>
        <Btn variant="primary" className="w-full" disabled={!name.trim()} onClick={() => onSubmit(name)}><Check className="h-4 w-4" /> Save</Btn>
      </div>
    </Modal>
  );
}

function AddDeviceMetricModal({ open, devices, onClose, onAdd }: { open: boolean; devices: AdminDevice[]; onClose: () => void; onAdd: (deviceId: string, deviceName: string, metric: string) => void }) {
  const [deviceId, setDeviceId] = useState("");
  const [metric, setMetric] = useState("");
  const tele = useDeviceTelemetry(deviceId || null, 200, 0);
  const metrics = useMemo(() => availableMetrics(tele.data ?? []), [tele.data]);

  useEffect(() => { if (!open) { setDeviceId(""); setMetric(""); } }, [open]);
  useEffect(() => { setMetric(""); }, [deviceId]);

  const device = devices.find((d) => d.id === deviceId) ?? null;

  return (
    <Modal open={open} onClose={onClose} title="Add device metric widget">
      <div className="space-y-3">
        <Field label="Device">
          <Select value={deviceId} onChange={setDeviceId} options={[{ value: "", label: "Select a device…" }, ...devices.map((d) => ({ value: d.id, label: d.name || d.id }))]} />
        </Field>
        <Field label="Metric" hint={deviceId && !tele.loading && metrics.length === 0 ? "No numeric metrics found in this device's frames." : undefined}>
          {!deviceId ? (
            <p className="text-xs ad-muted">Choose a device first.</p>
          ) : tele.loading && !tele.data ? (
            <p className="text-xs ad-muted">Loading metrics…</p>
          ) : (
            <Select value={metric} onChange={setMetric} options={[{ value: "", label: metrics.length ? "Select a metric…" : "No metrics available" }, ...metrics.map((m) => ({ value: m, label: m }))]} />
          )}
        </Field>
        <Btn variant="primary" className="w-full" disabled={!deviceId || !metric} onClick={() => device && metric && onAdd(deviceId, device.name || device.id, metric)}>
          <Plus className="h-4 w-4" /> Add widget
        </Btn>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------- kiosk ---

function KioskOverlay({ dashboard, ctx, onExit }: { dashboard: DashboardRecord; ctx: Ctx; onExit: () => void }) {
  const widgets = Array.isArray(dashboard.widgets) ? dashboard.widgets : [];
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onExit(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [onExit]);

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-gradient-to-br from-slate-950 to-black p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <Tv className="h-5 w-5 text-cyan-400" />
          <span className="text-lg font-bold">{dashboard.name}</span>
          <span className="flex items-center gap-1 text-xs text-green-400"><Dot tone="green" pulse /> live</span>
        </div>
        <Btn variant="subtle" onClick={onExit}><X className="h-4 w-4" /> Exit</Btn>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {widgets.map((w) => (
          <div key={w.id} className={`ad-card rounded-2xl p-4 ${w.span === 2 ? "sm:col-span-2" : ""}`}>
            <div className="mb-2 truncate text-[11px] font-semibold uppercase tracking-wider ad-muted">{titleFor(w)}</div>
            <WidgetView widget={w} ctx={ctx} />
          </div>
        ))}
      </div>
    </div>
  );
}
